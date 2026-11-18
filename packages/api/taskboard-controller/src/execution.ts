/** Transactions joining the task, its execution, the active slot and human acceptance. */
import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute } from 'node:path'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Domain, DomainTransaction } from '@deepseek-ai/dsh-storage-domain'
import type { ExitEvidence } from './stop.ts'
import { taskboardDomain, type TaskRecord } from './domain.ts'
import { admission, deliveryRecord, interactionRecord, reviewRecord, type DeliveryId, type RunAdmission, type RuntimeBinding,
  type TaskDelivery, type TaskReview, type TaskRun, type TaskRunId } from './execution-domain.ts'
import type { CommandId, TaskActivity, TaskCommand, TaskReceipt, StopFailure } from './types.ts'

type Tx = DomainTransaction<typeof taskboardDomain>
type Interaction = TaskRun['interactions'][number]
const slot = 'execution'

function ownedRun(tx: Tx, owner: RuntimeBinding): TaskRun {
  const active = tx.get('slots', slot)?.active
  const run = tx.get('runs', owner.runId)
  if (!active || !run || active.runId !== owner.runId || active.generation !== owner.generation || active.taskId !== owner.taskId
    || active.projectId !== owner.projectId || active.runtimeId !== owner.runtimeId) throw new Error('runtime no longer owns this run')
  return run
}

function taskFor(tx: Tx, owner: Pick<RuntimeBinding, 'projectId' | 'taskId'>): TaskRecord {
  const task = tx.get('tasks', owner.taskId)
  if (!task || task.task.projectId !== owner.projectId) throw new Error('task outside project')
  return task
}

function fingerprint(value: object): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function activity(task: TaskRecord, actor: TaskActivity['actor'], action: TaskActivity['action'], runId: TaskRunId,
  hash: string, id = brandString<CommandId>(randomUUID())): TaskReceipt {
  task.task.version++
  const receipt = { commandId: id, version: task.task.version, revision: task.task.revision }
  task.activity.push({ ...receipt, actor, action, runId, fingerprint: hash, time: new Date().toISOString() })
  return receipt
}

/** Host-only writes. The runtime adapter supplies ownership and the reviewer supplies the observed code fingerprint. */
export class TaskExecutions {
  /** @param domain - Taskboard's authoritative SQLite-backed domain. */
  constructor(private readonly domain: Domain<typeof taskboardDomain>) {}

  /**
   * Read a Run only while its recorded lease still belongs to the caller.
   * @param owner - current runtime identity and generation.
   * @returns the Run occupying the slot.
   */
  active(owner: RuntimeBinding): Promise<TaskRun> {
    return this.domain.transaction(tx => ownedRun(tx, owner))
  }

  /**
   * Persist the confirmed input and claim the serial slot before creating an SDK runtime.
   * @param input - operator selection with server-resolved identities, directory and execution configuration.
   * @returns the saved Run, including the lease generation.
   */
  admit(input: RunAdmission): Promise<TaskRun> {
    const request = admission.parse(input)
    const hash = fingerprint(request)
    return this.domain.transaction((tx) => {
      const task = taskFor(tx, request)
      const prior = task.activity.find(e => e.commandId === request.commandId)
      if (prior) {
        const saved = tx.get('runs', request.runId)
        if (saved && prior.action === 'run-requested' && prior.fingerprint === hash && saved.admissionFingerprint === hash) return saved
        throw new Error('command identity reused with different input')
      }
      if (task.task.version !== request.expectedVersion) throw new Error('task version conflict')
      if (task.task.archived || task.task.status !== 'todo' || !task.task.description.trim() || !task.task.acceptance.length) {
        throw new Error('run requires a todo task with a goal and acceptance criteria')
      }
      const lease = tx.get('slots', slot)
      if (lease?.active || task.activeRun) throw new Error('execution slot is occupied')
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
        if (!old || old.session.sessionId !== target.sessionId || old.session.home !== target.home
          || old.session.provider !== target.provider
          || old.workspace.directory !== target.workspace || old.workspace.branch !== request.workspace.branch
          || tx.get('sessions', sessionKey) !== request.taskId) {
          throw new Error('resume requires the original session, directory and branch')
        }
      } else if (tx.get('sessions', sessionKey) || previous?.admission.session.sessionId === target.sessionId) {
        throw new Error('fresh session is already referenced')
      }
      const generation = (lease?.generation ?? 0) + 1
      const priorReview = task.lastReview ? tx.get('reviews', task.lastReview) : undefined
      const run: TaskRun = { admission: request, generation, admissionFingerprint: hash, taskRevision: task.task.revision,
        input: { title: task.task.title, description: task.task.description, acceptance: [...task.task.acceptance],
          reviewFeedback: priorReview?.verdict === 'return' ? priorReview.feedback : null },
        state: 'preparing', control: 'normal', connection: 'disconnected', createdAt: new Date().toISOString(), receipt: null,
        endedAt: null, endReason: null, endFingerprint: null, interactions: [] }
      task.activeRun = task.latestRun = request.runId
      activity(task, 'operator', 'run-requested', request.runId, hash, request.commandId)
      tx.set('tasks', request.taskId, task)
      tx.set('runs', request.runId, run)
      tx.set('sessions', sessionKey, request.taskId)
      tx.set('slots', slot, { generation, active: { generation, runId: request.runId, runtimeId: request.runtimeId,
        projectId: request.projectId, taskId: request.taskId, workspace: target.workspace } })
      return run
    })
  }

  /**
   * Mark the input accepted using the actual SDK message id.
   * @param owner - binding held by the active runtime adapter.
   * @param messageId - original durable SDK receipt.
   * @returns resolution after the Run and task update commit.
   */
  started(owner: RuntimeBinding, messageId: string): Promise<void> {
    return this.domain.transaction((tx) => {
      const run = ownedRun(tx, owner)
      if (run.receipt === messageId && run.state === 'running') return
      if (!messageId || run.state !== 'preparing' || run.receipt) throw new Error('unexpected SDK receipt')
      run.receipt = messageId
      run.state = 'running'
      if (run.control === 'normal') run.connection = 'connected'
      const task = taskFor(tx, owner)
      task.task.status = 'in_progress'
      activity(task, 'runtime', 'run-started', owner.runId, fingerprint({ messageId }))
      tx.set('runs', owner.runId, run)
      tx.set('tasks', owner.taskId, task)
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
      const run = ownedRun(tx, owner)
      if (run.admission.session.sessionId !== interaction.sessionId) throw new Error('interaction belongs to another session')
      const prior = run.interactions.find(e => e.kind === interaction.kind && e.requestId === interaction.requestId)
      if (prior?.state === interaction.state) return
      if (prior && prior.state !== 'pending') throw new Error('interaction has already settled')
      if (!prior && interaction.state !== 'pending') throw new Error('unknown interaction')
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
      if (force ? run.control !== 'stop_requested' || run.connection !== 'suspect' : run.control !== 'normal') {
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
      if (run.control !== 'stop_requested') throw new Error('no pending stop')
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
      if (saved?.endFingerprint === hash && saved.generation === owner.generation && saved.admission.taskId === owner.taskId
        && saved.admission.projectId === owner.projectId && saved.admission.runtimeId === owner.runtimeId) return
      const run = ownedRun(tx, owner)
      if (run.control === 'stop_requested' && state !== 'interrupted') throw new Error('pending stop requires an interrupted outcome')
      if (!reason.trim() || (state === 'finished' && !run.receipt)) throw new Error('missing confirmed run outcome')
      const task = taskFor(tx, owner)
      if (output) {
        const d = deliveryRecord.parse(output)
        if (state !== 'finished' || d.runId !== owner.runId || d.taskId !== owner.taskId || d.projectId !== owner.projectId
          || d.revision !== run.taskRevision || tx.get('deliveries', d.id)) {
          throw new Error('delivery does not match the completed run')
        }
        if (d.verification.length !== run.input.acceptance.length ||
          d.verification.some((c, i) => c.criterion !== run.input.acceptance[i])) {
          throw new Error('delivery must cover every original acceptance criterion')
        }
        const prior = task.currentDelivery ? tx.get('deliveries', brandString<DeliveryId>(task.currentDelivery)) : undefined
        if (d.version !== (prior?.version ?? 0) + 1) throw new Error('unexpected delivery version')
        task.currentDelivery = d.id
        task.deliveryIds.push(d.id)
        tx.set('deliveries', d.id, d)
      }
      run.state = state
      run.control = 'normal'
      run.connection = 'disconnected'
      delete run.stopFailure
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
      tx.set('slots', slot, { generation: owner.generation, active: null })
    })
  }

  /**
   * Persist an operator's decision on one sealed delivery after the Host has rechecked the working tree.
   * @param expectedVersion - task version the operator reviewed.
   * @param decision - decision tied to the original criteria, version and fingerprint.
   * @param observedSnapshot - independently recomputed by the Host reviewer.
   * @returns the original receipt for equivalent retries.
   */
  review(expectedVersion: number, decision: Omit<TaskReview, 'time'>, observedSnapshot: string): Promise<TaskReceipt> {
    const time = new Date().toISOString()
    const review = reviewRecord.parse({ ...decision, time })
    const hash = fingerprint({ ...review, time: undefined, expectedVersion })
    return this.domain.transaction((tx) => {
      const task = taskFor(tx, review)
      const previous = task.activity.find(e => e.commandId === review.commandId)
      if (previous) {
        if (previous.fingerprint !== hash) throw new Error('command identity reused with different input')
        return { commandId: previous.commandId, version: previous.version, revision: previous.revision }
      }
      const d = tx.get('deliveries', review.deliveryId)
      if (task.task.version !== expectedVersion || !d || task.activeRun || task.task.status !== 'in_review'
        || task.currentDelivery !== d.id || d.taskId !== task.task.id || d.version !== review.deliveryVersion
        || d.revision !== review.revision || d.snapshot !== review.snapshot) throw new Error('delivery is no longer reviewable')
      if (review.verdict === 'accept') {
        if (d.snapshot !== observedSnapshot || d.revision !== task.task.revision) throw new Error('requirements or code have changed')
        const needed = d.verification.filter(check => check.status === 'failed' || check.status === 'not-run').map(check => check.criterion)
        if (review.waivers.length !== needed.length ||
          needed.some((criterion, i) => review.waivers[i]?.criterion !== criterion || !review.waivers[i].reason.trim())) {
          throw new Error('each failed or unexecuted criterion requires a human waiver')
        }
        task.task.status = 'done'
      } else {
        if (!review.feedback.trim()) throw new Error('returning a delivery requires feedback')
        task.task.status = 'todo'
      }
      if (tx.get('reviews', review.commandId)) throw new Error('review identity belongs to another task')
      task.lastReview = review.commandId
      const receipt = activity(task, 'operator', review.verdict === 'accept' ? 'accepted' : 'returned', d.runId, hash, review.commandId)
      tx.set('reviews', review.commandId, review)
      tx.set('tasks', review.taskId, task)
      return receipt
    })
  }
}
