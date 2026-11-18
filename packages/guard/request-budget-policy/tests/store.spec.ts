/** Fresh atomic decisions, immutable identities and conservative replay after restart. */
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import Storage from '@deepseek-ai/dsh-storage'
import * as Sqlite from '@deepseek-ai/dsh-storage-sqlite'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { Config, type BudgetRule, type RequestBudgetId } from '../src/config.ts'
import { BudgetStore, type ReservationId } from '../src/store.ts'

const facts = { provider: 'route', model: 'm' }
const id = () => brandString<ReservationId>(randomUUID())
const budgetId = brandString<RequestBudgetId>('shared')
function rule(maxRequests = 3, reserveExecuteRequests = 1, maxRequestsPerSession?: number): BudgetRule {
  return Config({ budgets: [{ id: budgetId, usageSource: 'local', maxRequests, reserveExecuteRequests,
    ...maxRequestsPerSession === undefined ? {} : { maxRequestsPerSession },
    routes: [{ provider: 'route', models: ['m'] }] }] }).budgets.get()[0]!
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-budget-store-'))
  const owners: { ctx: Context; store: BudgetStore }[] = []
  onTestFinished(async () => {
    for (const owner of owners) { await owner.store.close(); await owner.ctx.fiber.dispose() }
    await rm(root, { recursive: true, force: true })
  })
  const path = join(root, 'storage.db')
  const open = async () => {
    const ctx = new Context()
    await ctx.plugin(Storage)
    await ctx.plugin(Sqlite, { path })
    const facility = new DomainFacility(ctx, { backend: 'sqlite' })
    ctx.storage.mount('domain', facility)
    const store = await BudgetStore.open(facility)
    owners.push({ ctx, store })
    return store
  }
  const persisted = () => {
    const db = new DatabaseSync(path)
    try {
      const row = db.prepare('SELECT value FROM u_request_budget_budgets WHERE key = ?').get(budgetId)
      return JSON.parse(String(row!.value)) as { definition: { maxRequests: number }; requests: Record<string, { state: string }> }
    } finally { db.close() }
  }
  return { open, persisted, path }
}

it('shares capacity across independently loaded owners and reserves the last slot for explicit execute intent', async () => {
  const { open, persisted } = await fixture()
  const first = await open(), second = await open(), selected = rule()
  await first.initialize(selected); await second.initialize(selected)
  await Promise.all([first.reserve(selected, id(), facts), second.reserve(selected, id(), { ...facts, intent: 'review' })])
  await expect(first.reserve(selected, id(), facts)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_EXECUTE_RESERVED' })
  await second.reserve(selected, id(), { ...facts, intent: 'execute' })
  await expect(first.reserve(selected, id(), { ...facts, intent: 'execute' })).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_EXHAUSTED' })
  expect(Object.keys(persisted().requests)).toHaveLength(3)
})

const session = (value: string) => brandString<import('@deepseek-ai/dsh-brand').Branded<'SessionId'>>(value)

it('enforces Session and shared limits atomically across owners without bypassing execute reserves', async () => {
  const { open, persisted } = await fixture(), first = await open(), second = await open(), selected = rule(3, 1, 1)
  const a = { ...facts, sessionId: session('a') }, b = { ...facts, sessionId: session('b') }
  await first.initialize(selected); await second.initialize(selected)
  const attempt = id()
  await first.reserve(selected, attempt, a)
  await second.reserve(selected, attempt, a)
  await expect(second.reserve(selected, id(), { ...a, intent: 'execute' }))
    .rejects.toMatchObject({ code: 'LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED' })
  await second.reserve(selected, id(), b)
  const c = { ...facts, sessionId: session('c') }
  await expect(first.reserve(selected, id(), c)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_EXECUTE_RESERVED' })
  await first.reserve(selected, id(), { ...c, intent: 'execute' })
  await expect(second.reserve(selected, id(), { ...facts, sessionId: session('d'), intent: 'execute' }))
    .rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_EXHAUSTED' })
  expect(Object.keys(persisted().requests)).toHaveLength(3)
})

it('refunds only cancelled Session attempts and retains auxiliary and crash charges across restart', async () => {
  const { open, persisted } = await fixture(), first = await open(), selected = rule(5, 0, 1)
  const request = { ...facts, sessionId: session('resumed'), purpose: 'compaction' as const }, cancelled = id()
  await first.initialize(selected)
  await first.reserve(selected, cancelled, request)
  await first.transition(budgetId, cancelled, 'cancelled')
  const abandoned = id()
  await first.reserve(selected, abandoned, { ...request, purpose: 'session-title' })
  await first.close()
  const restored = await open()
  await restored.initialize(selected)
  await expect(restored.reserve(selected, id(), { ...request, intent: 'execute' }))
    .rejects.toMatchObject({ code: 'LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED' })
  await restored.reserve(selected, id(), { ...request, sessionId: session('other') })
  expect(persisted().requests).toMatchObject({ [cancelled]: { state: 'cancelled' }, [abandoned]: { state: 'reserved' } })
})

it('refuses missing identity and a zero Session cap without consuming any allowance', async () => {
  const { open, persisted } = await fixture(), store = await open(), selected = rule(3, 0, 0)
  await store.initialize(selected)
  await expect(store.reserve(selected, id(), facts)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_SESSION_REQUIRED' })
  await expect(store.reserve(selected, id(), { ...facts, sessionId: session('s') }))
    .rejects.toMatchObject({ code: 'LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED' })
  expect(persisted().requests).toEqual({})
})

it.each([undefined, 0, 2])('refuses changing an immutable Session cap to %s after restart', async (limit) => {
  const { open } = await fixture(), first = await open()
  await first.initialize(rule(3, 0, 1)); await first.close()
  const restored = await open(), changed = rule(3, 0, limit)
  expect(() => { restored.validate([changed]) }).toThrow(expect.objectContaining({ code: 'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT' }))
  await expect(restored.initialize(changed)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT' })
})

it('persists zero-capacity definitions and refuses conflicting definitions after restart', async () => {
  const { open, persisted } = await fixture(), first = await open()
  await first.initialize(rule(0, 0))
  await expect(first.reserve(rule(0, 0), id(), facts)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_EXHAUSTED' })
  await first.close()
  const restored = await open()
  expect(() => { restored.validate([rule(5, 0)]) }).toThrow(expect.objectContaining({ code: 'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT' }))
  await expect(restored.initialize(rule(5, 0))).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT' })
  expect(persisted().definition.maxRequests).toBe(0)
})

it('makes reservation and settlement idempotent, refunds only known unsubmitted attempts and retains abandoned reservations', async () => {
  const { open, persisted } = await fixture(), first = await open(), selected = rule(3, 0)
  await first.initialize(selected)
  const cancelled = id(), settled = id(), abandoned = id()
  await first.reserve(selected, cancelled, facts)
  await first.reserve(selected, cancelled, facts)
  await expect(first.reserve(selected, cancelled, { ...facts, model: 'different' }))
    .rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_REQUEST_CONFLICT' })
  await first.transition(budgetId, cancelled, 'committed')
  await first.transition(budgetId, cancelled, 'cancelled')
  await first.transition(budgetId, cancelled, 'cancelled')
  await expect(first.reserve(selected, cancelled, facts)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_TRANSITION' })
  await expect(first.transition(budgetId, cancelled, 'committed')).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_TRANSITION' })
  await first.reserve(selected, settled, facts)
  await expect(first.transition(budgetId, settled, 'settled')).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_TRANSITION' })
  await first.transition(budgetId, settled, 'committed'); await first.transition(budgetId, settled, 'committed')
  await first.transition(budgetId, settled, 'settled'); await first.transition(budgetId, settled, 'settled')
  await first.transition(budgetId, settled, 'committed')
  await expect(first.transition(budgetId, settled, 'cancelled')).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_TRANSITION' })
  await expect(first.transition(budgetId, id(), 'committed')).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_TRANSITION' })
  await first.reserve(selected, abandoned, facts)
  await first.close()
  const restored = await open(); await restored.initialize(selected)
  await restored.reserve(selected, id(), facts)
  await expect(restored.reserve(selected, id(), facts)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_EXHAUSTED' })
  expect(persisted().requests).toMatchObject({ [cancelled]: { state: 'cancelled' }, [settled]: { state: 'settled' },
    [abandoned]: { state: 'reserved' } })
})

it('detects a different Host changing a previously absent allowance before local initialization', async () => {
  const { open } = await fixture(), first = await open(), second = await open()
  await first.initialize(rule())
  await expect(second.initialize(rule(5, 0))).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT' })
  await expect(second.reserve(rule(5, 0), id(), facts)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT' })
})

it('rejects absent identities and reads branded session facts from stored receipts', async () => {
  const { open, persisted } = await fixture(), store = await open()
  await expect(store.reserve(rule(), id(), facts)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT' })
  await store.initialize(rule())
  await store.reserve(rule(), id(), { ...facts, sessionId: brandString<import('@deepseek-ai/dsh-brand').Branded<'SessionId'>>('s'),
    purpose: 'compaction' })
  await store.initialize(rule())
  expect(Object.keys(persisted().requests)).toHaveLength(1)
})


it('refuses a damaged fresh receipt without resetting the allowance', async () => {
  const { open, path } = await fixture(), store = await open()
  await store.initialize(rule())
  const db = new DatabaseSync(path)
  try {
    db.prepare('UPDATE u_request_budget_budgets SET value = ? WHERE key = ?').run('{"definition":null}', budgetId)
    await expect(store.reserve(rule(), id(), facts)).rejects.toMatchObject({ code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE' })
    expect(db.prepare('SELECT value FROM u_request_budget_budgets WHERE key = ?').get(budgetId)?.value).toBe('{"definition":null}')
  } finally { db.close() }
})
