/** Registered dispatch ownership and additional cancellation sources. */
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { LlmError } from './error.ts'
import type { GenerateOptions, LlmDispatchContext, LlmFailure, LlmProviderInfo, StreamChunk } from './types.ts'

/**
 * Create one continuation with captured metadata and additive cancellation.
 * @param provider - immutable registration metadata selected for this attempt.
 * @param options - resolved request, kept unchanged by policies.
 * @param dispatch - native request factory receiving composed transport cancellation.
 * @returns the policy context, single-use continuation and pure permission-check runner.
 */
export function createDispatch(
  provider: Readonly<LlmProviderInfo>,
  options: GenerateOptions,
  dispatch: (options: GenerateOptions) => AsyncIterable<StreamChunk>,
): { context: LlmDispatchContext; next: () => AsyncIterable<StreamChunk>; check: () => LlmFailure | undefined } {
  let delegated = false
  const cancellations: AbortSignal[] = []
  const checks: Array<() => LlmFailure | undefined> = []
  const context: LlmDispatchContext = Object.freeze({
    provider,
    options,
    checkBeforeDispatch(check: () => LlmFailure | undefined): void {
      if (delegated) throw new LlmError('Dispatch checks must be registered before delegation', 'INVALID_DISPATCH_CONTROL')
      checks.push(check)
    },
    cancelOn(signal: AbortSignal): void {
      if (delegated) throw new LlmError('Dispatch cancellation must be registered before delegation', 'INVALID_DISPATCH_CONTROL')
      cancellations.push(signal)
    },
  })
  return { context, check: () => {
    for (const check of checks) {
      const failure = check()
      if (failure !== undefined) return failure
    }
    return undefined
  }, next: () => {
    if (delegated) throw new LlmError('An LLM dispatch can only delegate once', 'INVALID_DISPATCH_CONTROL')
    delegated = true
    let nextOptions = options
    if (cancellations.length > 0) {
      nextOptions = { ...options, signal: AbortSignal.any([
        ...options.signal === undefined ? [] : [options.signal], ...cancellations,
      ]) }
      if (Object.isFrozen(options)) deepFreeze(nextOptions)
    }
    return dispatch(nextOptions)
  } }
}
