/** Taskboard wire admission and durable records for the Host-owned storage domain. */
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { projectId, taskId, projectScript, requirements, relations, taskView, memberRole, activityActor } from './member-board.ts'
import { deliveryRecord, queueRecord, reviewRecord, runRecord, selectedMaterial, slotRecord, workspaceInspection, type DeliveryId, type TaskRunId } from './execution-domain.ts'
import type { CommandId, MemberId, ProjectId, TaskId } from './types.ts'

const id = z.uuid()
const commandId = id.transform(brandString<CommandId>)
const text = z.string().trim().min(1)
const version = z.number().int().nonnegative()

const memberId = id.transform(brandString<MemberId>)
const memberName = text.max(120)
const verifier = z.string().regex(/^[a-f0-9]{64}$/)
const memberIdentity = z.strictObject({ id: memberId, name: memberName })
const account = memberIdentity.extend({
  verifier, version, disabled: z.boolean(), grants: z.array(z.strictObject({ projectId, role: memberRole })),
})
/** Create a named member and their first project grant. */
export const newMember = memberIdentity.extend({ verifier, projectId, role: memberRole })
const accountVersion = z.strictObject({ id: memberId, expectedVersion: version })
/** Optimistic access changes reserved for the Host operator. */
export const changeMember = z.discriminatedUnion('action', [
  accountVersion.extend({ action: z.literal('grant'), projectId, role: memberRole.nullable() }),
  accountVersion.extend({ action: z.literal('disable') }),
  accountVersion.extend({ action: z.literal('rotate'), verifier }),
])

/** Canonical project metadata, validated at command admission and reopen. */
export const projectRecord = z.strictObject({
  id: projectId, title: text, root: text, projectScript: projectScript.optional(), checkTrackedDiff: z.boolean().optional(),
  baselineBranch: text.optional(), configurationRef: text.optional(),
})
/** Project creation can only claim an unused identity. */
export const createProjectCommand = z.strictObject({ commandId, expectedVersion: z.literal(0), project: projectRecord })
const projectEntry = z.strictObject({ project: projectRecord, commandId, fingerprint: z.string(), order: z.array(taskId).default([]) })
/** Scope and optimistic concurrency fields admitted on every task write. */
export const command = z.strictObject({ commandId, projectId, taskId, expectedVersion: version })
/** Read at most the requested number of activities after a task-scoped checkpoint. */
export const activityPageRequest = z.strictObject({
  projectId, taskId, limit: z.int().positive(),
  cursor: z.strictObject({ taskId, position: z.int().positive(), commandId }).nullable(),
})
/** Stop commands identify the selected Run and require explicit force selection. */
export const stopCommand = command.extend({ runId: id.transform(brandString<TaskRunId>), force: z.boolean() })
/** Queue cancellation identifies the selected Run. */
export const queuedRunCommand = command.extend({ runId: id.transform(brandString<TaskRunId>) })
/** Run request with operator-confirmed directory and input selection. */
export const startCommand = command.extend({
  confirmedScript: projectScript.optional(),
  confirmedRoute: z.strictObject({ provider: text, model: text }).optional(),
  whenReady: z.literal(true).optional(),
  mode: z.enum(['fresh', 'resume']).default('fresh'),
  previousRun: id.transform(brandString<TaskRunId>).nullable(),
  confirmation: workspaceInspection.nullable(),
  materials: z.array(selectedMaterial),
})
/** Full replacement of editable requirements. */
export const requirementsCommand = command.extend({ requirements })
/** Project-local destination of a card move. */
export const orderCommand = command.extend({ beforeTaskId: taskId.nullable() })
/** One user comment. */
export const commentCommand = command.extend({ text })
/** Replace project-local grouping and blocking links in one operator command. */
export const relationsCommand = command.extend({ relations })
const activity = z.strictObject({
  member: memberIdentity.optional(),
  commandId, version, revision: version, actor: activityActor, time: z.iso.datetime(),
  action: z.enum([
    'created', 'edited', 'commented', 'planned', 'canceled', 'archived', 'reopened', 'reordered',
    'run-requested', 'run-canceled', 'run-started', 'run-receipt-reconciled', 'stop-requested', 'force-requested', 'run-ended', 'accepted', 'returned',
    'run-progress', 'run-blocked', 'delivery-submitted', 'relations-updated',
  ]), comment: text.optional(),
  runId: z.string().optional(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
})
/** The exact delivery, model and language confirmed for one coverage review. */
export const modelReviewCommand = z.strictObject({
  commandId, projectId, taskId, deliveryId: id.transform(brandString<DeliveryId>), snapshot: z.string().regex(/^[a-f0-9]{64}$/),
  provider: text, model: text, language: z.enum(['en', 'zh']),
})
const modelReviewAttempt = modelReviewCommand.extend({
  sessionId: text, requestedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), state: z.enum(['requested', 'completed', 'failed']),
  summary: text.nullable(),
}).refine(item => (item.state === 'completed') === (item.summary !== null) && Date.parse(item.expiresAt) > Date.parse(item.requestedAt)
  && item.sessionId === `taskboard-review-${item.taskId}-${item.commandId}`, 'invalid model review record')

const record = z.strictObject({ task: taskView, revisions: z.array(requirements.extend({ revision: version })), activity: z.array(activity),
  modelReviews: z.array(modelReviewAttempt).optional(),
  activeRun: z.uuid().nullable().default(null),
  latestRun: z.uuid().nullable().default(null),
  deliveryIds: z.array(z.uuid().transform(brandString<DeliveryId>)).default([]),
  currentDelivery: z.uuid().nullable().default(null), lastReview: commandId.nullable().default(null),
})

/** Authoritative task records and immutable project bindings. */
export const taskboardDomain = defineDomain({
  name: 'taskboard', version: 1, tables: {
    accounts: domainTable<MemberId, z.output<typeof account>>(account),
    slots: domainTable<string, z.output<typeof slotRecord>>(slotRecord),
    queue: domainTable<string, z.output<typeof queueRecord>>(queueRecord),
    runs: domainTable<TaskRunId, z.output<typeof runRecord>>(runRecord),
    deliveries: domainTable<DeliveryId, z.output<typeof deliveryRecord>>(deliveryRecord),
    reviews: domainTable<CommandId, z.output<typeof reviewRecord>>(reviewRecord),
    sessions: domainTable<string, TaskId>(taskId),
    projects: domainTable<ProjectId, z.output<typeof projectEntry>>(projectEntry),
    tasks: domainTable<TaskId, z.output<typeof record>>(record),
  },
})

/** Parsed aggregate stored in one SQLite row per task. */
export type TaskRecord = z.output<typeof record>
