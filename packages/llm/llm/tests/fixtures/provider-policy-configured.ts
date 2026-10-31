/** Exercise admission of a configured production pi-ai route from a logged tool call. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '../../src/index.ts'

export const name = 'provider-policy-configured-snapshot'
export const inject = ['llm', 'tools']

export function apply(ctx: Context): void {
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name === 'bash' && typeof exec.arguments === 'object' && exec.arguments !== null
      && 'command' in exec.arguments && exec.arguments.command === 'printf POLICY_PROBE') {
      await ctx.llm.prepareCall({ provider: 'policy-fixture', model: 'fixture' })
      throw new Error('Configured gated provider was admitted')
    }
    return next()
  })
}
