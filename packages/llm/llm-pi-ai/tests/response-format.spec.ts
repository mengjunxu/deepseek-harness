/** SDK payload hooks preserve native options and reject non-object wire payloads. */
import { expect, it } from 'vitest'
import type { Model } from '@earendil-works/pi-ai'
import type { LlmResponseFormat } from '@deepseek-ai/dsh-llm'
import { nativeResponseFormat } from '../src/response-format.ts'

const format: LlmResponseFormat = { type: 'json_schema', name: 'result', strict: true, schema: { type: 'object' } }
const model: Model<'openai-responses'> = {
  id: 'fixture', name: 'fixture', api: 'openai-responses', provider: 'test',
  baseUrl: 'https://fixture.invalid', reasoning: false, input: ['text'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 1024,
}

it('captures the format and preserves other native Responses text options', async () => {
  const selected = structuredClone(format)
  const hook = nativeResponseFormat('openai-responses', selected)
  selected.name = 'changed'
  expect(await hook?.({ model: 'fixture', text: { verbosity: 'low' } }, model)).toEqual({
    model: 'fixture', text: { verbosity: 'low', format },
  })
})

it.each([null, [], 'payload', 1, { text: null }, { text: [] }, { text: 'plain' }])('rejects invalid native payload %j', async (payload) => {
  const hook = nativeResponseFormat('openai-responses', format)
  await expect(Promise.resolve().then(() => hook?.(payload, model))).rejects.toMatchObject({ code: 'INVALID_ADAPTER_PAYLOAD' })
})

it('rejects unsupported APIs before constructing a payload hook', () => {
  expect(() => nativeResponseFormat('anthropic-messages', format)).toThrow('does not support native structured output')
  expect(nativeResponseFormat('anthropic-messages', undefined)).toBeUndefined()
})
