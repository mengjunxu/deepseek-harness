/** Framework-independent task records and trusted workflow inputs. */

/** Identifier types supplied by the consumer; the Core imports no harness types. */
export interface TaskDomain { taskId: string; ownerId: string; jobId: string }

/** Local node configuration; project aliases do not carry paths in task requests. */
export interface NodeConfig {
  readonly nodeId: string
  readonly workspaceRoot: string
  readonly repos: Readonly<Record<string, { readonly path: string; readonly defaultBaseRef: string }>>
}

/** Resource limits selected by the human submitter, including every fix attempt. */
export interface TaskBudget { readonly maxExecutionAttempts: number; readonly maxExpertCalls: number; readonly maxDurationMs: number }

/** Immutable local request; owner is assigned by the command adapter. */
export interface TaskRequest<D extends TaskDomain> {
  readonly id: D['taskId']
  readonly owner: D['ownerId']
  readonly title: string
  readonly prompt: string
  readonly repoAlias: string
  readonly baseRef: string
  readonly risk: 'trivial' | 'standard' | 'high_risk'
  readonly budget: TaskBudget
  readonly createdAt: number
}

/** Legal local workflow states, including explicit approval-invalidating replanning. */
export type TaskState = 'created' | 'queued' | 'claimed' | 'preparing' | 'planning' | 'plan_ready' | 'approved'
  | 'executing' | 'executed' | 'reviewing' | 'review_failed' | 'fixing' | 'completed' | 'failed'
  | 'interrupted' | 'cancel_requested' | 'cancelled' | 'needs_human' | 'needs_replan'

/** Proposed plan fields; approval and workflow state are never accepted from a plan. */
export interface TaskPlan {
  readonly summary: string
  readonly allowedFiles: readonly string[]
  readonly acceptanceCriteria: readonly string[]
  readonly source: 'human' | 'expert'
}

/** Append-only facts; only trusted operations construct them. */
export type TaskFact<D extends TaskDomain> =
  | { readonly kind: 'queued' | 'claimed' | 'preparing' | 'planning' | 'fix_started' | 'review_started' | 'cancel_requested' | 'cancelled' | 'resumed'; readonly at: number }
  | { readonly kind: 'plan'; readonly at: number; readonly plan: TaskPlan }
  | { readonly kind: 'approval'; readonly at: number; readonly revision: number; readonly digest: string; readonly actor: string }
  | { readonly kind: 'execution'; readonly at: number; readonly jobId: D['jobId']; readonly checkCount: number }
  | { readonly kind: 'process_exit'; readonly at: number; readonly phase: 'executor' | 'validation'; readonly index: number; readonly exitCode: number | null; readonly signal: string | null }
  | { readonly kind: 'settled'; readonly at: number; readonly outcome: 'completed' | 'failed' | 'killed'; readonly detail: string }
  | { readonly kind: 'review'; readonly at: number; readonly passed: boolean; readonly source: 'human' | 'expert'; readonly findings: string }
  | { readonly kind: 'scope_expanded' | 'interrupted' | 'budget_exhausted'; readonly at: number; readonly reason: string }

/** Immutable projection rebuilt from the request and persisted facts. */
export interface TaskRecord<D extends TaskDomain> {
  readonly request: TaskRequest<D>
  readonly state: TaskState
  readonly revision: number
  readonly plan: TaskPlan | null
  readonly approval: { readonly revision: number; readonly digest: string; readonly actor: string } | null
  readonly reviewCycle: number
  readonly executionAttempts: number
  readonly expertCalls: number
  readonly jobId: D['jobId'] | null
  readonly checkCount: number
  readonly facts: readonly TaskFact<D>[]
}
