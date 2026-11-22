/** Authenticated Web Host commands for Taskboard project bindings, requirements and history. */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { TaskWorkspaces, type TaskWorkspacePlan, type WorkspaceConfig } from './workspaces.ts'
import { matchesWorkspace, type RuntimeBinding } from './execution-domain.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { TaskRunId } from './execution-domain.ts'
import { createHash } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { RunStops } from './stop.ts'
import { TaskExecutions } from './execution.ts'
import { command, commentCommand, stopCommand, createProjectCommand, orderCommand, requirementsCommand, taskboardDomain, type TaskRecord } from './domain.ts'
import type { ProjectCreateCommand, ProjectId, TaskActivity, TaskboardProject, TaskCommand, TaskCommentCommand, TaskDetail, TaskId, TaskOrderCommand, TaskReceipt, TaskRequirements, TaskRequirementsCommand, TaskStopCommand, TaskView, WorkspaceInspection } from './types.ts'

export { createTaskRuntime, type TaskRuntimeOptions } from './runtime.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Operator Taskboard commands in the Web Host. */
    taskboardController: TaskboardController
  }
}

function fingerprint(action: string, parsed: object): string {
  return createHash('sha256').update(action).update(JSON.stringify(parsed)).digest('hex')
}

function acknowledge(entry: TaskReceipt): TaskReceipt {
  return { commandId: entry.commandId, version: entry.version, revision: entry.revision }
}

/** Host worktree directory and optional Git command limits. */
interface Config {
  /** Absolute parent for isolated Git worktrees. */
  worktreeRoot: string
  /** Milliseconds for one stop attempt including process observation. */
  stopTimeoutMs?: number
  /** Maximum duration of each Git subprocess in milliseconds. */
  gitTimeoutMs?: number
  /** Maximum retained Git stdout in bytes per command. */
  gitOutputMaxBytes?: number
}

/** Business state and history are committed together in one authoritative task row. */
export default class TaskboardController extends TypertRemoteService {
  static Config: z<Config, WorkspaceConfig & { stopTimeoutMs: number }> = z.object({
    worktreeRoot: z.string().required(),
    stopTimeoutMs: z.natural().min(1).max(2_147_483_647).default(10_000),
    gitTimeoutMs: z.natural().min(1).default(30_000),
    gitOutputMaxBytes: z.natural().min(1).default(16 * 1024 * 1024),
  })
  static inject = ['subprocess', 'storageDomain', storageBackendServiceKey('sqlite')]
  /** Host-only execution adapter operations scoped to the persisted Run. */
  executions!: TaskExecutions
  /** Targeted lifecycle operations on the exclusive SDK client. */
  stops!: RunStops
  private readonly stopTimeoutMs: number
  private domain!: Domain<typeof taskboardDomain>

  private readonly lifetime = new AbortController()
  private readonly workspaces: TaskWorkspaces

  /**
   * @param ctx - Web Host with its routed SQLite domain and subprocess provider.
   * @param config - isolated worktree parent and Git limits.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'taskboardController', { namespace: 'taskboard' })
    const resolved = TaskboardController.Config(config)
    this.stopTimeoutMs = resolved.stopTimeoutMs
    this.workspaces = new TaskWorkspaces(ctx.subprocess, resolved)
  }

  private project(id: ProjectId): TaskboardProject {
    const project = this.domain.table('projects').get(id)
    if (!project) throw new Error('unknown project')
    return project.project
  }

  /**
   * Inspect a registered project for original-directory execution.
   * @param projectId - operator-selected project.
   * @returns the canonical path, branch, baseline and change fingerprint.
   */
  @Remote
  inspectProject(projectId: ProjectId): Promise<WorkspaceInspection> {
    const root = this.project(projectId).root
    return this.workspaces.inspect(root, this.lifetime.signal).then((seen) => {
      if (seen.directory !== root) throw new Error('registered project root moved')
      return seen
    })
  }

  /**
   * Resolve a new Run directory before admission.
   * @param projectId - task's registered project.
   * @param runId - new Run identity.
   * @param confirmation - original directory confirmed by the operator, or null for isolation.
   * @returns the directory and commit to bind to the lease.
   */
  planWorkspace(projectId: ProjectId, runId: TaskRunId, confirmation: WorkspaceInspection | null): Promise<TaskWorkspacePlan> {
    const project = this.project(projectId)
    if (confirmation && confirmation.directory !== project.root) throw new Error('registered project root moved')
    return confirmation ? this.workspaces.existing(project.root, confirmation, 'original', this.lifetime.signal)
      : this.workspaces.isolated(project, runId, this.lifetime.signal)
  }

  private priorWorkspace(projectId: ProjectId, taskId: TaskId, priorRun: TaskRunId) {
    const record = this.domain.table('tasks').get(taskId)
    const run = this.domain.table('runs').get(priorRun)
    if (record?.task.projectId !== projectId || record.latestRun !== priorRun || record.activeRun ||
      !run || run.admission.taskId !== taskId || run.admission.projectId !== projectId) throw new Error('no completed prior run for this task')
    return run.admission.workspace
  }

  /**
   * Inspect the prior Run before the operator selects its directory again.
   * @param projectId - owning project.
   * @param taskId - task whose execution is being continued.
   * @param priorRun - latest inactive Run.
   * @returns current filesystem observations for the saved directory.
   */
  @Remote
  inspectPriorWorkspace(projectId: ProjectId, taskId: TaskId, priorRun: TaskRunId): Promise<WorkspaceInspection> {
    const prior = this.priorWorkspace(projectId, taskId, priorRun)
    return this.workspaces.inspect(prior.directory, this.lifetime.signal)
  }

  /**
   * Require the same actual directory and branch before resuming an existing Session.
   * @param projectId - owning project.
   * @param taskId - task being continued.
   * @param priorRun - latest inactive Run.
   * @param confirmation - current state selected by the operator.
   * @returns the validated directory plan.
   */
  planContinuation(projectId: ProjectId, taskId: TaskId, priorRun: TaskRunId,
    confirmation: WorkspaceInspection): Promise<TaskWorkspacePlan> {
    const prior = this.priorWorkspace(projectId, taskId, priorRun)
    if (confirmation.directory !== prior.directory || confirmation.branch !== prior.branch) throw new Error('prior directory or branch changed')
    return this.workspaces.existing(prior.directory, confirmation, 'continue', this.lifetime.signal)
  }

  /**
   * Prepare the exact workspace claimed by the active Run before launching its SDK.
   * @param owner - current runtime lease.
   * @param plan - directory plan for direct admission when the Run has no saved plan.
   * @returns observed working directory, branch and commit.
   */
  async prepareWorkspace(owner: RuntimeBinding, plan?: TaskWorkspacePlan): Promise<WorkspaceInspection> {
    const run = await this.executions.active(owner)
    const expected = run.admission.workspace
    const selected = run.workspacePlan ?? plan
    if (run.state !== 'preparing' || run.control !== 'normal' || !selected || !matchesWorkspace(selected, expected)
      || (plan && !matchesWorkspace(plan, expected))) throw new Error('workspace differs from active admission')
    const observed = await this.workspaces.materialize(selected, this.lifetime.signal)
    if (!matchesWorkspace({ directory: observed.directory, branch: observed.branch, baseline: observed.head }, expected)) {
      throw new Error('prepared directory does not match the active admission')
    }
    return observed
  }

  /** Open the authoritative domain before advertising a ready service. */
  protected async [Service.init](): Promise<void> {
    this.ctx.effect(() => () => { this.lifetime.abort() }, 'taskboard.workspace-inspection')
    this.domain = await this.ctx.storageDomain.open(taskboardDomain)
    this.ctx.effect(() => () => this.domain.close(), 'taskboard.domain')
    this.executions = new TaskExecutions(this.domain)
    this.stops = new RunStops(this.executions, this.stopTimeoutMs)
  }

  /**
   * Register a local project root selected by the operator.
   * @param request - idempotent creation with its absolute directory and optional configuration.
   * @returns the canonical persisted project.
   */
  @Remote
  async createProject(request: ProjectCreateCommand): Promise<TaskboardProject> {
    const parsed = createProjectCommand.parse(request)
    const key = parsed.project.id
    const hash = fingerprint('project', parsed)
    const projects = this.domain.table('projects')
    const prior = projects.get(key)
    if (prior?.commandId === parsed.commandId && prior.fingerprint === hash) return structuredClone(prior.project)
    if (!isAbsolute(parsed.project.root)) throw new Error('project root must be absolute')
    const root = await realpath(parsed.project.root)
    if (!(await stat(root)).isDirectory()) throw new Error('project root must be a directory')
    const next = await projects.modify(key, (current) => {
      if (current === undefined) return { commandId: parsed.commandId, fingerprint: hash, order: [], project: { ...parsed.project, root } }
      if (current.commandId === parsed.commandId && current.fingerprint === hash) return current
      throw new Error('project identity already registered')
    })
    if (!next) throw new Error('project creation returned no record')
    return structuredClone(next.project)
  }

  /**
   * Stop one Run and retain its directory while process exit remains unconfirmed.
   * @param request - operator command scoped to the selected project, task and Run.
   * @returns after the Host records the outcome.
   */
  @Remote
  async stopRun(request: TaskStopCommand): Promise<void> {
    const parsed = stopCommand.parse(request)
    await this.stops.stop(this.stopTarget(parsed.projectId, parsed.taskId, parsed.runId), parsed)
  }

  /**
   * Recheck an unconfirmed stop without sending another shutdown or force request.
   * @param projectId - project owning the Run's task.
   * @param taskId - task owning the Run.
   * @param runId - Run whose exit must be observed again.
   * @returns after recording exit or keeping the lease when the Host lacks complete evidence.
   */
  @Remote
  async recheckRunStop(projectId: ProjectId, taskId: TaskId, runId: TaskRunId): Promise<void> {
    await this.stops.recheck(this.stopTarget(projectId, taskId, runId))
  }

  private stopTarget(projectId: ProjectId, taskId: TaskId, runId: TaskRunId): RuntimeBinding {
    const run = this.domain.table('runs').get(runId)
    if (!run || run.generation === null || run.admission.projectId !== projectId || run.admission.taskId !== taskId) throw new Error('unknown stop target')
    return { ...run.admission, generation: run.generation }
  }

  /**
   * List project bindings without opening their directories or Sessions.
   * @returns the projects visible to the operator.
   */
  @Remote
  listProjects(): TaskboardProject[] {
    return Array.from(this.domain.table('projects').entries(), ([, entry]) => structuredClone(entry.project))
  }

  /**
   * Create a backlog task and its first requirements revision.
   * @param request - project scope, command identity and editable fields.
   * @returns the original acknowledgement on equivalent retries.
   */
  @Remote
  createTask(request: TaskRequirementsCommand): Promise<TaskReceipt> {
    const parsed = requirementsCommand.parse(request)
    return this.write('created', parsed, parsed.requirements)
  }

  /**
   * Replace the editable fields. An active execution retains its starting revision.
   * @param request - expected task version and replacement fields.
   * @returns the committed command receipt.
   */
  @Remote
  editTask(request: TaskRequirementsCommand): Promise<TaskReceipt> {
    const parsed = requirementsCommand.parse(request)
    return this.write('edited', parsed, parsed.requirements)
  }

  /**
   * Append an operator comment.
   * @param request - scoped command and comment.
   * @returns the committed command receipt.
   */
  @Remote
  comment(request: TaskCommentCommand): Promise<TaskReceipt> {
    const parsed = commentCommand.parse(request)
    return this.write('commented', parsed, undefined, parsed.text)
  }

  /**
   * Move a backlog or unblocked task to todo.
   * @param request - scoped command at the expected version.
   * @returns the committed command receipt.
   */
  @Remote
  planTask(request: TaskCommand): Promise<TaskReceipt> {
    return this.write('planned', command.parse(request))
  }

  /**
   * Cancel a task without an active execution.
   * @param request - scoped command at the expected version.
   * @returns the committed command receipt.
   */
  @Remote
  cancelTask(request: TaskCommand): Promise<TaskReceipt> {
    return this.write('canceled', command.parse(request))
  }

  /**
   * Archive an accepted or canceled task while retaining its history.
   * @param request - scoped command at the expected version.
   * @returns the committed command receipt.
   */
  @Remote
  archiveTask(request: TaskCommand): Promise<TaskReceipt> {
    return this.write('archived', command.parse(request))
  }

  /**
   * Reopen a completed or canceled task and retain the previous acceptance.
   * @param request - scoped command at the expected version.
   * @returns the committed command receipt.
   */
  @Remote
  reopenTask(request: TaskCommand): Promise<TaskReceipt> {
    return this.write('reopened', command.parse(request))
  }

  /**
   * Move a card before a task in the same project, or to the end.
   * @param request - scoped move at the expected version.
   * @returns the committed command receipt.
   */
  @Remote
  reorderTask(request: TaskOrderCommand): Promise<TaskReceipt> {
    const parsed = orderCommand.parse(request)
    return this.write('reordered', parsed, undefined, undefined, parsed.beforeTaskId)
  }

  /**
   * Read the task, its activity and immutable revision snapshots.
   * @param projectId - owning project.
   * @param taskId - task in the project.
   * @returns the stored detail, or null if the task is outside the project or absent.
   */
  @Remote
  detail(projectId: ProjectId, taskId: TaskId): TaskDetail | null {
    const record = this.domain.table('tasks').get(taskId)
    if (!record || record.task.projectId !== projectId) return null
    const activity = record.activity.map(({ fingerprint: _fingerprint, ...entry }) => entry)
    const runTable = this.domain.table('runs')
    const runs = record.activity.filter(e => e.action === 'run-requested').map((e) => {
      const run = e.runId && runTable.get(brandString<TaskRunId>(e.runId))
      if (!run) throw new Error('missing recorded run')
      const a = run.admission
      const prior = a.previousRun ? runTable.get(a.previousRun) : undefined
      return { runId: a.runId, previousRun: a.previousRun, state: run.state,
        control: run.control, connection: run.connection, stopFailure: run.stopFailure ?? null,
        revision: run.taskRevision, workspace: a.workspace.directory,
        branch: a.workspace.branch, sessionId: a.session.sessionId, priorSessionId: prior?.admission.session.sessionId ?? null,
        mode: a.mode, materialReferences: a.materials.map(m => m.reference), inputAttemptedAt: run.inputAttemptedAt ?? null,
        receipt: run.receipt, endReason: run.endReason }
    })
    const deliveries = record.deliveryIds.map((id) => {
      const d = this.domain.table('deliveries').get(id)
      if (!d) throw new Error('missing recorded delivery')
      return { id, runId: d.runId, version: d.version, revision: d.revision, snapshot: d.snapshot, summary: d.summary,
        stale: d.revision !== record.task.revision }
    })
    const reviews = record.activity.filter(e => e.action === 'accepted' || e.action === 'returned').map((e) => {
      const review = this.domain.table('reviews').get(e.commandId)
      if (!review) throw new Error('missing recorded review')
      return review
    })
    return structuredClone({ task: record.task, revisions: record.revisions, activity, runs, deliveries, reviews })
  }

  /**
   * List task cards for one project, including archived records only when requested.
   * @param projectId - owning project.
   * @param includeArchived - whether to include archived cards.
   * @returns the project's task cards.
   */
  @Remote
  listTasks(projectId: ProjectId, includeArchived: boolean): TaskView[] {
    const tasks: TaskView[] = []
    for (const [, { task }] of this.domain.table('tasks').entries()) {
      if (task.projectId === projectId && (includeArchived || !task.archived)) tasks.push(structuredClone(task))
    }
    const order = this.domain.table('projects').get(projectId)?.order ?? []
    const positions = new Map(order.map((id, index) => [id, index]))
    return tasks.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity) || a.id.localeCompare(b.id))
  }

  private async write(
    action: TaskActivity['action'], input: TaskCommand, requirements?: TaskRequirements, comment?: string, before?: TaskId | null,
  ): Promise<TaskReceipt> {
    const hash = fingerprint(action, input)
    const time = new Date().toISOString()
    return this.domain.transaction((tx) => {
      const project = tx.get('projects', input.projectId)
      if (!project) throw new Error('unknown task project')
      const current = tx.get('tasks', input.taskId)
      if (current && current.task.projectId !== input.projectId) throw new Error('task outside project')
      const previous = current?.activity.find(entry => entry.commandId === input.commandId)
      if (previous) {
        if (previous.fingerprint !== hash) throw new Error('command identity reused with different input')
        return acknowledge(previous)
      }
      if ((current?.task.version ?? 0) !== input.expectedVersion) throw new Error('task version conflict')
      let next: TaskRecord
      if (action === 'created') {
        if (current || !requirements) throw new Error('task already exists')
        next = { activeRun: null, latestRun: null, deliveryIds: [], currentDelivery: null, lastReview: null, task: { ...requirements, id: input.taskId, projectId: input.projectId, version: 1, revision: 1, archived: false, status: 'backlog' },
          revisions: [{ ...requirements, revision: 1 }], activity: [] }
      } else {
        if (!current) throw new Error('task does not exist')
        next = applyEdit(current, action, requirements)
      }
      if (action === 'created' || action === 'reordered') {
        const order = project.order.filter(id => id !== input.taskId)
        const index = before == null ? order.length : order.indexOf(before)
        if (index < 0) throw new Error('destination task is outside the project order')
        order.splice(index, 0, input.taskId)
        tx.set('projects', input.projectId, { ...project, order })
      }
      const entry = { commandId: input.commandId, version: next.task.version, revision: next.task.revision,
        action, actor: 'operator' as const, time, fingerprint: hash, ...(comment === undefined ? {} : { comment }) }
      next.activity.push(entry)
      tx.set('tasks', input.taskId, next)
      return acknowledge(entry)
    })
  }
}

function applyEdit(current: TaskRecord, action: Exclude<TaskActivity['action'], 'created'>, requirements?: TaskRequirements): TaskRecord {
  const next = structuredClone(current)
  const task = next.task
  if (task.archived && action !== 'reopened') throw new Error('reopen the archived task first')
  switch (action) {
    case 'edited':
      if (!requirements || task.status === 'done' || task.status === 'canceled') throw new Error('reopen the task before editing')
      if (task.description !== requirements.description || JSON.stringify(task.acceptance) !== JSON.stringify(requirements.acceptance)
        || task.title !== requirements.title) {
        task.revision++
        next.revisions.push({ ...requirements, revision: task.revision })
      }
      Object.assign(task, requirements)
      break
    case 'planned':
      if (task.status !== 'backlog' && task.status !== 'blocked') throw new Error('task cannot move to todo')
      task.status = 'todo'
      break
    case 'canceled':
      if (current.activeRun) throw new Error('stop the active run before canceling')
      if (!['backlog', 'todo', 'blocked'].includes(task.status)) throw new Error('task cannot be canceled in this state')
      task.status = 'canceled'
      break
    case 'archived':
      if (task.status !== 'done' && task.status !== 'canceled') throw new Error('task is not terminal')
      task.archived = true
      break
    case 'reopened':
      if (task.status !== 'done' && task.status !== 'canceled') throw new Error('task is not terminal')
      task.archived = false
      task.status = 'todo'
      break
    case 'reordered':
    case 'commented':
      break
    default:
      throw new Error('execution changes belong to the bound run')
  }
  task.version++
  return next
}
