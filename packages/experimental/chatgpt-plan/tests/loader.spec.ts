/** SIWC opt-in, credential restart and cancellation through real profile composition. */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader, { type ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime, { BlockAssembler } from '@deepseek-ai/dsh-llm'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import Authorization from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { profileComposition } from '../../../settings/settings/tests/profile-composition.ts'
import * as Plan from '../src/index.ts'

const accountKey = credentialKey('experimental-chatgpt-plan', 'default')

interface FixtureRoot {
  path: string
  contexts: Context[]
}

async function load(fixture: FixtureRoot, enabled: boolean) {
  const root = fixture.path
  const ctx = new Context()
  fixture.contexts.push(ctx)
  const config = join(root, 'cordis.yml')
  await writeFile(config, [
    '- id: llm', '  name: test-llm',
    '- id: credentials', '  name: test-credentials', '  config:',
    `    path: ${JSON.stringify(join(root, 'credentials.yml'))}`, '    watch: false',
    '- id: authorization', '  name: test-authorization',
    '- id: chatgpt-plan', '  name: test-chatgpt-plan', `  disabled: ${!enabled}`, '',
  ].join('\n'))
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['test-llm', LlmRuntime], ['test-credentials', Credentials],
    ['test-authorization', Authorization], ['test-chatgpt-plan', Plan],
  ])
  const internal: ModuleLoaderV2 = {
    version: 'v2', loadCache: new Map(),
    import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`Unexpected SIWC module ${specifier}`)
      return Promise.resolve(modules.get(specifier))
    },
    register(): never { throw new Error('Unexpected module hook') },
    getOrCreateModuleJob(): never { throw new Error('Unexpected module job') },
    resolveSync(): never { throw new Error('Unexpected synchronous resolution') },
    load(): never { throw new Error('Unexpected module load') },
  }
  ctx.loader.internal = internal
  const patch = await profileComposition(ctx, root, config)
  return { ctx, patch }
}

async function directory(): Promise<FixtureRoot> {
  const path = await mkdtemp(join(tmpdir(), 'dsh-siwc-loader-'))
  const fixture: FixtureRoot = { path, contexts: [] }
  onTestFinished(async () => {
    for (const ctx of fixture.contexts.toReversed()) await ctx.fiber.dispose()
    await rm(path, { recursive: true, force: true })
  })
  return fixture
}

async function seed(ctx: Context): Promise<void> {
  await ctx.credentials.modifyRecord(accountKey, async () => ({ kind: 'grant', payload: {
    clientId: 'oaiapp_loader', subject: 'loader-account', email: 'loader@example.test',
    access: 'loader-access', refresh: 'loader-refresh', idToken: 'loader-id',
    expiresAt: Date.now() + 3_600_000,
  } }))
}

function response(): Response {
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_loader', role: 'assistant' } },
    { type: 'response.output_text.delta', output_index: 0, delta: 'LOADER_OK' },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_loader', role: 'assistant',
      content: [{ type: 'output_text', text: 'LOADER_OK' }] } },
    { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } },
  ]
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })
}

it('enables SIWC explicitly and rejects invalid deadlines without changing the profile', async () => {
  const { ctx, patch } = await load(await directory(), false)
  expect(ctx.llm.listProviders()).toEqual([])
  await writeFile(patch, '- id: chatgpt-plan\n  disabled: false\n')
  await vi.waitFor(() => { expect(ctx.llm.listProviders()).toMatchObject([{ id: 'chatgpt-plan' }]) }, { timeout: 5000 })
  expect(await ctx.chatgptPlan.getState()).toMatchObject({ connected: false })
  const before = await readFile(patch, 'utf8')
  await expect(ctx.settings.update('chatgpt-plan', { requestTimeoutMs: 0 })).rejects.toThrow()
  expect(await readFile(patch, 'utf8')).toBe(before)
  expect(ctx.llm.listProviders()).toMatchObject([{ policy: { usageSource: 'work_codex_shared', balance: { status: 'unknown' } } }])
})

it('reuses the persisted account and acknowledgement after Loader restart without rediscovery', async () => {
  const root = await directory()
  const first = await load(root, true)
  await seed(first.ctx)
  await first.ctx.chatgptPlan.acknowledgePlanUsage()
  await first.ctx.fiber.dispose()
  const second = await load(root, true)
  expect(await second.ctx.chatgptPlan.getState()).toMatchObject({ connected: true, needsWelcome: false, email: 'loader@example.test' })
  const wire = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    expect(request.url).toBe('https://api.openai.com/v1/responses')
    expect(request.headers.get('authorization')).toBe('Bearer loader-access')
    expect(await request.json()).toMatchObject({ model: 'saved-model', store: false, stream: true })
    return response()
  })
  onTestFinished(() => { vi.unstubAllGlobals() })
  vi.stubGlobal('fetch', wire)
  try {
    const result = new BlockAssembler()
    for await (const chunk of second.ctx.llm.stream({ provider: 'chatgpt-plan', model: 'saved-model', messages: [] })) result.push(chunk)
    expect(result.blocks()).toEqual([{ type: 'text', text: 'LOADER_OK' }])
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(wire).toHaveBeenCalledTimes(1)
  } finally { vi.unstubAllGlobals() }
})

it('removes the route and settles an active response when the Loader disables SIWC', async () => {
  const { ctx, patch } = await load(await directory(), true)
  await seed(ctx)
  let started!: () => void
  const ready = new Promise<void>((resolve) => { started = resolve })
  let activeSignal: AbortSignal | undefined
  const wire = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    expect(request.url).toBe('https://api.openai.com/v1/responses')
    activeSignal = request.signal
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        const abort = (): void => { controller.error(request.signal.reason) }
        request.signal.addEventListener('abort', abort, { once: true })
        controller.enqueue(new TextEncoder().encode('data: {"type":"response.created","response":{"id":"loader-active"}}\n\n'))
        started()
      },
    }), { headers: { 'content-type': 'text/event-stream' } })
  })
  onTestFinished(() => { vi.unstubAllGlobals() })
  vi.stubGlobal('fetch', wire)
  const caller = new AbortController()
  const result = new BlockAssembler()
  const done = (async () => {
    for await (const chunk of ctx.llm.stream({ provider: 'chatgpt-plan', model: 'saved-model', messages: [], signal: caller.signal })) result.push(chunk)
  })()
  onTestFinished(async () => { caller.abort(); await ctx.fiber.dispose(); await done })
  try {
    await ready
    await writeFile(patch, '- id: chatgpt-plan\n  disabled: true\n')
    await vi.waitFor(() => { expect(ctx.llm.listProviders()).toEqual([]) }, { timeout: 5000 })
    expect(activeSignal?.aborted).toBe(true)
    await done
    expect(result.finish).toMatchObject({ kind: 'aborted', failure: { code: 'ABORTED' } })
    expect(wire).toHaveBeenCalledTimes(1)
  } finally { caller.abort(); await ctx.fiber.dispose(); await done; vi.unstubAllGlobals() }
})
