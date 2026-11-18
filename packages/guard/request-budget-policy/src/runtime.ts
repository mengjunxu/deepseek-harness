/** Own initialization, attempt cancellation and draining for one mounted storage handle. */
import { randomUUID } from 'node:crypto'
import type { VolatileSnapshot } from '@deepseek-ai/cordis'
import type { LlmDispatchContext, StreamChunk } from '@deepseek-ai/dsh-llm'
import { brandString } from '@deepseek-ai/dsh-brand'
import { BudgetError } from './error.ts'
import { BudgetStore, type ReservationId, type RequestFacts } from './store.ts'
import type { BudgetRule, Config, RequestBudget, RequestBudgetId } from './config.ts'

/**
 * Match an exact route without inferring intent or billing facts.
 * @param rules - current operator collection.
 * @param provider - captured registered route id.
 * @param model - resolved model id.
 * @returns the single matching rule, if protected.
 */
export function findRule(rules: readonly BudgetRule[], provider: string, model: string): BudgetRule | undefined {
  return rules.find(rule => rule.routes.some(route => route.provider === provider && route.models.includes(model)))
}

/** One storage lifetime; readiness belongs to the exact committed rule snapshot. */
export class BudgetRuntime {
  /** Cancels transport and prevents a closing handle from publishing readiness. */
  readonly lifetime = new AbortController()
  private ready: VolatileSnapshot<RequestBudget[]> | undefined
  private readonly pending = new Set<Promise<unknown>>()

  /**
   * @param store - exclusively owned domain handle, closed after draining attempts.
   * @param config - live collection whose exact snapshot determines readiness.
   * @param report - logger for owned initialization/settlement failures.
   */
  constructor(
    /** Atomic receipt owner used by configuration validation. */
    readonly store: BudgetStore,
    private readonly config: Config,
    private readonly report: (error: unknown) => void,
  ) {}

  /** @returns whether the current collection has completed durable initialization on this live handle. */
  isReady(): boolean { return !this.lifetime.signal.aborted && this.ready === this.config.budgets.get() }

  /**
   * Initialize all active identities; a failed or superseded activation remains unavailable.
   * @returns completion after checks and writes; owned failures are reported and keep admission closed.
   */
  initialize(): Promise<void> {
    const rules = this.config.budgets.get()
    this.ready = undefined
    const work = (async () => {
      try {
        for (const rule of rules) {
          if (this.lifetime.signal.aborted) return
          await this.store.initialize(rule)
        }
        if (!this.lifetime.signal.aborted && this.config.budgets.get() === rules) this.ready = rules
      } catch (error) { this.report(error) }
    })()
    return this.track(work)
  }

  /**
   * Reserve and commit before delegation, then retain any possibly dispatched charge.
   * @param rule - rule selected before asynchronous reservation.
   * @param dispatch - captured registered request and additive cancellation control.
   * @param next - single-use continuation; invocation is the conservative submission point.
   * @returns provider chunks or an owned refusal; unrelated policy defects remain thrown.
   */
  async* run(rule: BudgetRule, dispatch: LlmDispatchContext, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    const done = Promise.withResolvers<undefined>()
    this.pending.add(done.promise)
    const id = brandString<ReservationId>(randomUUID())
    let reserved = false, delegated = false
    try {
      dispatch.cancelOn(this.lifetime.signal)
      this.check(rule, dispatch)
      const { provider, model, intent, sessionId, purpose } = dispatch.options
      const request: RequestFacts = { provider, model,
        ...intent === undefined ? {} : { intent }, ...sessionId === undefined ? {} : { sessionId },
        ...purpose === undefined ? {} : { purpose } }
      await this.store.reserve(rule, id, request)
      reserved = true
      this.check(rule, dispatch)
      await this.store.transition(brandString<RequestBudgetId>(rule.id), id, 'committed')
      this.check(rule, dispatch)
      delegated = true
      yield* next()
    } catch (error) {
      if (!(error instanceof BudgetError)) throw error
      yield { type: 'finish', reason: { kind: error.code === 'ABORTED' ? 'aborted' : 'error', failure: error.failure } }
    } finally {
      try {
        if (reserved) await this.store.transition(brandString<RequestBudgetId>(rule.id), id, delegated ? 'settled' : 'cancelled')
      } catch (error) {
        // A failed receipt write retains the previous charge and blocks new approvals on this handle.
        this.ready = undefined
        this.report(error)
      } finally {
        this.pending.delete(done.promise)
        done.resolve(undefined)
      }
    }
  }

  /** Abort owned transports before awaiting their receipt writes and releasing storage.
   * @returns completion after all initialization/attempt work and domain closure.
   */
  async close(): Promise<void> {
    this.ready = undefined
    this.lifetime.abort()
    await Promise.allSettled([...this.pending])
    await this.store.close()
  }

  private check(rule: BudgetRule, dispatch: LlmDispatchContext): void {
    if (this.lifetime.signal.aborted || dispatch.options.signal?.aborted) {
      throw new BudgetError('Local request cancelled before dispatch', 'ABORTED')
    }
    const current = findRule(this.config.budgets.get(), dispatch.provider.id, dispatch.options.model)
    if (!this.isReady() || current?.id !== rule.id) {
      throw new BudgetError('Local request budget changed before dispatch', 'LOCAL_REQUEST_BUDGET_REVOKED')
    }
  }

  private track(work: Promise<void>): Promise<void> {
    this.pending.add(work)
    void work.finally(() => this.pending.delete(work))
    return work
  }
}
