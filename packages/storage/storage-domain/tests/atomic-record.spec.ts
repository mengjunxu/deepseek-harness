/** Schema-validated atomic domain modification without stale cached admission. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, onTestFinished, vi } from 'vitest'
import { z } from 'zod'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as Sqlite from '@deepseek-ai/dsh-storage-sqlite'
import { defineDomain, domainTable, DomainFacility } from '../src/index.ts'
import type { DomainChanged } from '../src/events.ts'
import { MemoryStorageBackend } from './helpers/memory-backend.ts'

const spec = defineDomain({ name: 'atomic_budget', version: 1,
  tables: { counters: domainTable<string, { used: number }>(z.object({ used: z.number().int().nonnegative() })) } })

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-domain-atomic-'))
  const contexts: Context[] = [], facilities: DomainFacility[] = []
  onTestFinished(async () => {
    for (const facility of facilities) await facility.closeAll()
    for (const ctx of contexts) await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })
  const open = async () => {
    const ctx = new Context(); contexts.push(ctx)
    await ctx.plugin(Storage)
    await ctx.plugin(Sqlite, { path: join(root, 'storage.db') })
    const facility = new DomainFacility(ctx, { backend: 'sqlite' }); facilities.push(facility)
    ctx.storage.mount('domain', facility)
    const domain = await facility.open(spec)
    const changes: DomainChanged[] = []
    ctx.on('domain/changed', (change) => { changes.push(change) })
    return { ctx, domain, changes }
  }
  return { open, path: join(root, 'storage.db') }
}

it('modifies the persisted value across owners, updates its own cache and emits committed changes', async () => {
  const { open } = await fixture()
  const first = await open(), second = await open()
  const a = first.domain.table('counters'), b = second.domain.table('counters')
  expect(await a.modify('shared', current => ({ used: (current?.used ?? 0) + 1 }))).toEqual({ used: 1 })
  expect(b.get('shared')).toBeUndefined()
  expect(await b.modify('shared', current => ({ used: current!.used + 1 }))).toEqual({ used: 2 })
  expect(a.get('shared')).toEqual({ used: 1 })
  expect(await a.modify('shared', current => ({ used: current!.used + 1 }))).toEqual({ used: 3 })
  expect(first.changes.map(change => change.value)).toEqual([{ used: 1 }, { used: 3 }])
  expect(await a.modify('shared', () => undefined)).toBeUndefined()
  expect(await a.modify('missing', () => undefined)).toBeUndefined()
  expect(a.get('shared')).toBeUndefined()
  expect(first.changes.at(-1)).toMatchObject({ key: 'shared', operation: 'deleted' })
  expect(first.changes).toHaveLength(3)
  expect(await b.modify('shared', () => undefined)).toBeUndefined()
  expect(b.get('shared')).toBeUndefined()
  expect(second.changes.at(-1)).toMatchObject({ key: 'shared', operation: 'deleted' })
  const restored = await open()
  expect(restored.domain.table('counters').get('shared')).toBeUndefined()
})

it('rejects fresh invalid records and callback failures without changing memory or emitting events', async () => {
  const { open, path } = await fixture()
  const first = await open(), table = first.domain.table('counters')
  await table.put('shared', { used: 1 })
  const refused = new Error('reservation refused')
  await expect(table.modify('shared', () => { throw refused })).rejects.toBe(refused)
  const other = new DatabaseSync(path)
  try {
    other.prepare('UPDATE u_atomic_budget_counters SET value = ? WHERE key = ?').run('{"used":"invalid"}', 'shared')
  } finally { other.close() }
  const modify = vi.fn((current: { used: number } | undefined) => current)
  await expect(table.modify('shared', modify)).rejects.toMatchObject({ code: 'invalid-record', detail: { table: 'counters', key: 'shared' } })
  expect(modify).not.toHaveBeenCalled()
  expect(table.get('shared')).toEqual({ used: 1 })
  expect(first.changes).toHaveLength(1)
})

it('rejects unsupported atomic modification instead of using a cached read and write', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend()
  ctx.storage.backend.register('memory', backend)
  const facility = new DomainFacility(ctx, { backend: 'memory' })
  onTestFinished(() => facility.closeAll())
  const table = (await facility.open(spec)).table('counters')
  await table.put('shared', { used: 1 })
  const modify = vi.fn((current: { used: number } | undefined) => current)
  await expect(table.modify('shared', modify)).rejects.toMatchObject({ code: 'atomic-modify-unsupported' })
  expect(modify).not.toHaveBeenCalled()
  expect(table.get('shared')).toEqual({ used: 1 })
})

it('rolls back every record on a failed command and publishes the complete committed view', async () => {
  const { open } = await fixture()
  const { domain, changes } = await open()
  const counters = domain.table('counters')
  await expect(domain.transaction((tx) => {
    tx.set('counters', 'a', { used: 3 })
    tx.set('counters', 'b', { used: -1 })
  })).rejects.toMatchObject({ code: 'invalid-record' })
  expect(changes).toHaveLength(0)
  expect(counters.size).toBe(0)
  await domain.transaction((tx) => {
    expect(tx.get('counters', 'a')).toBeUndefined()
    tx.set('counters', 'a', { used: 2 })
    tx.set('counters', 'b', { used: tx.get('counters', 'a')!.used + 1 })
  })
  expect(Array.from(counters.entries())).toEqual([['a', { used: 2 }], ['b', { used: 3 }]])
  expect(changes.map(change => change.key)).toEqual(['a', 'b'])
  const other = await open()
  expect(Array.from(other.domain.table('counters').entries())).toEqual(Array.from(counters.entries()))
  await other.domain.transaction((tx) => { tx.set('counters', 'c', { used: 4 }) })
  expect(counters.get('c')).toBeUndefined()
  await domain.transaction((tx) => {
    expect(tx.entries('counters')).toEqual(expect.arrayContaining([['c', { used: 4 }]]))
    tx.set('counters', 'b', undefined)
    expect(tx.entries('counters').map(([key]) => key)).not.toContain('b')
  })
  expect(counters.get('b')).toBeUndefined()
})

it('refuses transactions on a medium without atomic multi-record writes', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend())
  const facility = new DomainFacility(ctx, { backend: 'memory' })
  onTestFinished(() => facility.closeAll())
  const callback = vi.fn()
  await expect((await facility.open(spec)).transaction(callback)).rejects.toMatchObject({ code: 'atomic-modify-unsupported' })
  expect(callback).not.toHaveBeenCalled()
})
