/** Authenticated Web Host commands for Taskboard project bindings, requirements and history. */
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { TaskWorkspaces, type TaskWorkspacePlan, type WorkspaceConfig } from './workspaces.ts'
import { activeLeases, matchesWorkspace, reviewCommand, runAuthorization, validationResults,
  type RuntimeBinding, type TaskDelivery } from './execution-domain.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { TaskRunId } from './execution-domain.ts'
import { createHash, randomUUID } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { RunStops } from './stop.ts'
import { TeamAccounts, requireEditor, type MemberProof } from './team.ts'
import { teamRoute } from './team-http.ts'
import { RunDispatch } from './dispatch.ts'
import { TaskboardBackup } from './backup.ts'
import { verifyRestoredSession, savedTaskInput } from './session-recovery.ts'
import { RunInteractions, interactionReply } from './interactions.ts'
import { assessCoverage, type CoverageReviewConfig } from './model-review.ts'
import { checkRelations } from './relations.ts'
import { TaskExecutions } from './execution.ts'
import {
  activityPageRequest, modelReviewCommand, command, commentCommand, queuedRunCommand, startCommand, stopCommand, createProjectCommand,
  orderCommand, relationsCommand, requirementsCommand, taskboardDomain, type TaskRecord,
} from './domain.ts'
import type {
  ProjectMember, CreateMember, ChangeMember, TaskActivityCursor, TaskActivityPage,
  DeliveryFileDiff, DeliveryId, DeliverySummary, ProjectCreateCommand, ProjectId, TaskActivity, TaskboardProject,
  TaskCommand, TaskRelations, TaskCommentCommand, TaskDeliveryDetail, TaskDetail, TaskId,
  TaskInteractionReply, TaskOrderCommand, TaskPendingInteraction, TaskReceipt, TaskRequirements, TaskRequirementsCommand,
  ModelReviewAttempt, ModelReviewCommand, TaskReviewCommand, RunTaskSpec, TaskRunInputSnapshot,
  TaskStartCommand, TaskStartReceipt, TaskStopCommand, TaskView, WorkspaceInspection,
  TaskboardCard, TaskboardExecutionRoute, TaskboardInbox, TaskboardRestore,
} from './types.ts'

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

function publicActivity({ fingerprint: _fingerprint, runId, ...entry }: TaskRecord['activity'][number]): TaskActivity {
  return { ...entry, ...runId !== undefined && { runId: brandString<TaskRunId>(runId) } }
}

function summarizeDelivery(delivery: TaskDelivery, currentRevision: number): DeliverySummary {
  const { id, runId, version, revision, snapshot, summary } = delivery
  return { id, runId, version, revision, snapshot, summary, stale: revision !== currentRevision }
}

interface ExecutionConfig {
  /** Project configuration reference accepted by this Host. */
  reference: string
  /** Absolute parent for private SDK homes. */
  sessionRoot: string
  /** Provider name configured in the SDK profile. */
  provider: string
  /** Model configured in the SDK profile. */
  model: string
  /** Launch the configured SDK route after a claim. */
  dispatch?: boolean
  /** Limit for the SDK input acknowledgement. */
  requestTimeoutMs?: number
  /** Environment entries explicitly assigned to the SDK process. */
  env?: Record<string, string>
  /** Absolute SDK profile overlays applied before the required permission services. */
  patches?: string[]
}

function runtimeCompatibility({ provider, model, patches }: ExecutionConfig): string {
  return fingerprint('sdk', { provider, model, patches })
}

async function sdkPatchDigest(patches: readonly string[] | undefined, signal: AbortSignal): Promise<string | undefined> {
  if (!patches?.length) return undefined
  const hash = createHash('sha256')
  for (const path of patches) {
    const contents = await readFile(path, { signal })
    hash.update(createHash('sha256').update(contents).digest())
  }
  return hash.digest('hex')
}

/** Host worktree directory, Git command limits and optional Run configuration. */
interface Config {
  /** Absolute parent for isolated Git worktrees. */
  worktreeRoot: string
  /** Milliseconds for one stop attempt including process observation. */
  stopTimeoutMs?: number
  /** Maximum simultaneous Runs in independent workspaces. */
  maxParallelRuns?: number
  /** Maximum bytes buffered for one team member edit or comment. */
  memberRequestMaxBytes?: number
  /** Maximum duration of each Git subprocess in milliseconds. */
  gitTimeoutMs?: number
  /** Maximum retained Git stdout in bytes per command. */
  gitOutputMaxBytes?: number
  /** Optional separate, explicitly requested model review of validation coverage. */
  review?: CoverageReviewConfig | undefined
  /** Host-managed route and Session storage for newly queued Runs. */
  execution?: ExecutionConfig | undefined
}

/** Business state and history are committed together in one authoritative task row. */
export default class TaskboardController extends TypertRemoteService {
  static Config: z<Config, WorkspaceConfig & {
    maxParallelRuns: number
    memberRequestMaxBytes: number
    stopTimeoutMs: number
    execution?: ExecutionConfig | undefined
    review?: CoverageReviewConfig | undefined
  }> = z.object({
    worktreeRoot: z.string().required(),
    memberRequestMaxBytes: z.natural().min(1).default(262144),
    maxParallelRuns: z.natural().min(1).max(32).default(1),
    stopTimeoutMs: z.natural().min(1).max(2_147_483_647).default(10_000),
    gitTimeoutMs: z.natural().min(1).default(30_000),
    gitOutputMaxBytes: z.natural().min(1).default(16 * 1024 * 1024),
    review: z.union([z.object({
      provider: z.string().min(1).required(), model: z.string().min(1).required(),
      maxOutputTokens: z.natural().min(1).required(), timeoutMs: z.natural().min(1).max(2_147_483_647).required(),
      maxAttempts: z.natural().min(1).required(),
    }), z.const(undefined)]),
    execution: z.union([z.object({
      reference: z.string().min(1).required(),
      sessionRoot: z.string().min(1).required(),
      provider: z.string().min(1).required(),
      model: z.string().min(1).required(),
      dispatch: z.boolean().default(false),
      requestTimeoutMs: z.natural().min(1).max(2_147_483_647).default(30_000),
      env: z.dict(z.string()).default({}),
      patches: z.array(z.string().min(1)).default([]),
    }), z.const(undefined)]),
  })
  static inject = ['subprocess', 'storageDomain', storageBackendServiceKey('sqlite')]
  /** Host-only execution adapter operations scoped to the persisted Run. */
  executions!: TaskExecutions
  /** Targeted lifecycle operations on the exclusive SDK client. */
  stops!: RunStops
  private accounts!: TeamAccounts
  private readonly memberRequestMaxBytes: number
  private readonly maxParallelRuns: number
  private readonly stopTimeoutMs: number
  private readonly reviewsInFlight = new Set<Promise<ModelReviewAttempt>>()
  private readonly reviewConfig: CoverageReviewConfig | undefined
  private readonly executionConfig: ExecutionConfig | undefined
  private dispatch: RunDispatch | undefined
  private interactions!: RunInteractions
  private domain!: Domain<typeof taskboardDomain>
  private backups!: TaskboardBackup

  private readonly lifetime = new AbortController()
  private readonly workspaces: TaskWorkspaces

  /**
   * @param ctx - Web Host with its routed SQLite domain and subprocess provider.
   * @param config - isolated worktree parent, Git limits and optional SDK route.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'taskboardController', { namespace: 'taskboard' })
    const resolved = TaskboardController.Config(config)
    this.memberRequestMaxBytes = resolved.memberRequestMaxBytes
    this.maxParallelRuns = resolved.maxParallelRuns
    this.stopTimeoutMs = resolved.stopTimeoutMs
    this.reviewConfig = resolved.review
    this.executionConfig = resolved.execution
    if (this.executionConfig && !isAbsolute(this.executionConfig.sessionRoot)) throw new Error('Taskboard execution.sessionRoot must be absolute')
    if (this.executionConfig?.patches?.some(path => !isAbsolute(path))) throw new Error('Taskboard execution.patches must be absolute')
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

  private priorRun(projectId: ProjectId, taskId: TaskId, priorRun: TaskRunId) {
    const record = this.domain.table('tasks').get(taskId)
    const run = this.domain.table('runs').get(priorRun)
    if (record?.task.projectId !== projectId || record.latestRun !== priorRun || record.activeRun ||
      !run || run.admission.taskId !== taskId || run.admission.projectId !== projectId) throw new Error('no completed prior run for this task')
    return run
  }

  /**
   * Read the original SDK input of a queued or historical Run without opening its Session.
   * @param projectId - project owning the Run.
   * @param taskId - task owning the Run.
   * @param runId - Run whose saved input was selected.
   * @returns the admitted task content, feedback and explicitly selected material text.
   */
  @Remote
  runInput(projectId: ProjectId, taskId: TaskId, runId: TaskRunId): TaskRunInputSnapshot {
    return structuredClone(savedTaskInput(this.inputRun(projectId, taskId, runId)))
  }

  /**
   * Read the requirements, execution workspace and consent captured for one Run.
   * @param projectId - owning project.
   * @param taskId - owning task.
   * @param runId - queued or historical Run selected by the operator.
   * @returns the versioned TaskSpec with the original SDK input and available authorization.
   */
  @Remote
  runTaskSpec(projectId: ProjectId, taskId: TaskId, runId: TaskRunId): RunTaskSpec {
    const run = this.inputRun(projectId, taskId, runId)
    const { workspace, model, session } = run.admission
    return structuredClone({ format: 'dsh-task-spec', version: 1, projectId, taskId, runId, revision: run.taskRevision,
      workspace, ...(run.admission.projectScript && { projectScript: run.admission.projectScript }),
      route: model ? { provider: session.provider, model } : null, authorization: runAuthorization(run) ?? null,
      previousCheckpoint: run.previousCheckpoint ?? null, input: savedTaskInput(run) })
  }

  private inputRun(projectId: ProjectId, taskId: TaskId, runId: TaskRunId) {
    const run = this.domain.table('runs').get(runId)
    if (!run || run.admission.projectId !== projectId || run.admission.taskId !== taskId) throw new Error('unknown Run input')
    return run
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
    const prior = this.priorRun(projectId, taskId, priorRun).admission.workspace
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
    return this.continuedWorkspace(this.priorRun(projectId, taskId, priorRun).admission.workspace, confirmation)
  }

  private continuedWorkspace(
    prior: { directory: string; branch: string | null }, confirmation: WorkspaceInspection,
  ): Promise<TaskWorkspacePlan> {
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
    this.domain = await this.ctx.storageDomain.open(taskboardDomain)
    this.ctx.effect(() => async () => {
      this.lifetime.abort()
      try { await this.dispatch?.close() } finally {
        await Promise.allSettled(this.reviewsInFlight)
        await this.domain.close()
      }
    }, 'taskboard.domain')
    this.accounts = new TeamAccounts(this.domain)
    this.ctx.inject(['webServer'], (web) => {
      const route = teamRoute(this.accounts, (member, input) => input.action === 'edited'
        ? this.write('edited', input, { member, requirements: input.requirements })
        : this.write('commented', input, { member, comment: input.text }), this.memberRequestMaxBytes)
      web.effect(() => web.webServer.register(route), 'taskboard: team access')
    })
    this.executions = new TaskExecutions(this.domain, this.maxParallelRuns)
    this.backups = new TaskboardBackup(this.domain)
    this.interactions = new RunInteractions(this.executions)
    this.stops = new RunStops(this.executions, this.stopTimeoutMs, (run) => {
      const { workspace } = run.admission
      const project = this.project(run.admission.projectId)
      return this.workspaces.captureDelivery(workspace.directory, workspace.baseline, run.deliveryDraft?.files ?? [],
        this.lifetime.signal, project.checkTrackedDiff)
    })
    const config = this.executionConfig
    if (config?.dispatch) {
      this.dispatch = new RunDispatch({
        executions: this.executions, stops: this.stops, interactions: this.interactions, signal: this.lifetime.signal,
        stopTimeoutMs: this.stopTimeoutMs,
        capture: async (run, files) => {
          const { directory, baseline } = run.admission.workspace
          return (await this.workspaces.captureDelivery(directory, baseline, files, this.lifetime.signal)).fingerprint
        },
        prepare: async (owner) => { await this.prepareWorkspace(owner) },
        warn: (message) => { this.ctx.logger.warn(message) },
        resolve: async (run) => {
          const { configurationRef, model, session } = run.admission
          if (configurationRef !== config.reference || (model !== undefined && model !== config.model)
            || session.compatibility !== runtimeCompatibility(config)
            || session.provider !== config.provider || session.home !== join(config.sessionRoot, session.sessionId)) {
            throw new Error('queued Run has no matching SDK configuration')
          }
          if (run.admission.sdkPatchDigest !== undefined
            && run.admission.sdkPatchDigest !== await sdkPatchDigest(config.patches, this.lifetime.signal)) {
            throw new Error('queued Run SDK patch contents changed')
          }
          const { projectId, taskId, mode, previousRun } = run.admission
          if (mode === 'resume' && previousRun) {
            const prior = this.domain.table('runs').get(previousRun)
            if (!prior || prior.admission.projectId !== projectId || prior.admission.taskId !== taskId) throw new Error('missing prior Run')
            await verifyRestoredSession(prior, this.lifetime.signal)
          }
          return {
            cwd: session.workspace, dshHome: session.home, provider: config.provider, model: config.model,
            env: { ...scrubbedParentEnv(), ...config.env },
            ...config.patches === undefined ? {} : { patches: config.patches },
            ...config.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: config.requestTimeoutMs },
          }
        },
      })
      this.dispatch.wake()
    }
  }

  /**
   * Create a versioned Taskboard backup after active execution has settled.
   * @returns a JSON archive with a checksum and an explicit Session manifest.
   */
  @Remote
  exportBackup(): Promise<string> {
    return this.backups.exportBackup()
  }

  /**
   * Export a project for handoff outside the Taskboard.
   * @param projectId - project chosen by the operator.
   * @returns a JSON document with requirements, Run summaries and review history.
   */
  @Remote
  exportHandoff(projectId: ProjectId): Promise<string> {
    return this.backups.exportHandoff(projectId)
  }

  /**
   * Restore a verified archive into an empty Taskboard without replaying execution or requests.
   * @param archive - JSON backup selected by the operator.
   * @returns restored record counts and missing or canceled execution references.
   */
  @Remote
  restoreBackup(archive: string): Promise<TaskboardRestore> {
    return this.backups.restore(archive)
  }

  /**
   * Notify a connected Taskboard of its initial state and subsequent durable changes.
   * @param signal - authenticated stream lifetime.
   * @returns coalesced invalidations without exposing stored payloads.
   */
  @Remote({ mode: 'stream' })
  async *watchChanges(signal: AbortSignal): AsyncIterable<'changed'> {
    signal.throwIfAborted()
    let pending = true
    let wake: (() => void) | undefined
    const stop = this.ctx.on('domain/changed', (change) => {
      if (change.domain !== taskboardDomain.name) return
      pending = true
      wake?.()
    })
    const abort = () => { wake?.() }
    signal.addEventListener('abort', abort, { once: true })
    try {
      while (!signal.aborted) {
        if (pending) {
          pending = false
          yield 'changed'
        } else {
          await new Promise<void>((resolve) => { wake = resolve })
          wake = undefined
        }
      }
    } finally {
      stop()
      signal.removeEventListener('abort', abort)
    }
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
   * Queue a confirmed task snapshot and a Host-selected SDK route, with an explicit Session continuation option.
   * @param request - operator command, directory selection and explicit materials.
   * @returns the original queue receipt and Run ID on equivalent replays.
   */
  @Remote
  async startRun(request: TaskStartCommand): Promise<TaskStartReceipt> {
    const parsed = startCommand.parse(request)
    const { projectId, taskId, commandId, expectedVersion, previousRun, confirmation, materials, mode } = parsed
    if (parsed.whenReady && (mode !== 'fresh' || confirmation !== null)) {
      throw new Error('automatic claim requires a fresh isolated workspace')
    }
    const runId = brandString<TaskRunId>(commandId)
    const receipt = await this.executions.enqueueOperator(parsed, runId, async () => {
      const project = this.project(projectId)
      const config = this.executionConfig
      if (!config || (project.configurationRef && project.configurationRef !== config.reference)) {
        throw new Error('Taskboard execution configuration is unavailable for this project')
      }
      if (project.projectScript !== parsed.confirmedScript) throw new Error('project script differs from the Run confirmation')
      const expected = parsed.confirmedRoute
      if (expected && (expected.provider !== config.provider || expected.model !== config.model)) {
        throw new Error('SDK provider or model changed. Reopen the Run confirmation.')
      }
      if (mode === 'resume' && (!previousRun || !confirmation)) {
        throw new Error('Session continuation requires a prior Run and its confirmed directory')
      }
      const previous = mode === 'resume' && previousRun ? this.priorRun(projectId, taskId, previousRun) : null
      const prior = previous?.admission
      const compatibility = runtimeCompatibility(config)
      if (prior && (prior.configurationRef !== config.reference || prior.session.compatibility !== compatibility
        || prior.session.home !== join(config.sessionRoot, prior.session.sessionId))) {
        throw new Error('prior Session uses a different Taskboard execution configuration')
      }
      const patchDigest = await sdkPatchDigest(config.patches, this.lifetime.signal)
      if (prior?.sdkPatchDigest !== undefined && prior.sdkPatchDigest !== patchDigest) {
        throw new Error('SDK patch contents changed. Start a fresh Run with the current configuration.')
      }
      if (previous) await verifyRestoredSession(previous, this.lifetime.signal)
      const plan = prior && confirmation
        ? await this.continuedWorkspace(prior.workspace, confirmation)
        : await this.planWorkspace(projectId, runId, confirmation)
      const { directory, branch, baseline } = plan
      return { plan, input: {
        projectId, taskId, commandId, expectedVersion, previousRun, runId, runtimeId: randomUUID(),
        ...(parsed.whenReady && { whenReady: parsed.whenReady }), mode, configurationRef: config.reference, model: config.model,
        ...(parsed.confirmedScript && { projectScript: parsed.confirmedScript }),
        authorization: { executor: 'dsh-sdk', routeSelection: expected ? 'operator-confirmed' : 'deployment-default' },
        ...patchDigest !== undefined && { sdkPatchDigest: patchDigest }, materials, feedback: [],
        workspace: { directory, branch, baseline },
        session: prior?.session ?? {
          sessionId: runId, home: join(config.sessionRoot, runId), workspace: directory, provider: config.provider,
          compatibility,
        },
      } }
    })
    this.dispatch?.wake()
    return { ...receipt, runId }
  }

  /**
   * Cancel a Run that is still waiting for the execution slot.
   * @param request - versioned operator command scoped to the queued Run.
   * @returns the original cancellation receipt on equivalent replays.
   */
  @Remote
  cancelQueuedRun(request: TaskCommand & { runId: TaskRunId }): Promise<TaskReceipt> {
    const { runId, ...parsed } = queuedRunCommand.parse(request)
    return this.executions.cancelQueued(parsed, runId).then((receipt) => {
      this.dispatch?.wake()
      return receipt
    })
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
    this.dispatch?.wake()
  }

  /**
   * Recheck an unconfirmed shutdown without sending another signal.
   * @param projectId - project owning the Run's task.
   * @param taskId - task owning the Run.
   * @param runId - Run whose exit must be observed again.
   * @returns after recording exit or keeping the lease when the Host lacks complete evidence.
   */
  @Remote
  async recheckRunStop(projectId: ProjectId, taskId: TaskId, runId: TaskRunId): Promise<void> {
    await this.stops.recheck(this.stopTarget(projectId, taskId, runId))
    this.dispatch?.wake()
  }

  /**
   * Read the outstanding native questions and approvals for one Run.
   * @param projectId - project owning the Run's task.
   * @param taskId - task owning the Run.
   * @param runId - Run whose live requests the operator opened.
   * @returns requests still accepting an operator response.
   */
  @Remote
  pendingRunInteractions(projectId: ProjectId, taskId: TaskId, runId: TaskRunId): TaskPendingInteraction[] {
    return this.interactions.list(this.stopTarget(projectId, taskId, runId, 'interaction'))
  }

  /**
   * Submit one response to the Run's exact pending native request.
   * @param request - scoped operator response including the native request identity and kind.
   * @returns after the Host records and forwards the response to the original SDK responder.
   */
  @Remote
  answerRunInteraction(request: TaskInteractionReply): Promise<void> {
    const parsed = interactionReply.parse(request)
    return this.interactions.answer(this.stopTarget(parsed.projectId, parsed.taskId, parsed.runId, 'interaction'), parsed)
  }

  /**
   * Show pending requests grouped by the attached Run.
   * @returns the Run inboxes that need an operator response.
   */
  @Remote
  inbox(): TaskboardInbox[] {
    return activeLeases(this.domain.table('slots').get('execution')).flatMap((owner) => {
      const requests = this.interactions.list(owner)
      const { projectId, taskId, runId } = owner
      return requests.length ? [{ projectId, taskId, runId, requests }] : []
    })
  }

  /**
   * Show the selected SDK route and whether this project can dispatch.
   * @param projectId - project whose execution configuration the operator opened.
   * @returns configured launcher facts. The SDK validates credentials and permissions at launch.
   */
  @Remote
  executionRoute(projectId: ProjectId): TaskboardExecutionRoute {
    const project = this.project(projectId)
    const config = this.executionConfig
    if (!config || (project.configurationRef && project.configurationRef !== config.reference)) {
      return { state: 'unconfigured', provider: null, model: null }
    }
    return { state: config.dispatch ? 'configured' : 'disabled', provider: config.provider, model: config.model,
      ...(project.projectScript && { projectScript: project.projectScript }) }
  }

  /**
   * Read the sealed evidence and file inventory for one Delivery.
   * @param projectId - project that owns the task.
   * @param taskId - task that owns the Delivery.
   * @param deliveryId - immutable Delivery identity.
   * @returns verification, coverage and revision information.
   */
  @Remote
  deliveryDetail(projectId: ProjectId, taskId: TaskId, deliveryId: DeliveryId): TaskDeliveryDetail {
    const { delivery, task } = this.deliveryTarget(projectId, taskId, deliveryId)
    const { changes, knownIssues, unfinished, verification, code } = delivery
    const modelReviews = task.modelReviews?.filter(attempt => attempt.deliveryId === deliveryId) ?? []
    const route = this.reviewConfig
    return structuredClone({ ...summarizeDelivery(delivery, task.task.revision), changes, knownIssues, unfinished,
      verification, validationResults: validationResults(delivery), code: code ?? null,
      modelReviewStatus: modelReviews.at(-1)?.state ?? delivery.modelReviewStatus ?? null, modelReviews,
      reviewRoute: route ? { provider: route.provider, model: route.model, maxAttempts: route.maxAttempts } : null })
  }

  /**
   * Export validation coverage and risk for one sealed delivery without project text, paths or Session content.
   * @param projectId - owning project.
   * @param taskId - owning task.
   * @param deliveryId - sealed version selected by the operator.
   * @returns a compact JSON review package.
   */
  @Remote
  exportReviewPackage(projectId: ProjectId, taskId: TaskId, deliveryId: DeliveryId): string {
    const { task, delivery } = this.deliveryTarget(projectId, taskId, deliveryId)
    const criteria = { passed: 0, failed: 0, 'not-run': 0, 'not-applicable': 0 }
    for (const check of delivery.verification) criteria[check.status]++
    const files = { added: 0, modified: 0, deleted: 0, untracked: 0, declared: 0 }
    for (const file of delivery.code?.files ?? []) files[file.status]++
    return JSON.stringify({
      format: 'dsh-taskboard-review', version: 1, deliveryId, deliveryVersion: delivery.version, revision: delivery.revision,
      snapshot: delivery.snapshot, riskLevel: task.revisions[delivery.revision - 1]?.riskLevel ?? null,
      criteria, code: delivery.code ? { scope: delivery.code.scope, files } : null,
      projectChecks: validationResults(delivery).map(({ check, status, exitCode, reason }) => ({ check, status, exitCode, reason })),
      reportedIssues: delivery.knownIssues.length, reportedUnfinished: delivery.unfinished.length,
    }, null, 2)
  }

  /**
   * Request one coverage assessment without changing the delivery or the human decision.
   * @param request - operator-confirmed delivery fingerprint, route and response language.
   * @returns the recorded attempt; replay reads its current outcome without contacting the model.
   */
  @Remote
  requestModelReview(request: ModelReviewCommand): Promise<ModelReviewAttempt> {
    const result = this.assessDelivery(modelReviewCommand.parse(request))
    this.reviewsInFlight.add(result)
    return result.finally(() => { this.reviewsInFlight.delete(result) })
  }

  private async assessDelivery(request: ModelReviewCommand): Promise<ModelReviewAttempt> {
    this.lifetime.signal.throwIfAborted()
    const { projectId, taskId, deliveryId, commandId, provider, model, snapshot } = request
    const { delivery } = this.deliveryTarget(projectId, taskId, deliveryId)
    if (delivery.snapshot !== snapshot) throw new Error('model review delivery changed')
    const config = this.reviewConfig
    const reserved = await this.domain.transaction((tx) => {
      const task = tx.get('tasks', taskId)
      if (!task || task.task.projectId !== projectId || !task.deliveryIds.includes(deliveryId)) throw new Error('unknown delivery target')
      const attempts = task.modelReviews ??= []
      const prior = attempts.find(attempt => attempt.commandId === commandId)
      if (prior) {
        if (prior.deliveryId !== deliveryId || prior.snapshot !== snapshot || prior.provider !== provider || prior.model !== model
          || prior.language !== request.language) throw new Error('model review command identity reused')
        return { attempt: prior }
      }
      if (!config || provider !== config.provider || model !== config.model) throw new Error('model review route changed')
      const history = attempts.filter(attempt => attempt.deliveryId === deliveryId)
      const now = new Date()
      if (history.some(attempt => attempt.state === 'requested' && Date.parse(attempt.expiresAt) > now.getTime())) {
        throw new Error('model review already requested')
      }
      if (history.length >= config.maxAttempts) throw new Error('model review limit reached for this delivery')
      const attempt: ModelReviewAttempt = { ...request, sessionId: `taskboard-review-${taskId}-${commandId}`, requestedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + config.timeoutMs).toISOString(), state: 'requested', summary: null }
      attempts.push(attempt)
      tx.set('tasks', taskId, task)
      return { attempt, config }
    })
    if (!reserved.config) return reserved.attempt
    const timeout = Math.min(reserved.config.timeoutMs, Math.max(1, Date.parse(reserved.attempt.expiresAt) - Date.now()))
    const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(timeout)])
    let summary: string | null = null
    try {
      summary = await assessCoverage(this.ctx, reserved.config, request, reserved.attempt,
        this.exportReviewPackage(projectId, taskId, deliveryId), signal)
      signal.throwIfAborted()
    } catch (error) {
      if (!(error instanceof Error)) throw error
      summary = null
    }
    return this.domain.transaction((tx) => {
      const task = tx.get('tasks', taskId)
      const attempt = task?.modelReviews?.find(item => item.commandId === commandId)
      if (!task || !attempt) throw new Error('missing model review reservation')
      attempt.state = summary === null ? 'failed' : 'completed'
      attempt.summary = summary
      tx.set('tasks', taskId, task)
      return attempt
    })
  }

  /**
   * Read one file from the workspace while its fingerprint still matches the Delivery.
   * @param projectId - project that owns the task.
   * @param taskId - task that owns the Delivery.
   * @param deliveryId - immutable Delivery identity.
   * @param path - exact workspace-relative path from its file inventory.
   * @returns a read-only comparison, new file content or a display status.
   */
  @Remote
  deliveryDiff(projectId: ProjectId, taskId: TaskId, deliveryId: DeliveryId, path: string): Promise<DeliveryFileDiff> {
    const { delivery, workspace } = this.deliveryTarget(projectId, taskId, deliveryId)
    if (!delivery.code) throw new Error('delivery has no verified code snapshot')
    return this.workspaces.readDeliveryFile(workspace.directory, delivery.code, path, this.lifetime.signal)
  }

  /**
   * Record an operator’s acceptance or return for an exact Delivery and task version.
   * @param request - original delivery identity, snapshot and decision.
   * @returns the committed decision receipt, including on equivalent replay.
   */
  @Remote
  reviewDelivery(request: TaskReviewCommand): Promise<TaskReceipt> {
    const { expectedVersion, ...decision } = reviewCommand.parse(request)
    return this.executions.review(expectedVersion, decision, async () => {
      const { delivery, workspace } = this.deliveryTarget(decision.projectId, decision.taskId, decision.deliveryId)
      if (!delivery.code) throw new Error('delivery has no verified code snapshot')
      const { code } = delivery
      const paths = code.scope === 'declared-files' ? code.files.map(file => file.path) : []
      return (await this.workspaces.captureDelivery(workspace.directory, code.baseline, paths, this.lifetime.signal)).fingerprint
    }).then((receipt) => { this.dispatch?.wake(); return receipt })
  }

  private deliveryTarget(projectId: ProjectId, taskId: TaskId, deliveryId: DeliveryId) {
    const task = this.domain.table('tasks').get(taskId)
    const delivery = this.domain.table('deliveries').get(deliveryId)
    if (task?.task.projectId !== projectId || !task.deliveryIds.includes(deliveryId)
      || delivery?.projectId !== projectId || delivery.taskId !== taskId) {
      throw new Error('unknown delivery target')
    }
    const run = this.domain.table('runs').get(delivery.runId)
    if (!run?.endedAt || run.admission.projectId !== projectId || run.admission.taskId !== taskId) throw new Error('delivery Run does not match')
    return { task, delivery, workspace: run.admission.workspace }
  }

  private stopTarget(projectId: ProjectId, taskId: TaskId, runId: TaskRunId, action = 'stop'): RuntimeBinding {
    const run = this.domain.table('runs').get(runId)
    if (!run || run.generation === null || run.admission.projectId !== projectId || run.admission.taskId !== taskId) {
      throw new Error(`unknown ${action} target`)
    }
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
    return this.write('created', parsed, { requirements: parsed.requirements })
  }

  /**
   * Replace the editable fields. An active execution retains its starting revision.
   * @param request - expected task version and replacement fields.
   * @returns the committed command receipt.
   */
  @Remote
  editTask(request: TaskRequirementsCommand): Promise<TaskReceipt> {
    const parsed = requirementsCommand.parse(request)
    return this.write('edited', parsed, { requirements: parsed.requirements })
  }

  /**
   * Append an operator comment.
   * @param request - scoped command and comment.
   * @returns the committed command receipt.
   */
  @Remote
  comment(request: TaskCommentCommand): Promise<TaskReceipt> {
    const parsed = commentCommand.parse(request)
    return this.write('commented', parsed, { comment: parsed.text })
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
    return this.write('reordered', parsed, { before: parsed.beforeTaskId })
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
    const activity = record.activity.map(publicActivity)
    const runTable = this.domain.table('runs')
    const runs = record.activity.filter(e => e.action === 'run-requested').map((e) => {
      const run = e.runId && runTable.get(brandString<TaskRunId>(e.runId))
      if (!run) throw new Error('missing recorded run')
      const a = run.admission
      const prior = a.previousRun ? runTable.get(a.previousRun) : undefined
      const authorization = runAuthorization(run)
      return { ...(a.model && { route: { provider: a.session.provider, model: a.model } }),
        ...(authorization && { authorization }),
        ...(run.previousCheckpoint && { previousCheckpoint: run.previousCheckpoint }),
        runId: a.runId, previousRun: a.previousRun, state: run.state,
        control: run.control, connection: run.connection, stopFailure: run.stopFailure ?? null, launchFailure: run.launchFailure ?? null,
        revision: run.taskRevision, workspace: a.workspace.directory,
        branch: a.workspace.branch, sessionId: a.session.sessionId, priorSessionId: prior?.admission.session.sessionId ?? null,
        ...run.sessionNotIncluded && { sessionNotIncluded: run.sessionNotIncluded },
        lastEvent: run.lastEvent ?? null,
        interactions: run.interactions.map(({ kind, requestId, state }) => ({ kind, requestId, state })),
        ...(a.whenReady && { whenReady: a.whenReady }), mode: a.mode, materialReferences: a.materials.map(m => m.reference),
        inputAttemptedAt: run.inputAttemptedAt ?? null,
        receipt: run.receipt, endReason: run.endReason }
    })
    const deliveries = record.deliveryIds.map((id) => {
      const d = this.domain.table('deliveries').get(id)
      if (!d) throw new Error('missing recorded delivery')
      return summarizeDelivery(d, record.task.revision)
    })
    const reviews = record.activity.filter(e => e.action === 'accepted' || e.action === 'returned').map((e) => {
      const review = this.domain.table('reviews').get(e.commandId)
      if (!review) throw new Error('missing recorded review')
      return review
    })
    return structuredClone({ task: record.task, revisions: record.revisions, activity, runs, deliveries, reviews })
  }

  /**
   * Read task activity in commit order, starting immediately after the saved cursor.
   * @param projectId - owning project.
   * @param taskId - selected task.
   * @param cursor - checkpoint from a prior page, or null to start at the beginning.
   * @param limit - positive maximum number of entries to return.
   * @returns the activity and next checkpoint, or null for an absent or out-of-project task.
   * @throws When the checkpoint does not match the selected task's stored history.
   */
  @Remote
  activityPage(projectId: ProjectId, taskId: TaskId, cursor: TaskActivityCursor | null, limit: number): TaskActivityPage | null {
    activityPageRequest.parse({ projectId, taskId, cursor, limit })
    const record = this.domain.table('tasks').get(taskId)
    if (!record || record.task.projectId !== projectId) return null
    const start = cursor?.position ?? 0
    if (cursor && (cursor.taskId !== taskId || record.activity[start - 1]?.commandId !== cursor.commandId)) {
      throw new Error('activity cursor does not match this task history')
    }
    const activity = record.activity.slice(start, start + limit).map(publicActivity)
    const last = activity.at(-1)
    const position = start + activity.length
    return { activity, cursor: last ? { taskId, position, commandId: last.commandId } : cursor, hasMore: position < record.activity.length }
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

  /**
   * List project cards with their current or latest Run’s status and event position.
   * @param projectId - project owning the displayed cards.
   * @param includeArchived - whether archived cards are visible.
   * @returns project cards in operator-defined order.
   */
  @Remote
  listBoardCards(projectId: ProjectId, includeArchived: boolean): TaskboardCard[] {
    const tasks = this.domain.table('tasks')
    const runs = this.domain.table('runs')
    return this.listTasks(projectId, includeArchived).map((task) => {
      const record = tasks.get(task.id)
      const runId = record?.activeRun ?? record?.latestRun
      const run = runId ? runs.get(brandString<TaskRunId>(runId)) : undefined
      return { ...task, run: run ? { state: run.state, control: run.control, connection: run.connection,
        lastEvent: run.lastEvent ?? null, revision: run.taskRevision } : null }
    })
  }

  /**
   * Set the parent and prerequisites for a task before its next admission.
   * @param request - operator-selected links and expected task version.
   * @returns the receipt for the saved relationships.
   */
  @Remote
  setRelations(request: TaskCommand & { relations: TaskRelations }): Promise<TaskReceipt> {
    const parsed = relationsCommand.parse(request)
    return this.write('relations-updated', parsed, { links: parsed.relations })
  }

  /**
   * List accounts and the selected project's grants for the Host operator.
   * @param projectId - project being administered.
   * @returns account identities and current roles.
   */
  @Remote
  projectMembers(projectId: ProjectId): Promise<ProjectMember[]> { return this.accounts.members(projectId) }

  /**
   * Provision a named account with an initial project role.
   * @param request - new identity, project role and credential verifier.
   * @returns after the account and first grant commit.
   */
  @Remote
  createMember(request: CreateMember): Promise<void> { return this.accounts.create(request) }

  /**
   * Change a project grant, rotate a credential or disable an account.
   * @param request - selected change at the observed account version.
   * @returns after the new permissions commit.
   */
  @Remote
  changeMember(request: ChangeMember): Promise<void> { return this.accounts.change(request) }

  private async write(
    action: TaskActivity['action'], input: TaskCommand,
    { requirements, comment, before, links, member }: {
      member?: MemberProof
      requirements?: TaskRequirements
      comment?: string
      before?: TaskId | null
      links?: TaskRelations
    } = {},
  ): Promise<TaskReceipt> {
    const hash = fingerprint(action, member ? { memberId: member.id, input } : input)
    const time = new Date().toISOString()
    return this.domain.transaction((tx) => {
      const author = member && requireEditor(tx, member, input.projectId)
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
        if (links) {
          if (current.activeRun || current.task.archived || ['done', 'canceled'].includes(current.task.status)) {
            throw new Error('task relationships cannot change in this state')
          }
          checkRelations(current.task, links, id => tx.get('tasks', id)?.task)
        }
        if (action === 'edited' && current.activeRun) {
          const run = tx.get('runs', brandString<TaskRunId>(current.activeRun))
          if (run?.admission.whenReady && run.state === 'queued') throw new Error('cancel the automatic claim before editing')
        }
        next = applyEdit(current, action, requirements)
        if (links) next.task.relations = links
      }
      if (action === 'created' || action === 'reordered') {
        const order = project.order.filter(id => id !== input.taskId)
        const index = before == null ? order.length : order.indexOf(before)
        if (index < 0) throw new Error('destination task is outside the project order')
        order.splice(index, 0, input.taskId)
        tx.set('projects', input.projectId, { ...project, order })
      }
      const entry = { commandId: input.commandId, version: next.task.version, revision: next.task.revision,
        action, ...(author ? { actor: 'member' as const, member: author } : { actor: 'operator' as const }), time, fingerprint: hash, ...(comment === undefined ? {} : { comment }) }
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
    case 'edited': {
      if (!requirements || task.status === 'done' || task.status === 'canceled') throw new Error('reopen the task before editing')
      const updated = { ...requirements }
      if (updated.constraints === undefined && task.constraints !== undefined) updated.constraints = task.constraints
      if (updated.riskLevel === undefined && task.riskLevel !== undefined) updated.riskLevel = task.riskLevel
      if (updated.workflow === undefined && task.workflow !== undefined) updated.workflow = task.workflow
      if ((task.riskLevel ?? null) !== (updated.riskLevel ?? null)
        || JSON.stringify(task.workflow ?? null) !== JSON.stringify(updated.workflow ?? null)
        || (task.constraints ?? '') !== (updated.constraints ?? '') || task.description !== updated.description
        || JSON.stringify(task.acceptance) !== JSON.stringify(updated.acceptance) || task.title !== updated.title) {
        task.revision++
        next.revisions.push({ ...updated, revision: task.revision })
      }
      Object.assign(task, updated)
      break
    }
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
    case 'relations-updated':
    case 'reordered':
    case 'commented':
      break
    default:
      throw new Error('execution changes belong to the bound run')
  }
  task.version++
  return next
}
