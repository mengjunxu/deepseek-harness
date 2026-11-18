/** Service withdrawal must drain a consumer's final writes before closing its domain. */
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { expect, it, onTestFinished } from 'vitest'
import Storage, { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import * as Domain from '../src/index.ts'
import { MemoryStorageBackend } from './helpers/memory-backend.ts'

it('keeps a domain writable while an injected consumer drains on provider withdrawal', async () => {
  const ctx = new Context(), entered = Promise.withResolvers<undefined>(), release = Promise.withResolvers<undefined>()
  onTestFinished(async () => { release.resolve(undefined); await ctx.fiber.dispose() })
  await ctx.plugin(Storage)
  const backend = new MemoryStorageBackend()
  ctx.effect(() => ctx.storage.backend.register('memory', backend))
  ctx.provide(storageBackendServiceKey('memory'), backend)
  const provider = await ctx.plugin(Domain, { backend: 'memory' })
  const spec = Domain.defineDomain({ name: 'draining_consumer', version: 1,
    tables: { rows: Domain.domainTable<string, number>(z.number()) } })
  await ctx.plugin({ inject: ['storageDomain'], async apply(child: Context) {
    const domain = await child.storageDomain.open(spec)
    child.effect(() => async () => {
      entered.resolve(undefined)
      await release.promise
      await domain.table('rows').put('receipt', 1)
      await domain.close()
    })
  } })
  const disposed = provider.dispose()
  try {
    await entered.promise
    expect(backend.pool.media.get(spec.name)?.tables.get('rows')?.get('receipt')).toBeUndefined()
    expect(ctx.storage.form('domain').get(spec.name)).toBeDefined()
  } finally { release.resolve(undefined); await disposed }
  expect(backend.pool.media.get(spec.name)?.tables.get('rows')?.get('receipt')).toBe(1)
  expect(() => ctx.storage.form('domain')).toThrow()
})
