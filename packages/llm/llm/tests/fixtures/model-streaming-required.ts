/** Record exact model admission from a logged tool occurrence through the production pi-ai adapter. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '../../src/index.ts'

export const name = 'model-streaming-required-snapshot'
export const inject = ['llm', 'tools']

export function apply(ctx: Context): void {
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name === 'bash' && typeof exec.arguments === 'object' && exec.arguments !== null
      && 'command' in exec.arguments && exec.arguments.command === 'printf STREAMING_PROBE') {
      await ctx.llm.prepareCall({ provider: 'streaming-fixture', model: 'no-streaming', requiredCapabilities: ['streaming'] })
      throw new Error('Streaming-unsupported model was admitted')
    }
    return next()
  })
}
