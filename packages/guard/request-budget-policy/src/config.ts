/** Validate one live collection of exact routes and immutable local budget identities. */
import type { Volatile, VolatileSnapshot } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { LLM_USAGE_SOURCES, type LlmUsageSource } from '@deepseek-ai/dsh-llm'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** Operator-chosen identity of one local request allowance; changing it starts another allowance. */
export type RequestBudgetId = Branded<'RequestBudgetId'>

/** One exact-route group sharing a finite allowance. */
export interface RequestBudget {
  /** Persisted identity; shared/Session limits, execute reserve and source cannot change for this identity. */
  id: string
  /** Required captured Provider declaration; unknown is explicit and grants no payment permission. */
  usageSource: LlmUsageSource
  /** Total local attempts, including pending attempts left by crashes. */
  maxRequests: number
  /** Optional cap per exact durable Session ID within this allowance; missing identity is refused. */
  maxRequestsPerSession?: number
  /** Slots accessible only to requests explicitly labeled execute. */
  reserveExecuteRequests: number
  /** Exact, case-sensitive provider/model pairs; each pair belongs to only one budget. */
  routes: {
    /** Captured registered Provider route id. */
    provider: string
    /** Nonempty exact model ids approved to share this allowance. */
    models: string[]
  }[]
}

/** Live local allowances; empty means no request budgets are enforced. */
export interface Config {
  /** Replacing rules retains persisted counts for every reused identity. */
  budgets: Volatile<RequestBudget[]>
}

/** Raw operator rules, before the execute reserve default is resolved. */
export interface Options {
  /** Null resets the live collection to an empty list. */
  budgets?: (Omit<RequestBudget, 'id' | 'reserveExecuteRequests'> & {
    id: string
    reserveExecuteRequests?: number
  })[] | null
}

/** Immutable live rule captured for one operation. */
export type BudgetRule = VolatileSnapshot<RequestBudget>

const count = Schema.number().min(0).max(Number.MAX_SAFE_INTEGER).step(1)
const rules = Schema.array(Schema.object({
  id: Schema.string().pattern(/\S/).required(),
  usageSource: Schema.union([...LLM_USAGE_SOURCES]).required(),
  maxRequests: count.required(),
  maxRequestsPerSession: count,
  reserveExecuteRequests: count.default(0),
  routes: Schema.array(Schema.object({
    provider: Schema.string().pattern(/\S/).required(),
    models: Schema.array(Schema.string().pattern(/\S/).required()).min(1).required(),
  }).required()).min(1).required(),
}).required())

/** Validated live rules; invalid counts, duplicate identities/routes and excessive execute reserves reject before settings writes. */
export const Config: Schema<Options, Config> = Schema.object({
  budgets: Schema.transform(rules, (raw) => {
    const budgets = raw as RequestBudget[]
    const ids = new Set<string>(), pairs = new Set<string>()
    for (const budget of budgets) {
      if (ids.has(budget.id)) throw new Error(`Duplicate local request budget id: ${budget.id}`)
      ids.add(budget.id)
      if (budget.reserveExecuteRequests > budget.maxRequests) throw new Error(`Execute reserve exceeds budget: ${budget.id}`)
      if (budget.routes.length === 0) throw new Error(`Local request budget requires a route: ${budget.id}`)
      for (const route of budget.routes) for (const model of route.models) {
        const pair = JSON.stringify([route.provider, model])
        if (pairs.has(pair)) throw new Error(`Duplicate local request budget route: ${pair}`)
        pairs.add(pair)
      }
    }
    return budgets
  }, true).default([]).volatile(),
})
