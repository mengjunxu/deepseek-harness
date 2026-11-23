/** Durable execution references and human review records owned by the Taskboard Host. */
import { SessionSeq, type SessionId } from '@deepseek-ai/dsh-session'
import { z } from 'zod'
import { projectScript, riskLevel, workflow } from './member-board.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CommandId, DeliveryId, ModelReviewAttempt, ProjectId, TaskId, TaskInteractionId,
  TaskRunAuthorization, TaskRunId, ValidationResult } from './types.ts'

export type { TaskRunId, DeliveryId } from './types.ts'

const text = z.string().trim().min(1)
const runId = z.uuid().transform(brandString<TaskRunId>)
const projectId = z.uuid().transform(brandString<ProjectId>)
const taskId = z.uuid().transform(brandString<TaskId>)
const commandId = z.uuid().transform(brandString<CommandId>)
const deliveryId = z.uuid().transform(brandString<DeliveryId>)
const positive = z.number().int().positive()
const digest = z.string().regex(/^[a-f0-9]{64}$/)
const identity = z.strictObject({
  provider: text, sessionId: text.transform(brandString<SessionId>), home: text, workspace: text, compatibility: text,
})
/** Material explicitly supplied by the operator for one Run. */
export const selectedMaterial = z.strictObject({ reference: text, text: z.string() })
const workspace = z.strictObject({ directory: text, branch: text.nullable(), baseline: text.nullable() })
/** Filesystem observations shown to and confirmed by the operator. */
export const workspaceInspection = z.strictObject({
  directory: text, repository: text.nullable(), branch: text.nullable(), head: text.nullable(),
  dirty: z.boolean().nullable(), fingerprint: digest.nullable(),
})
const existingWorkspacePlan = workspace.extend({
  mode: z.enum(['original', 'continue']), source: text, checkout: z.null(), confirmation: workspaceInspection,
}).refine(plan => plan.source === plan.directory && plan.confirmation.directory === plan.directory
  && plan.confirmation.branch === plan.branch && plan.confirmation.head === plan.baseline,
{ message: 'workspace confirmation does not match the selected directory, branch and baseline' })

/** File and Git facts needed to materialize the directory after the queue is reopened. */
export const workspacePlanRecord = z.discriminatedUnion('mode', [
  workspace.extend({ mode: z.literal('isolated'), source: text, checkout: text, branch: text, baseline: text, confirmation: z.null() }),
  existingWorkspacePlan,
])

/**
 * Compare the workspace identity selected by the operator and stored in the admission.
 * @param observed - directory facts in a Host plan.
 * @param expected - workspace bound to the Run.
 * @returns whether the directory, branch and baseline all match.
 */
export function matchesWorkspace(observed: z.output<typeof workspace>, expected: z.output<typeof workspace>): boolean {
  return observed.directory === expected.directory && observed.branch === expected.branch && observed.baseline === expected.baseline
}

/** Server-resolved admission after the operator has confirmed the directory and material selection. */
export const admission = z.strictObject({
  runId, projectId, taskId, commandId, expectedVersion: positive, previousRun: runId.nullable(),
  mode: z.enum(['fresh', 'resume']), session: identity, workspace, configurationRef: text, model: text.optional(),
  materials: z.array(selectedMaterial),
  projectScript: projectScript.optional(), sdkPatchDigest: digest.optional(), whenReady: z.literal(true).optional(),
  runtimeId: z.uuid(), feedback: z.array(text),
  authorization: z.strictObject({ executor: z.literal('dsh-sdk'), routeSelection: z.enum(['operator-confirmed', 'deployment-default']) }).optional(),
})
const binding = z.strictObject({ runId, projectId, taskId, runtimeId: z.uuid(), generation: positive })

/**
 * Check the Session, checkout and recorded SDK configuration of a continuation.
 * @param previous - preceding claimed Run's admission.
 * @param next - proposed or archived continuation.
 * @returns whether both records identify the same Session and checkout.
 */
export function continuesSession(previous: z.output<typeof admission>, next: z.output<typeof admission>): boolean {
  return previous.session.sessionId === next.session.sessionId && previous.session.home === next.session.home
    && previous.session.provider === next.session.provider && previous.workspace.directory === next.session.workspace
    && previous.workspace.branch === next.workspace.branch
    && previous.configurationRef === next.configurationRef && previous.session.compatibility === next.session.compatibility
    && (previous.model === undefined || next.model === undefined || previous.model === next.model)
    && (previous.sdkPatchDigest === undefined || next.sdkPatchDigest === undefined || previous.sdkPatchDigest === next.sdkPatchDigest)
}

/** Run identities in the order in which the Host committed their start requests. */
export const queueRecord = z.array(runId)

const lease = binding.extend({ workspace: text })
/** Active directory leases and the greatest generation issued across all Runs. */
export const slotRecord = z.strictObject({ generation: positive, active: lease.nullable(), peers: z.array(lease).optional() })

/**
 * Read all leases, including single-slot records from earlier Hosts.
 * @param slots - saved execution slots.
 * @returns active owners in claim order.
 */
export function activeLeases(slots: z.output<typeof slotRecord> | undefined): z.output<typeof lease>[] {
  return slots?.active ? [slots.active, ...slots.peers ?? []] : []
}

/** Original interaction identity and terminal decision. */
export const interactionRecord = z.strictObject({
  requestId: text.transform(brandString<TaskInteractionId>),
  kind: z.enum(['approval', 'question']), state: z.enum(['pending', 'answered', 'withdrawn']), sessionId: text,
})

/** Run progress points to the original Session event without persisting its payload. */
export const runSessionEvent = z.object({
  seq: z.number().int().nonnegative().transform(SessionSeq),
  time: z.number().int().nonnegative(),
  type: text,
})

const verificationRecord = z.strictObject({
  criterion: text, status: z.enum(['passed', 'failed', 'not-run', 'not-applicable']), evidence: text,
})
const deliveryContent = z.strictObject({
  summary: text, changes: z.array(text), knownIssues: z.array(text), unfinished: z.array(text),
  verification: z.array(verificationRecord).min(1),
})

/** Evidence from the Agent, without a Host-owned snapshot or identifiers. */
export const deliverySubmission = deliveryContent.extend({
  files: z.array(z.string().min(1)), expectedVersion: positive,
})

/** A submitted delivery description that still needs process exit and a code snapshot. */
export type DeliverySubmission = z.output<typeof deliverySubmission>

/** Exit status or a bounded failure classification reported by the native SDK. */
export const scriptOutcome = z.union([
  z.strictObject({ exitCode: z.int(), reason: z.null() }),
  z.strictObject({ exitCode: z.null(), reason: z.enum(['unavailable', 'timed-out', 'interrupted', 'sandbox-denied']) }),
])

const scriptCheck = z.strictObject({
  script: projectScript, sourceSnapshot: digest.nullable(),
  observation: z.strictObject({ time: z.iso.datetime(), outcome: scriptOutcome }).nullable(),
}).refine(check => check.sourceSnapshot !== null || check.observation === null, 'script observation requires its source snapshot')

/** File inventory and fingerprint observed by the Host when sealing a Delivery. */
export const deliveryCodeSnapshot = z.strictObject({
  scope: z.enum(['git', 'declared-files']), baseline: text.nullable(), head: text.nullable(), fingerprint: digest,
  projectScriptCheck: scriptCheck.optional(),
  gitDiffCheck: z.enum(['passed', 'failed', 'not-run']).optional(),
  gitDiffObservation: z.strictObject({ observedAt: z.iso.datetime(), exitCode: z.number().int().nullable() }).optional(),
  files: z.array(z.strictObject({ path: z.string().min(1), status: z.enum(['added', 'modified', 'deleted', 'untracked', 'declared']) })),
})

/** Persisted native scope and the file identity of its Host ownership lock. */
export const runProcessScope = z.strictObject({
  identity: z.strictObject({
    kind: z.literal('macos-launchd'), bootId: z.uuid(),
    coalitionId: z.string().regex(/^[1-9][0-9]{0,19}$/),
    service: z.string().regex(/^gui\/\d+\/ai\.deepseek\.dsh\.sdk\.[a-f0-9-]{36}$/),
  }),
  lock: z.strictObject({ device: z.string().regex(/^\d+$/), inode: z.string().regex(/^[1-9]\d*$/) }),
})

/** Evidence required to reconcile one active Run after its original Host exits. */
export type RunProcessScope = z.output<typeof runProcessScope>

const runFields = z.strictObject({
  admission, admissionFingerprint: digest, taskRevision: positive,
  previousCheckpoint: z.strictObject({
    runId, sessionId: identity.shape.sessionId, revision: positive, receipt: text.nullable(), lastEvent: runSessionEvent.nullable(),
  }).optional(),
  workspacePlan: workspacePlanRecord.optional(),
  input: z.strictObject({ title: text, description: text, constraints: text.optional(), riskLevel: riskLevel.optional(),
    workflow: workflow.optional(),
    acceptance: z.array(text).min(1), reviewFeedback: z.string().nullable() }),
  control: z.enum(['normal', 'stop_requested', 'finalizing']), connection: z.enum(['connected', 'suspect', 'disconnected']),
  createdAt: z.iso.datetime(), receipt: text.nullable(), endedAt: z.iso.datetime().nullable(),
  inputAttemptedAt: z.iso.datetime().optional(),
  inputStartSeq: z.number().int().nonnegative().optional(),
  sessionNotIncluded: z.literal(true).optional(),
  processScope: runProcessScope.optional(),
  lastEvent: runSessionEvent.optional(),
  deliveryDraft: deliverySubmission.extend({ id: deliveryId, fingerprint: digest, scriptCheck: scriptCheck.optional() }).optional(),
  turnOutcome: z.enum(['finished', 'failed', 'interrupted']).optional(),
  launchFailure: text.optional(),
  stopFailure: z.enum(['runtime-unavailable', 'deadline', 'runtime-alive', 'scope-unknown', 'scope-occupied', 'observation-failed']).optional(),
  exitEvidence: z.strictObject({ runtimeId: z.uuid(), source: text }).optional(),
  endReason: text.nullable(), endFingerprint: digest.nullable(),
  interactions: z.array(interactionRecord),
})
const claimedRun = runFields.extend({ generation: positive, state: z.enum(['preparing', 'running', 'finished', 'failed', 'interrupted']) })
const unclaimedRun = runFields.extend({ generation: z.null(), state: z.enum(['queued', 'canceled']) })

/** Persisted start snapshot and lifecycle evidence. Only claimed Runs carry a lease generation. */
export const runRecord = z.discriminatedUnion('state', [claimedRun, unclaimedRun]).transform((run) => {
  // Older restores marked even a request canceled before it acquired a Session.
  if (run.generation === null) delete run.sessionNotIncluded
  return run
})
/** Parsed persisted Run, including requests canceled before a lease was assigned. */
export type SavedTaskRun = z.output<typeof runRecord>

/**
 * Project the operator's original authorization without inferring consent for older Runs.
 * @param run - committed Run record.
 * @returns the recorded execution and queue scope, when available.
 */
export function runAuthorization(run: SavedTaskRun): TaskRunAuthorization | undefined {
  const { authorization, commandId, expectedVersion, whenReady } = run.admission
  return authorization && { ...authorization, commandId, authorizedAt: run.createdAt,
    taskVersion: expectedVersion, scope: whenReady ? 'when-ready-once' : 'queue-once' }
}
/** A Run that acquired a runtime lease generation. */
export type TaskRun = z.output<typeof claimedRun>
/** Runtime outcome from the observed live SDK turn. */
export type TurnOutcome = NonNullable<TaskRun['turnOutcome']>
/** Host-only Run binding for trusted adapter callbacks. */
export type RuntimeBinding = z.output<typeof binding>
/** Trusted admission input. */
export type RunAdmission = z.input<typeof admission> & {
  runId: TaskRunId
  previousRun: TaskRunId | null
  projectId: ProjectId
  taskId: TaskId
  commandId: CommandId
}

/** Immutable Delivery with evidence against each criterion and an independently captured code fingerprint. */
export const deliveryRecord = deliveryContent.extend({
  modelReviewStatus: z.literal('not-requested').optional(),
  id: deliveryId, runId, projectId, taskId, revision: positive, version: positive, snapshot: digest, code: deliveryCodeSnapshot.optional(),
}).refine(delivery => !delivery.code || delivery.snapshot === delivery.code.fingerprint, 'delivery fingerprint differs from snapshot')
/** Structured handoff accepted by the task service after runtime termination. */
export type TaskDelivery = z.output<typeof deliveryRecord>

/** Immutable human decision bound to one delivery version and its code fingerprint. */
export const reviewRecord = z.strictObject({
  commandId, projectId, taskId, deliveryId, revision: positive, deliveryVersion: positive, snapshot: digest,
  verdict: z.enum(['accept', 'return']), assessmentId: commandId.optional(), feedback: z.string(), waivers: z.array(z.strictObject({ criterion: text, reason: text })),
  time: z.iso.datetime(),
})
/** Browser review command with the current Task version. */
export const reviewCommand = reviewRecord.omit({ time: true }).extend({ expectedVersion: positive })
/** Persisted review, including reasons for accepted failed or unexecuted checks. */
export type TaskReview = z.output<typeof reviewRecord>

/**
 * Require one verification entry per admitted criterion, in the confirmed order.
 * @param acceptance - criteria from the Run input snapshot.
 * @param verification - checks supplied with the delivery.
 */
export function verifyCriteria(acceptance: string[], verification: TaskDelivery['verification']): void {
  if (verification.length !== acceptance.length || verification.some((entry, i) => entry.criterion !== acceptance[i])) {
    throw new Error('delivery must cover every original acceptance criterion')
  }
}

/**
 * Require the configured Host check on the sealed code snapshot.
 * @param enabled - project registration setting at capture.
 * @param delivery - stored or restored delivery.
 */
export function verifyProjectCheck(enabled: boolean | undefined, delivery: TaskDelivery): void {
  const check = delivery.code?.gitDiffCheck
  const observation = delivery.code?.gitDiffObservation
  if (observation && (check !== gitCheckStatus(observation.exitCode)
    || (delivery.code?.scope === 'declared-files' && observation.exitCode !== null))) throw new Error('inconsistent project check evidence')
  if ((enabled === true) !== (check !== undefined)
    || (delivery.code?.scope === 'declared-files' && check !== undefined && check !== 'not-run')) {
    throw new Error('inconsistent project check evidence')
  }
}

/**
 * Interpret the exit of the tracked-diff check against a fixed baseline.
 * @param exitCode - observed process status, or null when no exit code was available.
 * @returns outcome of the Git check.
 */
export function gitCheckStatus(exitCode: number | null): ValidationResult['status'] {
  if (exitCode === 0) return 'passed'
  return exitCode === 2 ? 'failed' : 'not-run'
}

/**
 * Read deterministic checks from the sealed delivery, including status-only historical records.
 * @param delivery - delivery with its original code snapshot.
 * @returns the checks associated with that version.
 */
export function validationResults(delivery: Pick<TaskDelivery, 'code' | 'snapshot'>): ValidationResult[] {
  const code = delivery.code
  const results: ValidationResult[] = []
  const script = code?.projectScriptCheck
  if (script) {
    const observed = script.observation
    const reason = !observed ? 'unconfirmed' : script.sourceSnapshot !== delivery.snapshot ? 'snapshot-changed' : observed.outcome.reason
    const exitCode = reason === null ? observed?.outcome.exitCode ?? null : null
    results.push({ check: script.script === 'test' ? 'npm-test' : 'npm-build', snapshot: delivery.snapshot,
      status: reason ? 'not-run' : exitCode === 0 ? 'passed' : 'failed', observedAt: observed?.time ?? null, exitCode, reason })
  }
  if (!code?.gitDiffCheck) return results
  const observation = code.gitDiffObservation
  const exitCode = observation?.exitCode ?? null
  let reason: ValidationResult['reason'] = null
  if (code.gitDiffCheck === 'not-run' && observation) {
    reason = code.scope === 'declared-files' ? 'outside-git' : exitCode === null ? 'no-exit-code' : 'unexpected-exit'
  }
  return [{ check: 'git-diff-check', snapshot: delivery.snapshot, status: code.gitDiffCheck,
    observedAt: observation?.observedAt ?? null, exitCode, reason }, ...results]
}

/**
 * Check the assessment selected as a source for an operator's editable return feedback.
 * @param decision - decision against the sealed delivery.
 * @param attempts - saved assessments belonging to this task.
 */
export function verifyReturnAssessment(decision: TaskReview, attempts: readonly ModelReviewAttempt[] | undefined): void {
  if (!decision.assessmentId) return
  const selected = attempts?.find(attempt => attempt.commandId === decision.assessmentId)
  if (decision.verdict !== 'return' || selected?.state !== 'completed' || selected.deliveryId !== decision.deliveryId
    || selected.snapshot !== decision.snapshot) throw new Error('return requires a completed assessment of this delivery')
}

/**
 * Check the evidence required for the recorded human decision.
 * @param delivery - model evidence and any Host check from the reviewed delivery.
 * @param review - decision including feedback and per-criterion waivers.
 */
export function verifyReviewEvidence(
  delivery: Pick<TaskDelivery, 'verification' | 'code' | 'snapshot'>, review: Pick<TaskReview, 'verdict' | 'feedback' | 'waivers'>,
): void {
  if (review.verdict === 'return') {
    if (!review.feedback.trim()) throw new Error('returning a delivery requires feedback')
    return
  }
  const needed = delivery.verification.filter(check => check.status === 'failed' || check.status === 'not-run')
  if (review.waivers.length !== needed.length || needed.some((check, i) => review.waivers[i]?.criterion !== check.criterion
    || !review.waivers[i].reason.trim())) throw new Error('each failed or unexecuted criterion requires a human waiver')
  if (validationResults(delivery).some(check => check.status !== 'passed') && !review.feedback.trim()) {
    throw new Error('accepting an unsuccessful project check requires a reason')
  }
}
