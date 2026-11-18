/** Browser-safe Taskboard identities, operator commands and read models. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** One Taskboard project. */
export type ProjectId = Branded<'TaskboardProjectId'>
/** One business task, independent of Session identity. */
export type TaskId = Branded<'TaskboardTaskId'>
/** Stable identity of one operator action, including retries. */
export type CommandId = Branded<'TaskboardCommandId'>

/** Operator-selected project configuration. */
export interface TaskboardProject {
  id: ProjectId
  title: string
  root: string
  baselineBranch?: string | undefined
  configurationRef?: string | undefined
}

/** Facts displayed before an operator confirms execution. */
export interface WorkspaceInspection {
  directory: string
  repository: string | null
  branch: string | null
  head: string | null
  dirty: boolean | null
  fingerprint: string | null
}

/** Workbench execution identity. */
export type TaskRunId = Branded<'TaskboardRunId'>
/** Immutable delivery identity. */
export type DeliveryId = Branded<'TaskboardDeliveryId'>

/** Editable requirements at one revision. */
export interface TaskRequirements {
  title: string
  description: string
  acceptance: string[]
  priority: 'low' | 'normal' | 'high'
  labels: string[]
}

/** Task business state. Only a human Review can produce done. */
export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'blocked' | 'done' | 'canceled'

/** Read model for one task. Version counts commands and revision identifies the requirements. */
export interface TaskView extends TaskRequirements {
  id: TaskId
  projectId: ProjectId
  version: number
  revision: number
  status: TaskStatus
  archived: boolean
}

/** Project binding shared by task commands. */
export interface TaskCommand {
  commandId: CommandId
  projectId: ProjectId
  taskId: TaskId
  expectedVersion: number
}

/** Requirements written on creation or editing. */
export interface TaskRequirementsCommand extends TaskCommand {
  requirements: TaskRequirements
}

/** Move a card before another task in the same project, or to the end. */
export interface TaskOrderCommand extends TaskCommand {
  beforeTaskId: TaskId | null
}

/** A comment appended to the task's activity history. */
export interface TaskCommentCommand extends TaskCommand {
  text: string
}

/** Immutable acknowledgement of one committed operator command. */
export interface TaskReceipt {
  commandId: CommandId
  version: number
  revision: number
}

/** User-owned activity stored atomically with a task revision. */
export interface TaskActivity extends TaskReceipt {
  actor: 'operator' | 'runtime'
  time: string
  action: 'created' | 'edited' | 'commented' | 'planned' | 'canceled' | 'archived' | 'reopened' | 'reordered' | 'run-requested' | 'run-started' | 'stop-requested' | 'force-requested' | 'run-ended' | 'accepted' | 'returned'
  comment?: string | undefined
}

/** Target of an operator's graceful or explicit forced stop. */
export interface TaskStopCommand extends TaskCommand {
  runId: TaskRunId
  force: boolean
}

/** Immutable requirements and their revision number. */
export interface TaskRevision extends TaskRequirements {
  revision: number
}

/** Last failed observation during a stop attempt. */
export type StopFailure = 'runtime-unavailable' | 'deadline' | 'runtime-alive' | 'scope-unknown' | 'scope-occupied' | 'observation-failed'

/** Execution projection for the project detail page. */
export interface TaskRunSummary {
  runId: TaskRunId
  previousRun: TaskRunId | null
  state: 'preparing' | 'running' | 'finished' | 'failed' | 'interrupted'
  control: 'normal' | 'stop_requested' | 'finalizing'
  connection: 'connected' | 'suspect' | 'disconnected'
  stopFailure: StopFailure | null
  revision: number
  workspace: string
  branch: string | null
  sessionId: SessionId
  priorSessionId: SessionId | null
  mode: 'fresh' | 'resume'
  materialReferences: string[]
  receipt: string | null
  endReason: string | null
}

/** One reviewable code version. */
export interface DeliverySummary {
  id: DeliveryId
  runId: TaskRunId
  revision: number
  version: number
  snapshot: string
  summary: string
  stale: boolean
}

/** Historical decision against the delivery the operator examined. */
export interface ReviewSummary {
  commandId: CommandId
  deliveryId: DeliveryId
  revision: number
  deliveryVersion: number
  snapshot: string
  verdict: 'accept' | 'return'
  feedback: string
  waivers: { criterion: string; reason: string }[]
  time: string
}

/** Task detail with ordered activity and requirements history. */
export interface TaskDetail {
  task: TaskView
  revisions: TaskRevision[]
  activity: TaskActivity[]
  runs: TaskRunSummary[]
  deliveries: DeliverySummary[]
  reviews: ReviewSummary[]
}

/** Register an immutable project binding at version zero. */
export interface ProjectCreateCommand {
  commandId: CommandId
  expectedVersion: 0
  project: TaskboardProject
}
