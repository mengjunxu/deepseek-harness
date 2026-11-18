/** One native request borrows the existing approval service and owns its cancellation lifetime. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-app-boot'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import { hasGrant, type Config } from './config.ts'

/**
 * Install one-request authorization before any dispatch reservation.
 * @param ctx - optional live Agent/approval owners and the required LLM service.
 * @param config - current operator preset and missing-grant policy.
 */
export function installConfirmation(ctx: Context, config: Config): void {
  const lifetime = new AbortController(), pending = new Set<Promise<undefined>>()
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => closing ??= (async () => {
    lifetime.abort()
    await Promise.allSettled([...pending])
  })()
  ctx.effect(function* () {
    yield ctx.on('llm/authorize', async function* (dispatch, next) {
      const provider = dispatch.provider.id, { model, sessionId, purpose, loopAttempt } = dispatch.options
      if (dispatch.provider.policy?.usageSource !== 'api_metered') {
        yield* next(); return
      }
      if (hasGrant(config, provider, model)) {
        dispatch.checkBeforeDispatch(() => hasGrant(config, provider, model) ? undefined : revoked())
        yield* next(); return
      }
      if (config.onMissingGrant.get() !== 'ask') { yield refusal('PAID_ROUTE_CONSENT_REQUIRED'); return }
      const signal = AbortSignal.any([lifetime.signal, ...dispatch.options.signal === undefined ? [] : [dispatch.options.signal]])
      if (signal.aborted) { yield refusal('ABORTED'); return }
      const agent = sessionId === undefined ? undefined : ctx.get('agents')?.get(sessionId)
      const approval = ctx.get('approval')
      if (agent === undefined || approval === undefined) { yield refusal('PAID_ROUTE_CONSENT_UNAVAILABLE'); return }
      const done = Promise.withResolvers<undefined>()
      pending.add(done.promise)
      try {
        dispatch.cancelOn(lifetime.signal)
        const route = `${JSON.stringify(provider)}/${JSON.stringify(model)}`
        const identity = loopAttempt === undefined ? '' : `; step/start ${loopAttempt.stepStartSeq}, attempt ${loopAttempt.attempt}`
        const outcome = await approval.request({
          agent, toolName: 'llm', signal,
          reason: `API-metered native inference ${route}${identity}${purpose === undefined ? '' : `; purpose ${purpose}`}`,
          displayReason: {
            en: `Allow one API-metered request to ${route}? The charge and official balance are unknown. Retries require a new decision.`,
            zh: `允许向 ${route} 发送一次 API 按量付费请求吗？费用和官方余额未知。重试需要重新确认。`,
          },
        })
        if (outcome === 'cancelled') { yield refusal('ABORTED'); return }
        if (outcome !== 'allowed-once') {
          yield refusal(outcome === 'rejected' ? 'PAID_ROUTE_CONSENT_DENIED' : 'PAID_ROUTE_CONSENT_UNAVAILABLE')
          return
        }
        dispatch.checkBeforeDispatch(() => config.onMissingGrant.get() === 'ask' || hasGrant(config, provider, model) ? undefined : revoked())
        yield* next()
      } finally { pending.delete(done.promise); done.resolve(undefined) }
    })
    yield ctx.on('app-boot/before-dispose', close)
    yield close
  })
}

function revoked() {
  return { code: 'PAID_ROUTE_CONSENT_REVOKED', message: 'API-metered request consent was revoked before native dispatch' }
}

function refusal(code: 'ABORTED' | 'PAID_ROUTE_CONSENT_REQUIRED' | 'PAID_ROUTE_CONSENT_UNAVAILABLE' | 'PAID_ROUTE_CONSENT_DENIED' | 'PAID_ROUTE_CONSENT_REVOKED'): StreamChunk {
  return { type: 'finish', reason: { kind: code === 'ABORTED' ? 'aborted' : 'error',
    failure: { code, message: code === 'ABORTED' ? 'API-metered request confirmation was cancelled'
      : 'API-metered request has no active consent; review its exact route and approval policy before retrying' } } }
}
