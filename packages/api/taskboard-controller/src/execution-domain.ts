/** Durable execution references and human review records owned by the Taskboard Host. */
import type { SessionId } from '@deepseek-ai/dsh-session'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { CommandId, DeliveryId, ProjectId, TaskId, TaskRunId } from './types.ts'

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
const selectedMaterial = z.strictObject({ reference: text, text: z.string() })
const workspace = z.strictObject({ directory: text, branch: text.nullable(), baseline: text.nullable() })
const workspaceInspection = z.strictObject({
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
  mode: z.enum(['fresh', 'resume']), session: identity, workspace, configurationRef: text, materials: z.array(selectedMaterial),
  runtimeId: z.uuid(), feedback: z.array(text),
})
const binding = z.strictObject({ runId, projectId, taskId, runtimeId: z.uuid(), generation: positive })

/** Run identities in the order in which the Host committed their start requests. */
export const queueRecord = z.array(runId)

/** Execution and directory ownership saved with each start intent. */
export const slotRecord = z.strictObject({ generation: positive, active: binding.extend({ workspace: text }).nullable() })

/** Original interaction identity and terminal decision. */
export const interactionRecord = z.strictObject({
  requestId: text, kind: z.enum(['approval', 'question']), state: z.enum(['pending', 'answered', 'withdrawn']), sessionId: text,
})

const runFields = z.strictObject({
  admission, admissionFingerprint: digest, taskRevision: positive,
  workspacePlan: workspacePlanRecord.optional(),
  input: z.strictObject({ title: text, description: text, acceptance: z.array(text).min(1), reviewFeedback: z.string().nullable() }),
  control: z.enum(['normal', 'stop_requested', 'finalizing']), connection: z.enum(['connected', 'suspect', 'disconnected']),
  createdAt: z.iso.datetime(), receipt: text.nullable(), endedAt: z.iso.datetime().nullable(),
  inputAttemptedAt: z.iso.datetime().optional(),
  stopFailure: z.enum(['runtime-unavailable', 'deadline', 'runtime-alive', 'scope-unknown', 'scope-occupied', 'observation-failed']).optional(),
  exitEvidence: z.strictObject({ runtimeId: z.uuid(), source: text }).optional(),
  endReason: text.nullable(), endFingerprint: digest.nullable(),
  interactions: z.array(interactionRecord),
})
const claimedRun = runFields.extend({ generation: positive, state: z.enum(['preparing', 'running', 'finished', 'failed', 'interrupted']) })
const unclaimedRun = runFields.extend({ generation: z.null(), state: z.enum(['queued', 'canceled']) })

/** Persisted start snapshot and lifecycle evidence. Only claimed Runs carry a lease generation. */
export const runRecord = z.discriminatedUnion('state', [claimedRun, unclaimedRun])
/** Parsed persisted Run, including requests canceled before a lease was assigned. */
export type SavedTaskRun = z.output<typeof runRecord>
/** A Run that acquired a runtime lease generation. */
export type TaskRun = z.output<typeof claimedRun>
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
export const deliveryRecord = z.strictObject({
  id: deliveryId, runId, projectId, taskId, revision: positive, version: positive, snapshot: digest, summary: text,
  changes: z.array(text), knownIssues: z.array(text), unfinished: z.array(text),
  verification: z.array(z.strictObject({
    criterion: text, status: z.enum(['passed', 'failed', 'not-run', 'not-applicable']), evidence: text,
  })).min(1),
})
/** Structured handoff accepted by the task service after runtime termination. */
export type TaskDelivery = z.output<typeof deliveryRecord>

/** Immutable human decision bound to one delivery version and its code fingerprint. */
export const reviewRecord = z.strictObject({
  commandId, projectId, taskId, deliveryId, revision: positive, deliveryVersion: positive, snapshot: digest,
  verdict: z.enum(['accept', 'return']), feedback: z.string(), waivers: z.array(z.strictObject({ criterion: text, reason: text })),
  time: z.iso.datetime(),
})
/** Persisted review, including reasons for accepted failed or unexecuted checks. */
export type TaskReview = z.output<typeof reviewRecord>
