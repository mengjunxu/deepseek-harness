/** Native accounting preserves the serving source and exposes only bounded metadata. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished, vi } from 'vitest'
import LlmRuntime, { HarnessError, LlmError, LlmAdapter, resolveProviderPolicy, type GenerateOptions, type LlmUsageSource, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionLogOffset, SessionSeq, type SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import { disposeApplication } from '@deepseek-ai/dsh-app-boot'
import * as Records from '../src/request-records.ts'
import { requestAccountingProjection, requestPreparationFailureProjection } from '../src/request-record-projection.ts'

async function fixture(source: LlmUsageSource | null = 'api_metered') {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjections)
  const events: SessionEvent[] = []
  ctx.on('session/event', (_session, event) => { events.push(event) })
  const adapter = new class extends LlmAdapter {
    override providerInfo(provider: string) {
      return { id: provider, name: provider, ...source === null ? {} : { policy: resolveProviderPolicy({ usageSource: source }) } }
    }
    override async* stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
      yield { type: 'usage', usage: { inputTokens: 2, outputTokens: 1 } }
      yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }()
  const unregister = ctx.effect(() => ctx.llm.registerAdapter(['route'], adapter))
  const fiber = await ctx.plugin(Records), session = ctx.sessions.create()
  const call = { provider: 'route', model: 'm', messages: [], sessionId: session.id }
  return { ctx, adapter, session, call, fiber, events, unregister }
}

it('audits a direct native preparation refusal separately from settled dispatches', async () => {
  const { ctx, events, call, session } = await fixture()
  await Array.fromAsync(ctx.llm.stream({ ...call, provider: 'unregistered', intent: 'execute' }))
  expect(events.map(event => event.type).filter(type => type === 'llm/preparation-failed')).toHaveLength(1)
  expect(events.filter(event => event.type === 'llm/request-accounting')).toHaveLength(0)
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting']).values.requestAccounting)
    .toEqual({ recordCount: 0, bySource: {} })
})

it('records one captured-source settlement with the last usage sample and no copied prompt', async () => {
  const { ctx, events, call, session } = await fixture()
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting']).values.requestAccounting)
    .toEqual({ recordCount: 0, bySource: {} })
  await Array.fromAsync(ctx.llm.stream(call))
  const records = events.filter(event => event.type === 'llm/request-accounting')
  expect(records).toHaveLength(1)
  expect(records[0]?.data).toEqual({ provider: 'route', model: 'm', usageSource: 'api_metered',
    outcome: 'completed', finishKind: 'stop', usage: { kind: 'adapter-reported', tokens: { inputTokens: 3, outputTokens: 2 } } })
  session.append('turn/start', { turn: 1 })
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting']).values.requestAccounting).toMatchObject({ recordCount: 1 })
})

it.each(['provider-reported', 'estimated'] as const)('preserves explicit %s counter measurement in the log and cache view', async (measurement) => {
  const { ctx, adapter, call, session, events } = await fixture()
  adapter.stream = async function* () {
    yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, measurement } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  await Array.fromAsync(ctx.llm.stream(call))
  expect(events.find(e => e.type === 'llm/request-accounting')?.data).toMatchObject({ usage: { tokens: { measurement } } })
  const view = ctx.sessionProjections.snapshot(session, ['requestAccounting']).values.requestAccounting
  expect(view).toMatchObject({ last: { record: { usage: { tokens: { measurement } } } } })
  expect(requestAccountingProjection.stateSchema.parse(view)).toEqual(view)
})

it('captures the prepared serving registration across replacement and keeps replay views idempotent', async () => {
  const { ctx, session, call, adapter, unregister } = await fixture()
  const prepared = await ctx.llm.prepareCall(call)
  await unregister()
  const local = new class extends LlmAdapter {
    override providerInfo(provider: string) {
      return { id: provider, name: provider, policy: resolveProviderPolicy({ usageSource: 'local' }) }
    }
    override async* stream(): AsyncIterable<StreamChunk> { yield { type: 'finish', reason: { kind: 'stop' } } }
  }()
  ctx.effect(() => ctx.llm.registerAdapter(['route'], local))
  await Array.fromAsync(prepared.stream(call))
  await Array.fromAsync(ctx.llm.stream(call))
  const view = ctx.sessionProjections.snapshot(session, ['requestAccounting'])
  expect(view.values.requestAccounting).toMatchObject({ recordCount: 2, bySource: { api_metered: 1, local: 1 },
    last: { record: { usageSource: 'local', usage: { kind: 'unknown' } } } })
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting'])).toEqual(view)
  expect(adapter.providerInfo('route').policy?.usageSource).toBe('api_metered')
})

it.each(['stop', 'tool-calls', 'max-tokens', 'error', 'aborted'] as const)('records independent %s attempts and preserves unknown source', async (kind) => {
  const { ctx, adapter, events, call, session } = await fixture(null)
  adapter.stream = async function* () {
    yield { type: 'finish', reason: kind === 'error' || kind === 'aborted'
      ? { kind, failure: { code: 'FIXTURE', message: 'PRIVATE_CREDENTIAL_PAYLOAD' } } : { kind } }
  }
  for (let attempt = 0; attempt < 2; attempt++) await Array.fromAsync(ctx.llm.stream({ ...call, intent: 'review', purpose: 'compaction' }))
  const records = events.filter(event => event.type === 'llm/request-accounting')
  expect(records).toHaveLength(2)
  expect(records[0]?.data).toMatchObject({ usageSource: 'unknown', finishKind: kind, intent: 'review', purpose: 'compaction',
    outcome: kind === 'error' || kind === 'aborted' ? kind : 'completed', usage: { kind: 'unknown' } })
  expect(JSON.stringify(records)).not.toContain('PRIVATE_CREDENTIAL_PAYLOAD')
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting']).values.requestAccounting).toMatchObject({ recordCount: 2 })
})

it('records consumer closure as unknown and excludes calls without a live local Session', async () => {
  const { ctx, events, call, session } = await fixture()
  const { sessionId: _sessionId, ...unscoped } = call
  await Array.fromAsync(ctx.llm.stream(unscoped))
  expect(events.filter(event => event.type === 'llm/request-accounting')).toHaveLength(0)
  for await (const _chunk of ctx.llm.stream(call)) break
  const records = events.filter(event => event.type === 'llm/request-accounting')
  expect(records).toHaveLength(1)
  expect(records[0]?.data).toMatchObject({ outcome: 'unknown' })
  expect(records[0]?.data).not.toHaveProperty('finishKind')
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting']).values.requestAccounting)
    .toMatchObject({ recordCount: 1, last: { record: { outcome: 'unknown' } } })
})

it('restores a JSON projection checkpoint without adding another record', async () => {
  const { ctx, call, session, fiber } = await fixture()
  await Array.fromAsync(ctx.llm.stream(call))
  const expected = ctx.sessionProjections.snapshot(session, ['requestAccounting']).values.requestAccounting
  const checkpoint = JSON.parse(JSON.stringify(
    ctx.sessionProjections.checkpoint(session),
  )) as ReturnType<typeof ctx.sessionProjections.checkpoint>
  await fiber.dispose()
  await ctx.plugin(Records)
  expect(ctx.sessionProjections.viewCheckpoint(checkpoint).requestAccounting).toEqual(expected)
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting']).values.requestAccounting).toEqual(expected)
})

it('keeps historical Sessions without accounting empty until a new observed dispatch settles', async () => {
  const { ctx, session, events, call } = await fixture()
  session.append('turn/start', { turn: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const restored = ctx.sessions.create(undefined, { seed: [...events] })
  expect(ctx.sessionProjections.snapshot(restored, ['requestAccounting']).values.requestAccounting)
    .toEqual({ recordCount: 0, bySource: {} })
  const expectedSeq = restored.seq
  await Array.fromAsync(ctx.llm.stream({ ...call, sessionId: restored.id }))
  expect(ctx.sessionProjections.snapshot(restored, ['requestAccounting']).values.requestAccounting)
    .toMatchObject({ recordCount: 1, last: { seq: expectedSeq, record: { usageSource: 'api_metered' } } })
})

it('copies only token counters and snapshots samples before the adapter can mutate them', async () => {
  const { ctx, adapter, call, events, session } = await fixture()
  const usage: TokenUsage & { credential: string } = { inputTokens: 3, outputTokens: 2, totalTokens: 5, measurement: 'estimated',
    cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 1, credential: 'PRIVATE_TOKEN' }
  adapter.stream = async function* () {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'PRIVATE_RESPONSE' } }
    yield { type: 'usage', usage }
    usage.inputTokens = 999
    usage.measurement = 'provider-reported'
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  await Array.fromAsync(ctx.llm.stream(call))
  const record = events.find(event => event.type === 'llm/request-accounting')
  expect(record?.data).toMatchObject({ usage: { tokens: { measurement: 'estimated', inputTokens: 3, outputTokens: 2, totalTokens: 5,
    cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 1 } } })
  expect(JSON.stringify(record)).not.toContain('PRIVATE_TOKEN')
  expect(JSON.stringify(record)).not.toContain('PRIVATE_RESPONSE')
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting']).values.requestAccounting)
    .toMatchObject({ recordCount: 1, last: { record: { usage: { tokens: { reasoningTokens: 1 } } } } })
})

it('retains dispatched request labels when the caller changes its mutable options during IO', async () => {
  const { ctx, adapter, session, call, events } = await fixture()
  const started = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  adapter.stream = async function* (options) {
    started.resolve(undefined)
    await release.promise
    expect(options.model).toBe('m')
    expect(options.intent).toBe('chat')
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const request: GenerateOptions = { ...call, intent: 'chat', purpose: 'compaction' }
  const pending = Array.fromAsync(ctx.llm.stream(request))
  try {
    await started.promise
    request.model = 'other-model'; request.intent = 'execute'; request.purpose = 'session-title'
  } finally { release.resolve(undefined); await pending }
  const record = events.find(event => event.type === 'llm/request-accounting')
  expect(record?.data).toMatchObject({ model: 'm', intent: 'chat', purpose: 'compaction' })
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting']).values.requestAccounting).toMatchObject({ recordCount: 1 })
})

it('rejects invalid counts and extra fields at the durable projection-cache parser', () => {
  for (const value of [{ recordCount: -1, bySource: {} }, { recordCount: 0, bySource: {}, credentials: 'PRIVATE' },
    { recordCount: 1, bySource: { unknown: 1 }, last: { seq: 0, record: { provider: 'p', model: 'm', usageSource: 'unknown',
      outcome: 'unknown', usage: { kind: 'adapter-reported', tokens: { inputTokens: -1, outputTokens: 0 } } } } }]) {
    expect(() => requestAccountingProjection.stateSchema.parse(value)).toThrow()
  }
})

it('rejects an undeclared measurement at the durable cache parser', () => {
  expect(() => requestAccountingProjection.stateSchema.parse({ recordCount: 1, bySource: { local: 1 },
    last: { seq: 0, record: { provider: 'p', model: 'm', usageSource: 'local', outcome: 'completed',
      usage: { kind: 'adapter-reported', tokens: { inputTokens: 1, outputTokens: 1, measurement: 'official-billing' } } } } })).toThrow()
})

it('rebuilds a version-two cache from events carrying explicit measurement', async () => {
  const { ctx, adapter, call, session, events } = await fixture()
  adapter.stream = async function* () {
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1, measurement: 'estimated' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  await Array.fromAsync(ctx.llm.stream(call))
  const checkpoint = ctx.sessionProjections.checkpoint(session), accounting = checkpoint.requestAccounting
  if (!accounting) throw new Error('Expected accounting checkpoint')
  const legacy = { ...checkpoint, requestAccounting: { ...accounting, ver: 2 } }
  expect(ctx.sessionProjections.viewCheckpoint(legacy)).toEqual({ preparationFailures: { recordCount: 0 } })
  const restored = ctx.sessionProjections.restore(legacy, events, SessionLogOffset(0), session.header, SessionLogOffset(0))
  expect(restored.snapshot.values.requestAccounting).toMatchObject({ last: { record: { usage: { tokens: { measurement: 'estimated' } } } } })
  expect(restored.checkpoint.requestAccounting?.ver).toBe(3)
})

it('preserves a thrown middleware defect while recording only its error outcome', async () => {
  const { ctx, call, events } = await fixture(), defect = new Error('PRIVATE_DEFECT_PAYLOAD')
  ctx.on('llm/dispatch', () => { throw defect })
  await expect(Array.fromAsync(ctx.llm.stream(call))).rejects.toBe(defect)
  const record = events.find(event => event.type === 'llm/request-accounting')
  expect(record?.data).toMatchObject({ outcome: 'error', usage: { kind: 'unknown' } })
  expect(JSON.stringify(record)).not.toContain('PRIVATE_DEFECT_PAYLOAD')
})

it('withdraws recording and its projection when the optional plugin unloads', async () => {
  const { ctx, call, session, events, fiber } = await fixture()
  await fiber.dispose()
  await Array.fromAsync(ctx.llm.stream(call))
  expect(events.filter(event => event.type === 'llm/request-accounting')).toHaveLength(0)
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting']).values).not.toHaveProperty('requestAccounting')
})

it('aborts and drains an owned attempt before application disposal removes Session observers', async () => {
  const { ctx, adapter, events, call } = await fixture()
  const started = Promise.withResolvers<undefined>()
  adapter.stream = async function* (options) {
    if (!options.signal) throw new Error('Expected owned cancellation signal')
    const signal = options.signal, aborted = Promise.withResolvers<undefined>()
    const abort = () => { aborted.resolve(undefined) }
    signal.addEventListener('abort', abort, { once: true })
    try {
      started.resolve(undefined)
      if (!signal.aborted) await aborted.promise
      yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'Fixture aborted' } } }
    } finally { signal.removeEventListener('abort', abort) }
  }
  const pending = Array.fromAsync(ctx.llm.stream(call))
  try { await started.promise; await disposeApplication(ctx) }
  finally { await disposeApplication(ctx); await pending }
  expect(events.filter(event => event.type === 'llm/request-accounting').at(-1)?.data).toMatchObject({ outcome: 'aborted' })
})

it.each([false, true])('retains accounting failure and an optional dispatch defect (%s)', async (withDefect) => {
  const { ctx, session, call } = await fixture(), writeFailure = new Error('record write failed'), defect = new Error('dispatch defect')
  const spy = vi.spyOn(session, 'append').mockImplementation(() => { throw writeFailure })
  onTestFinished(() => { spy.mockRestore() })
  if (withDefect) ctx.on('llm/dispatch', () => { throw defect })
  const dispatch = Array.fromAsync(ctx.llm.stream(call))
  if (withDefect) await expect(dispatch).rejects.toMatchObject({ errors: [defect, writeFailure] })
  else await expect(dispatch).rejects.toBe(writeFailure)
})

it.each([
  ['ABORTED', 'aborted'], ['NO_ADAPTER', 'route'], ['POLICY_ROUTE_UNAVAILABLE', 'route'], ['PROVIDER_UNAVAILABLE', 'route'],
  ['UNSUPPORTED_PROVIDER_CAPABILITY', 'capability'], ['UNSUPPORTED_MODEL_CAPABILITY', 'capability'],
  ['UNSUPPORTED_REASONING_EFFORT', 'capability'], ['INVALID_RESPONSE_FORMAT', 'capability'], ['INVALID_CREDENTIAL', 'credentials'],
  ['VALIDATION_ADMISSION_DENIED', 'admission'], ['PAID_ROUTE_CONSENT_REQUIRED', 'admission'],
  ['ADMISSION_POLICY_INACTIVE', 'admission'], ['LOCAL_REQUEST_BUDGET_EXHAUSTED', 'admission'],
  ['LOCAL_REQUEST_BUDGET_EXECUTE_RESERVED', 'admission'], ['LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED', 'admission'],
  ['LOCAL_REQUEST_BUDGET_SESSION_REQUIRED', 'admission'], ['PRIVATE_ARBITRARY_CODE', 'unknown'],
] as const)('classifies %s preparation failure without copying private error data', async (code, category) => {
  const { ctx, adapter, call, session, events } = await fixture()
  const defect = new HarnessError('PRIVATE_CREDENTIAL_MESSAGE', code, { cause: new Error('PRIVATE_CAUSE') })
  adapter.prepareCall = async () => { throw defect }
  await expect(ctx.llm.prepareCall({ ...call, intent: 'review' }, undefined,
    { sessionId: session.id, purpose: 'compaction' })).rejects.toBe(defect)
  const records = events.filter(event => event.type === 'llm/preparation-failed')
  expect(records).toHaveLength(1)
  expect(records[0]?.data).toEqual({ provider: 'route', model: 'm', intent: 'review', purpose: 'compaction',
    stage: 'prepare', usageSource: 'api_metered', category })
  expect(JSON.stringify(records)).not.toContain('PRIVATE_')
  expect(ctx.sessionProjections.snapshot(session, ['requestAccounting', 'preparationFailures']).values)
    .toMatchObject({ requestAccounting: { recordCount: 0 }, preparationFailures: { recordCount: 1 } })
})

it('audits actual provider admission failure and leaves successful preparation unrecorded', async () => {
  const { ctx, call, session, events } = await fixture()
  await expect(ctx.llm.prepareCall({ ...call, requiredCapabilities: ['tools'] }, undefined, { sessionId: session.id }))
    .rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER_CAPABILITY' })
  const prepared = await ctx.llm.prepareCall({ provider: call.provider, model: call.model }, undefined, { sessionId: session.id })
  expect(prepared.config).not.toHaveProperty('sessionId')
  await Array.fromAsync(prepared.stream(call))
  expect(events.filter(event => event.type === 'llm/preparation-failed')).toHaveLength(1)
  expect(events.filter(event => event.type === 'llm/request-accounting')).toHaveLength(1)
})

it('audits one late preparation refusal without creating a settlement', async () => {
  const { ctx, call, session, events } = await fixture()
  const prepared = await ctx.llm.prepareCall(call, undefined, { sessionId: session.id })
  ctx.on('llm/admission', () => ({ code: 'PAID_ROUTE_CONSENT_REQUIRED', message: 'PRIVATE_POLICY_TEXT' }))
  const chunks = await Array.fromAsync(prepared.stream(call))
  expect(chunks).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'PAID_ROUTE_CONSENT_REQUIRED' } } }])
  const records = events.filter(event => event.type === 'llm/preparation-failed')
  expect(records).toHaveLength(1)
  expect(records[0]?.data).toMatchObject({ stage: 'stream', category: 'admission' })
  expect(events.filter(event => event.type === 'llm/request-accounting')).toHaveLength(0)
})

it('keeps missing-native preparation distinct when virtual middleware later completes', async () => {
  const { ctx, call, session, events } = await fixture()
  await expect(ctx.llm.prepareCall({ ...call, provider: 'virtual' }, undefined, { sessionId: session.id }))
    .rejects.toMatchObject({ code: 'NO_ADAPTER' })
  ctx.on('llm/stream', async function* () { yield { type: 'finish', reason: { kind: 'stop' } } })
  expect(await Array.fromAsync(ctx.llm.stream({ ...call, provider: 'virtual' })))
    .toEqual([{ type: 'finish', reason: { kind: 'stop' } }])
  const records = events.filter(event => event.type === 'llm/preparation-failed')
  expect(records).toHaveLength(1)
  expect(records[0]?.data).toMatchObject({ category: 'route', usageSource: 'unknown', stage: 'prepare' })
  expect(events.filter(event => event.type === 'llm/request-accounting')).toHaveLength(0)
})

it('captures failure labels and serving source before asynchronous replacement', async () => {
  const { ctx, adapter, call, session, events, unregister } = await fixture()
  const started = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  const defect = new Error('PRIVATE_RESOLUTION_ERROR')
  adapter.prepareCall = async () => { started.resolve(undefined); await release.promise; throw defect }
  const config = { ...call, intent: 'chat' as const }, context = { sessionId: session.id, purpose: 'compaction' as 'compaction' | 'session-title' }
  const pending = ctx.llm.prepareCall(config, undefined, context)
  const failure = expect(pending).rejects.toBe(defect)
  try {
    await started.promise
    await unregister()
    ctx.effect(() => ctx.llm.registerAdapter(['route'], new class extends LlmAdapter {
      override providerInfo(provider: string) { return { id: provider, name: provider, policy: resolveProviderPolicy({ usageSource: 'local' }) } }
      override async* stream(): AsyncIterable<StreamChunk> { yield { type: 'finish', reason: { kind: 'stop' } } }
    }()))
    config.model = 'changed'; context.purpose = 'session-title'
  } finally { release.resolve(undefined); await failure }
  expect(events.filter(event => event.type === 'llm/preparation-failed')[0]?.data)
    .toMatchObject({ model: 'm', intent: 'chat', purpose: 'compaction', usageSource: 'api_metered', category: 'unknown' })
})

it('classifies cancellation observed during model lookup and keeps the original rejection', async () => {
  const { ctx, adapter, call, session, events } = await fixture()
  const controller = new AbortController(), defect = new Error('PRIVATE_ABORT_REASON')
  adapter.prepareCall = async () => { controller.abort(defect); throw defect }
  await expect(ctx.llm.prepareCall(call, controller.signal, { sessionId: session.id })).rejects.toBe(defect)
  expect(events.filter(event => event.type === 'llm/preparation-failed')[0]?.data).toMatchObject({ category: 'aborted' })
})

it('excludes unscoped failures and withdraws preparation audit listeners on unload', async () => {
  const { ctx, call, session, fiber, events } = await fixture()
  await expect(ctx.llm.prepareCall({ ...call, provider: 'absent' })).rejects.toBeInstanceOf(LlmError)
  await expect(ctx.llm.prepareCall({ ...call, provider: 'absent' }, undefined, { sessionId: session.id + '-missing' as typeof session.id }))
    .rejects.toBeInstanceOf(LlmError)
  await fiber.dispose()
  await Array.fromAsync(ctx.llm.stream({ ...call, provider: 'absent' }))
  expect(events.filter(event => event.type === 'llm/preparation-failed')).toHaveLength(0)
  expect(ctx.sessionProjections.snapshot(session, ['preparationFailures']).values).not.toHaveProperty('preparationFailures')
})

it.each(['prepare', 'stream'] as const)('retains both the primary and audit-write defect for %s', async (stage) => {
  const { ctx, adapter, session, call } = await fixture()
  const primary = new LlmError('PRIVATE_PREPARATION_FAILURE', 'INVALID_CREDENTIAL'), write = new Error('audit write failed')
  adapter.prepareCall = async () => { throw primary }
  const spy = vi.spyOn(session, 'append').mockImplementation(() => { throw write })
  onTestFinished(() => { spy.mockRestore() })
  const pending = stage === 'prepare' ? ctx.llm.prepareCall(call, undefined, { sessionId: session.id }) : Array.fromAsync(ctx.llm.stream(call))
  await expect(pending).rejects.toMatchObject({ errors: [primary, { errors: [write] }] })
})

it.each([false, true])('restores preparation checkpoints without recounting (%s)', async (labels) => {
  const { ctx, call, session, fiber, events } = await fixture()
  await Array.fromAsync(ctx.llm.stream({ ...call, provider: 'absent', ...labels ? { intent: 'plan' as const, purpose: 'session-title' as const } : {} }))
  session.append('turn/start', { turn: 1 })
  const view = ctx.sessionProjections.snapshot(session, ['preparationFailures']).values.preparationFailures
  expect(view).toMatchObject({ recordCount: 1, last: { record: { stage: 'stream', category: 'route', ...labels ? { intent: 'plan', purpose: 'session-title' } : {} } } })
  expect(ctx.sessionProjections.snapshot(session, ['preparationFailures']).values.preparationFailures).toEqual(view)
  const checkpoint = JSON.parse(JSON.stringify(
    ctx.sessionProjections.checkpoint(session),
  )) as ReturnType<typeof ctx.sessionProjections.checkpoint>
  await fiber.dispose(); await ctx.plugin(Records)
  expect(ctx.sessionProjections.viewCheckpoint(checkpoint).preparationFailures).toEqual(view)
  expect(ctx.sessionProjections.snapshot(session, ['preparationFailures']).values.preparationFailures).toEqual(view)
  expect(events.filter(event => event.type === 'llm/preparation-failed')).toHaveLength(1)
  for (const value of [{ recordCount: -1 }, { recordCount: 0, prompt: 'PRIVATE' }, { recordCount: 1, last: { seq: 0,
    record: { provider: 'p', model: 'm', usageSource: 'local', stage: 'stream', category: 'route', error: 'PRIVATE' } } }]) {
    expect(() => requestPreparationFailureProjection.stateSchema.parse(value)).toThrow()
  }
})

it('joins concurrent main and auxiliary settlements without inferring identity from arrival order', async () => {
  const { ctx, adapter, call, session, events } = await fixture()
  const stepStartSeq = session.append('step/start', { turn: 1, step: 1 }).seq
  const started = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  const origin = { stepStartSeq, attempt: 1 }
  adapter.stream = async function* (options) {
    if (options.loopAttempt) { started.resolve(undefined); await release.promise }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const pending = Array.fromAsync(ctx.llm.stream({ ...call, loopAttempt: origin }))
  try {
    await started.promise
    await Array.fromAsync(ctx.llm.stream({ ...call, purpose: 'compaction' }))
    origin.stepStartSeq = SessionSeq(stepStartSeq + 99); origin.attempt = 99
  } finally { release.resolve(undefined); await pending }
  const records = events.filter(event => event.type === 'llm/request-accounting')
  expect(records).toHaveLength(2)
  expect(records[0]?.data).not.toHaveProperty('loopAttempt')
  expect(records[1]?.data).toMatchObject({ loopAttempt: { stepStartSeq, attempt: 1 } })
  const checkpoint = JSON.parse(JSON.stringify(
    ctx.sessionProjections.checkpoint(session),
  )) as ReturnType<typeof ctx.sessionProjections.checkpoint>
  expect(ctx.sessionProjections.viewCheckpoint(checkpoint).requestAccounting)
    .toMatchObject({ recordCount: 2, last: { record: { loopAttempt: { stepStartSeq, attempt: 1 } } } })
})

it('copies preparation attempt identity before asynchronous lookup and preserves it in checkpoints', async () => {
  const { ctx, adapter, call, session, events } = await fixture()
  const stepStartSeq = session.append('step/start', { turn: 1, step: 1 }).seq
  const origin = { stepStartSeq, attempt: 1 }, defect = new Error('PRIVATE_PREPARATION')
  adapter.prepareCall = async () => { origin.attempt = 999; throw defect }
  await expect(ctx.llm.prepareCall(call, undefined, { sessionId: session.id, loopAttempt: origin })).rejects.toBe(defect)
  const records = events.filter(event => event.type === 'llm/preparation-failed')
  expect(records[0]?.data).toMatchObject({ loopAttempt: { stepStartSeq, attempt: 1 } })
  const checkpoint = JSON.parse(JSON.stringify(
    ctx.sessionProjections.checkpoint(session),
  )) as ReturnType<typeof ctx.sessionProjections.checkpoint>
  expect(ctx.sessionProjections.viewCheckpoint(checkpoint).preparationFailures)
    .toMatchObject({ recordCount: 1, last: { record: { loopAttempt: { stepStartSeq, attempt: 1 } } } })
})

it('discards version-one accounting caches and rebuilds old events without inventing attribution', async () => {
  const { ctx, call, session, events } = await fixture()
  await Array.fromAsync(ctx.llm.stream(call))
  await Array.fromAsync(ctx.llm.stream({ ...call, provider: 'absent' }))
  const checkpoint = ctx.sessionProjections.checkpoint(session)
  const accounting = checkpoint.requestAccounting, preparation = checkpoint.preparationFailures
  if (!accounting || !preparation) throw new Error('Expected both checkpoint owners')
  const legacy = { ...checkpoint, requestAccounting: { ...accounting, ver: 1 }, preparationFailures: { ...preparation, ver: 1 } }
  expect(ctx.sessionProjections.viewCheckpoint(legacy)).toEqual({})
  expect(ctx.sessionProjections.restoreFloor(legacy)).toBe(0)
  const restored = ctx.sessionProjections.restore(legacy, events, SessionLogOffset(0), session.header, SessionLogOffset(0))
  expect(restored.snapshot.values).toMatchObject({ requestAccounting: { recordCount: 1 }, preparationFailures: { recordCount: 1 } })
  expect(restored.snapshot.values.requestAccounting?.last?.record).not.toHaveProperty('loopAttempt')
  expect(restored.snapshot.values.preparationFailures?.last?.record).not.toHaveProperty('loopAttempt')
  expect(restored.checkpoint.requestAccounting?.ver).toBe(3)
  expect(restored.checkpoint.preparationFailures?.ver).toBe(2)
})

it.each([0, -1, 1.5])('rejects durable attempt ordinal %s', (attempt) => {
  expect(() => requestAccountingProjection.stateSchema.parse({ recordCount: 1, bySource: { local: 1 },
    last: { seq: 2, record: { provider: 'p', model: 'm', usageSource: 'local', outcome: 'completed',
      loopAttempt: { stepStartSeq: 0, attempt }, usage: { kind: 'unknown' } } } })).toThrow()
})
