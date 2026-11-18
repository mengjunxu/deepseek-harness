/** Native response schemas bind preparation and validate completed adapter text. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished } from 'vitest'
import LlmRuntime, { LlmAdapter, resolveProviderPolicy, resolveResponseFormat, validateLlmRequestPolicy } from '../src/index.ts'
import type { GenerateOptions, LlmCapabilitySupport, LlmProviderCapability, StreamChunk } from '../src/index.ts'

declare module '../src/types.ts' {
  interface FinishReasonMap {
    'fixture-ending': { kind: 'fixture-ending' }
  }
}

const schema = {
  type: 'object', properties: { result: { type: 'string' } }, required: ['result'], additionalProperties: false,
}
const format = { type: 'json_schema' as const, name: 'result', schema, strict: true as const }
const requirements: LlmProviderCapability[] = ['structuredOutput']
const config = { provider: 'fixture', model: 'json', responseFormat: format, requiredCapabilities: requirements }

it('rejects an extension-defined finish without an established complete JSON outcome', async () => {
  const { llm } = await fixture([{ type: 'finish', reason: { kind: 'fixture-ending' } }])
  const chunks = await Array.fromAsync(llm.stream({ ...config, messages: [] }))
  expect(chunks.at(-1)).toMatchObject({ reason: { kind: 'error', failure: { code: 'STRUCTURED_OUTPUT_INCOMPLETE' } } })
})

function textChunks(text: string): StreamChunk[] {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
}

async function fixture(
  chunks = textChunks('{"result":"ok"}'),
  support: LlmCapabilitySupport | undefined = 'supported',
  providerSupport: LlmCapabilitySupport = 'supported',
) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(LlmRuntime)
  let calls = 0
  let closed = 0
  const adapter = new class extends LlmAdapter {
    override providerInfo(provider: string) {
      return { id: provider, name: provider, policy: resolveProviderPolicy({ capabilities: { structuredOutput: providerSupport } }) }
    }
    override resolveModel(provider: string, model: string) {
      return Promise.resolve({ provider, id: model, name: model,
        ...support === undefined ? {} : { structuredOutputSupport: support } })
    }
    override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
      calls += 1
      try { yield* chunks } finally { closed += 1 }
    }
  }()
  ctx.effect(() => ctx.llm.registerAdapter(['fixture'], adapter))
  return { llm: ctx.llm, calls: () => calls, closed: () => closed }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

it('rejects an invalid schema before the adapter streams', async () => {
  const { llm, calls } = await fixture()
  const invalid = { ...config, responseFormat: { ...format, schema: { type: 42 } } }
  await expect(llm.prepareCall(invalid)).rejects.toMatchObject({ code: 'INVALID_RESPONSE_FORMAT' })
  expect(calls()).toBe(0)
})

it.each(['unknown', 'unsupported'] as const)('rejects exact-model structured output declared %s', async (support) => {
  const { llm, calls } = await fixture(undefined, support)
  await expect(llm.prepareCall(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  expect(calls()).toBe(0)
})

it('requires Provider admission even when a format omits explicit requirements', async () => {
  const { llm, calls } = await fixture(undefined, 'supported', 'unknown')
  const input = { provider: 'fixture', model: 'json', responseFormat: format }
  await expect(llm.prepareCall(input)).rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER_CAPABILITY' })
  expect(calls()).toBe(0)
})

it('keeps valid schema-conforming text and binds the complete prepared format', async () => {
  const { llm } = await fixture()
  const call = await llm.prepareCall(config)
  const changed = { ...call.config, messages: [], responseFormat: { ...format, name: 'changed' } }
  expect(() => call.stream(changed)).toThrow('config changed')
  expect(await collect(call.stream({ ...call.config, messages: [] }))).toEqual(textChunks('{"result":"ok"}'))
})

it.each(['not-json', '{}', '{"result":1}', '{"result":"ok","extra":true}'])(
  'reports invalid structured completion: %s', async (text) => {
    const { llm } = await fixture(textChunks(text))
    const input = { ...config, messages: [] }
    expect((await collect(llm.stream(input))).at(-1)).toMatchObject({
      type: 'finish', reason: { kind: 'error', failure: { code: 'INVALID_STRUCTURED_OUTPUT' } },
    })
  },
)

it('rejects an incomplete structured completion without changing a provider failure', async () => {
  const truncated = await fixture([
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: '{"result":' },
    { type: 'finish', reason: { kind: 'max-tokens' } },
  ])
  expect((await collect(truncated.llm.stream({ ...config, messages: [] }))).at(-1)).toMatchObject({
    type: 'finish', reason: { kind: 'error', failure: { code: 'STRUCTURED_OUTPUT_INCOMPLETE' } },
  })
  const failed = await fixture([{ type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', message: 'retry later' } } }])
  expect((await collect(failed.llm.stream({ ...config, messages: [] }))).at(-1)).toMatchObject({
    type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT' } },
  })
})

it('allows a tool continuation and rejects a stream missing its terminal outcome', async () => {
  const tools = await fixture([{ type: 'finish', reason: { kind: 'tool-calls' } }])
  expect(await collect(tools.llm.stream({ ...config, messages: [] })))
    .toEqual([{ type: 'finish', reason: { kind: 'tool-calls' } }])
  const missing = await fixture(textChunks('{"result":"ok"}').slice(0, -1))
  expect((await collect(missing.llm.stream({ ...config, messages: [] }))).at(-1)).toMatchObject({
    type: 'finish', reason: { kind: 'error', failure: { code: 'STRUCTURED_OUTPUT_INCOMPLETE' } },
  })
})

it('closes the owned adapter iterator after rejecting its completion', async () => {
  const { llm, closed } = await fixture(textChunks('{}'))
  await collect(llm.stream({ ...config, messages: [] }))
  expect(closed()).toBe(1)
})

it.each([
  null, { ...format, name: 'bad name' }, { ...format, strict: false },
  { ...format, schema: { $async: true, type: 'object' } },
  { ...format, schema: { $ref: 'https://fixture.invalid/schema' } },
])('rejects unsupported response format input %j', (input) => {
  expect(() => resolveResponseFormat(input)).toThrow()
})

it('validates structured controls in durable JSON readers', () => {
  expect(() => { validateLlmRequestPolicy(config) }).not.toThrow()
  expect(() => { validateLlmRequestPolicy({ ...config, responseFormat: { ...format, name: 'bad name' } }) })
    .toThrow('Invalid JSON Schema response format')
})

it('validates final text separately from reasoning and preserves provider cancellation', async () => {
  const reasoned = await fixture([
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'fixture reasoning' } },
    ...textChunks('{"result":"ok"}').map(chunk => 'index' in chunk ? { ...chunk, index: 1 } : chunk),
  ])
  expect((await collect(reasoned.llm.stream({ ...config, messages: [] }))).at(-1)).toMatchObject({
    type: 'finish', reason: { kind: 'stop' },
  })
  const cancelled = await fixture([{ type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'cancelled' } } }])
  expect((await collect(cancelled.llm.stream({ ...config, messages: [] }))).at(-1)).toMatchObject({
    type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED' } },
  })
})

it('rejects cyclic and non-JSON schema data at the parser', () => {
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  expect(() => resolveResponseFormat({ ...format, schema: cycle })).toThrow('lossless JSON')
  expect(() => resolveResponseFormat({ ...format, schema: { type: 'object', default: () => 1 } })).toThrow('lossless JSON')
})
