/** Require native SDK approval for each fixture write. */
export const inject = ['tools']

export function apply(ctx) {
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next()
    return exec.name === 'write' && decision.kind === 'allow' ? { kind: 'ask', reason: 'Fixture file write' } : decision
  })
}
