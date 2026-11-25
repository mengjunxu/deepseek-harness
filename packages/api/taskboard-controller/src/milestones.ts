/** Per-Run milestone goals and advancement from the operator’s recorded decisions. */
import type { TaskActivity, TaskRequirements } from './types.ts'

/**
 * Locate the next stage after human decisions on the current requirements.
 * @param activity - task history in commit order.
 * @param revision - requirements revision being started.
 * @returns one-based stage, starting again after reopening or editing the requirements.
 */
export function nextMilestone(activity: readonly Pick<TaskActivity, 'action' | 'revision'>[], revision: number): number {
  let position = 1
  for (let index = activity.length - 1; index >= 0; index--) {
    const event = activity[index]
    if (event?.revision !== revision || event.action === 'reopened') break
    if (event.action === 'accepted') position++
  }
  return position
}

/**
 * Select the evidence required at this stage, including the full task criteria on final delivery.
 * @param requirements - requirements captured by the Run.
 * @param position - one-based milestone for a staged task, otherwise absent.
 * @returns ordered criteria used for execution and delivery verification.
 */
export function runCriteria(requirements: Pick<TaskRequirements, 'workflow' | 'acceptance'>, position?: number): string[] {
  const { workflow, acceptance } = requirements
  if (workflow?.template !== 'task.milestone.v1') {
    if (position !== undefined) throw new Error('unexpected milestone on an unstaged Run')
    return [...acceptance]
  }
  const goal = position && workflow.steps[position - 1]
  if (!goal) throw new Error('Run milestone is outside the saved plan')
  if (position !== workflow.steps.length) return [goal]
  return acceptance.includes(goal) ? [...acceptance] : [goal, ...acceptance]
}
