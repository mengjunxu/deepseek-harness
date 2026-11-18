/** Exact-route preset or one-request consent for declared API-metered model calls. */
import type { Context } from '@deepseek-ai/cordis'
import { hasGrant, type Config } from './config.ts'

export { Config } from './config.ts'
import type { LlmFailure } from '@deepseek-ai/dsh-llm'
import { installConfirmation } from './confirmation.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'paid-route-policy'
/** Registered-adapter admission is owned by the LLM service. */
export const inject = ['llm']

/**
 * Require an exact preset or authorize each declared API-metered request.
 * @param ctx - LLM service context; disposal withdraws and drains pending confirmations.
 * @param config - live operator grants, checked at preparation and again at dispatch.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('llm/admission', (provider, call): LlmFailure | undefined => {
    if (provider.policy?.usageSource !== 'api_metered') return undefined
    if (hasGrant(config, provider.id, call.model) || config.onMissingGrant.get() === 'ask') return undefined
    return {
      code: 'PAID_ROUTE_CONSENT_REQUIRED',
      message: `Provider "${provider.id}" model "${call.model}" requires an explicit preset for API-metered inference`,
    }
  })
  installConfirmation(ctx, config)
}
