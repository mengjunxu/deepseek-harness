/** Transactions joining the task, its execution, the active slot and human acceptance. */
import { isDeepStrictEqual } from 'node:util'
import { nextMilestone, runCriteria } from './milestones.ts'
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Domain, DomainTransaction } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { input } from 'zod'
import type { ExitEvidence } from './stop.ts'
import { taskboardDomain, type TaskRecord } from './domain.ts'
import { activeLeases, admission, continuesSession, deliveryRecord, interactionRecord, matchesWorkspace, reviewRecord, runProcessScope,
  verifyProjectCheck, verifyCriteria, verifyReviewEvidence, verifyReturnAssessment, workspacePlanRecord,
  type DeliveryId, type DeliverySubmission, type RunAdmission, type RunProcessScope,
  type RuntimeBinding, type SavedTaskRun, type TaskDelivery, type TaskReview,
  type TaskRun, type TaskRunId, type TurnOutcome } from './execution-domain.ts'
import type { CommandId, ProjectScript, ProjectScriptOutcome, DeliveryCodeSnapshot, RunSessionEvent, TaskRiskLevel, TaskWorkflow,
  TaskActivity,
  TaskCommand, TaskReceipt, StopFailure } from './types.ts'
import type { TaskWorkspacePlan } from './workspaces.ts'

type Tx = DomainTransaction<typeof taskboardDomain>
type Interaction = input<typeof interactionRecord>
const slot = 'execution'

function ownedRun(tx: Tx, owner: RuntimeBinding): TaskRun {
  const active = activeLeases(tx.get('slots', slot)).find(lease => lease.runId === owner.runId)
  const run = tx.get('runs', owner.runId)
  if (!active || !run || run.generation !== owner.generation || active.runId !== owner.runId || active.generation !== owner.generation
    || active.taskId !== owner.taskId || active.projectId !== owner.projectId || active.runtimeId !== owner.runtimeId) {
    throw new Error('runtime no longer owns this run')
  }
  return run
}

function matchesRun(owner: RuntimeBinding, run: SavedTaskRun): boolean {
  return run.generation === owner.generation && run.admission.taskId === owner.taskId
    && run.admission.projectId === owner.projectId && run.admission.runtimeId === owner.runtimeId
}

function taskFor(tx: Tx, owner: Pick<RuntimeBinding, 'projectId' | 'taskId'>): TaskRecord {
  const task = tx.get('tasks', owner.taskId)
  if (!task || task.task.projectId !== owner.projectId) throw new Error('task outside project')
  return task
}

function fingerprint(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/**
 * Identify the parsed start command, including the route when explicitly confirmed.
 * @param request - normalized operator request.
 * @returns the fingerprint used for command replay and authorization history.
 */
export function operatorStartFingerprint(request: TaskCommand): string {
  return fingerprint({ action: 'operator-start', request })
}

/**
 * Identify the normalized human decision independently of the Host's observation time.
 * @param review - decision recorded for one delivery.
 * @param expectedVersion - task version reviewed by the operator.
 * @returns the original command fingerprint for replay or archive verification.
 */
export function reviewFingerprint(review: TaskReview, expectedVersion: number): string {
  return fingerprint({ ...review, time: undefined, expectedVersion })
}

function previousAdmission(tx: Tx, task: TaskRecord, request: TaskCommand, runId: TaskRunId, hash: string) {
  const prior = task.activity.find(entry => entry.commandId === request.commandId)
  if (!prior) return
  const run = tx.get('runs', runId)
  if (!run || prior.action !== 'run-requested' || prior.fingerprint !== hash || run.admissionFingerprint !== hash) {
    throw new Error('command identity reused with different input')
  }
  return { run, receipt: { commandId: prior.commandId, version: prior.version, revision: prior.revision } }
}

function activity(task: TaskRecord, actor: TaskActivity['actor'], action: TaskActivity['action'], runId: TaskRunId,
  hash: string, id = brandString<CommandId>(randomUUID()), comment?: string): TaskReceipt {
  task.task.version++
  const receipt = { commandId: id, version: task.task.version, revision: task.task.revision }
  task.activity.push({ ...receipt, actor, action, runId, fingerprint: hash, time: new Date().toISOString(),
    ...comment === undefined ? {} : { comment } })
  return receipt
}

function taskToolRun(tx: Tx, owner: RuntimeBinding): TaskRun {
  const run = ownedRun(tx, owner)
  if (run.state !== 'running' || run.control !== 'normal' || run.connection !== 'connected') {
    throw new Error('Run no longer accepts task tools')
  }
  return run
}

function withinWorkspace(parent: string, child: string): boolean {
  const path = relative(parent, child)
  return !isAbsolute(path) && path !== '..' && !path.startsWith('..' + sep)
}

function readReview(tx: Tx, expectedVersion: number, review: TaskReview, hash: string):
  { receipt: TaskReceipt } | { task: TaskRecord; delivery: TaskDelivery } {
  const task = taskFor(tx, review)
  const previous = task.activity.find(entry => entry.commandId === review.commandId)
  if (previous) {
    if (previous.fingerprint !== hash) throw new Error('command identity reused with different input')
    return { receipt: { commandId: previous.commandId, version: previous.version, revision: previous.revision } }
  }
  const delivery = tx.get('deliveries', review.deliveryId)
  if (task.task.version !== expectedVersion || !delivery || task.activeRun || task.task.status !== 'in_review'
    || task.currentDelivery !== delivery.id || delivery.taskId !== task.task.id || delivery.version !== review.deliveryVersion
    || delivery.revision !== review.revision || delivery.snapshot !== review.snapshot) throw new Error('delivery is no longer reviewable')
  if (review.verdict === 'accept') {
    if (delivery.revision !== task.task.revision) throw new Error('requirements or code have changed')
    const run = tx.get('runs', delivery.runId)
    if (!run?.endedAt) throw new Error('delivery has no completed Run')
    const directory = lockDirectory(run)
    if (occupiedDirectories(tx).some(workspace =>
      withinWorkspace(directory, workspace) || withinWorkspace(workspace, directory))) {
      throw new Error('delivery workspace is in use by another Run')
    }
  }
  return { task, delivery }
}

function prerequisitesAccepted(tx: Tx, task: TaskRecord): boolean {
  return (task.task.relations?.blockers ?? []).every(id => tx.get('tasks', id)?.task.status === 'done')
}

function lockDirectory(run: SavedTaskRun): string {
  const plan = run.workspacePlan
  if (!plan) return run.admission.workspace.directory
  return plan.mode === 'isolated' ? plan.checkout : plan.confirmation.repository ?? plan.directory
}

function occupiedDirectories(tx: Tx): string[] {
  return activeLeases(tx.get('slots', slot)).map(owner => lockDirectory(ownedRun(tx, owner)))
}

function writeLeases(tx: Tx, generation: number, [active, ...peers]: ReturnType<typeof activeLeases>): void {
  tx.set('slots', slot, { generation, active: active ?? null, ...(peers.length ? { peers } : {}) })
}

function claim(tx: Tx, task: TaskRecord, run: SavedTaskRun, generation: number): TaskRun {
  const { runId, runtimeId, projectId, taskId } = run.admission
  const claimed: TaskRun = { ...run, generation, state: 'preparing' }
  task.latestRun = runId
  tx.set('tasks', taskId, task)
  tx.set('runs', runId, claimed)
  const leases = activeLeases(tx.get('slots', slot))
  leases.push({ generation, runId, runtimeId, projectId, taskId, workspace: lockDirectory(run) })
  writeLeases(tx, generation, leases)
  return claimed
}

/** Host-only writes. The runtime adapter supplies ownership and the reviewer supplies the observed code fingerprint. */
export class TaskExecutions {
  /**
   * @param domain - Taskboard's authoritative SQLite-backed domain.
   * @param maxParallelRuns - maximum simultaneous leases for independent workspaces.
   */
  constructor(private readonly domain: Domain<typeof taskboardDomain>, private readonly maxParallelRuns = 1) {}

  /**
   * Read a Run only while its recorded lease still belongs to the caller.
   * @param owner - current runtime identity and generation.
   * @returns the Run occupying the slot.
   */
  active(owner: RuntimeBinding): Promise<TaskRun> {
    return this.domain.transaction(tx => ownedRun(tx, owner))
  }

  /**
   * Read every lease and its Run in one transaction.
   * @returns the current lease and Run snapshot, if dispatch is occupied.
   */
  activeRuns(): Promise<{ owner: RuntimeBinding; run: TaskRun }[]> {
    return this.domain.transaction(tx => activeLeases(tx.get('slots', slot)).map(owner => ({ owner, run: ownedRun(tx, owner) })))
  }

  /**
   * Save the verified operating-system scope before submitting any input.
   * @param owner - Run and lease generation issuing input.
   * @param evidence - verified scope and the original Host's exclusive lock.
   * @returns after the proof is durable.
   */
  bindProcessScope(owner: RuntimeBinding, evidence: RunProcessScope): Promise<void> {
    return this.domain.transaction((tx) => {
      const run = ownedRun(tx, owner)
      if (run.processScope || run.inputAttemptedAt) throw new Error('runtime scope was already bound or input was attempted')
      run.processScope = runProcessScope.parse(evidence)
      tx.set('runs', owner.runId, run)
    })
  }

  /**
   * Retain the lease and withdraw SDK requests after the original Host lost ownership.
   * @param owner - persisted Run and lease generation under reconciliation.
   * @returns after recording the disconnected SDK transport without changing the Run outcome.
   */
  disconnectedHost(owner: RuntimeBinding): Promise<void> {
    return this.domain.transaction((tx) => {
      const run = ownedRun(tx, owner)
      if (run.connection === 'suspect' && run.interactions.every(request => request.state !== 'pending')) return
      run.connection = 'suspect'
      for (const request of run.interactions) if (request.state === 'pending') request.state = 'withdrawn'
      tx.set('runs', owner.runId, run)
    })
  }

  /**
   * Read an active tool caller's confirmed inputs and the current write version.
   * @param owner - authority assigned to the connection by the Host.
   * @returns the task requirements seen by the Run and the current concurrency version.
   */
  inspectForTool(owner: RuntimeBinding): Promise<{
    title: string
    description: string
    constraints?: string
    riskLevel?: TaskRiskLevel
    workflow?: TaskWorkflow
    milestone?: number
    acceptance: string[]
    revision: number
    version: number
  }> {
    return this.domain.transaction((tx) => {
      const { input, taskRevision } = taskToolRun(tx, owner)
      const { title, description, constraints, riskLevel, workflow, milestone, acceptance } = input
      return { title, description, ...(constraints && { constraints }), ...(riskLevel && { riskLevel }), ...(workflow && { workflow }),
        ...(milestone && { milestone }), acceptance, revision: taskRevision,
        version: taskFor(tx, owner).task.version }
    })
  }

  /**
   * Save the settled native adapter's observations under its active lease.
   * @param owner - SDK connection owning the Run.
   * @param counts - payload-free counts validated by the Host.
   */
  recordNativeActivity(owner: RuntimeBinding, counts: NonNullable<TaskRun['nativeActivity']>): Promise<void> {
    return this.domain.transaction((tx) => {
      const run = taskToolRun(tx, owner)
      const executor = run.admission.authorization?.executor
      if (executor !== 'codex' && executor !== 'codely') throw new Error('native activity requires a native Run')
      if (run.nativeActivity) {
        if (!isDeepStrictEqual(run.nativeActivity, counts)) throw new Error('native activity already recorded')
        return
      }
      run.nativeActivity = counts
      tx.set('runs', owner.runId, run)
    })
  }

  /**
   * Append a scoped activity from the task update tool.
   * @param owner - authority assigned to the connection by the Host.
   * @param request - deterministic command identity, expected version and validated activity.
   * @returns the committed action or its original receipt on replay.
   */
  recordToolUpdate(owner: RuntimeBinding, request: {
    id: CommandId
    expectedVersion: number
    action: 'commented' | 'run-progress' | 'run-blocked'
    text: string
  }): Promise<TaskReceipt> {
    return this.domain.transaction((tx) => {
      taskToolRun(tx, owner)
      const task = taskFor(tx, owner)
      const { id, action, text, expectedVersion } = request
      const hash = fingerprint({ runId: owner.runId, action, text, expectedVersion })
      const prior = task.activity.find(entry => entry.commandId === id)
      if (prior) {
        if (prior.fingerprint !== hash) throw new Error('task tool call identity reused with different input')
        return { commandId: id, version: prior.version, revision: prior.revision }
      }
      if (task.task.version !== expectedVersion) throw new Error('task version conflict')
      const receipt = activity(task, 'runtime', action, owner.runId, hash, id, text)
      tx.set('tasks', owner.taskId, task)
      return receipt
    })
  }

  /**
   * Store the Agent's evidence while retaining the active lease.
   * @param owner - authority assigned to the SDK connection.
   * @param id - durable identity derived from the native tool call.
   * @param submission - evidence and optimistic version supplied by the Agent.
   * @returns the recorded version, including on equivalent replay.
   */
  submitDelivery(owner: RuntimeBinding, id: CommandId, submission: DeliverySubmission): Promise<TaskReceipt> {
    const hash = fingerprint({ action: 'delivery-submitted', runId: owner.runId, submission })
    return this.domain.transaction((tx) => {
      const run = taskToolRun(tx, owner)
      const task = taskFor(tx, owner)
      const prior = task.activity.find(entry => entry.commandId === id)
      if (prior) {
        if (prior.fingerprint !== hash) throw new Error('task tool call identity reused with different input')
        return { commandId: id, version: prior.version, revision: prior.revision }
      }
      if (run.deliveryDraft) throw new Error('this Run has already submitted a delivery')
      if (task.task.version !== submission.expectedVersion) throw new Error('task version conflict')
      verifyCriteria(run.input.acceptance, submission.verification)
      run.deliveryDraft = { ...submission, id: brandString<DeliveryId>(id), fingerprint: hash }
      const receipt = activity(task, 'runtime', 'delivery-submitted', owner.runId, hash, id)
      tx.set('runs', owner.runId, run)
      tx.set('tasks', owner.taskId, task)
      return receipt
    })
  }

  /**
   * Reserve a project script once for the accepted SDK delivery call.
   * @param owner - currently running SDK generation.
   * @param id - native delivery tool call identity.
   * @param sourceSnapshot - workspace fingerprint observed before executing the check.
   * @returns the authorized script and directory only for the first reservation.
   */
  claimProjectScript(
    owner: RuntimeBinding, id: CommandId, sourceSnapshot: string,
  ): Promise<{ script: ProjectScript; directory: string } | null> {
    return this.domain.transaction((tx) => {
      const run = taskToolRun(tx, owner)
      const draft = run.deliveryDraft
      const script = run.admission.projectScript
      if (!script || !draft || String(draft.id) !== id) throw new Error('no authorized project script for this delivery')
      if (draft.scriptCheck) return null
      draft.scriptCheck = { script, sourceSnapshot, observation: null }
      tx.set('runs', owner.runId, run)
      return { script, directory: run.admission.workspace.directory }
    })
  }

  /**
   * Bind the native process observation to the original delivery and script reservation.
   * @param owner - live SDK generation.
   * @param id - native delivery tool call identity.
   * @param outcome - process exit or reason no result is available.
   */
  recordProjectScript(owner: RuntimeBinding, id: CommandId, outcome: ProjectScriptOutcome): Promise<void> {
    return this.domain.transaction((tx) => {
      const run = taskToolRun(tx, owner)
      const draft = run.deliveryDraft
      const check = draft?.scriptCheck
      if (!check || String(draft.id) !== id) throw new Error('no script reservation for this delivery')
      if (check.observation) {
        if (check.observation.outcome.exitCode !== outcome.exitCode || check.observation.outcome.reason !== outcome.reason) {
          throw new Error('script result already recorded')
        }
        return
      }
      check.observation = { time: new Date().toISOString(), outcome }
      tx.set('runs', owner.runId, run)
    })
  }

  /**
   * Close admission to new interactions after the Run's turn reaches its observed outcome.
   * @param owner - authority assigned to the closing SDK connection.
   * @param outcome - known result of the live SDK turn.
   * @param observedAfterExit - a persisted Session ending observed after verified process exit.
   * @returns whether the caller owns the transition into finalization.
   */
  beginFinalization(owner: RuntimeBinding, outcome: TurnOutcome, observedAfterExit: boolean = false): Promise<boolean> {
    return this.domain.transaction((tx) => {
      const saved = tx.get('runs', owner.runId)
      if (!saved || !matchesRun(owner, saved) || saved.endedAt || saved.control !== 'normal') return false
      const run = ownedRun(tx, owner)
      if (run.state !== 'running' || (!observedAfterExit && run.connection !== 'connected')
        || run.interactions.some(entry => entry.state === 'pending')) return false
      run.control = 'finalizing'
      run.turnOutcome = outcome
      tx.set('runs', owner.runId, run)
      return true
    })
  }

  /**
   * Seal the submitted evidence with the Host's post-exit observation and release the lease.
   * @param owner - authority assigned to the closing SDK connection.
   * @param evidence - independent runtime and tool process exit observation.
   * @param code - workspace snapshot made after process exit.
   * @returns after the delivery, task status and lease update commit together.
   */
  sealDelivery(owner: RuntimeBinding, evidence: ExitEvidence, code: DeliveryCodeSnapshot): Promise<void> {
    return this.domain.transaction((tx) => {
      const run = ownedRun(tx, owner)
      if (run.control !== 'finalizing' || run.turnOutcome !== 'finished' || !run.deliveryDraft
        || evidence.runtimeId !== owner.runtimeId || !evidence.source.trim()) {
        throw new Error('delivery requires its finalizing Run and confirmed exit')
      }
      const { id, summary, changes, knownIssues, unfinished, verification } = run.deliveryDraft
      const { runId, projectId, taskId } = owner
      const prior = tx.get('deliveries', taskFor(tx, owner).deliveryIds.at(-1) ?? id)
      const script = run.admission.projectScript
      const sealed = script ? { ...code,
        projectScriptCheck: run.deliveryDraft.scriptCheck ?? { script, sourceSnapshot: null, observation: null } } : code
      const delivery: TaskDelivery = { id, runId, projectId, taskId, revision: run.taskRevision, version: (prior?.version ?? 0) + 1,
        summary, changes, knownIssues, unfinished, verification, modelReviewStatus: 'not-requested', snapshot: code.fingerprint, code: sealed }
      const reason = 'delivery sealed after runtime exit'
      this.settle(tx, owner, run, evidence, 'finished', reason, fingerprint({ evidence, reason, delivery }), delivery)
    })
  }

  /**
   * Require an unconfirmed shutdown before observing the active runtime again.
   * @param owner - recorded runtime and lease generation.
   * @returns the pending shutdown control, or null for the same settled Run.
   */
  canRecheckStop(owner: RuntimeBinding): Promise<'stop_requested' | 'finalizing' | null> {
    return this.domain.transaction((tx) => {
      const saved = tx.get('runs', owner.runId)
      if (saved?.endedAt && matchesRun(owner, saved)) return null
      const run = ownedRun(tx, owner)
      if (run.control === 'normal' || !run.stopFailure) throw new Error('no unconfirmed stop')
      return run.control
    })
  }

  /**
   * Persist the confirmed input and claim an idle serial slot when no Run is waiting.
   * @param input - operator selection with server-resolved identities, directory and execution configuration.
   * @returns the saved Run, including the lease generation.
   */
  async admit(input: RunAdmission): Promise<TaskRun> {
    const { run } = await this.recordAdmission(input)
    if (run.generation === null) throw new Error('direct admission did not acquire a lease')
    return run
  }

  /**
   * Save a Run and its immutable input in submission order without acquiring a runtime lease.
   * @param input - operator selection with server-resolved identities and configuration.
   * @param plan - directory confirmation or worktree plan resolved by the Host.
   * @returns the original receipt on repeated submissions of the same command.
   */
  async enqueue(input: RunAdmission, plan: TaskWorkspacePlan): Promise<TaskReceipt> {
    return this.enqueueAdmission(input, plan)
  }

  /**
   * Replay a committed operator start before resolving its filesystem or deployment settings.
   * @param request - validated operator input.
   * @param runId - stable Run identity for the command.
   * @param resolve - prepares the Host-owned admission and workspace plan without starting a runtime.
   * @returns the committed queue receipt, including on an equivalent replay.
   */
  async enqueueOperator(
    request: TaskCommand, runId: TaskRunId, resolve: () => Promise<{ input: RunAdmission; plan: TaskWorkspacePlan }>,
  ): Promise<TaskReceipt> {
    const hash = operatorStartFingerprint(request)
    const replay = () => this.domain.transaction(tx => previousAdmission(tx, taskFor(tx, request), request, runId, hash))
    const saved = await replay()
    if (saved) return saved.receipt
    let resolved
    try {
      resolved = await resolve()
    } catch (error) {
      // A concurrent submission may commit while deployment or workspace resolution is in flight.
      const committed = await replay()
      if (committed) return committed.receipt
      throw error
    }
    return this.enqueueAdmission(resolved.input, resolved.plan, hash)
  }

  private async enqueueAdmission(input: RunAdmission, plan: TaskWorkspacePlan, hash?: string): Promise<TaskReceipt> {
    const saved = workspacePlanRecord.parse(plan)
    if (!matchesWorkspace(saved, input.workspace) || (input.mode === 'resume' && saved.mode !== 'continue')) {
      throw new Error('workspace plan does not match the queued admission')
    }
    return (await this.recordAdmission(input, saved, hash)).receipt
  }

  /**
   * Atomically assign an available lease to the oldest eligible Run.
   * @returns the Run whose lease this caller acquired, or null if no Run can be claimed.
   */
  claimNext(): Promise<TaskRun | null> {
    return this.domain.transaction((tx) => {
      const lease = tx.get('slots', slot)
      const active = activeLeases(lease)
      if (active.length >= this.maxParallelRuns) return null
      const directories = occupiedDirectories(tx)
      const waiting = tx.get('queue', slot) ?? []
      for (const runId of waiting) {
        const run = tx.get('runs', runId)
        if (run?.state !== 'queued' || !run.workspacePlan) throw new Error('invalid queued Run')
        const task = taskFor(tx, run.admission)
        if (task.activeRun !== runId) throw new Error('queued run no longer owns its task')
        if (!prerequisitesAccepted(tx, task)) continue
        const directory = lockDirectory(run)
        if (directories.some(workspace => withinWorkspace(directory, workspace) || withinWorkspace(workspace, directory))) continue
        tx.set('queue', slot, waiting.filter(id => id !== runId))
        return claim(tx, task, run, (lease?.generation ?? 0) + 1)
      }
      return null
    })
  }

  /**
   * Cancel one waiting Run and keep its history. A Run that has acquired the lease must be stopped.
   * @param request - operator command with the expected task version.
   * @param runId - queued Run in the selected task.
   * @returns the original cancellation receipt on replay.
   */
  cancelQueued(request: TaskCommand, runId: TaskRunId): Promise<TaskReceipt> {
    const { projectId, taskId, commandId, expectedVersion } = request
    const hash = fingerprint({ action: 'run-canceled', runId, projectId, taskId, commandId, expectedVersion })
    return this.domain.transaction((tx) => {
      const task = taskFor(tx, request)
      const prior = task.activity.find(e => e.commandId === request.commandId)
      if (prior) {
        if (prior.fingerprint !== hash) throw new Error('command identity reused with different input')
        return { commandId: prior.commandId, version: prior.version, revision: prior.revision }
      }
      if (task.task.version !== request.expectedVersion) throw new Error('task version conflict')
      const run = tx.get('runs', runId)
      const waiting = tx.get('queue', slot) ?? []
      if (task.activeRun !== runId || run?.state !== 'queued' || run.admission.projectId !== projectId || run.admission.taskId !== taskId
        || !waiting.includes(runId)) throw new Error('run is not queued for this task')
      const { mode, session } = run.admission
      if (mode === 'fresh') tx.set('sessions', JSON.stringify([session.home, session.sessionId]), undefined)
      task.activeRun = null
      const receipt = activity(task, 'operator', 'run-canceled', runId, hash, request.commandId)
      tx.set('tasks', request.taskId, task)
      tx.set('runs', runId, { ...run, state: 'canceled', endedAt: new Date().toISOString(), endReason: 'canceled before launch' })
      tx.set('queue', slot, waiting.filter(id => id !== runId))
      return receipt
    })
  }

  private recordAdmission(input: RunAdmission, plan?: SavedTaskRun['workspacePlan'], requestHash?: string): Promise<{ run: SavedTaskRun; receipt: TaskReceipt }> {
    const request = admission.parse(input)
    const hash = requestHash ?? fingerprint(plan ? { request, plan } : request)
    return this.domain.transaction((tx) => {
      const task = taskFor(tx, request)
      const prior = previousAdmission(tx, task, request, request.runId, hash)
      if (prior) return prior
      if (task.task.version !== request.expectedVersion) throw new Error('task version conflict')
      if (task.task.archived || task.task.status !== 'todo' || !task.task.description.trim() || !task.task.acceptance.length) {
        throw new Error('run requires a todo task with a goal and acceptance criteria')
      }
      if (request.whenReady && (request.mode !== 'fresh' || plan?.mode !== 'isolated')) throw new Error('automatic claim requires a fresh isolated workspace')
      if (!request.whenReady && !prerequisitesAccepted(tx, task)) throw new Error('task has unaccepted prerequisites')
      const lease = tx.get('slots', slot)
      const waiting = tx.get('queue', slot) ?? []
      if (task.activeRun || (!plan && (lease?.active || waiting.length))) throw new Error('execution slot is occupied')
      if (tx.get('runs', request.runId)) throw new Error('run identity is already claimed')
      if (request.previousRun !== task.latestRun) throw new Error('previous run does not match task')
      const previous = request.previousRun ? tx.get('runs', request.previousRun) : undefined
      if (request.previousRun && !previous) throw new Error('missing previous run')
      const target = request.session
      if (request.workspace.directory !== target.workspace || !isAbsolute(target.workspace) || !isAbsolute(target.home)) {
        throw new Error('session directory does not match the selected workspace')
      }
      const sessionKey = JSON.stringify([target.home, target.sessionId])
      if (request.mode === 'resume') {
        const old = previous?.admission
        if (!old || !continuesSession(old, request) || tx.get('sessions', sessionKey) !== request.taskId) {
          throw new Error('resume requires the original session, directory and branch')
        }
      } else if (tx.get('sessions', sessionKey) || previous?.admission.session.sessionId === target.sessionId) {
        throw new Error('fresh session is already referenced')
      }
      if (!isDeepStrictEqual(request.projectScript, tx.get('projects', request.projectId)?.project.projectScript) || (request.projectScript && !request.authorization)) {
        throw new Error('project script differs from the Run confirmation')
      }
      const priorReview = task.lastReview ? tx.get('reviews', task.lastReview) : undefined
      const milestone = task.task.workflow?.template === 'task.milestone.v1' ? nextMilestone(task.activity, task.task.revision) : undefined
      const run: SavedTaskRun = { admission: request, generation: null, admissionFingerprint: hash, taskRevision: task.task.revision,
        ...previous && { previousCheckpoint: { runId: previous.admission.runId, sessionId: previous.admission.session.sessionId,
          revision: previous.taskRevision, receipt: previous.receipt, lastEvent: previous.lastEvent ?? null } },
        ...(plan ? { workspacePlan: plan } : {}),
        input: { title: task.task.title, description: task.task.description,
          ...(task.task.constraints && { constraints: task.task.constraints }),
          ...(task.task.riskLevel && { riskLevel: task.task.riskLevel }),
          ...(task.task.workflow && { workflow: task.task.workflow }),
          ...(milestone && { milestone }), acceptance: runCriteria(task.task, milestone),
          reviewFeedback: priorReview?.verdict === 'return' ? priorReview.feedback : null },
        state: 'queued', control: 'normal', connection: 'disconnected', createdAt: new Date().toISOString(), receipt: null,
        endedAt: null, endReason: null, endFingerprint: null, interactions: [] }
      task.activeRun = request.runId
      const receipt = activity(task, 'operator', 'run-requested', request.runId, hash, request.commandId)
      tx.set('sessions', sessionKey, request.taskId)
      if (!plan) return { run: claim(tx, task, run, (lease?.generation ?? 0) + 1), receipt }
      tx.set('tasks', request.taskId, task)
      tx.set('runs', request.runId, run)
      tx.set('queue', slot, [...waiting, request.runId])
      return { run, receipt }
    })
  }

  /**
   * Persist the decision to send a Run's input before invoking its initialized SDK.
   * @param owner - current runtime and lease generation, after workspace preparation and the SDK handshake.
   * @param prompt - sends the saved Run's confirmed input to its bound Session and returns the SDK message ID.
   * @param inputStartSeq - first sequence where this SDK input may appear in storage.
   * @returns the committed message ID, or null when a previous attempt still needs reconciliation.
   * A prompt or receipt-write failure leaves the recorded attempt in place and propagates to the caller.
   */
  async submitInput(owner: RuntimeBinding, prompt: (run: TaskRun) => Promise<string>, inputStartSeq?: number): Promise<string | null> {
    const attempt = await this.domain.transaction((tx) => {
      const saved = tx.get('runs', owner.runId)
      if (saved && matchesRun(owner, saved)) {
        if (saved.receipt) return saved.receipt
        if (saved.endedAt && saved.inputAttemptedAt) return null
      }
      const run = ownedRun(tx, owner)
      if (run.inputAttemptedAt) return null
      if (run.state !== 'preparing' || run.control !== 'normal') throw new Error('run is not ready for SDK input')
      run.inputAttemptedAt = new Date().toISOString()
      if (inputStartSeq !== undefined) run.inputStartSeq = inputStartSeq
      tx.set('runs', owner.runId, run)
      return run
    })
    if (typeof attempt === 'string' || attempt === null) return attempt
    const messageId = await prompt(attempt)
    await this.started(owner, messageId)
    return messageId
  }

  /**
   * Release a claimed Run when workspace or configuration preparation failed before launching its SDK.
   * @param owner - launcher that owns this generation.
   * @param reason - failed preparation stage.
   * @returns after settling the Run and releasing its slot.
   */
  failedBeforeLaunch(owner: RuntimeBinding, reason: string): Promise<void> {
    return this.domain.transaction((tx) => {
      const run = ownedRun(tx, owner)
      if (run.inputAttemptedAt || run.receipt) throw new Error('input requires reconciliation')
      const state = run.control === 'stop_requested' ? 'interrupted' : 'failed'
      const evidence = { runtimeId: owner.runtimeId, source: 'launcher did not start an SDK process' }
      this.settle(tx, owner, run, evidence, state, reason, fingerprint({ evidence, state, reason }))
    })
  }

  /**
   * Retain the active lease and record a failed launch or an input requiring reconciliation.
   * @param owner - launcher that owns this generation.
   * @param reason - stage whose outcome requires investigation.
   * @returns after the suspect connection and reason are durable.
   */
  launchUnconfirmed(owner: RuntimeBinding, reason: string): Promise<void> {
    return this.domain.transaction((tx) => {
      const run = ownedRun(tx, owner)
      run.connection = 'suspect'
      run.launchFailure = reason
      tx.set('runs', owner.runId, run)
    })
  }

  /**
   * Save the actual SDK receipt, including when the matching Run ended while the reply was in flight.
   * @param owner - original runtime binding for the input.
   * @param messageId - original durable SDK receipt.
   * @returns resolution after the Run and task update commit.
   */
  started(owner: RuntimeBinding, messageId: string): Promise<void> {
    return this.domain.transaction((tx) => {
      const saved = tx.get('runs', owner.runId)
      if (saved?.endedAt && saved.inputAttemptedAt && matchesRun(owner, saved)) {
        if (saved.receipt === messageId) return
        if (!messageId || saved.receipt) throw new Error('unexpected SDK receipt')
        const task = taskFor(tx, owner)
        saved.receipt = messageId
        delete saved.launchFailure
        activity(task, 'runtime', 'run-receipt-reconciled', owner.runId, fingerprint({ messageId }))
        tx.set('runs', owner.runId, saved)
        tx.set('tasks', owner.taskId, task)
        return
      }
      const run = ownedRun(tx, owner)
      if (run.receipt === messageId && run.state === 'running') return
      if (!messageId || run.state !== 'preparing' || run.receipt) throw new Error('unexpected SDK receipt')
      if (run.workspacePlan && !run.inputAttemptedAt) throw new Error('SDK input attempt was not recorded')
      delete run.launchFailure
      run.receipt = messageId
      run.state = 'running'
      if (run.control === 'normal' && run.connection === 'disconnected') run.connection = 'connected'
      const task = taskFor(tx, owner)
      task.task.status = 'in_progress'
      activity(task, 'runtime', 'run-started', owner.runId, fingerprint({ messageId }))
      tx.set('runs', owner.runId, run)
      tx.set('tasks', owner.taskId, task)
    })
  }

  /**
   * Keep the latest committed sequence observed for the active SDK Session.
   * @param owner - original Run and lease binding.
   * @param sessionId - Session named by the notification.
   * @param event - metadata of the committed event.
   * @returns after recording the advancement or ignoring a repeated or late event.
   */
  observeSessionEvent(owner: RuntimeBinding, sessionId: SessionId, event: RunSessionEvent): Promise<void> {
    return this.domain.transaction((tx) => {
      const saved = tx.get('runs', owner.runId)
      if (!saved || !matchesRun(owner, saved) || saved.admission.session.sessionId !== sessionId) throw new Error('event belongs to another Run Session')
      if (saved.endedAt || (saved.lastEvent && saved.lastEvent.seq >= event.seq)) return
      const run = ownedRun(tx, owner)
      run.lastEvent = event
      tx.set('runs', owner.runId, run)
    })
  }

  /**
   * Record loss of the active SDK event stream without changing outcome or lease.
   * @param owner - original Run whose subscription closed.
   * @returns after recording a suspect connection, or leaving a settled or stopping Run intact.
   */
  observeTransportLoss(owner: RuntimeBinding): Promise<void> {
    return this.domain.transaction((tx) => {
      const saved = tx.get('runs', owner.runId)
      if (!saved || !matchesRun(owner, saved) || saved.endedAt || saved.control !== 'normal' || saved.connection === 'suspect') return
      const run = ownedRun(tx, owner)
      run.connection = 'suspect'
      tx.set('runs', owner.runId, run)
    })
  }

  /**
   * Record a genuine SDK request or its terminal outcome for the bound Session.
   * @param owner - owning runtime adapter.
   * @param value - original Session/request identity and interaction kind.
   * @returns resolution after the interaction is durable.
   */
  interaction(owner: RuntimeBinding, value: Interaction): Promise<void> {
    const interaction = interactionRecord.parse(value)
    return this.domain.transaction((tx) => {
      const saved = tx.get('runs', owner.runId)
      if (interaction.state === 'withdrawn' && saved?.endedAt && matchesRun(owner, saved)) return
      const run = ownedRun(tx, owner)
      if (run.admission.session.sessionId !== interaction.sessionId) throw new Error('interaction belongs to another session')
      const prior = run.interactions.find(e => e.kind === interaction.kind && e.requestId === interaction.requestId)
      if (prior?.state === interaction.state) return
      if (prior?.state === 'answered' && interaction.state === 'withdrawn') return
      if (prior && prior.state !== 'pending') throw new Error('interaction has already settled')
      if (!prior && interaction.state !== 'pending') throw new Error('unknown interaction')
      if (interaction.state !== 'withdrawn' && (run.control !== 'normal' || run.connection === 'suspect')) {
        throw new Error('run is no longer accepting interactions')
      }
      if (prior) prior.state = interaction.state
      else run.interactions.push(interaction)
      tx.set('runs', owner.runId, run)
    })
  }

  /**
   * Persist the operator's stop decision before the adapter signals the runtime.
   * @param owner - target runtime and active generation.
   * @param command - original operator command and observed task version.
   * @param force - explicit escalation after an unconfirmed graceful stop.
   * @returns the durable decision receipt.
   */
  requestStop(owner: RuntimeBinding, command: TaskCommand, force: boolean): Promise<{ receipt: TaskReceipt; issued: boolean }> {
    const action = force ? 'force-requested' : 'stop-requested'
    const { projectId, taskId, commandId, expectedVersion } = command
    const hash = fingerprint({ action, runId: owner.runId, runtimeId: owner.runtimeId, generation: owner.generation,
      projectId, taskId, commandId, expectedVersion })
    return this.domain.transaction((tx) => {
      const task = taskFor(tx, owner)
      if (command.taskId !== owner.taskId || command.projectId !== owner.projectId) throw new Error('wrong stop target')
      const prior = task.activity.find(entry => entry.commandId === command.commandId)
      if (prior) {
        if (prior.fingerprint !== hash) throw new Error('command identity reused with different input')
        return { receipt: { commandId: prior.commandId, revision: prior.revision, version: prior.version }, issued: false }
      }
      const run = ownedRun(tx, owner)
      if (task.task.version !== command.expectedVersion) throw new Error('task version conflict')
      if (force ? run.control === 'normal' || run.connection !== 'suspect' : run.control !== 'normal') {
        throw new Error('stop request does not match the current control state')
      }
      run.control = 'stop_requested'
      const receipt = activity(task, 'operator', action, owner.runId, hash, command.commandId)
      tx.set('runs', owner.runId, run)
      tx.set('tasks', owner.taskId, task)
      return { receipt, issued: true }
    })
  }

  /**
   * Keep the execution and directory occupied when shutdown or scope inspection is inconclusive.
   * @param owner - adapter whose stop attempt could not establish quiescence.
   * @param reason - observation that prevented confirmation.
   * @returns resolution after the suspect connection is durable.
   */
  stopUnconfirmed(owner: RuntimeBinding, reason: StopFailure): Promise<void> {
    return this.domain.transaction((tx) => {
      // A replay after terminal commit has no live handle and needs no reconciliation.
      if (reason === 'runtime-unavailable' && tx.get('runs', owner.runId)?.endedAt) return
      const run = ownedRun(tx, owner)
      if (reason === 'runtime-unavailable' && run.stopFailure) return
      if (run.control === 'normal') throw new Error('no pending stop')
      run.stopFailure = reason
      run.connection = 'suspect'
      tx.set('runs', owner.runId, run)
    })
  }

  /**
   * Close a confirmed stopped runtime, seal an optional delivery and release the matching lease atomically.
   * @param owner - generation and identities of the stopped runtime.
   * @param evidence - adapter observations confirming the exclusive child and its full tool scope exited.
   * @param state - observed terminal execution outcome.
   * @param reason - observed end or failure reason.
   * @param output - delivery sealed against the Host's captured snapshot, when available.
   * @returns resolution after the terminal records are durable.
   */
  exited(owner: RuntimeBinding, evidence: ExitEvidence, state: 'finished' | 'interrupted' | 'failed', reason: string, output?: TaskDelivery): Promise<void> {
    if (evidence.runtimeId !== owner.runtimeId || !evidence.source.trim()) return Promise.reject(new Error('missing target exit evidence'))
    const hash = fingerprint({ evidence, state, reason, delivery: output })
    return this.domain.transaction((tx) => {
      const saved = tx.get('runs', owner.runId)
      if (saved?.endFingerprint === hash && matchesRun(owner, saved)) return
      const run = ownedRun(tx, owner)
      if (run.control === 'stop_requested' && state !== 'interrupted') throw new Error('pending stop requires an interrupted outcome')
      this.settle(tx, owner, run, evidence, state, reason, hash, output)
    })
  }

  private settle(tx: Tx, owner: RuntimeBinding, run: TaskRun, evidence: ExitEvidence,
    state: 'finished' | 'interrupted' | 'failed', reason: string, hash: string, output?: TaskDelivery): void {
    if (!reason.trim() || (state === 'finished' && !run.receipt)) throw new Error('missing confirmed run outcome')
    const task = taskFor(tx, owner)
    if (output) {
      const d = deliveryRecord.parse(output)
      if (state !== 'finished' || d.runId !== owner.runId || d.taskId !== owner.taskId || d.projectId !== owner.projectId
        || d.revision !== run.taskRevision || tx.get('deliveries', d.id)) {
        throw new Error('delivery does not match the completed run')
      }
      verifyProjectCheck(tx.get('projects', owner.projectId)?.project.checkTrackedDiff, d)
      if (!isDeepStrictEqual(run.admission.projectScript, d.code?.projectScriptCheck?.script)) throw new Error('delivery lacks authorized project script evidence')
      verifyCriteria(run.input.acceptance, d.verification)
      const prior = task.currentDelivery ? tx.get('deliveries', brandString<DeliveryId>(task.currentDelivery)) : undefined
      if (d.version !== (prior?.version ?? 0) + 1) throw new Error('unexpected delivery version')
      task.currentDelivery = d.id
      task.deliveryIds.push(d.id)
      tx.set('deliveries', d.id, d)
      delete run.deliveryDraft
    }
    run.state = state
    run.control = 'normal'
    run.connection = 'disconnected'
    delete run.stopFailure
    delete run.launchFailure
    run.exitEvidence = evidence
    run.endedAt = new Date().toISOString()
    run.endReason = reason
    run.endFingerprint = hash
    for (const request of run.interactions) if (request.state === 'pending') request.state = 'withdrawn'
    task.activeRun = null
    task.task.status = output ? 'in_review' : 'blocked'
    activity(task, 'runtime', 'run-ended', owner.runId, fingerprint({ state, reason, delivery: output?.id }))
    tx.set('runs', owner.runId, run)
    tx.set('tasks', owner.taskId, task)
    const slots = tx.get('slots', slot)
    if (!slots) throw new Error('missing execution lease during settlement')
    writeLeases(tx, slots.generation, activeLeases(slots).filter(lease => lease.runId !== owner.runId))
  }

  /**
   * Persist an operator's decision on one sealed delivery after the Host has rechecked the working tree.
   * @param expectedVersion - task version the operator reviewed.
   * @param decision - decision tied to the original criteria, version and fingerprint.
   * @param observe - Host observation of the code fingerprint, performed before an acceptance commit.
   * @returns the original receipt for equivalent retries.
   */
  async review(expectedVersion: number, decision: Omit<TaskReview, 'time'>, observe: string | (() => Promise<string>)): Promise<TaskReceipt> {
    const time = new Date().toISOString()
    const review = reviewRecord.parse({ ...decision, time })
    const hash = reviewFingerprint(review, expectedVersion)
    const read = (tx: Tx) => readReview(tx, expectedVersion, review, hash)
    const initial = await this.domain.transaction(read)
    if ('receipt' in initial) return initial.receipt
    let observedSnapshot: string | undefined
    if (review.verdict === 'accept') {
      try {
        observedSnapshot = typeof observe === 'string' ? observe : await observe()
      } catch (error) {
        const replay = await this.domain.transaction(read)
        if ('receipt' in replay) return replay.receipt
        throw error
      }
    }
    return this.domain.transaction((tx) => {
      const target = read(tx)
      if ('receipt' in target) return target.receipt
      const { task, delivery: d } = target
      if (review.verdict === 'accept' && d.snapshot !== observedSnapshot) throw new Error('requirements or code have changed')
      verifyReturnAssessment(review, task.modelReviews)
      verifyReviewEvidence(d, review)
      const workflow = task.task.workflow
      const finalStage = workflow?.template !== 'task.milestone.v1' || nextMilestone(task.activity, task.task.revision) === workflow.steps.length
      task.task.status = review.verdict === 'accept' && finalStage ? 'done' : 'todo'
      if (tx.get('reviews', review.commandId)) throw new Error('review identity belongs to another task')
      task.lastReview = review.commandId
      const receipt = activity(task, 'operator', review.verdict === 'accept' ? 'accepted' : 'returned', d.runId, hash, review.commandId)
      tx.set('reviews', review.commandId, review)
      tx.set('tasks', review.taskId, task)
      return receipt
    })
  }
}
