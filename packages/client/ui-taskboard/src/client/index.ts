/** Register the Taskboard navigation and main panel in the existing Web frame. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { CommandId, ProjectId, TaskId, TaskView } from '@deepseek-ai/dsh-api-taskboard-controller/types'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { SidebarIcon, TaskboardToast } from './chrome.tsx'
import { TaskboardPage, type TaskboardPageActions } from './TaskboardPage.tsx'
import { en, zh, type TaskboardKey } from './locales.ts'
import { createTaskboardSource } from './source.ts'

const panelId = 'taskboard' as MainPanelId
const ns = 'taskboard'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Project Taskboard and operator actions. */
    taskboard: TaskboardKey
  }
}

/** The shared slots and authorized Taskboard and directory actions. */
export const inject = ['slots', 'locale', 'remote', 'remote.taskboard', 'uiWorkspace']

function commandId() { return randomUUID() as CommandId }
function taskCommand(task: TaskView) {
  return { commandId: commandId(), projectId: task.projectId, taskId: task.id, expectedVersion: task.version }
}

type Result<T> = { ok: true; value: T } | { ok: false; error: { message: string } }

async function requireValue<T>(request: Promise<Result<T>>): Promise<T> {
  const result = await request
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

/**
 * Install the Taskboard panel, application-level notices, and operator commands.
 * @param ctx - browser slot, locale, and authenticated Remote services.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(ns, { en, zh }), 'ui-taskboard: locale')
  const t = ctx.locale.bind(ns)
  const remote = ctx.remote.taskboard
  const source = createTaskboardSource({
    projects: () => requireValue(remote.listProjects()),
    tasks: (projectId, includeArchived) => requireValue(remote.listBoardCards(projectId, includeArchived)),
    detail: (projectId, taskId) => requireValue(remote.detail(projectId, taskId)),
    route: projectId => requireValue(remote.executionRoute(projectId)),
    inbox: () => requireValue(remote.inbox()),
    changes: signal => remote.watchChanges(signal),
  })
  const operations = { plan: remote.planTask, archive: remote.archiveTask, reopen: remote.reopenTask, cancelTask: remote.cancelTask }
  const download = (filename: string, read: () => string | Promise<string>) => source.mutate(async () => {
    const href = URL.createObjectURL(new Blob([await read()], { type: 'application/json' }))
    const link = document.createElement('a')
    link.download = filename
    link.href = href
    link.click()
    setTimeout(() => { URL.revokeObjectURL(href) }, 0)
  })
  const actions: TaskboardPageActions = {
    members: projectId => requireValue(remote.projectMembers(projectId)),
    createMember: input => source.mutate(async () => { await requireValue(remote.createMember(input)) }),
    changeMember: input => source.mutate(async () => { await requireValue(remote.changeMember(input)) }),
    downloadBackup: () => download('taskboard-backup.json', () => requireValue(remote.exportBackup())),
    downloadReviewPackage: (task, id) => download('taskboard-review.json',
      () => requireValue(remote.exportReviewPackage(task.projectId, task.id, id))),
    downloadHandoff: projectId => download('taskboard-handoff.json', () => requireValue(remote.exportHandoff(projectId))),
    async restoreBackup(file) {
      let restored: Awaited<ReturnType<TaskboardPageActions['restoreBackup']>>
      await source.mutate(async () => { restored = await requireValue(remote.restoreBackup(await file.text())) })
      return restored
    },
    async browse() {
      try { return await ctx.uiWorkspace.pickDirectory() }
      catch (error) {
        await source.mutate(() => Promise.reject(error instanceof Error ? error : new Error(String(error))))
        return null
      }
    },
    saveProject(project) {
      const id = randomUUID() as ProjectId
      return source.mutate(async () => {
        await requireValue(remote.createProject({ commandId: commandId(), expectedVersion: 0, project: { ...project, id } }))
      }, { projectId: id, taskId: null })
    },
    saveTask(projectId, task, requirements) {
      const taskId = task?.id ?? randomUUID() as TaskId
      const request = { commandId: commandId(), projectId, taskId, expectedVersion: task?.version ?? 0, requirements }
      return source.mutate(async () => { await requireValue(task ? remote.editTask(request) : remote.createTask(request)) }, { taskId })
    },
    taskAction(task, action) {
      return source.mutate(async () => { await requireValue(operations[action](taskCommand(task))) })
    },
    setRelations(task, relations) {
      return source.mutate(async () => { await requireValue(remote.setRelations({ ...taskCommand(task), relations })) })
    },
    addComment(task, text) {
      return source.mutate(async () => { await requireValue(remote.comment({ ...taskCommand(task), text })) })
    },
    move(task, target, beforeTaskId) {
      const request = taskCommand(task)
      return source.mutate(async () => {
        if (task.status === target) await requireValue(remote.reorderTask({ ...request, beforeTaskId }))
        else if (target === 'todo' && (task.status === 'backlog' || task.status === 'blocked')) await requireValue(remote.planTask(request))
        else if (target === 'canceled' && ['backlog', 'todo', 'blocked'].includes(task.status)) await requireValue(remote.cancelTask(request))
        else throw new Error(t('unsupportedMove'))
      })
    },
    getRunSpec: (projectId, taskId, runId) => requireValue(remote.runTaskSpec(projectId, taskId, runId)),
    downloadRunSpec: spec => download('task-spec.json', () => JSON.stringify(spec, null, 2)),
    inspectRun(task, previous, resume) {
      if (resume && previous) return requireValue(remote.inspectPriorWorkspace(task.projectId, task.id, previous.runId))
      return requireValue(remote.inspectProject(task.projectId))
    },
    startRun(task, input) {
      return source.mutate(async () => { await requireValue(remote.startRun({ ...taskCommand(task), ...input })) })
    },
    stopRun(task, runId, force) {
      return source.mutate(async () => { await requireValue(remote.stopRun({ ...taskCommand(task), runId, force })) })
    },
    cancelRun(task, runId) {
      return source.mutate(async () => { await requireValue(remote.cancelQueuedRun({ ...taskCommand(task), runId })) })
    },
    recheckRun(task, runId) {
      return source.mutate(async () => { await requireValue(remote.recheckRunStop(task.projectId, task.id, runId)) })
    },
    respond(reply) {
      return source.mutate(async () => { await requireValue(remote.answerRunInteraction(reply)) })
    },
    getDelivery: (task, id) => requireValue(remote.deliveryDetail(task.projectId, task.id, id)),
    getDiff: (task, id, path) => requireValue(remote.deliveryDiff(task.projectId, task.id, id, path)),
    requestCoverageReview(task, delivery, route) {
      return source.mutate(async () => {
        await requireValue(remote.requestModelReview({ commandId: commandId(), taskId: task.id, projectId: task.projectId,
          deliveryId: delivery.id, snapshot: delivery.snapshot, provider: route.provider, model: route.model,
          language: document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh' : 'en' }))
      })
    },
    reviewDelivery(task, delivery, decision) {
      const { id: deliveryId, version: deliveryVersion, revision, snapshot } = delivery
      return source.mutate(async () => {
        await requireValue(remote.reviewDelivery({ ...taskCommand(task), deliveryId, deliveryVersion, revision, snapshot, ...decision }))
      })
    },
  }
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: panelId, order: 15, label: () => t('title'),
  }, SidebarIcon))
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: panelId, locale: ns, inject: () => ({ ...source, ...actions }),
  }, TaskboardPage))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'taskboard.notice', locale: ns,
    inject: () => ({ hooks: { taskboardNotice: source.hooks.taskboardNotice }, dismiss: source.dismissNotice }),
  }, TaskboardToast))
}
