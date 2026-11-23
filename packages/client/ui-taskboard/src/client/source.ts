/** Remote reads and operator commands for the selected Taskboard project. */
import type {
  ProjectId, TaskboardCard, TaskboardExecutionRoute, TaskboardInbox, TaskboardProject, TaskDetail, TaskId,
} from '@deepseek-ai/dsh-api-taskboard-controller/types'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'

interface Selection {
  projectId: ProjectId | null
  taskId: TaskId | null
  includeArchived: boolean
}

/** All displayed data comes from the same selected project and task. */
export interface TaskboardSnapshot extends Selection {
  projects: TaskboardProject[]
  tasks: TaskboardCard[]
  detail: TaskDetail | null
  route: TaskboardExecutionRoute | null
  inbox: TaskboardInbox[]
  status: 'loading' | 'ready' | 'error'
}

interface Reads {
  projects(): Promise<TaskboardProject[]>
  tasks(projectId: ProjectId, includeArchived: boolean): Promise<TaskboardCard[]>
  detail(projectId: ProjectId, taskId: TaskId): Promise<TaskDetail | null>
  route(projectId: ProjectId): Promise<TaskboardExecutionRoute>
  inbox(): Promise<TaskboardInbox[]>
  changes(signal: AbortSignal): AsyncIterable<'changed'>
}

/** A settled operator action that can outlive the page. */
export interface TaskboardNotice {
  id: number
  ok: boolean
  message?: string
}

/** Select and refresh the current project or task without mounting another model. */
export interface TaskboardSource {
  hooks: { taskboard: HostObservable<TaskboardSnapshot>; taskboardNotice: HostObservable<TaskboardNotice | null> }
  refresh: () => Promise<void>
  watch: () => () => void
  selectProject: (projectId: ProjectId) => Promise<void>
  selectTask: (taskId: TaskId | null) => Promise<void>
  selectTarget: (projectId: ProjectId, taskId: TaskId) => Promise<void>
  showArchived: (includeArchived: boolean) => Promise<void>
  mutate: (action: () => Promise<void>, update?: Partial<Selection>) => Promise<boolean>
  dismissNotice: () => void
}

function observable<T>(initial: T): HostObservable<T> & { publish(value: T): void } {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    publish(next) {
      value = next
      for (const listener of listeners) listener()
    },
  }
}

/** Create one browser projection with generation-checked Remote reads.
 * @param reads - authenticated Remote queries.
 * @returns page selections, observable data, and settled operation notices.
 */
export function createTaskboardSource(reads: Reads): TaskboardSource {
  const initial: TaskboardSnapshot = {
    projects: [], tasks: [], detail: null, route: null, inbox: [], projectId: null, taskId: null, includeArchived: false, status: 'loading',
  }
  const data = observable(initial)
  const notice = observable<TaskboardNotice | null>(null)
  let signature = JSON.stringify(initial)
  let query = 0
  let noticeId = 0
  let selection: Selection = initial
  const publish = (value: TaskboardSnapshot) => {
    const next = JSON.stringify(value)
    if (signature !== next) {
      signature = next
      data.publish(value)
    }
  }
  async function refresh(next: Selection = selection): Promise<void> {
    selection = next
    const generation = ++query
    try {
      const projects = await reads.projects()
      if (generation !== query) return
      const projectId = projects.find(project => project.id === next.projectId)?.id ?? projects[0]?.id ?? null
      const [tasks, detail, route, inbox] = await Promise.all([
        projectId === null ? [] : reads.tasks(projectId, next.includeArchived),
        projectId === null || next.taskId === null ? null : reads.detail(projectId, next.taskId),
        projectId === null ? null : reads.route(projectId), reads.inbox(),
      ])
      if (generation !== query) return
      selection = { ...next, projectId, taskId: detail?.task.id ?? null }
      publish({ ...selection, projects, tasks, detail, route, inbox, status: 'ready' })
    } catch {
      if (generation === query) publish({ ...data.getSnapshot(), status: 'error' })
    }
  }
  return {
    hooks: { taskboard: data, taskboardNotice: notice },
    refresh: () => refresh(),
    watch() {
      const controller = new AbortController()
      const { signal } = controller
      const isAborted = () => signal.aborted
      let timer: ReturnType<typeof setTimeout> | undefined
      const read = async () => {
        try {
          for await (const _change of reads.changes(signal)) {
            if (isAborted()) return
            await refresh()
          }
        } catch (_error) {
          // A disconnected stream can recover from a fresh read and subscription.
        }
        if (isAborted()) return
        await refresh()
        if (!isAborted()) timer = setTimeout(() => { void read() }, 1200)
      }
      void read()
      return () => { controller.abort(); clearTimeout(timer) }
    },
    selectProject: (projectId: ProjectId) => refresh({ ...selection, projectId, taskId: null }),
    selectTask: (taskId: TaskId | null) => refresh({ ...selection, taskId }),
    selectTarget: (projectId: ProjectId, taskId: TaskId) => refresh({ ...selection, projectId, taskId }),
    showArchived: (includeArchived: boolean) => refresh({ ...selection, includeArchived }),
    async mutate(action: () => Promise<void>, update: Partial<Selection> = {}): Promise<boolean> {
      try {
        await action()
      } catch (cause) {
        notice.publish({ id: ++noticeId, ok: false, ...cause instanceof Error ? { message: cause.message } : {} })
        await refresh()
        return false
      }
      notice.publish({ id: ++noticeId, ok: true })
      await refresh({ ...selection, ...update })
      return true
    },
    dismissNotice: () => { notice.publish(null) },
  }
}
