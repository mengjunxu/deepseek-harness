/** Project member sign-in and task access using only the scoped Taskboard carrier. */
import { useState, type FormEvent } from 'react'
import { memberBoard, riskLevel } from '@deepseek-ai/dsh-api-taskboard-controller/member-board'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import { createRoot } from 'react-dom/client'
import type { MemberBoard, ProjectId, TaskView } from '@deepseek-ai/dsh-api-taskboard-controller/types'
import './taskboard-team.css'

const en = {
  title: 'Team taskboard', signIn: 'Sign in', key: 'Member key', signOut: 'Sign out', choose: 'Choose a project',
  denied: 'Access denied. Check your member key and project role.', conflict: 'Task changed. Refresh before editing.',
  failed: 'Could not load or save. Try again.', reload: 'Refresh', save: 'Save requirements', comment: 'Add comment',
  riskLevel: 'Risk level', unspecified: 'Unspecified', low: 'Low', medium: 'Medium', high: 'High',
  workflow: 'Workflow', 'task.quick.v1': 'Quick task · v1', 'task.standard.v1': 'Standard task · v1', steps: 'Optional steps (one per line)',
  constraints: 'Constraints', description: 'Goal', name: 'Task title', acceptance: 'Acceptance criteria (one per line)', empty: 'No visible tasks.',
  projects: 'Projects', operator: 'Operator', runtime: 'Run', member: 'Member', viewer: 'Viewer', editor: 'Editor', signedIn: 'Account',
  backlog: 'Backlog', todo: 'To do', in_progress: 'In progress', in_review: 'In review', blocked: 'Blocked', done: 'Done', canceled: 'Canceled',
}
const zh: Record<keyof typeof en, string> = {
  title: '团队任务看板', signIn: '登录', key: '成员密钥', signOut: '退出登录', choose: '选择项目', denied: '访问被拒绝，请核对成员密钥和项目角色。',
  conflict: '任务已变更，请刷新后再编辑。', failed: '读取或保存失败，请重试。', reload: '刷新', save: '保存需求', comment: '添加评论',
  riskLevel: '风险等级', unspecified: '未指定', low: '低', medium: '中', high: '高',
  workflow: '工作流', 'task.quick.v1': '快速任务 · v1', 'task.standard.v1': '常规任务 · v1', steps: '执行步骤（可选，每行一步）',
  constraints: '约束', description: '目标', name: '任务标题', acceptance: '验收标准（每行一项）', empty: '暂无可见任务。', projects: '项目', operator: '操作者', runtime: '执行', member: '成员',
  viewer: '只读成员', editor: '编辑者', signedIn: '账号', backlog: '储备', todo: '待办', in_progress: '进行中', in_review: '待验收',
  blocked: '阻塞', done: '完成', canceled: '已取消',
}
const chinese = navigator.language.toLowerCase().startsWith('zh')
const t = chinese ? zh : en
document.documentElement.lang = chinese ? 'zh-CN' : 'en'
document.title = t.title

function TaskCard({ item, editor, busy, save }: {
  item: MemberBoard['tasks'][number]
  editor: boolean
  busy: boolean
  save: (task: TaskView, form: HTMLFormElement, action: 'edited' | 'commented') => void
}) {
  const { task, comments } = item
  const [template, setTemplate] = useState<string>(task.workflow?.template ?? '')
  const [steps, setSteps] = useState(task.workflow?.template === 'task.standard.v1' ? task.workflow.steps.join('\n') : '')
  const submit = (event: FormEvent<HTMLFormElement>, action: 'edited' | 'commented') => {
    event.preventDefault()
    save(task, event.currentTarget, action)
  }
  return <article><header><h2>{task.title}</h2><span>{t[task.status]}</span></header><p>{task.description}</p>
    {task.riskLevel && <p><strong>{t.riskLevel}</strong> · {t[task.riskLevel]}</p>}
    {task.workflow && <p><strong>{t.workflow}</strong> · {t[task.workflow.template]}</p>}
    {task.workflow?.template === 'task.standard.v1' && task.workflow.steps.length > 0 &&
      <ol>{task.workflow.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>}
    {task.constraints && <p><strong>{t.constraints}</strong><br />{task.constraints}</p>}
    <ul>{task.acceptance.map((text, index) => <li key={index}>{text}</li>)}</ul>
    {editor && task.status !== 'done' && task.status !== 'canceled' && <details><summary>{t.save}</summary>
      <form onSubmit={(event) => { submit(event, 'edited') }}>
        <label>{t.name}<input name="title" required defaultValue={task.title} /></label>
        <label>{t.description}<textarea name="description" defaultValue={task.description} /></label>
        <label>{t.constraints}<textarea name="constraints" defaultValue={task.constraints ?? ''} /></label>
        <label>{t.workflow}<select name="workflow" value={template} onChange={(event) => { setTemplate(event.target.value) }}>
          <option value="">{t.unspecified}</option>
          <option value="task.quick.v1">{t['task.quick.v1']}</option>
          <option value="task.standard.v1">{t['task.standard.v1']}</option>
        </select></label>
        {template === 'task.standard.v1' && <label>{t.steps}<textarea name="steps"
          value={steps} onChange={(event) => { setSteps(event.target.value) }} /></label>}
        <label>{t.riskLevel}<select name="riskLevel" defaultValue={task.riskLevel ?? ''}>
          <option value="">{t.unspecified}</option>
          {riskLevel.options.map(level => <option key={level} value={level}>{t[level]}</option>)}
        </select></label>
        <label>{t.acceptance}<textarea name="acceptance" defaultValue={task.acceptance.join('\n')} /></label>
        <button disabled={busy}>{t.save}</button>
      </form></details>}
    {comments.map((entry, index) => <p key={index}><b>{entry.author ?? t[entry.actor]}</b> · {entry.text}</p>)}
    {editor && <form onSubmit={(event) => { submit(event, 'commented') }}>
      <label>{t.comment}<input name="text" required /></label><button disabled={busy}>{t.comment}</button>
    </form>}
  </article>
}

class RequestError extends Error {
  constructor(readonly status: number) { super('Taskboard HTTP ' + String(status)) }
}

function TeamPage() {
  const [key, setKey] = useState('')
  const [board, setBoard] = useState<MemberBoard>()
  const [project, setProject] = useState<ProjectId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = async (id: ProjectId | null, body?: object) => {
    const url = new URL('./taskboard-team-api', document.baseURI)
    if (id) url.searchParams.set('project', id)
    const result = await fetch(url, { method: body ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store',
      headers: { authorization: 'Bearer ' + key.trim(), 'content-type': 'application/json' },
      ...(body && { body: JSON.stringify(body) }) })
    if (!result.ok) throw new RequestError(result.status)
    return result
  }
  const load = async (id: ProjectId | null, body?: object) => {
    setBusy(true)
    setError('')
    try {
      if (body) await request(id, body)
      const next = memberBoard.parse(await (await request(id)).json())
      setBoard(next)
      setProject(id)
    } catch (cause) {
      const status = cause instanceof RequestError ? cause.status : undefined
      if (status === 401 || status === 403) { setBoard(undefined); setProject(null); setKey('') }
      setError(status === 401 || status === 403 ? t.denied : status === 409 ? t.conflict : t.failed)
    } finally { setBusy(false) }
  }
  const save = (task: TaskView, form: HTMLFormElement, action: 'edited' | 'commented') => {
    const data = new FormData(form)
    const text = (name: string) => {
      const field = data.get(name)
      return typeof field === 'string' ? field : ''
    }
    const template = text('workflow')
    const workflow = template === 'task.standard.v1' ? { template, steps: text('steps').split('\n').map(s => s.trim()).filter(Boolean) }
      : template === 'task.quick.v1' ? { template } : null
    const fields = action === 'commented' ? { text: text('text') } : { requirements: {
      title: text('title'), description: text('description'), constraints: text('constraints'), riskLevel: text('riskLevel') || null,
      acceptance: text('acceptance').split('\n').map(line => line.trim()).filter(Boolean),
      workflow, priority: task.priority, labels: task.labels,
    } }
    void load(task.projectId, { commandId: randomUUID(), projectId: task.projectId, taskId: task.id,
      expectedVersion: task.version, action, ...fields })
  }
  const selected = board?.projects.find(entry => entry.id === project)
  return <><header><h1>{t.title}</h1>{board && <button disabled={busy} onClick={() => {
    setKey(''); setBoard(undefined); setProject(null); setError('')
  }}>{t.signOut}</button>}</header>
  {error && <p role="alert">{error}</p>}
  {!board ? <form onSubmit={(event) => { event.preventDefault(); void load(null) }}>
    <label>{t.key}<input type="password" value={key} required onChange={(event) => { setKey(event.target.value) }} /></label>
    <button disabled={busy}>{t.signIn}</button></form> : <>
    <p>{t.signedIn} · {board.name}</p>
    <nav><label>{t.projects}<select value={project ?? ''} disabled={busy} onChange={(event) => { void load(event.target.value as ProjectId || null) }}>
      <option value="">{t.choose}</option>{board.projects.map(entry => <option key={entry.id} value={entry.id}>{entry.title}</option>)}
    </select></label><button disabled={busy} onClick={() => { void load(project) }}>{t.reload}</button></nav>
    {selected && <><p>{selected.title} · {t[selected.role]}</p>{board.tasks.length === 0 && <p>{t.empty}</p>}
      {board.tasks.map(item => <TaskCard key={item.task.id + '/' + String(item.task.version)} item={item} editor={selected.role === 'editor'} busy={busy} save={save} />)}</>}
  </>}
  </>
}

const mount = document.getElementById('team')
if (mount) createRoot(mount).render(<TeamPage />)
