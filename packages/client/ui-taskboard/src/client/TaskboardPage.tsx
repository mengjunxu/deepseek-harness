/** Main Taskboard panel and its project, task, and activity forms. */
import { useEffect, useState, type FormEvent } from 'react'
import clsx from 'clsx'
import {
  Button, Checkbox, IconPlusOutlineRegular, IconSearchOutlineRegular, Input, Modal, Pill, StateDot, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  DeliveryId, ProjectId, TaskboardCard, TaskboardProject, TaskboardRestore,
  TaskId, TaskRelations, TaskInteractionReply, TaskRequirements, TaskStatus, TaskView,
} from '@deepseek-ai/dsh-api-taskboard-controller/types'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { createTaskboardSource } from './source.ts'
import { TeamPanel, type TeamActions } from './TeamPanel.tsx'
import { RunPanel, type RunActions } from './RunPanel.tsx'
import { WorkflowDetails } from './WorkflowDetails.tsx'
import { DeliveryPanel, type DeliveryActions } from './DeliveryPanel.tsx'
import { InteractionPanel } from './InteractionPanel.tsx'
import css from './TaskboardPage.module.css'

const statuses = ['backlog', 'todo', 'in_progress', 'in_review', 'blocked', 'done', 'canceled'] as const
const riskLevels = ['low', 'medium', 'high'] as const
const priorities = ['low', 'normal', 'high'] as const
type TaskAction = 'plan' | 'archive' | 'reopen' | 'cancelTask'

/** Scoped operations installed by the plugin's composition. */
export interface TaskboardPageActions extends RunActions, DeliveryActions, TeamActions {
  browse(): Promise<string | null>
  saveProject(project: Pick<TaskboardProject, 'title' | 'root' | 'baselineBranch' | 'checkTrackedDiff' | 'projectScript'>): Promise<boolean>
  saveTask(projectId: ProjectId, task: TaskView | null, requirements: TaskRequirements): Promise<boolean>
  move(task: TaskView, target: TaskStatus, before: TaskId | null): Promise<boolean>
  taskAction(task: TaskView, action: TaskAction): Promise<boolean>
  setRelations(task: TaskView, relations: TaskRelations): Promise<boolean>
  addComment(task: TaskView, text: string): Promise<boolean>
  respond: (reply: TaskInteractionReply) => Promise<boolean>
  downloadBackup: () => Promise<boolean>
  downloadHandoff: (projectId: ProjectId) => Promise<boolean>
  restoreBackup: (file: File) => Promise<TaskboardRestore | undefined>
}

type TaskboardPageProps = PropsRuntime<'main'> & PropsLocale<'taskboard'> & InjectFace<
  Omit<ReturnType<typeof createTaskboardSource>, 'mutate' | 'dismissNotice'> & TaskboardPageActions
>
type Translate = TaskboardPageProps['t']

type Form = { kind: 'project' | 'backup' | 'team' } | { kind: 'task'; task: TaskView | null } | { kind: 'relations'; task: TaskView } | null

function BackupPanel({ projectId, empty, t, onClose, actions }: {
  projectId: ProjectId | null
  empty: boolean
  t: Translate
  onClose: () => void
  actions: Pick<TaskboardPageActions, 'downloadBackup' | 'downloadHandoff' | 'restoreBackup'>
}) {
  const [file, setFile] = useState<File>()
  const [restored, setRestored] = useState<TaskboardRestore>()
  const [busy, setBusy] = useState(false)
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try { await action() } finally { setBusy(false) }
  }
  const onRestore = async () => {
    if (!file) return
    const result = await actions.restoreBackup(file)
    if (result) setRestored(result)
  }
  return (
    <Modal open onClose={onClose} title={t('backupTitle')} closeLabel={t('close')}>
      <div className={css.form}>
        <p>{t('backupContents')}</p>
        <div className={css.controls}>
          <Button variant="outline" disabled={busy || empty}
            onClick={() => { void perform(actions.downloadBackup) }}>{t('downloadBackup')}</Button>
          {projectId !== null && <Button variant="outline" disabled={busy}
            onClick={() => { void perform(() => actions.downloadHandoff(projectId)) }}>{t('downloadHandoff')}</Button>}
        </div>
        {restored ? <p role="status">{t('backupRestored', {
          projects: restored.projects, tasks: restored.tasks, sessions: restored.missingSessions, queued: restored.canceledQueuedRuns,
        })}</p> : <>
          <p>{t('restoreEmpty')}</p>
          {empty && <>
            <label>{t('backupFile')}
              <input type="file" accept=".json,application/json" disabled={busy}
                onChange={(event) => { setFile(event.target.files?.[0]) }} />
            </label>
            <div className={css.formEnd}>
              <Button variant="primary" disabled={busy || !file} onClick={() => { void perform(onRestore) }}>{t('restoreBackup')}</Button>
            </div>
          </>}
        </>}
      </div>
    </Modal>
  )
}

function TaskEditor({ task, t, onClose, onSave }: {
  task: TaskView | null
  t: Translate
  onClose: () => void
  onSave: (requirements: TaskRequirements) => Promise<boolean>
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [constraints, setConstraints] = useState(task?.constraints ?? '')
  const [riskLevel, setRiskLevel] = useState(task?.riskLevel ?? null)
  const [template, setTemplate] = useState<string>(task?.workflow?.template ?? '')
  const [steps, setSteps] = useState(task?.workflow?.template === 'task.standard.v1' ? task.workflow.steps.join('\n') : '')
  const [acceptance, setAcceptance] = useState(task?.acceptance.join('\n') ?? '')
  const [priority, setPriority] = useState<TaskRequirements['priority']>(task?.priority ?? 'normal')
  const [labels, setLabels] = useState(task?.labels.join(', ') ?? '')
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim()) { setInvalid(true); return }
    setInvalid(false)
    setBusy(true)
    const pieces = (text: string, separator: string) => text.split(separator).map(value => value.trim()).filter(Boolean)
    try {
      const workflow = template === 'task.standard.v1' ? { template, steps: pieces(steps, '\n') } as const
        : template === 'task.quick.v1' ? { template } as const : null
      if (await onSave({ title, description, constraints, riskLevel, workflow, acceptance: pieces(acceptance, '\n'),
        priority, labels: pieces(labels, ',') })) onClose()
    } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={t(task ? 'edit' : 'newTask')} closeLabel={t('close')}>
      <form className={css.form} onSubmit={(event) => { void submit(event) }}>
        <label>{t('titleField')}<Input data-modal-autofocus value={title} onChange={(event) =>{  setTitle(event.target.value) }} /></label>
        <label>{t('description')}<textarea value={description} onChange={(event) =>{  setDescription(event.target.value) }} /></label>
        <label>{t('constraints')}<textarea value={constraints} onChange={(event) => { setConstraints(event.target.value) }} /></label>
        <label>{t('workflow')}<select value={template} onChange={(event) => { setTemplate(event.target.value) }}>
          <option value="">{t('unspecified')}</option>
          <option value="task.quick.v1">{t('task.quick.v1')}</option>
          <option value="task.standard.v1">{t('task.standard.v1')}</option>
        </select></label>
        {template === 'task.standard.v1' && <label>{t('workflowSteps')}
          <textarea value={steps} onChange={(event) => { setSteps(event.target.value) }} /></label>}
        <label>{t('riskLevel')}<select value={riskLevel ?? ''} onChange={(event) => {
          setRiskLevel(riskLevels.find(level => level === event.target.value) ?? null)
        }}>
          <option value="">{t('unspecified')}</option>
          {riskLevels.map(level => <option key={level} value={level}>{t(level)}</option>)}
        </select></label>
        <label>{t('acceptance')}<textarea value={acceptance} onChange={(event) =>{  setAcceptance(event.target.value) }} /></label>
        <div className={css.controls} role="group" aria-label={t('priority')}>
          {priorities.map(level => (
            <Pill active={priority === level} aria-pressed={priority === level} key={level}
              onClick={() => { setPriority(level) }}>{t(level)}</Pill>
          ))}
        </div>
        <label>{t('labels')}<Input value={labels} onChange={(event) =>{  setLabels(event.target.value) }} /></label>
        {invalid && <div role="alert" className={css.alert}>{t('invalidTask')}</div>}
        <div className={css.formEnd}>
          <Button type="button" variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" variant="primary" disabled={busy}>{t('save')}</Button>
        </div>
      </form>
    </Modal>
  )
}

function RelationsEditor({ task, tasks, save, close, t }: {
  task: TaskView
  tasks: TaskView[]
  save: TaskboardPageActions['setRelations']
  close: () => void
  t: Translate
}) {
  const [parent, setParent] = useState(task.relations?.parent ?? null)
  const [blockers, setBlockers] = useState(task.relations?.blockers ?? [])
  const [saving, setSaving] = useState(false)
  const options = tasks.filter(row => row.id !== task.id)
  const titles = new Map(options.map(row => [row.id, row.title]))
  const ids = new Set([...titles.keys(), ...blockers, ...(parent ? [parent] : [])])
  const submit = async () => {
    setSaving(true)
    try { if (await save(task, { parent, blockers })) close() }
    finally { setSaving(false) }
  }
  return <Modal open title={t('relations')} closeLabel={t('close')} onClose={close}>
    <div className={css.form}>
      <label>{t('parentTask')}<select value={parent ?? ''} onChange={(event) => { setParent(event.target.value as TaskId || null) }}>
        <option value="">{t('noParent')}</option>
        {Array.from(ids, id => <option key={id} value={id}>{titles.get(id) ?? id}</option>)}
      </select></label>
      <label>{t('blockers')}<select multiple value={blockers} onChange={(event) => {
        setBlockers(Array.from(event.target.selectedOptions, option => option.value as TaskId))
      }}>
        {Array.from(ids, id => <option key={id} value={id}>{titles.get(id) ?? id}</option>)}
      </select></label>
      <Button variant="primary" disabled={saving} onClick={() => { void submit() }}>{t('save')}</Button>
    </div>
  </Modal>
}

function ProjectEditor({ t, browse, onClose, onSave }: {
  t: Translate
  browse: () => Promise<string | null>
  onClose: () => void
  onSave: (project: Pick<TaskboardProject, 'title' | 'root' | 'baselineBranch' | 'checkTrackedDiff' | 'projectScript'>) => Promise<boolean>
}) {
  const [title, setTitle] = useState('')
  const [root, setRoot] = useState('')
  const [branch, setBranch] = useState('')
  const [checkTrackedDiff, setCheckTrackedDiff] = useState(false)
  const [script, setScript] = useState('')
  const [busy, setBusy] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!title.trim() || !root.trim()) { setInvalid(true); return }
    setInvalid(false)
    setBusy(true)
    try {
      const project = { title, root, ...(script === 'test' || script === 'build' ? { projectScript: script } as const : {}), ...(checkTrackedDiff && { checkTrackedDiff }), ...(branch.trim() && { baselineBranch: branch }) }
      if (await onSave(project)) onClose()
    } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={t('newProject')} closeLabel={t('close')}>
      <form className={css.form} onSubmit={(event) => { void submit(event) }}>
        <label>{t('projectName')}<Input data-modal-autofocus value={title} onChange={(event) =>{  setTitle(event.target.value) }} /></label>
        <label>{t('projectDirectory')}
          <span className={css.controls}>
            <Input value={root} className={clsx(css.flexInput)} onChange={(event) =>{  setRoot(event.target.value) }} />
            <Button type="button" variant="outline" onClick={() => {
              void browse().then((path) => { if (path !== null) setRoot(path) })
            }}>{t('browse')}</Button>
          </span>
        </label>
        <label>{t('baselineBranch')}<Input value={branch} onChange={(event) =>{  setBranch(event.target.value) }} /></label>
        <label>{t('projectScript')}<select value={script} onChange={(event) => { setScript(event.target.value) }}>
          <option value="">{t('noScript')}</option><option value="test">{t('npm-test')}</option><option value="build">{t('npm-build')}</option>
        </select></label>
        <Checkbox checked={checkTrackedDiff} onChange={setCheckTrackedDiff} label={t('enableGitDiffCheck')} />
        {invalid && <div role="alert" className={css.alert}>{t('invalidProject')}</div>}
        <div className={css.formEnd}>
          <Button type="button" variant="ghost" onClick={onClose}>{t('cancel')}</Button>
          <Button type="submit" variant="primary" disabled={busy}>{t('save')}</Button>
        </div>
      </form>
    </Modal>
  )
}

function availableActions(task: TaskView): TaskAction[] {
  if (task.archived) return ['reopen']
  if (task.status === 'done' || task.status === 'canceled') return ['reopen', 'archive']
  if (task.status === 'backlog' || task.status === 'blocked') return ['plan', 'cancelTask']
  return task.status === 'todo' ? ['cancelTask'] : []
}

/**
 * Render the Taskboard as a native main panel.
 * @param props - the Taskboard's stable projection, authenticated commands, and locale seat.
 * @returns project navigation, task views, and the selected task’s detail.
 */
export function TaskboardPage(props: TaskboardPageProps) {
  const { useTaskboard, refresh, watch, selectProject, selectTask, selectTarget, showArchived, t } = props
  const { projects, projectId, tasks, detail, route, inbox, status, includeArchived } = useTaskboard(value => value)
  const [form, setForm] = useState<Form>(null)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [dragged, setDragged] = useState<TaskView | null>(null)
  const [comment, setComment] = useState('')
  const [review, setReview] = useState<{ taskId: TaskId; deliveryId: DeliveryId | null }>()
  const searchTerm = search.trim().toLowerCase()
  const shown = tasks.filter(task => (filter === 'all' || task.status === filter)
    && [task.title, task.description, ...task.labels].some(value => value.toLowerCase().includes(searchTerm)))
  const project = projects.find(item => item.id === projectId)
  const task = detail?.task
  const siblings = task ? tasks.filter(row => row.status === task.status && !row.archived) : []
  const position = siblings.findIndex(row => row.id === task?.id)
  const latestDelivery = detail?.deliveries.at(-1)
  const reviewing = review && review.taskId === task?.id && (review.deliveryId === null
    ? latestDelivery : detail?.deliveries.find(item => item.id === review.deliveryId))

  useEffect(watch, [watch])

  const chooseTask = (id: TaskId | null) => {
    setComment('')
    setReview(undefined)
    void selectTask(id)
  }
  const drop = (target: TaskStatus, before: TaskId | null) => {
    const moving = dragged
    setDragged(null)
    if (!moving || moving.id === before) return
    if (target === 'done' && moving.status === 'in_review') {
      chooseTask(moving.id)
      setReview({ taskId: moving.id, deliveryId: null })
    } else void props.move(moving, target, before)
  }
  const card = (row: TaskboardCard) => (
    <button
      key={row.id}
      type="button"
      className={clsx(css.card, task?.id === row.id && css.selected)}
      aria-expanded={task?.id === row.id}
      draggable={!row.archived}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', row.id)
        setDragged(row)
      }}
      onDragEnd={() =>{  setDragged(null) }}
      onDragOver={(event) => { if (dragged) event.preventDefault() }}
      onDrop={(event) => { event.preventDefault(); event.stopPropagation(); drop(row.status, row.id) }}
      onClick={() =>{  chooseTask(row.id) }}
    >
      <span className={css.cardTitle}>{row.title}</span>
      <span className={css.cardMeta}>
        {view === 'list' && <Tag tone="neutral">{t(row.status)}</Tag>}
        {row.archived && <Tag>{t('archivedLabel')}</Tag>}
        {row.priority !== 'normal' && <Tag tone={row.priority === 'high' ? 'warning' : 'quiet'}>{t(row.priority)}</Tag>}
        {row.labels.map(label => <Tag key={label}>{label}</Tag>)}
        {row.run?.state === 'queued' && <Tag>{t('run.queued')}</Tag>}
        {row.run?.connection === 'suspect' && <Tag tone="warning">{t('connectionSuspect')}</Tag>}
        {(['question', 'approval'] as const).map((kind) => {
          const count = inbox.find(entry => entry.taskId === row.id)?.requests.filter(request => request.kind === kind).length
          return count ? <Tag key={kind} tone={kind === 'approval' ? 'warning' : 'info'}>{t(kind)} {count}</Tag> : null
        })}
      </span>
      {row.run?.lastEvent && (row.run.state === 'running' || row.run.state === 'preparing')
        && <span className={css.muted}>{t('lastEvent')} <code>{row.run.lastEvent.type}</code></span>}
    </button>
  )

  return (
    <main className={css.page} aria-label={t('title')} data-testid="taskboard-page">
      <div className={css.content}>
        <header className={css.heading}>
          <h1>{t('title')}</h1>
          <div className={css.controls}>
            {inbox.map(entry => <Button key={entry.runId} variant="outline" size="sm" onClick={() => {
              setReview(undefined)
              setComment('')
              void selectTarget(entry.projectId, entry.taskId)
            }}>{t('pending')} ({entry.requests.length}){inbox.length > 1 && ' · ' + (tasks.find(row => row.id === entry.taskId)?.title ?? entry.taskId)}</Button>)}
            {project && <Button variant="ghost" size="sm" onClick={() => { setForm({ kind: 'team' }) }}>{t('teamAccess')}</Button>}
            <Button variant="ghost" size="sm" onClick={() => { setForm({ kind: 'backup' }) }}>{t('backupTitle')}</Button>
            <Button variant="outline" size="sm" onClick={() =>{  setForm({ kind: 'project' }) }}>{t('newProject')}</Button>
            {project && <Button variant="primary" size="sm" icon={<IconPlusOutlineRegular size={13} />}
              onClick={() =>{  setForm({ kind: 'task', task: null }) }}>{t('newTask')}</Button>}
          </div>
        </header>
        {status === 'error' && <div role="alert" className={css.alert}>
          {t('loadFailed')} <Button variant="ghost" size="sm" onClick={() => { void refresh() }}>{t('retry')}</Button>
        </div>}
        {status === 'loading' && <div role="status" aria-label={t('loading')} className={css.empty}><StateDot state="ongoing" /></div>}
        {status === 'ready' && projects.length === 0 && <p className={css.empty}>{t('noProjects')}</p>}
        {project && <div className={css.controls} role="group" aria-label={t('projects')}>
          {projects.map(item => (
            <Pill key={item.id} active={item.id === projectId} aria-pressed={item.id === projectId}
              onClick={() => { void selectProject(item.id) }}>{item.title}</Pill>
          ))}
        </div>}
        {project && <section className={css.project}>
          <div className={css.controls}>
            <Input icon={<IconSearchOutlineRegular />} value={search} placeholder={t('search')} aria-label={t('search')}
              onChange={(event) =>{  setSearch(event.target.value) }} />
            <div className={css.controls} role="group" aria-label={t('display')}>
              {(['board', 'list'] as const).map(mode => (
                <Pill key={mode} active={view === mode} aria-pressed={view === mode} onClick={() =>{  setView(mode) }}>{t(mode)}</Pill>
              ))}
            </div>
            <Checkbox checked={includeArchived} label={t('archived')} onChange={(checked) => { void showArchived(checked) }} />
          </div>
          <div className={css.controls} role="group" aria-label={t('status')}>
            {(['all', ...statuses] as const).map(value => (
              <Pill key={value} active={filter === value} aria-pressed={filter === value}
                onClick={() => { setFilter(value) }}>{t(value)}</Pill>
            ))}
          </div>
          {view === 'board' ? (
            <div className={css.board}>
              {(filter === 'all' ? statuses : [filter]).map(column => (
                <section key={column} className={css.column} aria-label={t(column)}
                  onDragOver={(event) => { if (dragged) event.preventDefault() }}
                  onDrop={(event) => { event.preventDefault(); drop(column, null) }}
                >
                  <h2>{t(column)} <span>{shown.filter(row => row.status === column).length}</span></h2>
                  {shown.filter(row => row.status === column).map(card)}
                </section>
              ))}
            </div>
          ) : (
            <div className={css.list}>
              {shown.length === 0 && <p className={css.empty}>{t(tasks.length === 0 ? 'noTasks' : 'noMatches')}</p>}
              {shown.map(card)}
            </div>
          )}
          {route && <details className={css.history}>
            <summary>{t('executionSettings')}</summary>
            {route.provider && <div>{route.provider} · {route.model}</div>}
            <div>{t(`route.${route.state}`)}</div>
          </details>}
        </section>}
      </div>
      {detail && task && <aside className={css.detail} aria-label={task.title}>
        <header className={css.detailHeading}>
          <h2>{task.title}</h2>
          <Button variant="ghost" size="sm" onClick={() =>{  chooseTask(null) }}>{t('close')}</Button>
        </header>
        <div className={css.controls}>
          <Tag tone="info">{t(task.status)}</Tag>
          <Tag>{t('revision')} {task.revision}</Tag>
        </div>
        <details className={css.history}>
          <summary>{t('relations')}</summary>
          {task.relations?.parent && <p>{t('parentTask')} · {tasks.find(row => row.id === task.relations?.parent)?.title ?? task.relations.parent}</p>}
          {task.relations?.blockers.map((id) => {
            const dependency = tasks.find(row => row.id === id)
            return <p key={id}>{t('blockers')} · {dependency ? dependency.title + ' · ' + t(dependency.status) : id}</p>
          })}
          {tasks.filter(row => row.relations?.parent === task.id).map(row => <Button key={row.id} variant="ghost" size="sm"
            onClick={() => { chooseTask(row.id) }}>{t('childTask')} · {row.title}</Button>)}
          {!task.archived && ['todo', 'backlog', 'blocked', 'in_review'].includes(task.status)
            && !detail.runs.some(run => ['queued', 'preparing', 'running'].includes(run.state)) &&
            <Button variant="outline" size="sm" onClick={() => { setForm({ kind: 'relations', task }) }}>{t('editRelations')}</Button>}
        </details>
        <RunPanel key={task.id} detail={detail} route={route} actions={props} t={t} />
        {inbox.filter(entry => entry.taskId === task.id).map(entry =>
          <InteractionPanel key={entry.runId} inbox={entry} respond={props.respond} t={t} />)}
        {detail.deliveries.length > 0 && <section className={css.section}>
          <h3>{t('delivery')}</h3>
          {detail.deliveries.map(item => (
            <Button key={item.id} variant="outline" size="sm" onClick={() => {
              setReview({ taskId: task.id, deliveryId: item.id })
            }}>{item.summary} · {t('delivery')} {item.version}</Button>
          ))}
        </section>}
        {task.description && <p className={css.prose}>{task.description}</p>}
        {task.riskLevel && <p><strong>{t('riskLevel')}</strong> · {t(task.riskLevel)}</p>}
        {task.workflow && <WorkflowDetails workflow={task.workflow} t={t} />}
        {task.constraints && <p className={css.prose}><strong>{t('constraints')}</strong><br />{task.constraints}</p>}
        {task.acceptance.length > 0 && <ul className={css.criteria}>
          {task.acceptance.map((line, index) => <li key={index}>{line}</li>)}
        </ul>}
        <div className={css.controls}>
          {!task.archived && <Button variant="outline" size="sm" onClick={() =>{  setForm({ kind: 'task', task }) }}>{t('edit')}</Button>}
          {availableActions(task).map(action => (
            <Button key={action} variant="ghost" size="sm" onClick={() => { void props.taskAction(task, action) }}>{t(action)}</Button>
          ))}
          {position > 0 && <Button variant="ghost" size="sm" onClick={() => {
            void props.move(task, task.status, siblings[position - 1]?.id ?? null)
          }}>{t('moveEarlier')}</Button>}
          {position >= 0 && position < siblings.length - 1 && <Button variant="ghost" size="sm" onClick={() => {
            void props.move(task, task.status, siblings[position + 2]?.id ?? null)
          }}>{t('moveLater')}</Button>}
        </div>
        <details className={css.history}>
          <summary>{t('versions')}</summary>
          <ol>{detail.revisions.map(item => <li key={item.revision}><details>
            <summary>{t('revision')} {item.revision} · {item.title}</summary>
            <p className={css.prose}>{item.description}</p>
            {item.riskLevel && <p><strong>{t('riskLevel')}</strong> · {t(item.riskLevel)}</p>}
            {item.constraints && <p className={css.prose}><strong>{t('constraints')}</strong><br />{item.constraints}</p>}
            {item.workflow && <WorkflowDetails workflow={item.workflow} t={t} />}
            <ul>{item.acceptance.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
          </details></li>)}</ol>
        </details>
        <details className={css.history} open>
          <summary>{t('history')}</summary>
          <ol>{detail.activity.map(item => (
            <li key={item.commandId}>{item.member?.name ?? t(item.actor)} · {item.comment ?? t(`activity.${item.action}`)}
              <time className={css.muted} dateTime={item.time}>{new Date(item.time).toLocaleString()}</time>
            </li>
          ))}</ol>
        </details>
        {!task.archived && <form className={css.controls} onSubmit={(event) => {
          event.preventDefault()
          if (comment.trim()) void props.addComment(task, comment).then((ok) => { if (ok) setComment('') })
        }}>
          <Input value={comment} aria-label={t('comment')} onChange={(event) =>{  setComment(event.target.value) }} />
          <Button type="submit" variant="outline" size="sm" disabled={!comment.trim()}>{t('addComment')}</Button>
        </form>}
      </aside>}
      {task && reviewing && <DeliveryPanel key={reviewing.id} task={task} selected={reviewing}
        current={reviewing.id === latestDelivery?.id}
        reviews={detail.reviews.filter(review => review.deliveryId === reviewing.id)}
        actions={props} t={t} close={() => { setReview(undefined) }} />}
      {form?.kind === 'project' && <ProjectEditor t={t} browse={props.browse} onClose={() =>{  setForm(null) }} onSave={props.saveProject} />}
      {form?.kind === 'team' && projectId && <TeamPanel key={projectId} projectId={projectId} actions={props} t={t} close={() => { setForm(null) }} />}
      {form?.kind === 'backup' && <BackupPanel projectId={projectId} empty={status === 'ready' && projects.length === 0}
        t={t} actions={props} onClose={() => { setForm(null) }} />}
      {form?.kind === 'relations' && <RelationsEditor task={form.task} tasks={tasks} save={props.setRelations}
        close={() => { setForm(null) }} t={t} />}
      {form?.kind === 'task' && projectId !== null && <TaskEditor t={t} task={form.task} onClose={() =>{  setForm(null) }}
        onSave={requirements => props.saveTask(projectId, form.task, requirements)} />}
    </main>
  )
}
