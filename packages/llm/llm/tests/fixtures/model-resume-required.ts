/** Record native provider restore admission from a logged tool occurrence through the production pi-ai adapter. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '../../src/index.ts'

export const name = 'model-resume-required-snapshot'
export const inject = ['llm', 'tools']

export function apply(ctx: Context): void {
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name === 'bash' && typeof exec.arguments === 'object' && exec.arguments !== null
      && 'command' in exec.arguments && exec.arguments.command === 'printf RESUME_PROBE') {
      await ctx.llm.prepareCall({ provider: 'resume-fixture', model: 'history-only', requiredCapabilities: ['resume'] })
      throw new Error('Native-resume-unsupported provider was admitted')
    }
    return next()
  })
}
