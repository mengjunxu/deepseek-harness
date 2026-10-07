/** DSH identifier binding for the framework-independent MGSD workflow Core. */
import type { Branded } from '@deepseek-ai/dsh-brand'
import type { JobId } from '@deepseek-ai/dsh-jobs'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { CoreWorkflow } from './core.ts'
import type { TaskDomain } from './types.ts'

/** Durable task identifier; process-local JobId values are not interchangeable. */
export type TaskId = Branded<'MgsdTaskId'>

/** DSH-owned identifier binding; the generic Core never imports these types. */
export interface DshTaskDomain extends TaskDomain { taskId: TaskId; ownerId: SessionId; jobId: JobId }

/** Local workflow with DSH's branded identifiers; all behavior is owned by CoreWorkflow. */
export class MgsdWorkflow extends CoreWorkflow<DshTaskDomain> {}

export { CoreWorkflow } from './core.ts'
export { parseNodeConfig } from './validation.ts'
export type { NodeConfig, TaskBudget, TaskDomain, TaskFact, TaskPlan, TaskRecord, TaskRequest, TaskState } from './types.ts'
