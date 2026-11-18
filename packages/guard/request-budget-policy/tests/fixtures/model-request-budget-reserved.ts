/** Record a production local-budget refusal from a logged tool occurrence. */
import type { Context } from '@deepseek-ai/cordis'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'model-request-budget-reserved-snapshot'
export const inject = ['llm', 'tools']
export function apply(ctx: Context): void {
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name !== 'bash' || typeof exec.arguments !== 'object' || exec.arguments === null
      || !('command' in exec.arguments) || exec.arguments.command !== 'printf LOCAL_BUDGET_PROBE') return next()
    const chunks = await Array.fromAsync(ctx.llm.stream({ provider: 'budget-fixture', model: 'm', intent: 'chat', messages: [] }))
    const last = chunks.at(-1)
    if (last?.type === 'finish' && (last.reason.kind === 'error' || last.reason.kind === 'aborted') && last.reason.failure) {
      throw new LlmError(last.reason.failure.message, last.reason.failure.code)
    }
    throw new Error('Execute-reserved local budget admitted an ordinary request')
  })
}
