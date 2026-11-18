/** Opt-in, fail-closed local request budgets over registered LLM dispatch and atomic storage. */
import type { Context, Fiber } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-app-boot'
import type { LlmFailure } from '@deepseek-ai/dsh-llm'
import { Config, type Options } from './config.ts'
import { BudgetStore } from './store.ts'
import { BudgetRuntime, findRule } from './runtime.ts'

export { Config } from './config.ts'
export type { Options, RequestBudget, RequestBudgetId } from './config.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'request-budget-policy'
/** The parent admission listener mounts before optional storage initializes. */
export const inject = ['llm']

/**
 * Protect configured routes while initializing, running and draining storage-backed reservations.
 * @param ctx - LLM context; the optional domain injection owns storage readiness separately.
 * @param config - validated live exact-route allowances; no rules means no budget enforcement.
 */
export function apply(ctx: Context, config: Config): void {
  let runtime: BudgetRuntime | undefined
  const unavailable: LlmFailure = { code: 'LOCAL_REQUEST_BUDGET_UNAVAILABLE',
    message: 'Local request budget storage is not ready; no additional request is approved' }
  ctx.on('llm/admission', (provider, request): LlmFailure | undefined => {
    const rule = findRule(config.budgets.get(), provider.id, request.model)
    if (!rule) return undefined
    if (rule.usageSource !== (provider.policy?.usageSource ?? 'unknown')) {
      return { code: 'LOCAL_REQUEST_BUDGET_SOURCE_CHANGED', message: 'Provider usage source does not match its local request budget' }
    }
    return runtime?.isReady() ? undefined : unavailable
  })
  ctx.on('llm/dispatch', async function* (dispatch, next) {
    const rule = findRule(config.budgets.get(), dispatch.provider.id, dispatch.options.model)
    if (!rule) { yield* next(); return }
    const active = runtime
    if (!active?.isReady()) { yield { type: 'finish', reason: { kind: 'error', failure: unavailable } }; return }
    yield* active.run(rule, dispatch, next)
  })
  ctx.on('internal/config', function (this: Fiber, _raw, next) {
    const raw: unknown = next()
    if (this === ctx.fiber) runtime?.store.validate(Config(raw as Options).budgets.get())
    return raw
  })
  ctx.on('loader/volatile-update', () => { void runtime?.initialize() })
  ctx.on('app-boot/before-dispose', async () => {
    const active = runtime
    runtime = undefined
    await active?.close()
  })

  ctx.inject(['storageDomain'], (scope) => {
    const abort = new AbortController()
    scope.effect(async () => {
      let store: BudgetStore | undefined, active: BudgetRuntime | undefined
      try {
        store = await BudgetStore.open(scope.storageDomain)
        if (abort.signal.aborted) { await store.close(); return () => {} }
        active = new BudgetRuntime(store, config, (error) => { scope.logger.error(error) })
        runtime = active
        await active.initialize()
      } catch (error) {
        scope.logger.error(error)
        if (store) await store.close()
      }
      return async () => {
        if (runtime === active) runtime = undefined
        await active?.close()
      }
    })
    // The synchronous cancellation effect can run while the setup disposer waits for storage.
    scope.effect(() => () => {
      abort.abort()
      if (runtime) { runtime.lifetime.abort(); runtime = undefined }
    })
  })
}
