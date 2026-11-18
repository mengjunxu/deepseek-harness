/** Production dispatch guard under live Loader updates, cancellation and storage teardown. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, onTestFinished, vi } from 'vitest'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import Storage from '@deepseek-ai/dsh-storage'
import * as Sqlite from '@deepseek-ai/dsh-storage-sqlite'
import * as Domain from '@deepseek-ai/dsh-storage-domain'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import { Adapter } from '../../paid-route-policy/tests/adapter.ts'
import { BudgetStore } from '../src/store.ts'
import { BudgetRuntime } from '../src/runtime.ts'
import { MemoryStorageBackend } from '../../../storage/storage-domain/tests/helpers/memory-backend.ts'
import * as Policy from '../src/index.ts'

const call = { provider: 'paid', model: 'm', messages: [] }
const budget = { id: 'local-period', usageSource: 'local' as const, maxRequests: 2, reserveExecuteRequests: 1,
  routes: [{ provider: 'paid', models: ['m'] }] }
async function boot(withStorage = true) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-budget-runtime-')), ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  await ctx.plugin(LlmRuntime)
  const adapter = new Adapter('local')
  ctx.effect(() => ctx.llm.registerAdapter(['paid', 'other'], adapter))
  if (withStorage) {
    await ctx.plugin(Storage)
    await ctx.plugin(Sqlite, { path: join(root, 'storage.db') })
    await ctx.plugin(Domain, { backend: 'sqlite' })
  }
  return { ctx, adapter, root }
}
async function fixture(withStorage = true, maxRequests = 2, reserveExecuteRequests = 1, maxRequestsPerSession?: number) {
  const { ctx, adapter, root } = await boot(withStorage)
  const live = await liveConfig(ctx, Policy, { budgets: [{ ...budget, maxRequests, reserveExecuteRequests, maxRequestsPerSession }] })
  if (withStorage) await vi.waitFor(async () => { await expect(ctx.llm.prepareCall(call)).resolves.toBeDefined() })
  const receipts = () => {
    const db = new DatabaseSync(join(root, 'storage.db'))
    try {
      const row = db.prepare('SELECT value FROM u_request_budget_budgets WHERE key = ?').get(budget.id)
      return (JSON.parse(String(row!.value)) as { requests: Record<string, { state: string }> }).requests
    } finally { db.close() }
  }
  return { ctx, live, adapter, receipts }
}
function barrier() { return Promise.withResolvers<undefined>() }

it('refuses missing Session identity before native dispatch and shares a cap across intents and auxiliary calls', async () => {
  const { ctx, adapter, live, receipts } = await fixture(true, 5, 1, 1)
  const prepared = await ctx.llm.prepareCall(call)
  expect((await Array.fromAsync(prepared.stream(call))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'LOCAL_REQUEST_BUDGET_SESSION_REQUIRED' } } })
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'LOCAL_REQUEST_BUDGET_SESSION_REQUIRED' } } })
  expect(adapter.calls).toBe(0)
  const request = { ...call, sessionId: brandString<Branded<'SessionId'>>('same-session') }
  expect((await Array.fromAsync(ctx.llm.stream({ ...request, purpose: 'session-title' }))).at(-1))
    .toMatchObject({ reason: { kind: 'stop' } })
  expect((await Array.fromAsync(ctx.llm.stream({ ...request, intent: 'execute' }))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED' } } })
  expect((await Array.fromAsync(ctx.llm.stream({ ...request, sessionId: brandString<Branded<'SessionId'>>('different-session') }))).at(-1))
    .toMatchObject({ reason: { kind: 'stop' } })
  await expect(live.update({ budgets: [{ ...budget, maxRequests: 5, maxRequestsPerSession: 2 }] }))
    .rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT' })
  expect(adapter.calls).toBe(2)
  expect(Object.values(receipts()).map(item => item.state)).toEqual(['settled', 'settled'])
})

it('checks the last execute slot on real dispatch, preserves unknown official balance and withdraws on disposal', async () => {
  const { ctx, adapter, live, receipts } = await fixture()
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'LOCAL_REQUEST_BUDGET_EXECUTE_RESERVED' } } })
  expect((await Array.fromAsync(ctx.llm.stream({ ...call, intent: 'execute' }))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
  expect((await Array.fromAsync(ctx.llm.stream({ ...call, intent: 'execute' }))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'LOCAL_REQUEST_BUDGET_EXHAUSTED' } } })
  expect(adapter.calls).toBe(2)
  expect(Object.values(receipts()).map(item => item.state)).toEqual(['settled', 'settled'])
  expect(ctx.llm.listProviders()[0]?.policy?.balance).toEqual({ status: 'unknown' })
  await live.fiber.dispose()
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
})

it('fails closed without storage, permits unprotected routes and rejects a captured source mismatch', async () => {
  const { ctx, adapter } = await fixture(false)
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' })
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' } } })
  expect(adapter.calls).toBe(0)
  expect((await Array.fromAsync(ctx.llm.stream({ ...call, provider: 'other' }))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
  ctx.effect(() => ctx.llm.registerAdapter(['changed'], new Adapter('api_metered')))
  // The protected route remains fixed; replacing its registration changes the captured source.
  const replacement = new Adapter('api_metered')
  await ctx.fiber.dispose()
  const ready = await fixture()
  ready.ctx.effect(() => ready.ctx.llm.registerAdapter(['changed'], replacement))
  await ready.live.update({ budgets: [{ ...budget, routes: [{ provider: 'changed', models: ['m'] }] }] })
  await expect(ready.ctx.llm.prepareCall({ ...call, provider: 'changed' }))
    .rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_SOURCE_CHANGED' })
  expect(replacement.calls).toBe(0)
})

it('rejects a capacity edit before live values change and initializes a newly named period without remounting', async () => {
  const { ctx, live, adapter } = await fixture()
  await expect(live.update({ budgets: [{ ...budget, maxRequests: 9 }] })).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT' })
  await live.update({ budgets: [{ ...budget, id: 'next-period', maxRequests: 0, reserveExecuteRequests: 0 }] })
  expect(live.entry.fiber === live.fiber).toBe(true)
  await vi.waitFor(async () => { await expect(ctx.llm.prepareCall(call)).resolves.toBeDefined() })
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'LOCAL_REQUEST_BUDGET_EXHAUSTED' } } })
  expect(adapter.calls).toBe(0)
})

it.each(['abort', 'revoke'] as const)('refunds a reserved but unsubmitted request after %s during storage work', async (operation) => {
  const { ctx, live, adapter, receipts } = await fixture(true, 2, 1, 1)
  const request = { ...call, sessionId: brandString<Branded<'SessionId'>>('cancelled-session') }
  const entered = barrier(), release = barrier(), abort = new AbortController()
  // The captured method is invoked with its actual receiver inside the barrier wrapper.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const reserve = BudgetStore.prototype.reserve
  const spy = vi.spyOn(BudgetStore.prototype, 'reserve').mockImplementation(async function (this: BudgetStore, ...args) {
    await reserve.call(this, ...args); entered.resolve(undefined); await release.promise
  })
  onTestFinished(() => { spy.mockRestore() })
  const pending = Array.fromAsync(ctx.llm.stream({ ...request, signal: abort.signal }))
  let chunks: StreamChunk[]
  try {
    await entered.promise
    if (operation === 'abort') abort.abort()
    else await live.update({ budgets: [] })
  } finally { release.resolve(undefined); chunks = await pending; spy.mockRestore() }
  expect(chunks.at(-1)).toMatchObject({ reason: { failure: { code: operation === 'abort' ? 'ABORTED' : 'LOCAL_REQUEST_BUDGET_REVOKED' } } })
  expect(adapter.calls).toBe(0)
  expect(Object.values(receipts()).map(item => item.state)).toEqual(['cancelled'])
  if (operation === 'revoke') {
    await live.update({ budgets: [{ ...budget, maxRequestsPerSession: 1 }] })
    await vi.waitFor(async () => { await expect(ctx.llm.prepareCall(call)).resolves.toBeDefined() })
  }
  expect((await Array.fromAsync(ctx.llm.stream(request))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
})

it('aborts an active transport, drains its charged receipt and closes storage during disposal', async () => {
  const { ctx, live, adapter, receipts } = await fixture()
  const entered = barrier()
  let observedSignal: AbortSignal | undefined
  adapter.stream = async function* (options: GenerateOptions) {
    adapter.calls++; observedSignal = options.signal; entered.resolve(undefined)
    if (!options.signal?.aborted) await new Promise<undefined>((resolve) => { options.signal!.addEventListener('abort', () => { resolve(undefined) }, { once: true }) })
    yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'Fixture transport aborted' } } }
  }
  const pending = Array.fromAsync(ctx.llm.stream(call))
  try {
    await entered.promise
    await live.fiber.dispose()
    expect(observedSignal?.aborted).toBe(true)
  } finally { await live.fiber.dispose(); await pending }
  expect(Object.values(receipts()).map(item => item.state)).toEqual(['settled'])
  expect(adapter.calls).toBe(1)
})

it('retains a possibly submitted charge when a downstream policy throws', async () => {
  const { ctx, receipts, adapter } = await fixture()
  const defect = new Error('downstream policy defect')
  ctx.on('llm/dispatch', () => { throw defect })
  await expect(Array.fromAsync(ctx.llm.stream(call))).rejects.toBe(defect)
  expect(adapter.calls).toBe(0)
  expect(Object.values(receipts()).map(item => item.state)).toEqual(['settled'])
})

it('closes admission when settlement storage fails and retains the committed receipt', async () => {
  const { ctx, receipts } = await fixture()
  // Invoked with the actual receiver inside the fault wrapper.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const transition = BudgetStore.prototype.transition
  const spy = vi.spyOn(BudgetStore.prototype, 'transition').mockImplementation(function (this: BudgetStore, ...args) {
    if (args[2] === 'settled') return Promise.reject(new Error('storage disconnected'))
    return transition.call(this, ...args)
  })
  onTestFinished(() => { spy.mockRestore() })
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' })
  expect(Object.values(receipts()).map(item => item.state)).toEqual(['committed'])
})

it('cancels a committed reservation if its owner observes cancellation before delegation', async () => {
  const { ctx, receipts, adapter } = await fixture()
  const abort = new AbortController()
  // Invoked with the actual receiver inside the cancellation wrapper.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = BudgetStore.prototype.transition
  const spy = vi.spyOn(BudgetStore.prototype, 'transition').mockImplementation(async function (this: BudgetStore, ...args) {
    await original.call(this, ...args)
    if (args[2] === 'committed') abort.abort()
  })
  onTestFinished(() => { spy.mockRestore() })
  expect((await Array.fromAsync(ctx.llm.stream({ ...call, signal: abort.signal }))).at(-1)).toMatchObject({ reason: { kind: 'aborted' } })
  expect(adapter.calls).toBe(0)
  expect(Object.values(receipts()).map(item => item.state)).toEqual(['cancelled'])
})

it('keeps admission installed after initialization fails and recovers on a valid live collection', async () => {
  const { ctx, adapter } = await boot()
  // Reinstalled as a method implementation; it is never invoked unbound.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = BudgetStore.prototype.initialize
  const failed = barrier()
  const spy = vi.spyOn(BudgetStore.prototype, 'initialize').mockImplementationOnce(async () => {
    failed.resolve(undefined)
    throw new Error('simulated unavailable atomic backend')
  })
  onTestFinished(() => { spy.mockRestore() })
  const live = await liveConfig(ctx, Policy, { budgets: [budget] })
  await failed.promise
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' })
  expect(adapter.calls).toBe(0)
  spy.mockImplementation(original)
  await live.update({ budgets: [{ ...budget, id: 'recovered-period' }] })
  await vi.waitFor(async () => { await expect(ctx.llm.prepareCall(call)).resolves.toBeDefined() })
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
})

it('closes an acquired domain if disposal occurs while opening it', async () => {
  const { ctx, adapter } = await boot(), entered = barrier(), release = barrier()
  const original = BudgetStore.open.bind(BudgetStore)
  const spy = vi.spyOn(BudgetStore, 'open').mockImplementation(async (facility) => {
    const store = await original(facility)
    entered.resolve(undefined)
    await release.promise
    return store
  })
  onTestFinished(() => { spy.mockRestore() })
  const fiber = ctx.plugin(Policy, { budgets: [budget] })
  await entered.promise
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' })
  const disposed = fiber.dispose()
  try { expect(adapter.calls).toBe(0) }
  finally { release.resolve(undefined); await disposed }
  expect(ctx.storageDomain.get('request_budget')).toBeUndefined()
})

it('reports an open failure without removing protection or leaking an acquired handle', async () => {
  const { ctx, adapter } = await boot(), failed = barrier()
  const spy = vi.spyOn(BudgetStore, 'open').mockImplementation(async () => {
    failed.resolve(undefined)
    throw new Error('invalid persisted budget domain')
  })
  onTestFinished(() => { spy.mockRestore() })
  const fiber = ctx.plugin(Policy, { budgets: [budget] })
  await failed.promise
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' })
  expect(adapter.calls).toBe(0)
  await fiber.dispose()
})

it('drains initialization during disposal before closing the domain', async () => {
  const { ctx } = await boot(), entered = barrier(), release = barrier()
  // The original receives its owning store explicitly in the barrier wrapper.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = BudgetStore.prototype.initialize
  const spy = vi.spyOn(BudgetStore.prototype, 'initialize').mockImplementation(async function (this: BudgetStore, rule) {
    await original.call(this, rule); entered.resolve(undefined); await release.promise
  })
  onTestFinished(() => { spy.mockRestore() })
  const fiber = ctx.plugin(Policy, { budgets: [budget, { ...budget, id: 'second', routes: [{ provider: 'other', models: ['m'] }] }] })
  await entered.promise
  const disposed = fiber.dispose()
  try { expect(ctx.storageDomain.get('request_budget')).toBeDefined() }
  finally { release.resolve(undefined); await disposed }
  expect(ctx.storageDomain.get('request_budget')).toBeUndefined()
})

it('matches an undeclared source only through explicit unknown and persists auxiliary/session classification', async () => {
  const { ctx, live } = await fixture()
  const unclassified: import('@deepseek-ai/dsh-llm').LlmAdapter = new Adapter()
  unclassified.providerInfo = provider => ({ id: provider, name: provider })
  ctx.effect(() => ctx.llm.registerAdapter(['unclassified'], unclassified))
  await live.update({ budgets: [{ ...budget, id: 'unknown-source-period', usageSource: 'unknown', routes: [{ provider: 'unclassified', models: ['m'] }] }] })
  const request = { ...call, provider: 'unclassified', sessionId: brandString<Branded<'SessionId'>>('session-id'), purpose: 'session-title' as const }
  await vi.waitFor(async () => { await expect(ctx.llm.prepareCall(request)).resolves.toBeDefined() })
  expect((await Array.fromAsync(ctx.llm.stream(request))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
})

it('refuses atomic accounting on a backend that only implements cached read/write', async () => {
  const { ctx, adapter } = await boot(false)
  await ctx.plugin(Storage)
  ctx.effect(() => ctx.storage.backend.register('memory', new MemoryStorageBackend()))
  await ctx.plugin(Domain, { backend: 'memory' })
  const live = await liveConfig(ctx, Policy, { budgets: [budget] })
  const change = vi.fn()
  ctx.on('domain/changed', change)
  await ctx.fiber.await()
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' })
  expect(adapter.calls).toBe(0)
  expect(change).not.toHaveBeenCalled()
  await live.fiber.dispose()
})

it('closes an acquired store after an unexpected activation defect while retaining parent admission', async () => {
  const { ctx, adapter } = await boot()
  const failed = barrier()
  const spy = vi.spyOn(BudgetRuntime.prototype, 'initialize').mockImplementation(() => {
    failed.resolve(undefined)
    return Promise.reject(new Error('activation defect'))
  })
  onTestFinished(() => { spy.mockRestore() })
  const live = await liveConfig(ctx, Policy, { budgets: [budget] })
  await failed.promise
  await vi.waitFor(() => { expect(ctx.storageDomain.get('request_budget')).toBeUndefined() })
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' })
  expect(adapter.calls).toBe(0)
  await live.fiber.dispose()
})

it('refuses a dispatch that reaches the policy while a live replacement initializes', async () => {
  const { ctx, adapter } = await boot(), entered = barrier(), release = barrier()
  ctx.on('llm/dispatch', async function* (_dispatch, next) {
    entered.resolve(undefined); await release.promise; yield* next()
  })
  const live = await liveConfig(ctx, Policy, { budgets: [budget] })
  await vi.waitFor(async () => { await expect(ctx.llm.prepareCall(call)).resolves.toBeDefined() })
  const pending = Array.fromAsync(ctx.llm.stream(call))
  const initialized = barrier(), allowInitialization = barrier()
  // The original is invoked with its actual receiver inside the barrier wrapper.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = BudgetStore.prototype.initialize
  const spy = vi.spyOn(BudgetStore.prototype, 'initialize').mockImplementation(async function (this: BudgetStore, rule) {
    await original.call(this, rule); initialized.resolve(undefined); await allowInitialization.promise
  })
  onTestFinished(() => { spy.mockRestore() })
  try {
    await entered.promise
    await live.update({ budgets: [{ ...budget, id: 'replacement' }] })
    await initialized.promise
    release.resolve(undefined)
    expect((await pending).at(-1)).toMatchObject({ reason: { failure: { code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' } } })
    expect(adapter.calls).toBe(0)
    // A second update can finish before the first; the old snapshot must never regain readiness.
    await live.update({ budgets: [] })
  } finally { release.resolve(undefined); allowInitialization.resolve(undefined); await pending }
})

it.each([true, false])('drains the application phase before resource disposal with storage=%s', async (withStorage) => {
  const { ctx, receipts } = await fixture(withStorage)
  if (withStorage) await Array.fromAsync(ctx.llm.stream(call))
  await ctx.parallel('app-boot/before-dispose')
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' })
  if (withStorage) expect(Object.values(receipts()).map(item => item.state)).toEqual(['settled'])
})
