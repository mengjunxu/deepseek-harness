/** Portable Taskboard history and atomic restoration into an empty database. */
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Domain, DomainTransaction } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { checkRelations } from './relations.ts'
import { startCommand, taskboardDomain, type TaskRecord } from './domain.ts'
import { operatorStartFingerprint, reviewFingerprint } from './execution.ts'
import { continuesSession, matchesWorkspace, runAuthorization, validationResults, verifyCriteria,
  verifyReviewEvidence, verifyReturnAssessment, verifyProjectCheck,
  type SavedTaskRun, type TaskDelivery, type TaskReview } from './execution-domain.ts'
import type { CommandId, DeliveryId, ProjectId, TaskboardRestore, TaskId, TaskRunId } from './types.ts'

type Tx = DomainTransaction<typeof taskboardDomain>
const tables = taskboardDomain.tables
const slot = 'execution'
const format = 'dsh-taskboard-backup'
const archiveVersion = 1

const envelope = z.strictObject({
  format: z.literal(format), version: z.literal(archiveVersion), createdAt: z.iso.datetime(),
  domainVersion: z.literal(taskboardDomain.version), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  payload: z.unknown(),
})
const payloadSchema = z.strictObject({
  includesSessions: z.literal(false),
  projects: z.array(tables.projects.valueSchema),
  tasks: z.array(tables.tasks.valueSchema),
  runs: z.array(tables.runs.valueSchema),
  deliveries: z.array(tables.deliveries.valueSchema),
  reviews: z.array(tables.reviews.valueSchema),
  queue: tables.queue.valueSchema,
  generation: z.number().int().positive().nullable(),
})
type Payload = z.output<typeof payloadSchema>

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function values<V>(entries: ReadonlyArray<readonly [string, V]>): V[] {
  return [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([, value]) => value)
}

function snapshot(tx: Tx): Payload {
  return {
    includesSessions: false,
    projects: values(tx.entries('projects')),
    tasks: values(tx.entries('tasks')),
    runs: values(tx.entries('runs')),
    deliveries: values(tx.entries('deliveries')),
    reviews: values(tx.entries('reviews')),
    queue: tx.get('queue', slot) ?? [],
    generation: tx.get('slots', slot)?.generation ?? null,
  }
}

function unique<K extends string, V>(records: V[], key: (value: V) => K): Map<K, V> {
  const entries = new Map(records.map(value => [key(value), value]))
  if (entries.size !== records.length) throw new Error('backup contains duplicate record IDs')
  return entries
}

function sessionKey(run: SavedTaskRun): string {
  const { home, sessionId } = run.admission.session
  return JSON.stringify([home, sessionId])
}

function validateRunHistory(task: TaskRecord, runs: ReadonlyMap<TaskRunId, SavedTaskRun>, admitted: Set<TaskRunId>): void {
  let latest: SavedTaskRun | undefined
  for (const event of task.activity) {
    if (event.action !== 'run-requested') continue
    const run = event.runId && runs.get(brandString<TaskRunId>(event.runId))
    if (!run || admitted.has(run.admission.runId) || run.admission.taskId !== task.task.id || event.revision !== run.taskRevision
      || event.commandId !== run.admission.commandId || event.fingerprint !== run.admissionFingerprint) {
      throw new Error('backup has invalid Run metadata')
    }
    const current = run.admission
    if (current.previousRun !== (latest?.admission.runId ?? null)) throw new Error('backup has invalid Run history')
    const point = run.previousCheckpoint
    if (point && (!latest || point.runId !== latest.admission.runId || point.sessionId !== latest.admission.session.sessionId
      || point.revision !== latest.taskRevision || (point.receipt !== null && point.receipt !== latest.receipt)
      || !isDeepStrictEqual(point.lastEvent, latest.lastEvent ?? null))) throw new Error('backup has an inconsistent Run checkpoint')
    if (current.mode === 'resume' ? !latest || !continuesSession(latest.admission, current)
      : latest?.admission.session.sessionId === current.session.sessionId) throw new Error('backup has invalid Run history')
    if (current.authorization) {
      const { commandId, projectId, taskId, expectedVersion, whenReady, mode, previousRun, materials } = current
      if (!current.model || !run.workspacePlan) throw new Error('backup has incomplete Run authorization')
      const request = startCommand.parse({ commandId, projectId, taskId, expectedVersion, mode, previousRun, materials, whenReady,
        confirmation: run.workspacePlan.confirmation, ...(current.projectScript && { confirmedScript: current.projectScript }), ...current.authorization.routeSelection === 'operator-confirmed'
          && { confirmedRoute: { provider: current.session.provider, model: current.model } } })
      if (operatorStartFingerprint(request) !== run.admissionFingerprint) throw new Error('backup has inconsistent Run authorization')
    }
    admitted.add(current.runId)
    if (run.generation !== null) latest = run
  }
  if (task.latestRun !== (latest?.admission.runId ?? null)) throw new Error('backup has invalid Run history')
}

function validateReviewHistory(tasks: readonly TaskRecord[], runs: ReadonlyMap<TaskRunId, SavedTaskRun>,
  reviews: ReadonlyMap<CommandId, TaskReview>, deliveries: ReadonlyMap<DeliveryId, TaskDelivery>): void {
  const recorded = new Set<CommandId>()
  for (const task of tasks) {
    let previous: TaskReview | undefined
    for (const event of task.activity) {
      if (event.action === 'run-requested' && event.runId) {
        const run = runs.get(brandString<TaskRunId>(event.runId))
        if (run?.input.reviewFeedback !== (previous?.verdict === 'return' ? previous.feedback : null)) {
          throw new Error('backup has inconsistent review history for Run feedback')
        }
      }
      if (event.action !== 'accepted' && event.action !== 'returned') continue
      const decision = reviews.get(event.commandId)
      if (!decision || recorded.has(event.commandId) || decision.taskId !== task.task.id || event.actor !== 'operator'
        || deliveries.get(decision.deliveryId)?.runId !== event.runId
        || event.action !== (decision.verdict === 'accept' ? 'accepted' : 'returned')
        || event.fingerprint !== reviewFingerprint(decision, event.version - 1)) throw new Error('backup has inconsistent review history')
      recorded.add(event.commandId)
      previous = decision
    }
    if (task.lastReview !== (previous?.commandId ?? null)) throw new Error('backup has inconsistent review history')
  }
  if (recorded.size !== reviews.size) throw new Error('backup has an unbound review')
}

function validateRelations(snapshot: Payload): void {
  const projects = unique(snapshot.projects, item => item.project.id)
  const tasks = unique(snapshot.tasks, item => item.task.id)
  const runs = unique(snapshot.runs, item => item.admission.runId)
  const deliveries = unique(snapshot.deliveries, item => item.id)
  const reviews = unique(snapshot.reviews, item => item.commandId)
  const queue = new Set(snapshot.queue)
  if (queue.size !== snapshot.queue.length) throw new Error('backup contains a duplicate queued Run')
  for (const [id, entry] of projects) {
    if (!isAbsolute(entry.project.root) || new Set(entry.order).size !== entry.order.length
      || entry.order.some(taskId => tasks.get(taskId)?.task.projectId !== id)) throw new Error('backup has invalid project metadata')
  }
  for (const { task, revisions } of tasks.values()) {
    const latest = revisions.at(-1)
    if (!latest || revisions.some((item, index) => item.revision !== index + 1)
      || latest.revision !== task.revision || latest.title !== task.title || latest.description !== task.description
      || (latest.riskLevel ?? null) !== (task.riskLevel ?? null)
      || !isDeepStrictEqual(latest.workflow ?? null, task.workflow ?? null)
      || (latest.constraints ?? '') !== (task.constraints ?? '')
      || !isDeepStrictEqual(latest.acceptance, task.acceptance)) throw new Error('backup has invalid requirements history')
  }
  const sessions = new Map<string, TaskId>()
  for (const [id, run] of runs) {
    const a = run.admission
    const task = tasks.get(a.taskId)
    const revision = task?.revisions[run.taskRevision - 1]
    if (!revision || run.input.title !== revision.title || run.input.description !== revision.description.trim()
      || (run.input.riskLevel ?? null) !== (revision.riskLevel ?? null)
      || !isDeepStrictEqual(run.input.workflow ?? null, revision.workflow ?? null)
      || (run.input.constraints ?? '') !== (revision.constraints ?? '') || !isDeepStrictEqual(run.input.acceptance, revision.acceptance)) {
      throw new Error('backup Run input does not match its requirements revision')
    }
    const prior = a.previousRun ? runs.get(a.previousRun) : undefined
    if (a.projectScript !== projects.get(a.projectId)?.project.projectScript || (a.projectScript && !a.authorization)) {
      throw new Error('backup has inconsistent project script authorization')
    }
    if (run.workspacePlan && !matchesWorkspace(run.workspacePlan, a.workspace)) throw new Error('backup Run workspace differs from its plan')
    const queued = run.state === 'queued'
    if (task.task.projectId !== a.projectId || a.previousRun === id || (a.previousRun && prior?.admission.taskId !== a.taskId)
      || run.processScope || run.control !== 'normal' || run.connection !== 'disconnected'
      || queued !== queue.has(id) || queued !== (task.activeRun === id) || queued !== (run.endedAt === null)
      || run.state === 'running' || run.state === 'preparing' || run.interactions.some(item => item.state === 'pending')
      || (run.generation !== null && run.generation > (snapshot.generation ?? 0))
      || !isAbsolute(a.session.home) || !isAbsolute(a.workspace.directory) || a.session.workspace !== a.workspace.directory) {
      throw new Error('backup has invalid Run metadata')
    }
    const key = sessionKey(run)
    const owner = sessions.get(key)
    if (owner && owner !== a.taskId) throw new Error('backup references a Session from multiple tasks')
    sessions.set(key, a.taskId)
  }
  if (snapshot.queue.some(id => !runs.has(id))) throw new Error('backup queue references a missing Run')
  const admitted = new Set<TaskRunId>()
  for (const [id, entry] of tasks) {
    const modelCommands = new Set<CommandId>()
    for (const attempt of entry.modelReviews ?? []) {
      const delivery = deliveries.get(attempt.deliveryId)
      if (modelCommands.has(attempt.commandId) || attempt.taskId !== id || attempt.projectId !== entry.task.projectId
        || delivery?.taskId !== id || delivery.snapshot !== attempt.snapshot) throw new Error('backup has an unbound model review')
      modelCommands.add(attempt.commandId)
    }
    validateRunHistory(entry, runs, admitted)
    if (entry.task.relations) checkRelations(entry.task, entry.task.relations, key => tasks.get(key)?.task)
    const latest = entry.latestRun ? runs.get(brandString<TaskRunId>(entry.latestRun)) : undefined
    const active = entry.activeRun ? runs.get(brandString<TaskRunId>(entry.activeRun)) : undefined
    const lastReview = entry.lastReview ? reviews.get(entry.lastReview) : undefined
    if (entry.task.status === 'done' && (lastReview?.verdict !== 'accept' || lastReview.deliveryId !== entry.currentDelivery
      || lastReview.revision !== entry.task.revision)) throw new Error('backup completed task has no matching acceptance')
    if (!projects.has(entry.task.projectId) || (entry.latestRun && latest?.admission.taskId !== id)
      || (entry.activeRun && active?.admission.taskId !== id) || (entry.lastReview && lastReview?.taskId !== id)
      || new Set(entry.deliveryIds).size !== entry.deliveryIds.length
      || (entry.currentDelivery && entry.currentDelivery !== entry.deliveryIds.at(-1))
      || entry.deliveryIds.some(deliveryId => deliveries.get(deliveryId)?.taskId !== id)
      || entry.activity.some(item => item.runId && runs.get(brandString<TaskRunId>(item.runId))?.admission.taskId !== id)) {
      throw new Error('backup has invalid task metadata')
    }
  }
  if (admitted.size !== runs.size) throw new Error('backup has invalid Run metadata')
  for (const [id, item] of deliveries) {
    const task = tasks.get(item.taskId)
    const run = runs.get(item.runId)
    if (!task?.deliveryIds.includes(id) || task.task.projectId !== item.projectId || run?.admission.taskId !== item.taskId
      || run.state !== 'finished' || run.taskRevision !== item.revision) throw new Error('backup has an unbound delivery')
    verifyProjectCheck(projects.get(item.projectId)?.project.checkTrackedDiff, item)
    if (run.admission.projectScript !== item.code?.projectScriptCheck?.script) throw new Error('backup has inconsistent project script evidence')
    verifyCriteria(run.input.acceptance, item.verification)
  }
  for (const item of reviews.values()) {
    const task = tasks.get(item.taskId)
    const delivery = deliveries.get(item.deliveryId)
    if (!task || task.task.projectId !== item.projectId || delivery?.taskId !== item.taskId || delivery.revision !== item.revision
      || delivery.version !== item.deliveryVersion || delivery.snapshot !== item.snapshot) {
      throw new Error('backup has an unbound review')
    }
    verifyReturnAssessment(item, task.modelReviews)
    verifyReviewEvidence(delivery, item)
  }
  validateReviewHistory(snapshot.tasks, runs, reviews, deliveries)
}

function readArchive(archive: string): Payload {
  const parsed: unknown = JSON.parse(archive)
  const { sha256, ...document } = envelope.parse(parsed)
  if (digest([document.format, document.version, document.createdAt, document.domainVersion, document.payload]) !== sha256) {
    throw new Error('backup checksum does not match its content')
  }
  const payload = payloadSchema.parse(document.payload)
  validateRelations(payload)
  return payload
}

/** Taskboard export and restore for authenticated operators. */
export class TaskboardBackup {
  /** @param domain - authoritative Taskboard storage. */
  constructor(private readonly domain: Domain<typeof taskboardDomain>) {}

  /**
   * Create a versioned archive of a quiescent Taskboard for an empty destination.
   * @returns a checksummed JSON file with Taskboard history and Session metadata.
   */
  async exportBackup(): Promise<string> {
    const data = await this.domain.transaction((tx) => {
      if (tx.get('slots', slot)?.active) throw new Error('wait for the active Run to exit before backing up Taskboard')
      return snapshot(tx)
    })
    const payload: Payload = { ...data, runs: data.runs.map(({ processScope: _scope, ...run }) => run) }
    const createdAt = new Date().toISOString()
    const domainVersion = taskboardDomain.version
    const sha256 = digest([format, archiveVersion, createdAt, domainVersion, payload])
    return JSON.stringify({ format, version: archiveVersion, createdAt, domainVersion, sha256, payload }, null, 2)
  }

  /**
   * Export one project's requirements, Run summaries, explicitly selected materials and human reviews.
   * @param projectId - project selected by the operator.
   * @returns a JSON handoff document for reading outside Taskboard.
   */
  async exportHandoff(projectId: ProjectId): Promise<string> {
    const data = await this.domain.transaction(snapshot)
    const project = data.projects.find(item => item.project.id === projectId)
    if (!project) throw new Error('unknown project')
    const tasks = data.tasks.filter(item => item.task.projectId === projectId)
      .map(({ task, revisions, activity, modelReviews }) => ({ task, revisions, activity, ...(modelReviews && { modelReviews }) }))
    const runs = data.runs.filter(run => run.admission.projectId === projectId).map(run => ({
      authorization: runAuthorization(run),
      runId: run.admission.runId, taskId: run.admission.taskId, previousRun: run.admission.previousRun,
      sessionId: run.admission.session.sessionId, ...(run.previousCheckpoint && { previousCheckpoint: run.previousCheckpoint }),
      ...(run.admission.model && { route: { provider: run.admission.session.provider, model: run.admission.model } }),
      revision: run.taskRevision, state: run.state, workspace: run.admission.workspace, receipt: run.receipt,
      createdAt: run.createdAt, endedAt: run.endedAt, endReason: run.endReason,
      lastEvent: run.lastEvent, selectedMaterials: run.admission.materials,
    }))
    const deliveries = data.deliveries.filter(item => item.projectId === projectId)
      .map(delivery => ({ ...delivery, validationResults: validationResults(delivery) }))
    const reviews = data.reviews.filter(item => item.projectId === projectId)
    return JSON.stringify({ format: 'dsh-taskboard-handoff', version: 1, project: project.project, tasks, runs, deliveries, reviews }, null, 2)
  }

  /**
   * Validate and restore history atomically. Waiting Runs become canceled historical entries.
   * @param archive - full versioned backup document selected by the operator.
   * @returns counts for the restored records and explicitly omitted Session data.
   */
  async restore(archive: string): Promise<TaskboardRestore> {
    const data = readArchive(archive)
    const now = new Date().toISOString()
    const tasks = unique(data.tasks, item => item.task.id)
    return this.domain.transaction((tx) => {
      if (Object.keys(tables).some(name => tx.entries(name as keyof typeof tables).length)) {
        throw new Error('restore requires an empty Taskboard database')
      }
      const sessions = new Set<string>()
      for (const run of data.runs) {
        const { runId, taskId } = run.admission
        if (run.state === 'queued') {
          tx.set('runs', runId, { ...run, state: 'canceled', endedAt: now, endReason: 'queue entry canceled during restore' })
          continue
        }
        if (run.state === 'canceled') {
          tx.set('runs', runId, run)
          continue
        }
        tx.set('runs', runId, { ...run, sessionNotIncluded: true })
        const key = sessionKey(run)
        sessions.add(key)
        tx.set('sessions', key, taskId)
      }
      for (const [id, task] of tasks) {
        if (task.activeRun) {
          const runId = task.activeRun
          task.activeRun = null
          task.task.version++
          task.activity.push({
            commandId: brandString<CommandId>(randomUUID()), version: task.task.version, revision: task.task.revision,
            actor: 'operator', action: 'run-canceled', runId, time: now, fingerprint: digest(['restored without queue', runId]),
          })
        }
        tx.set('tasks', id, task)
      }
      for (const item of data.projects) tx.set('projects', item.project.id, item)
      for (const item of data.deliveries) tx.set('deliveries', item.id, item)
      for (const item of data.reviews) tx.set('reviews', item.commandId, item)
      if (data.generation !== null) tx.set('slots', slot, { generation: data.generation, active: null })
      return { projects: data.projects.length, tasks: tasks.size, missingSessions: sessions.size, canceledQueuedRuns: data.queue.length }
    })
  }
}
