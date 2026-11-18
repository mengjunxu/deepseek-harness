/** Configured model admission policies must activate before inference is permitted. */
import { FiberState, type Context } from '@deepseek-ai/cordis'
import type { Entry } from '@deepseek-ai/cordis-plugin-loader'
import type { LlmFailure } from '@deepseek-ai/dsh-llm'

const policyNames = ['paid-route-policy', 'request-budget-policy'] as const

/**
 * Identify mandatory configured model policies independently of an operator's entry id.
 * @param entry - declared module and any imported plugin runtime.
 * @returns whether this package or imported namespace owns a mandatory admission policy.
 */
export function isRequiredAdmissionPolicy(entry: Entry): boolean {
  return policyName(entry) !== undefined
}

function policyName(entry: Entry): typeof policyNames[number] | undefined {
  return policyNames.find(name => entry.options.name === `@deepseek-ai/dsh-${name}` || entry.fiber?.runtime?.name === name)
}

/**
 * Refuse inference while a configured policy cannot activate, including before the startup audit.
 * @param ctx - application root with its Loader installed; the listener is owned by this root.
 */
export function installAdmissionPolicyActivation(ctx: Context): void {
  const loader = ctx.loader
  const unavailable = (name: string): LlmFailure => ({
    code: 'ADMISSION_POLICY_INACTIVE',
    message: `Configured model policy "${name}" is not active; operator configuration repair is required`,
  })
  ctx.on('llm/admission', (): LlmFailure | undefined => {
    for (const entry of loader.entries()) {
      const name = policyName(entry)
      if (name === undefined) continue
      try { if (entry.disabled) continue }
      catch (_error) {
        // An invalid disabled expression cannot exempt a configured model policy.
        return unavailable(name)
      }
      if (entry.fiber?.state !== FiberState.ACTIVE) return unavailable(name)
    }
    return undefined
  })
}
