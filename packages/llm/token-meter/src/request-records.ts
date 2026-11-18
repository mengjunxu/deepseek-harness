/** Optional Session accounting for registered native request dispatch. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-session'
import type { FinishReason, TokenUsage } from '@deepseek-ai/dsh-llm'
import { requestAccountingProjection, requestPreparationFailureProjection } from './request-record-projection.ts'
import type { RequestAccountingRecord } from './request-record-types.ts'

export type { RequestAccountingRecord, RequestAccountingProjection,
  RequestPreparationFailureRecord, RequestPreparationFailureProjection } from './request-record-types.ts'

/** Optional plugin identifier. */
export const name = 'token-meter-request-records'
/** Accounting needs the captured LLM registration and an existing local Session. */
export const inject = ['llm', 'sessions', 'sessionProjections']

/**
 * Record native request settlements without copying model input or credentials.
 * @param ctx - live LLM, Session and projection owners.
 */
export function apply(ctx: Context): void {
  const lifetime = new AbortController(), pending = new Set<Promise<undefined>>()
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => closing ??= (async () => {
    lifetime.abort()
    await Promise.allSettled([...pending])
  })()
  ctx.effect(function* () {
    yield ctx.sessionProjections.register(requestAccountingProjection)
    yield ctx.sessionProjections.register(requestPreparationFailureProjection)
    yield ctx.on('llm/preparation-failed', (failure) => {
      if (failure.sessionId === undefined) return
      const session = ctx.sessions.get(failure.sessionId)
      if (!session) return
      const { sessionId: _sessionId, ...record } = failure
      session.append('llm/preparation-failed', record)
    })
    yield ctx.on('llm/dispatch', async function* (dispatch, next) {
      const session = dispatch.options.sessionId === undefined ? undefined : ctx.sessions.get(dispatch.options.sessionId)
      if (!session) { yield* next(); return }
      const { model, intent, purpose } = dispatch.options
      const loopAttempt = dispatch.options.loopAttempt === undefined ? undefined : Object.freeze({
        stepStartSeq: dispatch.options.loopAttempt.stepStartSeq, attempt: dispatch.options.loopAttempt.attempt,
      })
      const done = Promise.withResolvers<undefined>()
      pending.add(done.promise)
      let usage: TokenUsage | undefined, finishKind: FinishReason['kind'] | undefined
      let failed = false, dispatchError: unknown
      try {
        dispatch.cancelOn(lifetime.signal)
        for await (const chunk of next()) {
          if (chunk.type === 'usage') usage = copyUsage(chunk.usage)
          else if (chunk.type === 'finish') finishKind = chunk.reason.kind
          yield chunk
        }
      } catch (error) { failed = true; dispatchError = error; throw error }
      finally {
        try {
          const record: RequestAccountingRecord = {
            provider: dispatch.provider.id, model,
            usageSource: dispatch.provider.policy?.usageSource ?? 'unknown',
            ...intent === undefined ? {} : { intent },
            ...purpose === undefined ? {} : { purpose },
            ...loopAttempt === undefined ? {} : { loopAttempt },
            outcome: failed ? 'error' : outcome(finishKind),
            ...finishKind === undefined ? {} : { finishKind },
            usage: usage === undefined ? { kind: 'unknown' } : { kind: 'adapter-reported', tokens: usage },
          }
          session.append('llm/request-accounting', record)
        } catch (error) {
          if (failed) throw new AggregateError([dispatchError, error], 'Request dispatch and accounting both failed')
          throw error
        } finally { pending.delete(done.promise); done.resolve(undefined) }
      }
    })
    yield ctx.on('app-boot/before-dispose', close)
    yield close
  })
}

function outcome(kind: FinishReason['kind'] | undefined): RequestAccountingRecord['outcome'] {
  switch (kind) {
    case 'stop': case 'tool-calls': case 'max-tokens': return 'completed'
    case 'aborted': return 'aborted'
    case 'error': return 'error'
    // Finish reasons are merge-extensible; an unknown discriminant grants no completion claim.
    default: return 'unknown'
  }
}

function copyUsage(usage: TokenUsage): TokenUsage {
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
    ...usage.measurement === undefined ? {} : { measurement: usage.measurement },
    ...usage.totalTokens === undefined ? {} : { totalTokens: usage.totalTokens },
    ...usage.cacheReadTokens === undefined ? {} : { cacheReadTokens: usage.cacheReadTokens },
    ...usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.cacheWriteTokens },
    ...usage.reasoningTokens === undefined ? {} : { reasoningTokens: usage.reasoningTokens } }
}
