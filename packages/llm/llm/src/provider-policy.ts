/** Parse operator-supplied provider policy without inferring billing or capabilities. */
import { z } from 'zod'
import Schema from '@deepseek-ai/schemastery'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { HarnessError } from './error.ts'
import type { LlmProviderPolicy, LlmProviderPolicyInput } from './types.ts'

const SUPPORT = ['supported', 'unsupported', 'unknown'] as const
const USAGE_SOURCES = ['work_codex_shared', 'chatgpt_web_unofficial', 'api_metered',
  'third_party', 'local', 'experimental_unverified', 'unknown'] as const
const AVAILABILITY = ['ready', 'unconfigured', 'auth_required', 'limited', 'gated', 'unavailable'] as const

/** Cordis configuration fields; provider resolution enforces cross-field admission rules before activation or settings writes. */
export const ProviderPolicySchema: Schema<LlmProviderPolicyInput | undefined> = Schema.union([Schema.object({
  usageSource: Schema.union([...USAGE_SOURCES]),
  availability: Schema.union([...AVAILABILITY]),
  gateReason: Schema.string(),
  capabilities: Schema.object({
    streaming: Schema.union([...SUPPORT]), tools: Schema.union([...SUPPORT]),
    structuredOutput: Schema.union([...SUPPORT]), vision: Schema.union([...SUPPORT]),
    resume: Schema.union([...SUPPORT]),
  }),
  balance: Schema.object({ status: Schema.const('unknown').required() }).default({ status: 'unknown' }),
}), Schema.const(undefined)])

const support = z.enum(SUPPORT).default('unknown')
const policySchema = z.object({
  usageSource: z.enum(USAGE_SOURCES).default('unknown'),
  availability: z.enum(AVAILABILITY).default('ready'),
  gateReason: z.string().trim().min(1).optional(),
  capabilities: z.object({ streaming: support, tools: support, structuredOutput: support,
    vision: support, resume: support }).strict().prefault({}),
  balance: z.object({ status: z.literal('unknown') }).strict().default({ status: 'unknown' }),
}).strict().superRefine((value, ctx) => {
  if (value.availability !== 'ready' && value.gateReason === undefined) {
    ctx.addIssue({ code: 'custom', message: 'Unavailable providers require gateReason', path: ['gateReason'] })
  }
  if ((value.usageSource === 'chatgpt_web_unofficial' || value.usageSource === 'experimental_unverified')
    && value.availability === 'ready') {
    ctx.addIssue({ code: 'custom', message: 'Experimental inference is gated', path: ['availability'] })
  }
})

/**
 * Resolve a policy from provider-owned configuration; omitted facts remain unknown.
 * Experimental sources cannot be admitted as ready by this parser.
 * @param input - untrusted policy configuration; an empty object declares an existing ready route with unknown facts.
 * @returns detached immutable policy; invalid input throws INVALID_PROVIDER_POLICY.
 */
export function resolveProviderPolicy(input: unknown): LlmProviderPolicy {
  const result = policySchema.safeParse(input)
  if (!result.success) throw new HarnessError('Invalid LLM provider policy', 'INVALID_PROVIDER_POLICY', { cause: result.error })
  const { gateReason, ...policy } = result.data
  return deepFreeze({ ...policy, ...gateReason === undefined ? {} : { gateReason } })
}

const REQUEST_INTENTS = ['chat', 'plan', 'review', 'execute'] as const

/** Accepted conversational intents for operator configuration. */
export const RequestIntentSchema = Schema.union([...REQUEST_INTENTS])

const CAPABILITIES = ['streaming', 'tools', 'structuredOutput', 'vision', 'resume'] as const

/** Provider capabilities accepted in explicit request requirements. */
export const RequiredCapabilitiesSchema = Schema.array(Schema.union([...CAPABILITIES]))

const requestPolicySchema = z.object({
  intent: z.enum(REQUEST_INTENTS).optional(),
  requiredCapabilities: z.array(z.enum(CAPABILITIES)).optional(),
}).loose()

/**
 * Validate optional request policy fields at a JSON or durable-data reader.
 * @param input - request configuration including unrelated provider controls.
 * @throws INVALID_REQUEST_POLICY for unknown intents or capability requirements.
 */
export function validateLlmRequestPolicy(input: unknown): void {
  const result = requestPolicySchema.safeParse(input)
  if (!result.success) throw new HarnessError('Invalid LLM request policy', 'INVALID_REQUEST_POLICY', { cause: result.error })
}
