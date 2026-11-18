/** Audit a refused auxiliary preparation before the main recorded request proceeds. */
import type { Context } from '@deepseek-ai/cordis'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type {} from '../../src/index.ts'

export const name = 'model-preparation-audit'
export const inject = ['llm', 'agentLoop']

export function apply(ctx: Context): void {
  ctx.on('agent/request', async ({ agent }, next) => {
    const config = await next()
    try {
      await ctx.llm.prepareCall({ provider: config.provider, model: config.model, requiredCapabilities: ['resume'] },
        undefined, { sessionId: agent.session.id, purpose: 'compaction' })
    } catch (error) {
      if (error instanceof LlmError && error.code === 'UNSUPPORTED_PROVIDER_CAPABILITY') return config
      throw error
    }
    throw new Error('Native-resume preparation unexpectedly passed')
  })
}
