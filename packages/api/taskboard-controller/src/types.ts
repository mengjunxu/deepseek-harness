/** Browser-safe Taskboard identities, operator commands and read models. */
import type { SessionId, SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { Branded } from '@deepseek-ai/dsh-brand'

/** One Taskboard project. */
export type ProjectId = Branded<'TaskboardProjectId'>
/** One business task, independent of Session identity. */
export type TaskId = Branded<'TaskboardTaskId'>
/** Stable identity of one operator action, including retries. */
export type CommandId = Branded<'TaskboardCommandId'>

/** Identity of a named Taskboard member. */
export type MemberId = Branded<'TaskboardMemberId'>
/** A project-local grant; Host administration uses the existing operator login. */
export type MemberRole = 'viewer' | 'editor'

/** Account metadata safe to show in the Host's project access dialog. */
export interface ProjectMember {
  id: MemberId
  name: string
  version: number
  disabled: boolean
  role: MemberRole | null
}

/** A new account and its initial project grant. Only the verifier crosses the operator RPC. */
export interface CreateMember {
  id: MemberId
  name: string
  verifier: string
  projectId: ProjectId
  role: MemberRole
}

/** Versioned account or project change issued by the Host operator. */
export type ChangeMember = { id: MemberId; expectedVersion: number } & (
  | { action: 'grant'; projectId: ProjectId; role: MemberRole | null }
  | { action: 'disable' }
  | { action: 'rotate'; verifier: string }
)

/** Member-visible task fields and authored discussion within one project. */
export interface MemberBoard {
  name: string
  projects: { id: ProjectId; title: string; role: MemberRole }[]
  tasks: { task: TaskView; comments: { author: string | null; actor: TaskActivity['actor']; text: string }[] }[]
}

/** Package script selected by the project operator for delivery validation. */
export type ProjectScript = 'test' | 'build'

/** Operator-selected project configuration. */
export interface TaskboardProject {
  id: ProjectId
  title: string
  root: string
  baselineBranch?: string | undefined
  /** Run git diff --check against tracked changes at delivery. */
  checkTrackedDiff?: boolean | undefined
  projectScript?: ProjectScript | undefined
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

/** Identifies one outstanding SDK request within its Run. */
export type TaskInteractionId = Branded<'TaskboardInteractionId'>

/** One question and the answer choices supplied by the runtime. */
export interface TaskQuestion {
  id: string
  question: string
  detail?: string | undefined
  header?: string | undefined
  multiSelect?: boolean | undefined
  options?: { label: string; description?: string | undefined }[] | undefined
  intent?: { kind: 'plan-review'; approve: string; callId?: string | undefined } | undefined
}

/** Native SDK requests available for an operator response. */
export type TaskPendingInteraction =
  | { kind: 'question'; requestId: TaskInteractionId; questions: TaskQuestion[] }
  | { kind: 'approval'; requestId: TaskInteractionId; toolName: string; callId?: string | undefined; reason?: string | undefined }

/** One answer or dismissal for the exact native user question. */
export type TaskQuestionReply =
  | { cancelled: true }
  | { answers: { id: string; selected: string[]; custom?: string | undefined }[] }

/** Operator response scoped to its Run and request kind. */
export type TaskInteractionReply = {
  projectId: ProjectId
  taskId: TaskId
  runId: TaskRunId
  requestId: TaskInteractionId
} & (
  | { kind: 'approval'; outcome: 'allowed-once' | 'rejected' | 'cancelled' }
  | { kind: 'question'; result: TaskQuestionReply }
)

/** Durable request state retained after the native request can no longer be answered. */
export interface TaskInteractionSummary {
  requestId: TaskInteractionId
  kind: 'approval' | 'question'
  state: 'pending' | 'answered' | 'withdrawn'
}

/** Live questions and approvals owned by the active Run in this Host. */
export interface TaskboardInbox {
  projectId: ProjectId
  taskId: TaskId
  runId: TaskRunId
  requests: TaskPendingInteraction[]
}

/** SDK provider and model bound to one Taskboard Run. */
export interface TaskboardSdkRoute {
  provider: string
  model: string
}

/** Operator-visible configuration for launching a Run without exposing credentials. */
export interface TaskboardExecutionRoute {
  projectScript?: ProjectScript | undefined
  state: 'unconfigured' | 'disabled' | 'configured'
  provider: string | null
  model: string | null
}

/** Risk level specified by the person editing the requirements. */
export type TaskRiskLevel = 'low' | 'medium' | 'high'

/** Versioned execution template selected for a task revision. Standard steps are in operator-specified order. */
export type TaskWorkflow = { template: 'task.quick.v1' } | { template: 'task.standard.v1'; steps: string[] }

/** Editable requirements at one revision. */
export interface TaskRequirements {
  title: string
  description: string
  /** Operator constraints. Omit on edit to retain them, or send empty text to clear them. */
  constraints?: string | undefined
  /** Omit on edit to retain the recorded level, or send null to clear it. */
  riskLevel?: TaskRiskLevel | null | undefined
  /** Omit on edit to retain the current workflow, or send null to clear it. */
  workflow?: TaskWorkflow | null | undefined
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
  /** Project-local grouping and prerequisites set by the operator. */
  relations?: TaskRelations | undefined
  archived: boolean
}

/** Parent grouping is independent of which tasks must be accepted before dispatch. */
export interface TaskRelations {
  parent: TaskId | null
  blockers: TaskId[]
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
  runId?: TaskRunId | undefined
  member?: { id: MemberId; name: string } | undefined
  actor: 'operator' | 'runtime' | 'member'
  time: string
  action: 'created' | 'edited' | 'commented' | 'planned' | 'canceled' | 'archived' | 'reopened' | 'reordered' | 'run-requested'
    | 'run-canceled' | 'run-started' | 'run-receipt-reconciled' | 'stop-requested' | 'force-requested' | 'run-ended' | 'accepted' | 'returned'
    | 'run-progress' | 'run-blocked'
    | 'delivery-submitted' | 'relations-updated'
  comment?: string | undefined
}

/** Resume after a committed activity at its one-based position in this task's history. */
export interface TaskActivityCursor {
  taskId: TaskId
  position: number
  commandId: CommandId
}

/** Activities in commit order, with a cursor retained even when a poll returns an empty page. */
export interface TaskActivityPage {
  activity: TaskActivity[]
  cursor: TaskActivityCursor | null
  hasMore: boolean
}

/** Target of an operator's graceful or explicit forced stop. */
export interface TaskStopCommand extends TaskCommand {
  runId: TaskRunId
  force: boolean
}

/** Queue a fresh Session or explicitly reopen the preceding Run's Session in the same workspace. */
export interface TaskStartCommand extends TaskCommand {
  /** Provider and model shown for confirmation, when supplied by the caller. */
  confirmedRoute?: TaskboardSdkRoute | undefined
  confirmedScript?: ProjectScript | undefined
  /** Permit exactly one fresh isolated Run once its blockers are accepted. */
  whenReady?: true | undefined
  mode?: 'fresh' | 'resume'
  previousRun: TaskRunId | null
  confirmation: WorkspaceInspection | null
  materials: TaskInputMaterial[]
}

/** Text and reference explicitly selected by the operator at Run admission. */
export interface TaskInputMaterial {
  reference: string
  text: string
}

/** Immutable task content used for the SDK user message. */
export interface TaskRunInputSnapshot {
  title: string
  description: string
  constraints?: string
  riskLevel?: TaskRiskLevel
  workflow?: TaskWorkflow
  acceptance: string[]
  reviewFeedback: string | null
  materials: TaskInputMaterial[]
}

/** Durable acknowledgement of one operator start, including its queued Run. */
export interface TaskStartReceipt extends TaskReceipt {
  runId: TaskRunId
}

/** Versioned task specification as admitted for one Run, readable without its workspace or Session files. */
export interface RunTaskSpec {
  projectScript?: ProjectScript | undefined
  format: 'dsh-task-spec'
  version: 1
  projectId: ProjectId
  taskId: TaskId
  runId: TaskRunId
  revision: number
  workspace: { directory: string; branch: string | null; baseline: string | null }
  /** Route and consent are absent from admissions created before those fields were recorded. */
  route: TaskboardSdkRoute | null
  authorization: TaskRunAuthorization | null
  previousCheckpoint: TaskRunCheckpoint | null
  input: TaskRunInputSnapshot
}

/** Immutable requirements and their revision number. */
export interface TaskRevision extends TaskRequirements {
  revision: number
}

/** Last failed observation during a stop attempt. */
export type StopFailure = 'runtime-unavailable' | 'deadline' | 'runtime-alive' | 'scope-unknown' | 'scope-occupied' | 'observation-failed'

/** Position and metadata of a committed event in the Run's bound Session. */
export interface RunSessionEvent {
  seq: SessionSeq
  time: number
  type: string
}

/** Predecessor progress observed in the transaction that admitted a subsequent Run. */
export interface TaskRunCheckpoint {
  runId: TaskRunId
  sessionId: SessionId
  revision: number
  receipt: string | null
  lastEvent: RunSessionEvent | null
}

/** Execution projection for the project detail page. */
export interface TaskRunSummary {
  /** Operator start command and its route choice, when recorded by the admitting Host. */
  authorization?: TaskRunAuthorization
  /** Source of a retry or continuation when captured at admission. */
  previousCheckpoint?: TaskRunCheckpoint
  /** Admitted provider and model when the Run stored both. */
  route?: TaskboardSdkRoute
  runId: TaskRunId
  previousRun: TaskRunId | null
  state: 'queued' | 'preparing' | 'running' | 'finished' | 'failed' | 'canceled' | 'interrupted'
  control: 'normal' | 'stop_requested' | 'finalizing'
  connection: 'connected' | 'suspect' | 'disconnected'
  stopFailure: StopFailure | null
  /** Preparation or input operation that requires reconciliation, when present. */
  launchFailure: string | null
  revision: number
  workspace: string
  branch: string | null
  sessionId: SessionId
  /** A restored Run that acquired a lease carries its Session reference without the log files. */
  sessionNotIncluded?: true
  /** Greatest observed position in this Run's Session, without event payloads. */
  lastEvent: RunSessionEvent | null
  interactions: TaskInteractionSummary[]
  priorSessionId: SessionId | null
  mode: 'fresh' | 'resume'
  whenReady?: true | undefined
  materialReferences: string[]
  /** When the Host committed a send attempt. A null receipt then requires reconciliation. */
  inputAttemptedAt: string | null
  receipt: string | null
  endReason: string | null
}

/** Scope of the authenticated operator command that authorized one SDK Run. */
export interface TaskRunAuthorization {
  commandId: CommandId
  authorizedAt: string
  taskVersion: number
  executor: 'dsh-sdk'
  routeSelection: 'operator-confirmed' | 'deployment-default'
  scope: 'queue-once' | 'when-ready-once'
}

/** Records restored from a verified metadata backup. */
export interface TaskboardRestore {
  projects: number
  tasks: number
  missingSessions: number
  canceledQueuedRuns: number
}

/** A board card with its latest Run’s independently tracked activity. */
export interface TaskboardCard extends TaskView {
  run: Pick<TaskRunSummary, 'state' | 'control' | 'connection' | 'lastEvent' | 'revision'> | null
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

/** A workspace-relative path shown in a delivery review. */
export interface DeliveryFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'untracked' | 'declared'
}

/** Native SDK observation for a script authorized at Run admission. */
export type ProjectScriptOutcome = { exitCode: number; reason: null } | {
  exitCode: null
  reason: 'unavailable' | 'timed-out' | 'interrupted' | 'sandbox-denied'
}

/** Script attempt and the code fingerprint observed before dispatch. */
export interface ProjectScriptCheck {
  script: ProjectScript
  sourceSnapshot: string | null
  observation: { time: string; outcome: ProjectScriptOutcome } | null
}

/** File coverage and Git identities recorded when a Run produces a delivery. */
export interface DeliveryCodeSnapshot {
  scope: 'git' | 'declared-files'
  baseline: string | null
  head: string | null
  fingerprint: string
  files: DeliveryFile[]
  /** Host observation of the optional project check against the Run baseline. */
  gitDiffCheck?: 'passed' | 'failed' | 'not-run' | undefined
  /** Observation made during capture when the Host recorded detailed Git check evidence. */
  gitDiffObservation?: { observedAt: string; exitCode: number | null } | undefined
  projectScriptCheck?: ProjectScriptCheck | undefined
}

/** Deterministic Host check attached to one sealed delivery fingerprint. */
export interface ValidationResult {
  check: 'git-diff-check' | 'npm-test' | 'npm-build'
  snapshot: string
  status: 'passed' | 'failed' | 'not-run'
  observedAt: string | null
  exitCode: number | null
  reason: 'outside-git' | 'no-exit-code' | 'unexpected-exit' | 'unavailable' | 'timed-out' | 'interrupted' | 'sandbox-denied' | 'unconfirmed' | 'snapshot-changed' | null
}

/** Operator request for one tool-free assessment of the selected sealed delivery. */
export interface ModelReviewCommand {
  commandId: CommandId
  projectId: ProjectId
  taskId: TaskId
  deliveryId: DeliveryId
  snapshot: string
  provider: string
  model: string
  language: 'en' | 'zh'
}

/** One explicit model review, separate from the human delivery decision. */
export interface ModelReviewAttempt extends ModelReviewCommand {
  sessionId: string
  requestedAt: string
  expiresAt: string
  state: 'requested' | 'completed' | 'failed'
  summary: string | null
}

/** Current deployment selection and the number of reviews an operator may request per delivery. */
export interface ModelReviewRoute extends TaskboardSdkRoute {
  maxAttempts: number
}

/** Read-only comparison of one reviewed path, with explicit display limits. */
export type DeliveryFileDiff =
  | { kind: 'patch'; text: string }
  | { kind: 'file'; text: string }
  | { kind: 'binary' | 'oversized' | 'symlink' }

/** Verification evidence supplied for exactly one confirmed acceptance criterion. */
export interface DeliveryVerification {
  criterion: string
  status: 'passed' | 'failed' | 'not-run' | 'not-applicable'
  evidence: string
}

/** Full evidence and code inventory for an immutable Delivery. */
export interface TaskDeliveryDetail extends DeliverySummary {
  /** Project checks observed by the Host, in execution order. */
  validationResults: ValidationResult[]
  /** A null status means the sealing Host did not record a model review decision. */
  modelReviewStatus: ModelReviewAttempt['state'] | 'not-requested' | null
  reviewRoute: ModelReviewRoute | null
  modelReviews: ModelReviewAttempt[]
  changes: string[]
  verification: DeliveryVerification[]
  knownIssues: string[]
  unfinished: string[]
  code: DeliveryCodeSnapshot | null
}

/** Historical decision against the delivery the operator examined. */
export interface ReviewSummary {
  commandId: CommandId
  deliveryId: DeliveryId
  revision: number
  deliveryVersion: number
  snapshot: string
  verdict: 'accept' | 'return'
  /** Completed assessment selected by the operator when drafting a return. */
  assessmentId?: CommandId | undefined
  feedback: string
  waivers: { criterion: string; reason: string }[]
  time: string
}

/** An operator’s decision for the exact Delivery, code fingerprint and requirements revision they reviewed. */
export interface TaskReviewCommand extends TaskCommand, Omit<ReviewSummary, 'commandId' | 'time'> {}

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
