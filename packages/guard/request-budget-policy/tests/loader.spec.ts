/** Real profile Settings preserve immutable allowance definitions and receipts across restart. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import Loader, { type ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import { profileComposition } from '../../../settings/settings/tests/profile-composition.ts'
import * as Policy from '../src/index.ts'
import Storage from '@deepseek-ai/dsh-storage'
import * as Sqlite from '@deepseek-ai/dsh-storage-sqlite'
import * as Json from '@deepseek-ai/dsh-storage-json'
import * as Domain from '@deepseek-ai/dsh-storage-domain'
import { Adapter } from '../../paid-route-policy/tests/adapter.ts'


it.each([undefined, 1])('persists rules and keeps consumed slots across profile restart with Session cap %s', async (maxRequestsPerSession) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-request-budget-profile-'))
  const contexts: Context[] = []
  onTestFinished(async () => { for (const ctx of contexts) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  const path = join(root, 'cordis.yml')
  const budget = { id: 'development-period', usageSource: 'local', maxRequests: 2, reserveExecuteRequests: 1,
    ...maxRequestsPerSession === undefined ? {} : { maxRequestsPerSession },
    routes: [{ provider: 'local-model', models: ['model'] }] }
  const modules = new Map<string, unknown>([
    ['test-llm-service', LlmRuntime], ['@deepseek-ai/dsh-storage', Storage], ['@deepseek-ai/dsh-storage-json', Json],
    ['@deepseek-ai/dsh-storage-sqlite', Sqlite], ['@deepseek-ai/dsh-storage-domain', Domain],
    ['@deepseek-ai/dsh-request-budget-policy', Policy],
  ])
  await writeFile(path, [
    '- id: llm', '  name: test-llm-service',
    '- id: adapter', '  name: test-local-adapter',
    '- id: storage', "  name: '@deepseek-ai/dsh-storage'",
    '- id: storage-json', "  name: '@deepseek-ai/dsh-storage-json'", '  config:',
    `    root: ${JSON.stringify(join(root, 'json-storage'))}`,
    '- id: storage-sqlite', "  name: '@deepseek-ai/dsh-storage-sqlite'", '  config:',
    `    path: ${JSON.stringify(join(root, 'local-request-budgets.db'))}`,
    '- id: storage-domain', "  name: '@deepseek-ai/dsh-storage-domain'", '  config:',
    '    backend: json', '    routes:', '      request_budget: sqlite',
    '- id: request-budget-policy', "  name: '@deepseek-ai/dsh-request-budget-policy'", '  config:',
    `    budgets: ${JSON.stringify([budget])}`, '',
  ].join('\n'))
  const boot = async () => {
    const ctx = new Context(); contexts.push(ctx)
    const adapter = new Adapter('local')
    const ownModules = new Map(modules)
    ownModules.set('test-local-adapter', { inject: ['llm'], apply(ctx: Context) {
      ctx.effect(() => ctx.llm.registerAdapter(['local-model'], adapter))
    } })
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const internal: ModuleLoaderV2 = {
      version: 'v2', loadCache: new Map(),
      import(specifier: string) {
        if (!ownModules.has(specifier)) throw new Error(`Unexpected profile module ${specifier}`)
        return Promise.resolve(ownModules.get(specifier))
      },
      register(): never { throw new Error('Unexpected module hook') },
      getOrCreateModuleJob(): never { throw new Error('Unexpected module job') },
      resolveSync(): never { throw new Error('Unexpected synchronous resolution') },
      load(): never { throw new Error('Unexpected module load') },
    }
    ctx.loader.internal = internal
    const settingsPath = await profileComposition(ctx, root, path)
    const call = { provider: 'local-model', model: 'model', messages: [], sessionId: brandString<Branded<'SessionId'>>('durable-session') }
    await vi.waitFor(async () => { await expect(ctx.llm.prepareCall(call)).resolves.toBeDefined() })
    return { ctx, adapter, settingsPath, call }
  }
  const first = await boot()
  expect((await Array.fromAsync(first.ctx.llm.stream(first.call))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
  await first.ctx.settings.update('request-budget-policy', { budgets: [budget] })
  const validFile = await readFile(first.settingsPath, 'utf8')
  for (const invalid of [{ ...budget, maxRequests: 9 }, { ...budget, reserveExecuteRequests: 3 },
    { ...budget, maxRequestsPerSession: 2 }, budget, null]) {
    const rules = invalid === budget ? [budget, budget] : [invalid]
    await expect(first.ctx.settings.update('request-budget-policy', { budgets: rules })).rejects.toThrow()
    expect(await readFile(first.settingsPath, 'utf8')).toBe(validFile)
  }
  await first.ctx.fiber.dispose()
  const second = await boot()
  expect((await Array.fromAsync(second.ctx.llm.stream(second.call))).at(-1))
    .toMatchObject({ reason: { failure: { code: maxRequestsPerSession === undefined
      ? 'LOCAL_REQUEST_BUDGET_EXECUTE_RESERVED' : 'LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED' } } })
  const execute = { ...second.call, intent: 'execute' as const }
  if (maxRequestsPerSession !== undefined) {
    expect((await Array.fromAsync(second.ctx.llm.stream(execute))).at(-1))
      .toMatchObject({ reason: { failure: { code: 'LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED' } } })
  }
  expect((await Array.fromAsync(second.ctx.llm.stream({ ...execute, sessionId: brandString<Branded<'SessionId'>>('another-session') }))).at(-1))
    .toMatchObject({ reason: { kind: 'stop' } })
  expect(second.adapter.calls).toBe(1)
  await second.ctx.settings.update('request-budget-policy', { budgets: null })
  expect((await Array.fromAsync(second.ctx.llm.stream(second.call))).at(-1)).toMatchObject({ reason: { kind: 'stop' } })
})
