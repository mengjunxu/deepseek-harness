/** Fail the first receipt write after the real SDK has accepted the input. */
import { writeFile } from 'node:fs/promises'

export const inject = ['taskboardController']

export function apply(ctx, config) {
  const executions = ctx.taskboardController.executions
  const started = executions.started
  let failed = false
  ctx.effect(() => {
    executions.started = async (owner, messageId) => {
      if (failed) return started.call(executions, owner, messageId)
      failed = true
      await writeFile(config.marker, messageId, { flag: 'wx' })
      throw new Error('fixture receipt write failed after input acceptance')
    }
    return () => { executions.started = started }
  })
}
