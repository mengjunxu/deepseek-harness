/** Native strict JSON Schema payload mapping for supported pi-ai APIs. */
import type { SimpleStreamOptions } from '@earendil-works/pi-ai'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { LlmResponseFormat } from '@deepseek-ai/dsh-llm'

/**
 * Check whether this adapter maps native schema output for one wire protocol.
 * @param api - resolved pi-ai API identifier.
 * @returns whether a request format can be delivered without downgrade.
 */
export function supportsStructuredOutputApi(api: string): boolean {
  return api === 'openai-completions' || api === 'openai-responses'
}

/**
 * Capture the response format for one request's native payload hook.
 * @param api - resolved wire protocol; unsupported protocols reject a format.
 * @param format - validated request control, omitted for ordinary text output.
 * @returns payload hook, or undefined when no format was requested.
 */
export function nativeResponseFormat(api: string, format: LlmResponseFormat | undefined): SimpleStreamOptions['onPayload'] {
  if (format === undefined) return undefined
  if (!supportsStructuredOutputApi(api)) {
    throw new LlmError(`pi-ai API "${api}" does not support native structured output`, 'UNSUPPORTED_STRUCTURED_OUTPUT_API')
  }
  const captured = structuredClone(format)
  return (payload) => {
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      throw new LlmError('Native structured output requires an object request payload', 'INVALID_ADAPTER_PAYLOAD')
    }
    if (api === 'openai-completions') {
      const { type, ...jsonSchema } = captured
      return { ...payload, response_format: { type, json_schema: jsonSchema } }
    }
    if ('text' in payload && payload.text !== undefined) {
      if (typeof payload.text !== 'object' || payload.text === null || Array.isArray(payload.text)) {
        throw new LlmError('Native response text configuration must be an object', 'INVALID_ADAPTER_PAYLOAD')
      }
      return { ...payload, text: { ...payload.text, format: captured } }
    }
    return { ...payload, text: { format: captured } }
  }
}
