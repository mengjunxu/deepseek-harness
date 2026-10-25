import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Llm, { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import Credentials from '@deepseek-ai/dsh-credentials-local'
import Authorization from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import * as Plan from '../src/index.ts'

const contexts: Context[] = [], directories: string[] = []
const key = credentialKey('experimental-chatgpt-plan', 'default')
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'siwc-provider-')); directories.push(directory)
  const ctx = new Context(); contexts.push(ctx)
  await ctx.plugin(Credentials, { path: join(directory, 'credentials.yml'), watch: false })
  await ctx.plugin(Authorization); await ctx.plugin(Llm)
  const fiber = ctx.plugin(Plan, { requestTimeoutMs: 10_000 })
  await fiber
  return { ctx, fiber }
}
async function seed(ctx: Context, expiresAt = Date.now() + 3_600_000) {
  await ctx.credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: { clientId: 'oaiapp_test', subject: 'fixture',
    email: 'fixture@example.test', access: 'fixture-access', refresh: 'fixture-refresh', idToken: 'fixture-id', expiresAt } }))
}

it('keeps secrets out of account state, advertises the account catalog and removes its route on disposal', async () => {
  const { ctx, fiber } = await fixture()
  expect(await ctx.chatgptPlan.getState()).toMatchObject({ connected: false })
  await expect(ctx.llm.listModels('chatgpt-plan')).rejects.toMatchObject({ code: 'MISSING_CREDENTIAL' })
  await seed(ctx)
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ models: [
    { slug: 'fixture', display_name: 'Fixture', visibility: 'list' }, { slug: 'hidden', display_name: 'Hidden', visibility: 'hide' },
  ] })))
  expect(await ctx.llm.listModels('chatgpt-plan')).toEqual([{ provider: 'chatgpt-plan', id: 'fixture', name: 'Fixture', inputModalities: ['text'] }])
  const state = await ctx.chatgptPlan.getState()
  expect(state).toMatchObject({ connected: true, email: 'fixture@example.test', needsWelcome: true })
  expect(JSON.stringify(state)).not.toContain('fixture-access')
  await ctx.chatgptPlan.acknowledgePlanUsage()
  expect(await ctx.chatgptPlan.getState()).toMatchObject({ needsWelcome: false })
  await fiber.dispose()
  await expect(ctx.llm.listModels('chatgpt-plan')).rejects.toMatchObject({ code: 'NO_ADAPTER' })
})

it('uses the public Responses endpoint, preserves system instructions and settles only after response.completed', async () => {
  const { ctx } = await fixture(); await seed(ctx)
  const events = [
    { type: 'response.created', response: { id: 'fixture' } },
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_fixture', role: 'assistant' } },
    { type: 'response.output_text.delta', output_index: 0, delta: 'SIWC_OK' },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_fixture', role: 'assistant', content: [{ type: 'output_text', text: 'SIWC_OK' }] } },
    { type: 'response.completed', response: { status: 'completed', usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } },
  ]
  const requests: Request[] = []
  const wire = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    if (request.url.endsWith('/models')) return Response.json({ detail: 'Rate limit exceeded' }, { status: 429 })
    requests.push(request.clone())
    expect(request.redirect).toBe('error')
    const body: unknown = await request.clone().json()
    expect(body).toMatchObject({ store: false, stream: true, model: 'fixture', tools: [{
      type: 'namespace', name: 'dsh', description: 'Tools available in this DSH session.',
      tools: [{ type: 'function', name: 'read', description: 'Read a workspace file.' }],
    }] })
    expect(body).not.toHaveProperty('max_output_tokens')
    const headers = request.headers
    expect(headers.get('authorization')).toBe('Bearer fixture-access')
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } })
  })
  vi.stubGlobal('fetch', wire)
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({ provider: 'chatgpt-plan', model: 'fixture', system: 'Retain this instruction',
    tools: [{ name: 'read', description: 'Read a workspace file.', parameters: { type: 'object', properties: {} } }],
    messages: [createUserMessage({ content: [{ type: 'text', text: 'hello' }], source: { kind: 'model', provider: 'chatgpt-plan', model: 'fixture' } })] })) assembler.push(chunk)
  expect(assembler.finish).toEqual({ kind: 'stop' })
  expect(requests[0]?.url).toBe('https://api.openai.com/v1/responses')
  expect(wire).toHaveBeenCalledTimes(1)
})

it('retains the grant when revocation fails and deletes it after confirmed revocation', async () => {
  const { ctx } = await fixture(); await seed(ctx)
  const fetch = vi.fn(async () => new Response('', { status: 500 }))
  vi.stubGlobal('fetch', fetch)
  await expect(ctx.chatgptPlan.signOut()).rejects.toMatchObject({ code: 'AUTH' })
  expect((await ctx.chatgptPlan.getState()).connected).toBe(true)
  fetch.mockImplementation(async () => new Response('', { status: 200 }))
  expect((await ctx.chatgptPlan.signOut()).connected).toBe(false)
})

it.each([
  ['subscription_sharing_usage_limit_exceeded', 'QUOTA'],
  ['subscription_sharing_usage_unavailable', 'SERVER'],
])('reports streamed %s as %s without discarding diagnostics', async (providerCode, code) => {
  const { ctx } = await fixture(); await seed(ctx)
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (new Request(input).url.endsWith('/models')) return Response.json({ models: [{ slug: 'fixture', display_name: 'Fixture', visibility: 'list' }] })
    return new Response(
      `data: ${JSON.stringify({ type: 'response.failed', response: { error: { code: providerCode, message: providerCode } } })}\n\n`,
      { headers: { 'content-type': 'text/event-stream' } },
    )
  }))
  const assembler = new BlockAssembler()
  for await (const chunk of ctx.llm.stream({ provider: 'chatgpt-plan', model: 'fixture', messages: [] })) assembler.push(chunk)
  expect(assembler.finish).toMatchObject({ kind: 'error', failure: { code } })
  expect(assembler.finish).toHaveProperty('failure.message', expect.stringContaining(providerCode))
})

it.each([
  ['deadline', 'TIMEOUT'],
  ['caller', 'ABORTED'],
  ['eof', 'TRANSPORT'],
])('retains streamed text when %s ends the request and reports %s', async (cause, code) => {
  const { ctx } = await fixture(); await seed(ctx)
  const deadline = new AbortController(), caller = new AbortController()
  vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal)
  let closeStream = (): void => { throw new Error('Response stream not started') }
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    if (new Request(input).url.endsWith('/models')) return Response.json({ models: [{ slug: 'fixture', display_name: 'Fixture', visibility: 'list' }] })
    const events = [
      { type: 'response.created', response: { id: 'fixture' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_fixture', role: 'assistant' } },
      { type: 'response.output_text.delta', output_index: 0, delta: 'Partial reply' },
    ]
    return new Response(new ReadableStream<Uint8Array>({ start(controller) {
      closeStream = () => { controller.close() }
      controller.enqueue(new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')))
    } }), { headers: { 'content-type': 'text/event-stream' } })
  }))
  const assembler = new BlockAssembler()
  let text = ''
  for await (const chunk of ctx.llm.stream({ provider: 'chatgpt-plan', model: 'fixture', messages: [], signal: caller.signal })) {
    assembler.push(chunk)
    if (chunk.type === 'text-delta') {
      text += chunk.text
      closeStream()
      if (cause === 'deadline') deadline.abort(new DOMException('Fixture deadline', 'TimeoutError'))
      if (cause === 'caller') caller.abort()
    }
  }
  expect(text).toBe('Partial reply')
  expect(assembler.finish).toMatchObject({ kind: cause === 'caller' ? 'aborted' : 'error', failure: { code } })
})
