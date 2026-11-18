/** Atomic read/modify/write through independent owners of one SQLite medium. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, onTestFinished, vi } from 'vitest'
import type { KvUnit } from '@deepseek-ai/dsh-storage'
import { Config, SqliteStorageBackend } from '../src/index.ts'

const descriptor = { name: 'atomic_budget', version: 1, tables: ['records'], hasGlobal: false }

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-atomic-record-'))
  const backends: SqliteStorageBackend[] = []
  onTestFinished(async () => {
    for (const backend of backends) await backend.close()
    await rm(root, { recursive: true, force: true })
  })
  const path = join(root, 'storage.db')
  const open = async (): Promise<KvUnit> => {
    const backend = new SqliteStorageBackend(new Config({ path }))
    backends.push(backend)
    return backend.kv.open(descriptor)
  }
  return { path, open }
}

function modifier(unit: KvUnit) {
  if (unit.modifyRecord === undefined) throw new Error('SQLite must implement atomic record modification')
  return unit.modifyRecord.bind(unit)
}

function increment(value: unknown): number {
  if (value === undefined) return 1
  if (typeof value !== 'number') throw new Error('Expected a persisted counter')
  return value + 1
}

it('reads the latest committed value through independently opened owners and survives reopening', async () => {
  const { open } = await fixture()
  const first = await open(), second = await open()
  const a = modifier(first), b = modifier(second)
  expect(await a('records', 'shared', increment)).toBe(1)
  expect(await b('records', 'shared', increment)).toBe(2)
  expect(await a('records', 'shared', increment)).toBe(3)
  expect(await b('records', '__proto__', () => null)).toBeNull()
  expect(await a('records', '__proto__', current => current)).toBeNull()
  await first.close(); await second.close()
  const restored = await open()
  expect((await restored.loadAll()).tables['records']).toEqual({ shared: 3, ['__proto__']: null })
})

it('deletes existing or absent records and rolls back callback or serialization failures', async () => {
  const { open } = await fixture()
  const unit = await open(), modify = modifier(unit)
  await unit.putRecord('records', 'shared', 5)
  const rejected = new Error('reservation refused')
  await expect(modify('records', 'shared', () => { throw rejected })).rejects.toBe(rejected)
  await expect(modify('records', 'shared', () => 1n)).rejects.toThrow(/BigInt/)
  expect((await unit.loadAll()).tables['records']).toEqual({ shared: 5 })
  expect(await modify('records', 'shared', increment)).toBe(6)
  expect(await modify('records', 'shared', () => undefined)).toBeUndefined()
  expect(await modify('records', 'missing', () => undefined)).toBeUndefined()
  expect((await unit.loadAll()).tables['records']).toEqual({})
})

it('refuses lock contention before the callback and can modify after the other writer releases', async () => {
  const { path, open } = await fixture()
  const unit = await open(), modify = modifier(unit)
  await unit.putRecord('records', 'shared', 5)
  const other = new DatabaseSync(path)
  onTestFinished(() => { other.close() })
  const callback = vi.fn(increment)
  other.exec('BEGIN IMMEDIATE')
  try {
    await expect(modify('records', 'shared', callback)).rejects.toThrow(/locked|busy/)
    expect(callback).not.toHaveBeenCalled()
    other.prepare('UPDATE u_atomic_budget_records SET value = ? WHERE key = ?').run('9', 'shared')
  } finally { other.exec('COMMIT') }
  expect(await modify('records', 'shared', callback)).toBe(10)
})

it('rejects invalid tables, corrupt persisted JSON and closed units without invoking the callback', async () => {
  const { path, open } = await fixture()
  const unit = await open(), modify = modifier(unit)
  const callback = vi.fn(increment)
  await expect(modify('undeclared', 'key', callback)).rejects.toThrow(/declared no table/)
  const other = new DatabaseSync(path)
  try {
    other.prepare('INSERT INTO u_atomic_budget_records (key, value) VALUES (?, ?)').run('bad', '{broken')
    await expect(modify('records', 'bad', callback)).rejects.toMatchObject({ code: 'malformed-medium' })
    expect(other.prepare('SELECT value FROM u_atomic_budget_records WHERE key = ?').get('bad')).toEqual({ value: '{broken' })
  } finally { other.close() }
  await unit.close()
  await expect(modify('records', 'key', callback)).rejects.toMatchObject({ code: 'closed' })
  expect(callback).not.toHaveBeenCalled()
})

it('retains a commit error when SQLite has already rolled the transaction back', async () => {
  const { open } = await fixture()
  const unit = await open(), modify = modifier(unit)
  await unit.putRecord('records', 'shared', 5)
  // oxlint-disable-next-line typescript/unbound-method -- the saved native method is invoked with an explicit database receiver
  const exec = DatabaseSync.prototype.exec
  const fault = new Error('SQLite commit aborted')
  const spy = vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (this: DatabaseSync, sql: string) {
    if (sql === 'COMMIT') {
      exec.call(this, 'ROLLBACK')
      throw fault
    }
    exec.call(this, sql)
  })
  try {
    await expect(modify('records', 'shared', increment)).rejects.toBe(fault)
  } finally { spy.mockRestore() }
  expect((await unit.loadAll()).tables['records']).toEqual({ shared: 5 })
  expect(await modify('records', 'shared', increment)).toBe(6)
})

it('retains both failures when rollback also fails', async () => {
  const { open } = await fixture()
  const unit = await open(), modify = modifier(unit)
  await unit.putRecord('records', 'shared', 5)
  // oxlint-disable-next-line typescript/unbound-method -- the saved native method is invoked with an explicit database receiver
  const exec = DatabaseSync.prototype.exec
  const refused = new Error('reservation refused'), rollback = new Error('rollback IO failure')
  let rollbackPending: (() => void) | undefined
  const spy = vi.spyOn(DatabaseSync.prototype, 'exec').mockImplementation(function (this: DatabaseSync, sql: string) {
    if (sql === 'ROLLBACK') { rollbackPending = () => { exec.call(this, 'ROLLBACK') }; throw rollback }
    exec.call(this, sql)
  })
  try {
    await expect(modify('records', 'shared', () => { throw refused })).rejects.toMatchObject({
      name: 'AggregateError', errors: [refused, rollback], cause: refused,
    })
  } finally {
    spy.mockRestore()
    rollbackPending?.()
  }
  expect((await unit.loadAll()).tables['records']).toEqual({ shared: 5 })
})
