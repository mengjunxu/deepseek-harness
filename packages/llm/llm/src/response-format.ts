/** Native response schemas and validation of completed adapter output. */
import Schema from '@deepseek-ai/schemastery'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { z } from 'zod'
import { isJsonValue, snapshotJsonValue } from '@deepseek-ai/dsh-util-values'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import { BlockAssembler } from './assembler.ts'
import { LlmError } from './error.ts'
import type { LlmResponseFormat, StreamChunk } from './types.ts'

const formatSchema = z.object({
  type: z.literal('json_schema'),
  name: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  schema: z.record(z.string(), z.custom<JsonValue>(isJsonValue)),
  strict: z.literal(true),
}).strict()

function compile(input: unknown) {
  const detached = snapshotJsonValue(input)
  if (detached === undefined) throw new LlmError('Response format must contain lossless JSON', 'INVALID_RESPONSE_FORMAT')
  const parsed = formatSchema.safeParse(detached)
  if (!parsed.success) throw new LlmError('Invalid JSON Schema response format', 'INVALID_RESPONSE_FORMAT', { cause: parsed.error })
  if (parsed.data.schema.$async === true) {
    throw new LlmError('Asynchronous response schemas are not supported', 'INVALID_RESPONSE_FORMAT')
  }
  const format: LlmResponseFormat = parsed.data
  try {
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(format.schema)
    return { format, validate }
  } catch (error: unknown) {
    throw new LlmError('Invalid response JSON Schema', 'INVALID_RESPONSE_FORMAT', { cause: error })
  }
}

/**
 * Validate a native format and its synchronous JSON Schema without contacting a provider.
 * @param input - configuration or durable JSON value.
 * @returns a detached format; unsupported schemas throw INVALID_RESPONSE_FORMAT.
 */
export function resolveResponseFormat(input: unknown): LlmResponseFormat {
  return compile(input).format
}

/** Optional native format configuration; invalid schemas fail during loading. */
export const ResponseFormatSchema: Schema<LlmResponseFormat | undefined> = Schema.union([
  Schema.transform(Schema.object({
    type: Schema.const('json_schema').required(),
    name: Schema.string().required(),
    schema: Schema.dict(Schema.any()).required(),
    strict: Schema.const(true).required(),
  }).required(), resolveResponseFormat),
  Schema.const(undefined),
])

/** Adapter-stream validation state; incomplete output never becomes a successful JSON result. */
export class StructuredOutputValidator {
  private readonly assembler = new BlockAssembler()
  private readonly validate: ReturnType<typeof compile>['validate']
  private terminal = false

  /** @param format - validated request format captured for this stream. */
  constructor(format: LlmResponseFormat) {
    this.validate = compile(format).validate
  }

  /**
   * Accept one adapter chunk and validate text before its successful terminal chunk is exposed.
   * @param chunk - next adapter chunk; provider failures and tool continuations retain their outcomes.
   */
  push(chunk: StreamChunk): void {
    this.assembler.push(chunk)
    if (chunk.type !== 'finish') return
    this.terminal = true
    switch (chunk.reason.kind) {
      case 'error':
      case 'aborted':
      case 'tool-calls': return
      case 'max-tokens':
        throw new LlmError('Structured output ended before completion', 'STRUCTURED_OUTPUT_INCOMPLETE')
      case 'stop': break
      default: {
        // FinishReason is merge-extensible; an unknown ending cannot establish a complete JSON result.
        throw new LlmError('Structured output has an unsupported ending', 'STRUCTURED_OUTPUT_INCOMPLETE')
      }
    }
    const text = this.assembler.blocks().flatMap(block => block.type === 'text' ? [block.text] : []).join('')
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch (error: unknown) {
      throw new LlmError('Structured output is not valid JSON', 'INVALID_STRUCTURED_OUTPUT', { cause: error })
    }
    if (!this.validate(value)) {
      throw new LlmError('Structured output does not satisfy the requested JSON Schema', 'INVALID_STRUCTURED_OUTPUT')
    }
  }

  /** Require a terminal provider outcome before iteration completes. */
  end(): void {
    if (!this.terminal) throw new LlmError('Structured output has no terminal outcome', 'STRUCTURED_OUTPUT_INCOMPLETE')
  }
}
