/** Node-only workflow engine; consumer identifier types enter through TaskDomain. */
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { NodeConfig, TaskDomain, TaskFact, TaskPlan, TaskRecord, TaskRequest, TaskState } from './types.ts'
import { fields, integer, parseBudget, parsePlan, text } from './validation.ts'

const SCHEMA_VERSION = 1
const terminal: readonly TaskState[] = ['completed', 'failed', 'cancelled', 'needs_human']
const active: readonly TaskState[] = ['claimed', 'preparing', 'planning', 'executing', 'reviewing', 'fixing', 'cancel_requested']

function digest(plan: TaskPlan): string { return createHash('sha256').update(JSON.stringify(plan)).digest('hex') }

/* v8 ignore next -- readFact admits only TaskFact's closed discriminants. */
function assertNever(value: never): never { throw new Error(`Unknown task fact: ${String(value)}`) }

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

function requireState(state: TaskState, allowed: readonly TaskState[]): void {
  if (!allowed.includes(state)) throw new Error(`Operation is not allowed from ${state}; expected ${allowed.join(', ')}`)
}

function readRequest<D extends TaskDomain>(value: unknown): TaskRequest<D> {
  const r = fields(value, ['id', 'owner', 'title', 'prompt', 'repoAlias', 'baseRef', 'risk', 'budget', 'createdAt'])
  const id = text(r.id)
  if (!/^TASK-[0-9a-f-]{36}$/u.test(id)) throw new Error('Invalid task id')
  if (r.risk !== 'trivial' && r.risk !== 'standard' && r.risk !== 'high_risk') throw new Error('Invalid risk')
  return { id, owner: text(r.owner), title: text(r.title), prompt: text(r.prompt),
    repoAlias: text(r.repoAlias), baseRef: text(r.baseRef), risk: r.risk, budget: parseBudget(r.budget), createdAt: integer(r.createdAt) }
}

function readFact<D extends TaskDomain>(value: unknown): TaskFact<D> {
  if (!value || typeof value !== 'object' || !('kind' in value)) throw new Error('Invalid task fact')
  const kind = text(value.kind)
  const keys: Record<string, string[]> = {
    plan: ['plan'], approval: ['revision', 'digest', 'actor'], execution: ['jobId', 'checkCount'],
    process_exit: ['phase', 'index', 'exitCode', 'signal'], settled: ['outcome', 'detail'], review: ['passed', 'source', 'findings'],
    scope_expanded: ['reason'], interrupted: ['reason'], budget_exhausted: ['reason'],
  }
  const r = fields(value, ['kind', 'at', ...keys[kind] ?? []])
  const at = integer(r.at)
  switch (kind) {
    case 'queued': case 'claimed': case 'preparing': case 'planning': case 'fix_started': case 'review_started':
    case 'cancel_requested': case 'cancelled': case 'resumed': return { kind, at }
    case 'plan': return { kind, at, plan: parsePlan(r.plan) }
    case 'approval': return { kind, at, revision: integer(r.revision, 1), digest: text(r.digest), actor: text(r.actor) }
    case 'execution': return { kind, at, jobId: text(r.jobId), checkCount: integer(r.checkCount, 1) }
    case 'process_exit': {
      if (r.phase !== 'executor' && r.phase !== 'validation') throw new Error('Invalid process phase')
      if (r.exitCode !== null && (typeof r.exitCode !== 'number' || !Number.isInteger(r.exitCode))) throw new Error('Invalid exit code')
      return { kind, at, phase: r.phase, index: integer(r.index), exitCode: r.exitCode, signal: r.signal === null ? null : text(r.signal) }
    }
    case 'settled': {
      if (r.outcome !== 'completed' && r.outcome !== 'failed' && r.outcome !== 'killed') throw new Error('Invalid outcome')
      return { kind, at, outcome: r.outcome, detail: text(r.detail) }
    }
    case 'review': {
      if (typeof r.passed !== 'boolean' || (r.source !== 'human' && r.source !== 'expert')) throw new Error('Invalid review')
      return { kind, at, passed: r.passed, source: r.source, findings: text(r.findings) }
    }
    case 'scope_expanded': case 'interrupted': case 'budget_exhausted': return { kind, at, reason: text(r.reason) }
    default: throw new Error(`Unknown task fact: ${kind}`)
  }
}

function project<D extends TaskDomain>(request: TaskRequest<D>, facts: readonly TaskFact<D>[]): TaskRecord<D> {
  let state: TaskState = 'created'
  let revision = 0
  let plan: TaskPlan | null = null
  let approval: TaskRecord<D>['approval'] = null
  let reviewCycle = 0
  let executionAttempts = 0
  let expertCalls = 0
  let jobId: D['jobId'] | null = null
  let checkCount = 0
  let processExits: Extract<TaskFact<D>, { kind: 'process_exit' }>[] = []
  let replanPending = false
  for (const fact of facts) {
    switch (fact.kind) {
      case 'queued': requireState(state, ['created']); state = 'queued'; break
      case 'claimed': requireState(state, ['queued']); state = 'claimed'; break
      case 'preparing': requireState(state, ['claimed']); state = 'preparing'; break
      case 'planning': requireState(state, ['preparing', 'needs_replan']); state = 'planning'; break
      case 'plan':
        requireState(state, ['planning', 'plan_ready'])
        if (request.risk === 'high_risk' && fact.plan.source !== 'expert') throw new Error('High-risk planning requires expert input')
        if (fact.plan.source === 'expert') expertCalls += 1
        if (expertCalls > request.budget.maxExpertCalls) throw new Error('Expert budget exhausted')
        plan = fact.plan; revision += 1; approval = null; state = 'plan_ready'; break
      case 'approval':
        requireState(state, ['plan_ready'])
        if (!plan || fact.revision !== revision || fact.digest !== digest(plan)) throw new Error('Approval does not match the current plan')
        approval = { revision, digest: fact.digest, actor: fact.actor }; state = 'approved'; break
      case 'execution':
        requireState(state, ['approved', 'fixing'])
        if (executionAttempts >= request.budget.maxExecutionAttempts || fact.at - request.createdAt >= request.budget.maxDurationMs) throw new Error('Execution budget exhausted')
        executionAttempts += 1; jobId = fact.jobId; checkCount = fact.checkCount; processExits = []; replanPending = false; state = 'executing'; break
      case 'process_exit': {
        requireState(state, ['executing', 'cancel_requested'])
        const expectedIndex = processExits.length
        if ((expectedIndex === 0 && (fact.phase !== 'executor' || fact.index !== 0))
          || (expectedIndex > 0 && (fact.phase !== 'validation' || fact.index !== expectedIndex || fact.index > checkCount))
          || processExits.some(exit => exit.exitCode !== 0)) throw new Error('Process exit facts are out of order')
        processExits.push(fact); break
      }
      case 'settled':
        if (state === 'preparing' && fact.outcome === 'failed') { state = 'failed'; break }
        requireState(state, ['executing', 'cancel_requested'])
        if (fact.outcome === 'completed') {
          if (state === 'cancel_requested' || processExits.length !== checkCount + 1 || processExits.some(exit => exit.exitCode !== 0)) throw new Error('Successful independent validation required')
          state = request.risk === 'trivial' ? 'completed' : 'executed'
        } else state = fact.outcome === 'failed' ? 'failed' : replanPending ? 'needs_replan' : 'cancelled'
        break
      case 'review_started': requireState(state, ['executed']); reviewCycle += 1; state = 'reviewing'; break
      case 'review':
        requireState(state, ['reviewing'])
        if (request.risk === 'high_risk' && fact.source !== 'expert') throw new Error('High-risk review requires expert input')
        if (fact.source === 'expert') expertCalls += 1
        if (expertCalls > request.budget.maxExpertCalls) throw new Error('Expert budget exhausted')
        state = fact.passed ? 'completed' : reviewCycle === 2 ? 'needs_human' : 'review_failed'; break
      case 'fix_started': requireState(state, ['review_failed']); state = 'fixing'; break
      case 'scope_expanded':
        requireState(state, ['plan_ready', 'approved', 'executed', 'review_failed', 'fixing', 'executing'])
        approval = null; replanPending = state === 'executing'; state = replanPending ? 'cancel_requested' : 'needs_replan'; break
      case 'cancel_requested':
        if (terminal.includes(state) || state === 'cancel_requested') throw new Error('Task cannot be cancelled from this state')
        state = 'cancel_requested'; break
      case 'cancelled': requireState(state, ['cancel_requested']); state = 'cancelled'; break
      case 'interrupted':
        requireState(state, active); approval = null; state = 'interrupted'; break
      case 'resumed': requireState(state, ['interrupted']); approval = null; state = 'needs_replan'; break
      case 'budget_exhausted':
        if (terminal.includes(state)) throw new Error('Terminal task cannot change')
        state = 'needs_human'; break
      /* v8 ignore next -- readFact rejects unknown durable discriminants before projection. */
      default: assertNever(fact)
    }
  }
  return freeze({ request, state, revision, plan, approval, reviewCycle, executionAttempts, expertCalls, jobId, checkCount, facts })
}

/** Transactional task persistence and deterministic operations with one live controller per database. */
export class CoreWorkflow<D extends TaskDomain> {
  private readonly db: DatabaseSync
  private readonly token = randomUUID()

  /**
   * Open the task database, reject another live controller, and interrupt incomplete active work.
   * @param path - Node-local SQLite file.
   * @param node - Validated local project configuration.
   * @param clock - Timestamp source, captured for every committed operation.
   */
  constructor(path: string, readonly node: NodeConfig, private readonly clock: () => number = Date.now) {
    mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    let acquired = false
    try {
      const row = this.db.prepare('PRAGMA user_version').get()
      if (row?.user_version !== 0 && row?.user_version !== SCHEMA_VERSION) throw new Error('Unsupported MGSD database version')
      this.db.exec('BEGIN IMMEDIATE')
      try {
        this.db.exec('CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, request TEXT NOT NULL); CREATE TABLE IF NOT EXISTS facts (task_id TEXT NOT NULL, seq INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(task_id, seq)); CREATE TABLE IF NOT EXISTS controller (id INTEGER PRIMARY KEY, pid INTEGER NOT NULL, token TEXT NOT NULL)')
        const owner = this.db.prepare('SELECT pid FROM controller WHERE id = 1').get()
        if (owner) {
          const pid = Number(owner.pid)
          let alive = true
          try { process.kill(pid, 0) } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
            alive = false
          }
          if (alive) throw new Error('Another live MGSD controller owns this database')
        }
        this.db.prepare('INSERT OR REPLACE INTO controller VALUES (1, ?, ?)').run(process.pid, this.token)
        this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}; COMMIT`)
        acquired = true
      } catch (error) { this.db.exec('ROLLBACK'); throw error }
      for (const task of this.list()) {
        if (active.includes(task.state)) this.append(task.request.id, { kind: 'interrupted', at: clock(), reason: 'Controller restarted; approval revoked and work was not respawned' })
      }
    } catch (error) {
      if (acquired) this.db.prepare('DELETE FROM controller WHERE token = ?').run(this.token)
      this.db.close(); throw error
    }
  }

  /**
   * Create an immutable task request without starting execution.
   * @param owner - Trusted Session owner supplied by the adapter.
   * @param input - Human request JSON; runtime and approval fields are rejected.
   * @returns Created task with a durable branded identifier.
   */
  create(owner: D['ownerId'], input: unknown): TaskRecord<D> {
    const data = fields(input, ['title', 'prompt', 'repoAlias', 'risk', 'budget'])
    const alias = text(data.repoAlias)
    const repo = this.node.repos[alias]
    if (!repo) throw new Error('Unknown local repository alias')
    const request = readRequest<D>({ ...data, id: `TASK-${randomUUID()}`, owner, baseRef: repo.defaultBaseRef, createdAt: this.clock() })
    this.db.prepare('INSERT INTO tasks VALUES (?, ?)').run(request.id, JSON.stringify(request))
    return project(request, [])
  }

  /**
   * Read an immutable task projection, validating every durable fact.
   * @param id - Durable task identifier.
   * @returns Task or throws when absent/corrupt.
   */
  get(id: D['taskId']): TaskRecord<D> {
    const row = this.db.prepare('SELECT request FROM tasks WHERE id = ?').get(id)
    if (!row || typeof row.request !== 'string') throw new Error('Unknown task')
    const parsed: unknown = JSON.parse(row.request)
    const request = readRequest<D>(parsed)
    if (request.id !== id) throw new Error('Task request id does not match database key')
    const facts = this.db.prepare('SELECT seq, data FROM facts WHERE task_id = ? ORDER BY seq').all(id).map((row, index) => {
      if (row.seq !== index || typeof row.data !== 'string') throw new Error('Invalid task event sequence')
      const value: unknown = JSON.parse(row.data)
      return readFact<D>(value)
    })
    return project(request, facts)
  }

  /**
   * Read all tasks through durable-record validation.
   * @returns All validated task projections in stable identifier order.
   */
  list(): TaskRecord<D>[] {
    return this.db.prepare('SELECT id FROM tasks ORDER BY id').all().map(row => this.get(text(row.id) as D['taskId']))
  }

  /**
   * Advance one preparation stage; invalid transitions fail before persistence.
   * @param id - Task identifier.
   * @param stage - Explicit preparation, fix, review, or resume operation.
   * @returns Committed projection.
   */
  advance(id: D['taskId'], stage: 'queued' | 'claimed' | 'preparing' | 'planning' | 'fix_started' | 'review_started' | 'resumed'): TaskRecord<D> {
    return this.append(id, { kind: stage, at: this.clock() })
  }

  /**
   * Replace a proposed plan and revoke any earlier approval.
   * @param id - Task identifier.
   * @param input - External proposal, without approval or runtime state.
   * @returns Current revision ready for human approval.
   * @throws Persists needs_human before rejecting when the expert budget is exhausted.
   */
  propose(id: D['taskId'], input: unknown): TaskRecord<D> {
    const plan = parsePlan(input)
    const result = this.append(id, (task) => {
      requireState(task.state, ['planning', 'plan_ready'])
      if (plan.source === 'expert' && task.expertCalls >= task.request.budget.maxExpertCalls) return { kind: 'budget_exhausted', at: this.clock(), reason: 'Expert budget exhausted' }
      return { kind: 'plan', at: this.clock(), plan }
    })
    if (result.state === 'needs_human') throw new Error('Expert budget exhausted; human intervention required')
    return result
  }

  /**
   * Record a trusted human command approving the current plan revision.
   * @param id - Task identifier.
   * @param revision - Revision explicitly selected by the human.
   * @param actor - Human-command actor assigned by the adapter, not planner output.
   * @returns Approved task; stale revisions are rejected.
   */
  approve(id: D['taskId'], revision: number, actor: string): TaskRecord<D> {
    return this.append(id, (task) => {
      if (!task.plan) throw new Error('A plan is required')
      return { kind: 'approval', at: this.clock(), revision: integer(revision, 1), digest: digest(task.plan), actor: text(actor) }
    })
  }

  /**
   * Reserve an approved execution before the adapter starts a process.
   * @param id - Task identifier.
   * @param jobId - Process-local job reference, distinct from the task id.
   * @param checkCount - Required independent checks for this attempt.
   * @returns Committed execution reservation.
   * @throws Persists needs_human before rejecting exhausted execution budgets; no process may start.
   */
  execute(id: D['taskId'], jobId: D['jobId'], checkCount: number): TaskRecord<D> {
    const count = integer(checkCount, 1)
    const result = this.append(id, (task) => {
      requireState(task.state, ['approved', 'fixing'])
      const at = this.clock()
      if (task.executionAttempts >= task.request.budget.maxExecutionAttempts || at - task.request.createdAt >= task.request.budget.maxDurationMs) return { kind: 'budget_exhausted', at, reason: 'Execution budget exhausted' }
      return { kind: 'execution', at, jobId, checkCount: count }
    })
    if (result.state === 'needs_human') throw new Error('Execution budget exhausted; human intervention required')
    return result
  }

  /**
   * Record an observed process exit independently of later cleanup and interruption.
   * @param id - Task identifier.
   * @param phase - Executor or sequential independent validator.
   * @param index - Zero for executor, one-based for checks.
   * @param exitCode - Observed exit code, or null.
   * @param signal - Observed terminating signal, or null.
   * @returns Committed facts; out-of-order checks are rejected.
   */
  processExit(id: D['taskId'], phase: 'executor' | 'validation', index: number, exitCode: number | null, signal: string | null): TaskRecord<D> {
    return this.append(id, { kind: 'process_exit', at: this.clock(), phase, index, exitCode, signal })
  }

  /**
   * Settle an execution after managed cleanup, or record a failed preparation without starting execution.
   * @param id - Task identifier.
   * @param outcome - Runner outcome; only failed is admitted during preparation.
   * @param detail - Outcome detail including cleanup/interruption facts.
   * @returns Executed/completed, failed, or cancelled task.
   */
  settle(id: D['taskId'], outcome: 'completed' | 'failed' | 'killed', detail: string): TaskRecord<D> {
    return this.append(id, { kind: 'settled', at: this.clock(), outcome, detail: text(detail) })
  }

  /**
   * Record a review; the second failed review ends in needs_human.
   * @param id - Task identifier.
   * @param input - Review JSON, never a requested workflow state.
   * @returns Deterministically selected review result.
   */
  review(id: D['taskId'], input: unknown): TaskRecord<D> {
    const data = fields(input, ['passed', 'source', 'findings'])
    const fact = readFact<D>({ ...data, kind: 'review', at: this.clock() })
    return this.append(id, (task) => {
      requireState(task.state, ['reviewing'])
      if (data.source === 'expert' && task.expertCalls >= task.request.budget.maxExpertCalls) return { kind: 'budget_exhausted', at: this.clock(), reason: 'Expert budget exhausted' }
      return fact
    })
  }

  /**
   * Invalidate execution approval when the proposed scope changes.
   * @param id - Task identifier.
   * @param reason - Human-visible replan reason.
   * @returns Task requiring a new plan and approval.
   */
  replan(id: D['taskId'], reason: string): TaskRecord<D> {
    return this.append(id, { kind: 'scope_expanded', at: this.clock(), reason: text(reason) })
  }

  /**
   * Persist cancellation intent; preparation and execution await managed settlement.
   * @param id - Task identifier.
   * @returns Cancelled task or an intent awaiting actual process cleanup.
   */
  cancel(id: D['taskId']): TaskRecord<D> {
    const previous = this.get(id).state
    const task = this.append(id, { kind: 'cancel_requested', at: this.clock() })
    return previous === 'executing' || previous === 'preparing' ? task : this.append(id, { kind: 'cancelled', at: this.clock() })
  }

  /** Close storage only after the adapter has awaited its owned processes. */
  close(): void {
    this.db.prepare('DELETE FROM controller WHERE token = ?').run(this.token)
    this.db.close()
  }

  private append(id: D['taskId'], operation: TaskFact<D> | ((task: TaskRecord<D>) => TaskFact<D>)): TaskRecord<D> {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const current = this.get(id)
      const fact = typeof operation === 'function' ? operation(current) : operation
      const next = project(current.request, [...current.facts, fact])
      this.db.prepare('INSERT INTO facts VALUES (?, ?, ?)').run(id, current.facts.length, JSON.stringify(fact))
      this.db.exec('COMMIT')
      return next
    } catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
}
