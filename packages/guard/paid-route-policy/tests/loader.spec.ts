/** Real profile settings validate and persist exact grants before admitting model calls. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader, { type ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { profileComposition } from '../../../settings/settings/tests/profile-composition.ts'
import * as Policy from '../src/index.ts'
import { Adapter } from './adapter.ts'

it('validates, persists and revokes preset consent through the real profile settings path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-paid-route-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  const path = join(root, 'cordis.yml')
  await writeFile(path, [
    '- id: llm', "  name: 'test-llm-service'",
    '- id: adapter', "  name: 'test-metered-adapter'",
    '- id: paid-route-policy', "  name: '@deepseek-ai/dsh-paid-route-policy'", '',
  ].join('\n'))
  const adapter = new Adapter()
  const modules = new Map<string, unknown>([
    ['test-llm-service', LlmRuntime],
    ['test-metered-adapter', { inject: ['llm'], apply(ctx: Context) {
      ctx.effect(() => ctx.llm.registerAdapter(['paid'], adapter))
    } }],
    ['@deepseek-ai/dsh-paid-route-policy', Policy],
  ])
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const internal: ModuleLoaderV2 = {
    version: 'v2', loadCache: new Map(),
    import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`Unexpected profile module ${specifier}`)
      return Promise.resolve(modules.get(specifier))
    },
    register(): never { throw new Error('Unexpected module hook') },
    getOrCreateModuleJob(): never { throw new Error('Unexpected module job') },
    resolveSync(): never { throw new Error('Unexpected synchronous resolution') },
    load(): never { throw new Error('Unexpected module load') },
  }
  ctx.loader.internal = internal
  const settingsPath = await profileComposition(ctx, root, path)
  const call = { provider: 'paid', model: 'm' }
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'PAID_ROUTE_CONSENT_REQUIRED' })
  expect(adapter.resolutions).toBe(0)
  await ctx.settings.update('paid-route-policy', { grants: [{ provider: 'paid', models: ['m'] }] })
  const prepared = await ctx.llm.prepareCall(call)
  const approvedFile = await readFile(settingsPath, 'utf8')
  expect(approvedFile).toContain('provider: paid')
  expect(approvedFile).toContain('- m')
  await expect(ctx.settings.update('paid-route-policy', { grants: [{ provider: 'paid', models: [] }] })).rejects.toThrow()
  expect(await readFile(settingsPath, 'utf8')).toBe(approvedFile)
  await ctx.settings.update('paid-route-policy', { grants: null })
  expect((await Array.fromAsync(prepared.stream({ ...prepared.config, messages: [] }))).at(-1))
    .toMatchObject({ reason: { kind: 'error', failure: { code: 'PAID_ROUTE_CONSENT_REQUIRED' } } })
  expect(adapter.calls).toBe(0)
  await ctx.settings.update('paid-route-policy', { grants: [{ provider: 'paid', models: ['m'] }] })
  expect((await Array.fromAsync(ctx.llm.stream({ ...call, messages: [] }))).at(-1))
    .toEqual({ type: 'finish', reason: { kind: 'stop' } })
  const presetFile = await readFile(settingsPath, 'utf8')
  await expect(ctx.settings.update('paid-route-policy', { onMissingGrant: 'auto' })).rejects.toThrow()
  expect(await readFile(settingsPath, 'utf8')).toBe(presetFile)
  await ctx.settings.update('paid-route-policy', { onMissingGrant: 'ask', grants: [] })
  expect(await readFile(settingsPath, 'utf8')).toContain('onMissingGrant: ask')
  await expect(ctx.llm.prepareCall(call)).resolves.toBeDefined()
  expect((await Array.fromAsync(ctx.llm.stream({ ...call, messages: [] }))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'PAID_ROUTE_CONSENT_UNAVAILABLE' } } })
  expect(adapter.calls).toBe(1)
})
