/** Taskboard wire admission and durable records for the Host-owned storage domain. */
import { brandString } from '@deepseek-ai/dsh-brand'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { deliveryRecord, reviewRecord, runRecord, slotRecord, type DeliveryId, type TaskRunId } from './execution-domain.ts'
import type { CommandId, ProjectId, TaskId } from './types.ts'

const id = z.uuid()
const projectId = id.transform(brandString<ProjectId>)
const taskId = id.transform(brandString<TaskId>)
const commandId = id.transform(brandString<CommandId>)
const text = z.string().trim().min(1)
const version = z.number().int().nonnegative()

/** Canonical project metadata, validated at command admission and reopen. */
export const projectRecord = z.strictObject({
  id: projectId, title: text, root: text, baselineBranch: text.optional(), configurationRef: text.optional(),
})
/** Project creation can only claim an unused identity. */
export const createProjectCommand = z.strictObject({ commandId, expectedVersion: z.literal(0), project: projectRecord })
const projectEntry = z.strictObject({ project: projectRecord, commandId, fingerprint: z.string(), order: z.array(taskId).default([]) })
const requirements = z.strictObject({
  title: text, description: z.string(), acceptance: z.array(text), priority: z.enum(['low', 'normal', 'high']), labels: z.array(text),
})
/** Scope and optimistic concurrency fields admitted on every task write. */
export const command = z.strictObject({ commandId, projectId, taskId, expectedVersion: version })
/** Stop commands identify the selected Run and require explicit force selection. */
export const stopCommand = command.extend({ runId: id.transform(brandString<TaskRunId>), force: z.boolean() })
/** Full replacement of editable requirements. */
export const requirementsCommand = command.extend({ requirements })
/** Project-local destination of a card move. */
export const orderCommand = command.extend({ beforeTaskId: taskId.nullable() })
/** One user comment. */
export const commentCommand = command.extend({ text })
const view = requirements.extend({
  id: taskId, projectId, version, revision: version, archived: z.boolean(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'canceled']),
})
const activity = z.strictObject({
  commandId, version, revision: version, actor: z.enum(['operator', 'runtime']), time: z.iso.datetime(),
  action: z.enum([
    'created', 'edited', 'commented', 'planned', 'canceled', 'archived', 'reopened', 'reordered',
    'run-requested', 'run-started', 'stop-requested', 'force-requested', 'run-ended', 'accepted', 'returned',
  ]), comment: text.optional(),
  runId: z.string().optional(), fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
})
const record = z.strictObject({ task: view, revisions: z.array(requirements.extend({ revision: version })), activity: z.array(activity),
  activeRun: z.uuid().nullable().default(null),
  latestRun: z.uuid().nullable().default(null),
  deliveryIds: z.array(z.uuid().transform(brandString<DeliveryId>)).default([]),
  currentDelivery: z.uuid().nullable().default(null), lastReview: commandId.nullable().default(null),
})

/** Authoritative task records and immutable project bindings. */
export const taskboardDomain = defineDomain({
  name: 'taskboard', version: 1, tables: {
    slots: domainTable<string, z.output<typeof slotRecord>>(slotRecord),
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
