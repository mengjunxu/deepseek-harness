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

/** Server-resolved admission after the operator has confirmed the directory and material selection. */
export const admission = z.strictObject({
  runId, projectId, taskId, commandId, expectedVersion: positive, previousRun: runId.nullable(),
  mode: z.enum(['fresh', 'resume']), session: identity, workspace, configurationRef: text, materials: z.array(selectedMaterial),
  runtimeId: z.uuid(), feedback: z.array(text),
})
const binding = z.strictObject({ runId, projectId, taskId, runtimeId: z.uuid(), generation: positive })

/** Execution and directory ownership saved with each start intent. */
export const slotRecord = z.strictObject({ generation: positive, active: binding.extend({ workspace: text }).nullable() })

/** Original interaction identity and terminal decision. */
export const interactionRecord = z.strictObject({
  requestId: text, kind: z.enum(['approval', 'question']), state: z.enum(['pending', 'answered', 'withdrawn']), sessionId: text,
})

/** Persisted, immutable start snapshot and runtime lifecycle evidence. */
export const runRecord = z.strictObject({
  admission, generation: positive, admissionFingerprint: digest, taskRevision: positive,
  input: z.strictObject({ title: text, description: text, acceptance: z.array(text).min(1), reviewFeedback: z.string().nullable() }),
  state: z.enum(['preparing', 'running', 'finished', 'failed', 'interrupted']),
  control: z.enum(['normal', 'stop_requested', 'finalizing']), connection: z.enum(['connected', 'suspect', 'disconnected']),
  createdAt: z.iso.datetime(), receipt: text.nullable(), endedAt: z.iso.datetime().nullable(),
  stopFailure: z.enum(['runtime-unavailable', 'deadline', 'runtime-alive', 'scope-unknown', 'scope-occupied', 'observation-failed']).optional(),
  exitEvidence: z.strictObject({ runtimeId: z.uuid(), source: text }).optional(),
  endReason: text.nullable(), endFingerprint: digest.nullable(),
  interactions: z.array(interactionRecord),
})
/** Parsed persisted run. */
export type TaskRun = z.output<typeof runRecord>
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
