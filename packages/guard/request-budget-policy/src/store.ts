/** Atomic, conservative local request receipts; no provider balance or transcript is stored. */
import { z } from 'zod'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { LLM_USAGE_SOURCES } from '@deepseek-ai/dsh-llm'
import { defineDomain, domainTable, type Domain, type DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { BudgetError, assertDefinition } from './error.ts'
import type { BudgetRule, RequestBudgetId } from './config.ts'

/** UUID identity of one local reservation, distinct from a provider-issued request id. */
export type ReservationId = Branded<'LocalRequestReservationId'>

const definitionSchema = z.object({
  usageSource: z.enum(LLM_USAGE_SOURCES),
  maxRequests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  maxRequestsPerSession: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  reserveExecuteRequests: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict().refine(value => value.reserveExecuteRequests <= value.maxRequests)
const requestSchema = z.object({
  provider: z.string().min(1), model: z.string().min(1),
  intent: z.enum(['chat', 'plan', 'review', 'execute']).optional(),
  sessionId: z.string().min(1).transform(value => brandString<Branded<'SessionId'>>(value)).optional(),
  purpose: z.enum(['compaction', 'session-title']).optional(),
}).strict()
const receiptSchema = z.object({
  request: requestSchema,
  state: z.enum(['reserved', 'committed', 'settled', 'cancelled']),
  createdAt: z.number(), updatedAt: z.number(),
}).strict()
const stateSchema = z.object({
  definition: definitionSchema,
  requests: z.record(z.uuid().transform(value => brandString<ReservationId>(value)), receiptSchema),
}).strict()
type State = z.infer<typeof stateSchema>
/** Model-hidden receipt fields used to reject conflicting retries of one reservation identity. */
export type RequestFacts = z.infer<typeof requestSchema>

/** Versioned owner declaration; capacity decisions and transitions affect one atomic record. */
export const budgetDomain = defineDomain({ name: 'request_budget', version: 1,
  tables: { budgets: domainTable<RequestBudgetId, State>(stateSchema) } })

function definition(rule: BudgetRule): State['definition'] {
  return { usageSource: rule.usageSource, maxRequests: rule.maxRequests, reserveExecuteRequests: rule.reserveExecuteRequests,
    ...rule.maxRequestsPerSession === undefined ? {} : { maxRequestsPerSession: rule.maxRequestsPerSession } }
}
function sameDefinition(a: State['definition'], b: State['definition']): boolean {
  return a.usageSource === b.usageSource && a.maxRequests === b.maxRequests
    && a.reserveExecuteRequests === b.reserveExecuteRequests && a.maxRequestsPerSession === b.maxRequestsPerSession
}
function sameRequest(a: RequestFacts, b: RequestFacts): boolean {
  return a.provider === b.provider && a.model === b.model && a.intent === b.intent
    && a.sessionId === b.sessionId && a.purpose === b.purpose
}

/** Private allowance owner; every decision reads fresh state inside the backend transaction. */
export class BudgetStore {
  /** @param domain - exclusively owned validated budget domain. */
  constructor(private readonly domain: Domain<typeof budgetDomain>) {}

  /**
   * Open and validate existing receipts; unsupported atomic modification fails during initialization.
   * @param facility - injected domain facility, routed to an atomic backend by the operator.
   * @returns an owned handle which must be closed after attempts drain.
   */
  static async open(facility: DomainFacility): Promise<BudgetStore> {
    return new BudgetStore(await facility.open(budgetDomain))
  }

  /**
   * Reject locally known identity changes before profile persistence; fresh atomic checks still protect other Hosts.
   * @param rules - proposed operator rules.
   */
  validate(rules: readonly BudgetRule[]): void {
    for (const rule of rules) {
      const current = this.domain.table('budgets').get(brandString<RequestBudgetId>(rule.id))
      if (current) assertDefinition(sameDefinition(current.definition, definition(rule)))
    }
  }

  /**
   * Persist an empty allowance even when its capacity is zero, or check its immutable definition.
   * @param rule - activated allowance.
   * @returns completion after the atomic record commits.
   */
  async initialize(rule: BudgetRule): Promise<void> {
    const expected = definition(rule)
    await this.change(brandString<RequestBudgetId>(rule.id), (current) => {
      if (current) assertDefinition(sameDefinition(current.definition, expected))
      return current ?? { definition: expected, requests: {} }
    })
  }

  /**
   * Reserve before provider dispatch; repeated identical reservations do not consume another slot.
   * @param rule - captured allowance, checked against persisted shared/Session limits and source.
   * @param id - attempt UUID generated outside the transaction.
   * @param request - model-hidden request classification.
   * @returns completion after the receipt commits, or an owned missing-Session, exhaustion or conflict refusal.
   */
  async reserve(rule: BudgetRule, id: ReservationId, request: RequestFacts): Promise<void> {
    const expected = definition(rule), now = Date.now()
    await this.change(brandString<RequestBudgetId>(rule.id), (current) => {
      if (!current) throw new BudgetError('Local request budget identity is not initialized', 'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT')
      assertDefinition(sameDefinition(current.definition, expected))
      if (expected.maxRequestsPerSession !== undefined && request.sessionId === undefined) {
        throw new BudgetError('A Session identity is required by this local request budget', 'LOCAL_REQUEST_BUDGET_SESSION_REQUIRED')
      }
      const state = current
      const previous = state.requests[id]
      if (previous) {
        if (!sameRequest(previous.request, request)) throw new BudgetError('Local request reservation identity conflicts with its receipt',
          'LOCAL_REQUEST_BUDGET_REQUEST_CONFLICT')
        if (previous.state === 'cancelled') throw new BudgetError('Cancelled local request reservations cannot be reused',
          'LOCAL_REQUEST_BUDGET_TRANSITION')
        return state
      }
      const charged = Object.values(state.requests).filter(receipt => receipt.state !== 'cancelled')
      if (expected.maxRequestsPerSession !== undefined
        && charged.filter(receipt => receipt.request.sessionId === request.sessionId).length >= expected.maxRequestsPerSession) {
        throw new BudgetError('Local request budget for this Session is exhausted', 'LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED')
      }
      const used = charged.length
      if (used >= expected.maxRequests) throw new BudgetError('Local request budget is exhausted', 'LOCAL_REQUEST_BUDGET_EXHAUSTED')
      if (request.intent !== 'execute' && used >= expected.maxRequests - expected.reserveExecuteRequests) {
        throw new BudgetError('Remaining local request slots are reserved for execute intent', 'LOCAL_REQUEST_BUDGET_EXECUTE_RESERVED')
      }
      return { ...state, requests: { ...state.requests, [id]: { request, state: 'reserved', createdAt: now, updatedAt: now } } }
    })
  }

  /**
   * Move an owned receipt idempotently; cancellation is permitted only when this owner knows delegation never occurred.
   * Settled, pending-after-crash and possibly submitted attempts all retain their charge.
   * @param budget - persisted allowance identity.
   * @param id - reservation UUID.
   * @param target - committed before delegation, cancelled before delegation, or settled afterwards.
   * @returns completion after the receipt commits.
   */
  async transition(budget: RequestBudgetId, id: ReservationId, target: 'committed' | 'cancelled' | 'settled'): Promise<void> {
    const now = Date.now()
    await this.change(budget, (current) => {
      const receipt = current?.requests[id]
      if (!receipt) throw new BudgetError('Local request reservation receipt is missing', 'LOCAL_REQUEST_BUDGET_TRANSITION')
      if (receipt.state === target || (receipt.state === 'settled' && target === 'committed')) return current
      if (receipt.state === 'cancelled' || receipt.state === 'settled'
        || (receipt.state === 'reserved' && target === 'settled')) {
        throw new BudgetError('Local request reservation transition is invalid', 'LOCAL_REQUEST_BUDGET_TRANSITION')
      }
      return { ...current, requests: { ...current.requests, [id]: { ...receipt, state: target, updatedAt: now } } }
    })
  }

  /** @returns completion after the domain releases its backend handle. */
  close(): Promise<void> { return this.domain.close() }

  private async change(id: RequestBudgetId, modify: (state: State | undefined) => State): Promise<void> {
    try { await this.domain.table('budgets').modify(id, modify) }
    catch (error) {
      if (error instanceof BudgetError) throw error
      throw new BudgetError('Local request budget storage is unavailable; no additional request is approved',
        'LOCAL_REQUEST_BUDGET_UNAVAILABLE', { cause: error })
    }
  }
}
