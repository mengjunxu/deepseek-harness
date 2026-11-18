/** Registered dispatch policies run after resolution and before native inference. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished } from 'vitest'
import LlmRuntime, { LlmAdapter, resolveProviderPolicy } from '../src/index.ts'
import type { GenerateOptions, StreamChunk } from '../src/index.ts'

async function fixture(stream?: (options: GenerateOptions) => AsyncIterable<StreamChunk>) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(LlmRuntime)
  const trace: string[] = [], calls: GenerateOptions[] = []
  const adapter = new class extends LlmAdapter {
    override providerInfo(provider: string) {
      return { id: provider, name: provider, policy: resolveProviderPolicy({ usageSource: 'work_codex_shared' }) }
    }
    override resolveModel(provider: string, model: string) {
      trace.push('resolve')
      return Promise.resolve({ provider, id: model, name: model })
    }
    override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      trace.push('native'); calls.push(options)
      if (stream !== undefined) { yield* stream(options); return }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }()
  const remove = ctx.effect(() => ctx.llm.registerAdapter(['fixture'], adapter))
  return { ctx, trace, calls, remove }
}

it('exposes captured registration and resolved options before the adapter starts', async () => {
  const { ctx, trace, calls } = await fixture()
  ctx.on('llm/dispatch', async function* (dispatch, next) {
    trace.push('policy')
    expect(dispatch.provider).toMatchObject({ id: 'fixture', policy: { usageSource: 'work_codex_shared' } })
    expect(dispatch.options).toMatchObject({ provider: 'fixture', model: 'm', messages: [] })
    yield* next()
  })
  await Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] }))
  expect(trace).toEqual(['resolve', 'policy', 'native'])
  expect(calls).toHaveLength(1)
})

it('finishes authorization before dispatch policies regardless of listener registration order', async () => {
  const { ctx, trace, calls } = await fixture()
  ctx.on('llm/dispatch', async function* (_dispatch, next) { trace.push('reserve'); yield* next() })
  ctx.on('llm/authorize', async function* (_dispatch, next) { trace.push('authorize'); yield* next() })
  await Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] }))
  expect(trace).toEqual(['resolve', 'authorize', 'reserve', 'native'])
  expect(calls).toHaveLength(1)
})

it('never enters dispatch policies when authorization refuses or cancellation wins', async () => {
  const { ctx, calls } = await fixture()
  let reservations = 0
  ctx.on('llm/dispatch', async function* (_dispatch, next) { reservations++; yield* next() })
  const remove = ctx.on('llm/authorize', async function* () {
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'DENIED', message: 'Denied' } } }
  })
  const request = { provider: 'fixture', model: 'm', messages: [] }
  expect((await Array.fromAsync(ctx.llm.stream(request))).at(-1)).toMatchObject({ reason: { failure: { code: 'DENIED' } } })
  remove()
  const cancelled = new AbortController(); cancelled.abort()
  ctx.on('llm/authorize', async function* (dispatch, next) { dispatch.cancelOn(cancelled.signal); yield* next() })
  expect((await Array.fromAsync(ctx.llm.stream(request))).at(-1)).toMatchObject({ reason: { kind: 'aborted' } })
  expect(reservations).toBe(0)
  expect(calls).toHaveLength(0)
})

it('rechecks admission after authorization before reserving resources', async () => {
  const { ctx, calls } = await fixture()
  let allowed = true, reservations = 0
  ctx.on('llm/admission', () => allowed ? undefined : { code: 'REVOKED', message: 'Revoked' })
  ctx.on('llm/dispatch', async function* (_dispatch, next) { reservations++; yield* next() })
  ctx.on('llm/authorize', async function* (_dispatch, next) { allowed = false; yield* next() })
  expect((await Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] }))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'REVOKED' } } })
  expect(reservations).toBe(0)
  expect(calls).toHaveLength(0)
})

it('rechecks invocation permission before reservation and native I/O, keeping check defects thrown', async () => {
  const { ctx, calls } = await fixture()
  let allowed = true, reservations = 0
  const authorize = ctx.on('llm/authorize', async function* (dispatch, next) {
    dispatch.checkBeforeDispatch(() => allowed ? undefined : { code: 'EXPIRED', message: 'Expired' })
    yield* next()
    expect(() => { dispatch.checkBeforeDispatch(() => undefined) }).toThrow(/before delegation/)
  })
  ctx.on('llm/dispatch', async function* (dispatch, next) {
    reservations++
    dispatch.checkBeforeDispatch(() => undefined)
    allowed = false
    yield* next()
  })
  expect((await Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] }))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'EXPIRED' } } })
  expect(reservations).toBe(1); expect(calls).toHaveLength(0)
  authorize()
  const defect = new Error('Permission checker defect')
  ctx.on('llm/authorize', async function* (dispatch, next) {
    dispatch.checkBeforeDispatch(() => { throw defect })
    yield* next()
  })
  await expect(Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] }))).rejects.toBe(defect)
  expect(reservations).toBe(1)
})

it('honors dispatch-phase permission checks before native construction', async () => {
  const { ctx, calls } = await fixture()
  ctx.on('llm/dispatch', async function* (dispatch, next) {
    dispatch.checkBeforeDispatch(() => ({ code: 'DISPATCH_REFUSED', message: 'Refused' }))
    yield* next()
  })
  expect((await Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] }))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'DISPATCH_REFUSED' } } })
  expect(calls).toHaveLength(0)
})

it('keeps a permission-check defect thrown at the final native check', async () => {
  const { ctx, calls } = await fixture()
  const defect = new Error('Final check defect')
  let checks = 0
  ctx.on('llm/authorize', async function* (dispatch, next) {
    dispatch.checkBeforeDispatch(() => {
      checks++
      if (checks > 1) throw defect
      return undefined
    })
    yield* next()
  })
  await expect(Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] }))).rejects.toBe(defect)
  expect(checks).toBe(2); expect(calls).toHaveLength(0)
})

it('permits an owned refusal without entering the adapter and preserves thrown policy defects', async () => {
  const { ctx, calls } = await fixture()
  const remove = ctx.on('llm/dispatch', async function* () {
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'LOCAL_LIMIT', message: 'Local limit' } } }
  })
  const request = { provider: 'fixture', model: 'm', messages: [] }
  expect((await Array.fromAsync(ctx.llm.stream(request))).at(-1)).toMatchObject({ reason: { failure: { code: 'LOCAL_LIMIT' } } })
  expect(calls).toHaveLength(0)
  remove()
  const defect = new Error('dispatch policy defect')
  ctx.on('llm/dispatch', () => { throw defect })
  await expect(Array.fromAsync(ctx.llm.stream(request))).rejects.toBe(defect)
  expect(calls).toHaveLength(0)
})

it('keeps policy iteration failures thrown after the native stream ends', async () => {
  const { ctx, calls } = await fixture()
  const defect = new Error('policy finalization defect')
  ctx.on('llm/dispatch', async function* (_dispatch, next) { yield* next(); throw defect })
  await expect(Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] }))).rejects.toBe(defect)
  expect(calls).toHaveLength(1)
})

it('rechecks pure admission after asynchronous policy work', async () => {
  const { ctx, calls } = await fixture()
  const ready = Promise.withResolvers<undefined>(), proceed = Promise.withResolvers<undefined>()
  let allowed = true
  ctx.on('llm/admission', () => allowed ? undefined : { code: 'REVOKED', message: 'Revoked' })
  ctx.on('llm/dispatch', async function* (_dispatch, next) {
    ready.resolve(undefined); await proceed.promise
    yield* next()
  })
  const pending = Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] }))
  onTestFinished(async () => { proceed.resolve(undefined); await pending })
  await ready.promise
  allowed = false
  proceed.resolve(undefined)
  expect((await pending).at(-1)).toMatchObject({ reason: { kind: 'error', failure: { code: 'REVOKED' } } })
  expect(calls).toHaveLength(0)
})

it('retains the prepared registration while a dispatch policy waits across replacement', async () => {
  const { ctx, calls, remove } = await fixture()
  const ready = Promise.withResolvers<undefined>(), proceed = Promise.withResolvers<undefined>()
  let replacements = 0
  ctx.on('llm/dispatch', async function* (dispatch, next) {
    expect(dispatch.provider.policy?.usageSource).toBe('work_codex_shared')
    ready.resolve(undefined); await proceed.promise
    expect(dispatch.provider.policy?.usageSource).toBe('work_codex_shared')
    yield* next()
  })
  const prepared = await ctx.llm.prepareCall({ provider: 'fixture', model: 'm' })
  const pending = Array.fromAsync(prepared.stream({ ...prepared.config, messages: [] }))
  onTestFinished(async () => { proceed.resolve(undefined); await pending })
  await ready.promise
  await remove()
  const replacement = new class extends LlmAdapter {
    override providerInfo(provider: string) {
      return { id: provider, name: provider, policy: resolveProviderPolicy({ usageSource: 'api_metered' }) }
    }
    override async *stream(): AsyncIterable<StreamChunk> {
      replacements += 1
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }()
  ctx.effect(() => ctx.llm.registerAdapter(['fixture'], replacement))
  proceed.resolve(undefined)
  await pending
  expect(calls).toHaveLength(1)
  expect(replacements).toBe(0)
})

it.each(['caller', 'first', 'second'] as const)('composes %s cancellation without changing request content', async (owner) => {
  const caller = new AbortController(), first = new AbortController(), second = new AbortController()
  const ready = Promise.withResolvers<undefined>()
  const { ctx, calls } = await fixture(async function* (options) {
    const signal = options.signal
    if (signal === undefined) throw new Error('Expected a composed dispatch signal')
    const stopped = new Promise<void>((resolve) => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    ready.resolve(undefined); await stopped
    yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'Fixture cancelled' } } }
  })
  ctx.on('llm/dispatch', async function* (dispatch, next) { dispatch.cancelOn(first.signal); yield* next() })
  ctx.on('llm/dispatch', async function* (dispatch, next) { dispatch.cancelOn(second.signal); yield* next() })
  const messages: GenerateOptions['messages'] = []
  const options = Object.freeze({ provider: 'fixture', model: 'm', messages, signal: caller.signal })
  const pending = Array.fromAsync(ctx.llm.stream(options))
  onTestFinished(async () => { caller.abort(); await pending })
  await ready.promise
  const selected = { caller, first, second }[owner]
  selected.abort()
  expect((await pending).at(-1)).toMatchObject({ reason: { kind: 'aborted', failure: { code: 'ABORTED' } } })
  expect(calls[0]?.messages).toBe(messages)
  expect(calls[0]?.signal?.aborted).toBe(true)
  expect(Object.isFrozen(calls[0])).toBe(true)
  expect(options.signal).toBe(caller.signal)
  expect(caller.signal.aborted).toBe(owner === 'caller')
})

it('refuses an already-cancelled additional lifetime before adapter construction', async () => {
  const { ctx, calls } = await fixture()
  const lifetime = new AbortController(); lifetime.abort()
  ctx.on('llm/dispatch', async function* (dispatch, next) { dispatch.cancelOn(lifetime.signal); yield* next() })
  expect((await Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] }))).at(-1))
    .toMatchObject({ reason: { kind: 'aborted', failure: { code: 'ABORTED' } } })
  expect(calls).toHaveLength(0)
})

it('refuses an already-cancelled caller before entering the adapter', async () => {
  const { ctx, calls } = await fixture()
  const caller = new AbortController(); caller.abort()
  expect((await Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [], signal: caller.signal }))).at(-1))
    .toMatchObject({ reason: { kind: 'aborted', failure: { code: 'ABORTED' } } })
  expect(calls).toHaveLength(0)
})

it('refuses repeated delegation and cancellation registration after delegation', async () => {
  const { ctx, calls } = await fixture()
  ctx.on('llm/dispatch', async function* (dispatch, next) {
    const stream = next()
    expect(() => { dispatch.cancelOn(new AbortController().signal) }).toThrow('before delegation')
    yield* stream
    yield* next()
  })
  await expect(Array.fromAsync(ctx.llm.stream({ provider: 'fixture', model: 'm', messages: [] })))
    .rejects.toMatchObject({ code: 'INVALID_DISPATCH_CONTROL' })
  expect(calls).toHaveLength(1)
})
