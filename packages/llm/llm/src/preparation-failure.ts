/** Metadata-only classification of preparation failures; provider acceptance remains unknown. */
import { HarnessError } from './error.ts'
import type { LlmCallConfig } from './call-config.ts'
import type { LlmPreparationContext, LlmPreparationFailure } from './types.ts'

/**
 * Capture invocation labels before asynchronous model resolution.
 * @param config - caller-owned route and controls.
 * @param context - optional Session and auxiliary classification.
 * @param stage - explicit preparation or direct stream preparation.
 * @returns detached primitive labels without request content.
 */
export function preparationLabels(
  config: LlmCallConfig,
  context: LlmPreparationContext | undefined,
  stage: LlmPreparationFailure['stage'],
): Omit<LlmPreparationFailure, 'category' | 'usageSource'> {
  return Object.freeze({ provider: config.provider, model: config.model, stage,
    ...config.intent === undefined ? {} : { intent: config.intent },
    ...context?.sessionId === undefined ? {} : { sessionId: context.sessionId },
    ...context?.purpose === undefined ? {} : { purpose: context.purpose },
    ...context?.loopAttempt === undefined ? {} : { loopAttempt: Object.freeze({
      stepStartSeq: context.loopAttempt.stepStartSeq, attempt: context.loopAttempt.attempt,
    }) } })
}

/**
 * Classify only owned stable codes; unknown failures never copy arbitrary error data.
 * @param error - original preparation failure.
 * @param signal - cancellation observed for this preparation.
 * @returns a fixed category without provider messages or codes.
 */
export function preparationFailureCategory(error: unknown, signal?: AbortSignal): LlmPreparationFailure['category'] {
  if (signal?.aborted) return 'aborted'
  if (!(error instanceof HarnessError)) return 'unknown'
  switch (error.code) {
    case 'ABORTED': return 'aborted'
    case 'NO_ADAPTER': case 'POLICY_ROUTE_UNAVAILABLE': case 'PROVIDER_UNAVAILABLE': return 'route'
    case 'UNSUPPORTED_PROVIDER_CAPABILITY': case 'UNSUPPORTED_MODEL_CAPABILITY':
    case 'UNSUPPORTED_REASONING_EFFORT': case 'INVALID_RESPONSE_FORMAT': return 'capability'
    case 'INVALID_CREDENTIAL': return 'credentials'
    case 'VALIDATION_ADMISSION_DENIED': case 'PAID_ROUTE_CONSENT_REQUIRED':
    case 'ADMISSION_POLICY_INACTIVE': case 'LOCAL_REQUEST_BUDGET_EXHAUSTED':
    case 'LOCAL_REQUEST_BUDGET_EXECUTE_RESERVED': case 'LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED':
    case 'LOCAL_REQUEST_BUDGET_SESSION_REQUIRED': return 'admission'
    default: return 'unknown'
  }
}
