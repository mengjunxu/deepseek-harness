/** Record explicit paid route consent from a logged tool occurrence through the production pi-ai adapter. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-llm'

export const name = 'model-paid-route-required-snapshot'
export const inject = ['llm', 'tools']

export function apply(ctx: Context): void {
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name === 'bash' && typeof exec.arguments === 'object' && exec.arguments !== null
      && 'command' in exec.arguments && exec.arguments.command === 'printf PAID_ROUTE_PROBE') {
      await ctx.llm.prepareCall({ provider: 'metered-fixture', model: 'metered-model' })
      throw new Error('Unapproved API-metered provider was admitted')
    }
    return next()
  })
}
