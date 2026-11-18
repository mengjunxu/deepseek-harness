/** Real pi-ai HTTP payloads carry strict response schemas without text-mode downgrade. */
import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, it } from 'vitest'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { LlmResponseFormat } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer } from './mock-server.ts'

const format: LlmResponseFormat = {
  type: 'json_schema', name: 'result', strict: true,
  schema: { type: 'object', properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false },
}
const text = '{"result":"ok"}'
const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  await closeMockServers()
})

function events(api: string): string[] {
  if (api === 'openai-completions') return [
    JSON.stringify({ choices: [{ delta: { role: 'assistant', content: text }, index: 0, finish_reason: null }] }),
    JSON.stringify({ choices: [{ delta: {}, index: 0, finish_reason: 'stop' }] }), '[DONE]',
  ]
  const item = { type: 'message', id: 'msg_json', role: 'assistant', content: [{ type: 'output_text', text }] }
  return [
    JSON.stringify({ type: 'response.created', response: { id: 'resp_json' } }),
    JSON.stringify({ type: 'response.output_item.added', output_index: 0, item: { ...item, content: [] } }),
    JSON.stringify({ type: 'response.output_text.delta', output_index: 0, delta: text }),
    JSON.stringify({ type: 'response.output_item.done', output_index: 0, item }),
    JSON.stringify({ type: 'response.completed', response: { id: 'resp_json', status: 'completed', output: [item],
      usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } }),
  ]
}

it.each(['openai-completions', 'openai-responses'] as const)('sends native JSON Schema through %s and keeps plain calls plain', async (api) => {
  const server = await mockServer([{ events: events(api) }, { events: events(api) }])
  const profiles = resolveProfiles({ fixture: {
    api, baseURL: server.url, policy: { capabilities: { structuredOutput: 'supported' } },
    models: [{ id: 'json', structuredOutputSupport: 'supported' }],
  } })
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: () => Promise.resolve('fixture-key'), auth: memoryAuth() })
  ctx.effect(() => ctx.llm.registerAdapter(['fixture'], adapter))
  expect(await ctx.llm.resolveModelInfo('fixture', 'json')).toMatchObject({ structuredOutputSupport: 'supported' })
  const input = { provider: 'fixture', model: 'json', messages: [createUserMessage({
    content: [{ type: 'text', text: 'Return the requested result.' }], source: { kind: 'user' },
  })] }
  const result = await assemble(ctx, { ...input, responseFormat: format })
  expect(result.finish).toEqual({ kind: 'stop' })
  expect(result.message.content).toEqual([{ type: 'text', text }])
  if (api === 'openai-completions') {
    const { type, ...jsonSchema } = format
    expect(server.requests[0]).toMatchObject({ response_format: { type, json_schema: jsonSchema } })
  } else {
    expect(server.requests[0]).toMatchObject({ text: { format } })
  }
  expect((await assemble(ctx, input)).finish).toEqual({ kind: 'stop' })
  expect(server.requests[1]).not.toHaveProperty('response_format')
  expect(server.requests[1]).not.toHaveProperty('text.format')
})

it('rejects a supported declaration for an API without a native mapping', () => {
  expect(() => resolveProfiles({ fixture: {
    api: 'anthropic-messages', baseURL: 'https://fixture.invalid',
    models: [{ id: 'json', structuredOutputSupport: 'supported' }],
  } }, 'strict')).toThrow(/no schema output mapping/)
})
