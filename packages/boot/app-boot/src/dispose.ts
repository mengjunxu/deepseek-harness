/** Whole-application quiescence before concurrent Cordis resource teardown. */
import type { Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * Stop new owned work and await active work before whole-application resource teardown.
     * All listeners settle before Cordis fibers dispose, including when a listener rejects.
     * Listeners must not call or await disposeApplication for the same root.
     * @mode parallel
     */
    'app-boot/before-dispose'(): Promise<void>
  }
}

const disposals = new WeakMap<Context, Promise<void>>()

/**
 * Drain application work, then dispose every Cordis resource even if a drain fails.
 * Repeated calls for the same root share the pending or completed result.
 * @param ctx - whole application's root Context; do not call from its before-dispose listener.
 * @returns completion after all drain listeners and fiber cleanup; drain and cleanup failures are retained.
 */
export function disposeApplication(ctx: Context): Promise<void> {
  const existing = disposals.get(ctx)
  if (existing) return existing
  const pending = Promise.resolve().then(async () => {
    const failures: unknown[] = []
    try { await ctx.parallel('app-boot/before-dispose') } catch (error) { failures.push(error) }
    try { await ctx.fiber.dispose() } catch (error) { failures.push(error) }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, 'Application disposal failed')
  })
  disposals.set(ctx, pending)
  return pending
}
