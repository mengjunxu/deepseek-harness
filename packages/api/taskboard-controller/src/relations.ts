/** Validation shared by task relationship edits and metadata restore. */
import type { TaskId, TaskRelations, TaskView } from './types.ts'

/**
 * Require project-local links and an acyclic parent hierarchy and prerequisite graph.
 * @param task - task whose links are being replaced.
 * @param links - operator-selected parent and prerequisites.
 * @param read - read a task in the same transaction or backup.
 */
export function checkRelations(task: TaskView, links: TaskRelations, read: (id: TaskId) => TaskView | undefined): void {
  if (new Set(links.blockers).size !== links.blockers.length) throw new Error('duplicate task dependency')
  for (const kind of ['parent', 'blockers'] as const) {
    const pending = kind === 'parent' ? (links.parent ? [links.parent] : []) : [...links.blockers]
    const seen = new Set<TaskId>()
    for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
      if (id === task.id) throw new Error('task relationship would create a cycle')
      if (seen.has(id)) continue
      seen.add(id)
      const target = read(id)
      if (target?.projectId !== task.projectId) throw new Error('task relationship outside project')
      const next = target.relations
      if (kind === 'blockers') {
        for (const blocker of next?.blockers ?? []) pending.push(blocker)
      } else if (next?.parent) pending.push(next.parent)
    }
  }
}
