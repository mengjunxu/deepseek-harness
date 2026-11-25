/** Browser-safe validation for the scoped member board and its stored task records. */
import { brandString } from '@deepseek-ai/dsh-brand'
import { z } from 'zod'
import type { ProjectId, TaskId } from './types.ts'

const text = z.string().trim().min(1)
const version = z.number().int().nonnegative()
/** Project identity admitted on the wire and in storage. */
export const projectId = z.uuid().transform(brandString<ProjectId>)
/** Project-owned task identity. */
export const taskId = z.uuid().transform(brandString<TaskId>)
/** Project-scoped roles available to named members. */
export const memberRole = z.enum(['viewer', 'editor'])
/** Origin of an activity entry. */
export const activityActor = z.enum(['operator', 'runtime', 'member'])
/** Supported operator assessments of task risk. */
export const riskLevel = z.enum(['low', 'medium', 'high'])

/** Package-manager script approved at registration and confirmed for each Run. */
export const projectScript = z.union([
  z.enum(['test', 'build']),
  z.strictObject({ manager: z.enum(['npm', 'pnpm']), name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/u) }),
])

/** Operator-selected execution template with optional planning for standard tasks. */
export const workflow = z.discriminatedUnion('template', [
  z.strictObject({ template: z.literal('task.quick.v1') }),
  z.strictObject({ template: z.literal('task.standard.v1'), steps: z.array(text) }),
  z.strictObject({ template: z.literal('task.milestone.v1'), steps: z.array(text).min(1) }),
])
/** Editable fields shared by the operator and project editors. */
export const requirements = z.strictObject({
  title: text, description: z.string(), constraints: z.string().trim().optional(), riskLevel: riskLevel.nullable().optional(),
  workflow: workflow.nullable().optional(),
  acceptance: z.array(text), priority: z.enum(['low', 'normal', 'high']), labels: z.array(text),
})
/** Project-local parent and prerequisite references. */
export const relations = z.strictObject({ parent: taskId.nullable(), blockers: z.array(taskId) })
/** Task data shared by the operator board and the scoped member response. */
export const taskView = requirements.extend({
  relations: relations.optional(),
  id: taskId, projectId, version, revision: version, archived: z.boolean(),
  status: z.enum(['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'canceled']),
})
/** Authenticated member's project list and selected project's cards. */
export const memberBoard = z.strictObject({
  name: text, projects: z.array(z.strictObject({ id: projectId, title: text, role: memberRole })),
  tasks: z.array(z.strictObject({ task: taskView, comments: z.array(z.strictObject({
    author: text.nullable(), actor: activityActor, text,
  })) })),
})
