/** Run launch confirmations and the selected task’s execution history. */
import { projectScriptLabel } from './project-script.ts'
import { Fragment, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Button, Checkbox, Modal, Pill, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  NativeTaskExecutor, ProjectId, TaskboardExecutionRoute, TaskboardSdkRoute, TaskDetail, TaskId,
  TaskRunCheckpoint, TaskRunId, RunTaskSpec, TaskRunSummary,
  TaskStartCommand, TaskView, WorkspaceInspection,
} from '@deepseek-ai/dsh-api-taskboard-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TaskboardPage.module.css'
import { WorkflowDetails } from './WorkflowDetails.tsx'

type Translate = PropsLocale<'taskboard'>['t']
type WorkspaceMode = 'original' | 'isolated' | 'resume'

function routeLabel(route: TaskboardSdkRoute, executor: 'dsh-sdk' | NativeTaskExecutor | undefined, t: Translate): string {
  const sdk = `${route.provider} · ${route.model}`
  return executor && executor !== 'dsh-sdk' ? `${t(executor)} (${t('sdkExecutor')} · ${sdk})` : sdk
}

/** Browser actions over the deployed Taskboard run controller. */
export interface RunActions {
  downloadRunSpec: (spec: RunTaskSpec) => Promise<boolean>
  getRunSpec: (projectId: ProjectId, taskId: TaskId, runId: TaskRunId) => Promise<RunTaskSpec>
  inspectRun: (task: TaskView, previous: TaskRunSummary | undefined, resume: boolean) => Promise<WorkspaceInspection>
  startRun: (task: TaskView, input: Pick<TaskStartCommand, 'mode' | 'previousRun' | 'confirmation' | 'materials' | 'whenReady' | 'confirmedRoute' | 'confirmedScript' | 'nativeExecutor'>) => Promise<boolean>
  stopRun: (task: TaskView, runId: TaskRunId, force: boolean) => Promise<boolean>
  cancelRun: (task: TaskView, runId: TaskRunId) => Promise<boolean>
  recheckRun: (task: TaskView, runId: TaskRunId) => Promise<boolean>
}

function NativeActivity({ run, t }: { run: TaskRunSummary; t: Translate }) {
  if (!run.nativeActivity) return null
  const kinds = Object.keys(run.nativeActivity) as (keyof NonNullable<TaskRunSummary['nativeActivity']>)[]
  return <details className={css.history}>
    <summary>{t('native.heading')}</summary>
    {kinds.length ? <dl className={css.facts}>{kinds.map(kind =>
      <Fragment key={kind}><dt>{t(`native.${kind}`)}</dt><dd>{run.nativeActivity?.[kind]}</dd></Fragment>)}</dl>
      : <p>{t('native.empty')}</p>}
  </details>
}

function PreviousCheckpoint({ point, t }: { point: TaskRunCheckpoint; t: Translate }) {
  const event = point.lastEvent
  return <details className={css.history}>
    <summary>{t('previousCheckpoint')}</summary>
    <dl className={css.facts}>
      <dt>{t('runId')}</dt><dd><code>{point.runId}</code></dd>
      <dt>{t('sessionId')}</dt><dd><code>{point.sessionId}</code></dd>
      <dt>{t('revision')}</dt><dd>{point.revision}</dd>
      <dt>{t('inputReceipt')}</dt><dd>{point.receipt ? <code>{point.receipt}</code> : t('noRecordedValue')}</dd>
      <dt>{t('lastEvent')}</dt><dd>{event ? <><code>#{event.seq} · {event.type}</code> · <time
        dateTime={new Date(event.time).toISOString()}>{new Date(event.time).toLocaleString()}</time></> : t('noRecordedValue')}</dd>
    </dl>
  </details>
}

function RunInputDialog({ projectId, taskId, runId, actions, t, close }: {
  projectId: ProjectId
  taskId: TaskId
  runId: TaskRunId
  actions: RunActions
  t: Translate
  close: () => void
}) {
  const [spec, setSpec] = useState<RunTaskSpec>()
  const input = spec?.input
  const { getRunSpec } = actions
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void getRunSpec(projectId, taskId, runId).then((value) => {
      if (!controller.signal.aborted) setSpec(value)
    }, () => {
      if (!controller.signal.aborted) setFailed(true)
    })
    return () => { controller.abort() }
  }, [projectId, taskId, runId, getRunSpec, attempt])
  return <Modal open title={t('savedInput')} closeLabel={t('close')} onClose={close} className={css.reviewModal ?? ''}>
    {failed && <div role="alert">{t('inputReadFailed')} <Button variant="ghost" onClick={() => {
      setFailed(false)
      setAttempt(value => value + 1)
    }}>{t('retry')}</Button></div>}
    {!failed && !input && <p role="status">{t('loading')}</p>}
    {spec && input && <div className={css.section}>
      <h3>{input.title}</h3>
      <p>{t('revision')} {spec.revision}{spec.route && <> · {routeLabel(spec.route, spec.authorization?.executor, t)}</>}</p>
      {spec.previousCheckpoint && <PreviousCheckpoint point={spec.previousCheckpoint} t={t} />}
      {spec.authorization && <details className={css.history}>
        <summary>{t('startAuthorization')}</summary>
        <dl className={css.facts}>
          <dt>{t('executor')}</dt><dd>{t(spec.authorization.executor === 'dsh-sdk' ? 'sdkExecutor' : spec.authorization.executor)}</dd>
          <dt>{t('modelRoute')}</dt><dd>{t(spec.authorization.routeSelection)}</dd>
          <dt>{t('authorizedScope')}</dt><dd>{t(spec.authorization.scope)}</dd>
          <dt>{t('authorizedAt')}</dt><dd><time dateTime={spec.authorization.authorizedAt}>
            {new Date(spec.authorization.authorizedAt).toLocaleString()}</time></dd>
          <dt>{t('startCommandId')}</dt><dd><code>{spec.authorization.commandId}</code></dd>
        </dl>
      </details>}
      <dl className={css.facts}>
        <dt>{t('executionDirectory')}</dt><dd><code>{spec.workspace.directory}</code></dd>
        {spec.workspace.branch && <><dt>{t('branch')}</dt><dd>{spec.workspace.branch}</dd></>}
        {spec.workspace.baseline && <><dt>{t('baseline')}</dt><dd><code>{spec.workspace.baseline}</code></dd></>}
      </dl>
      <Button size="sm" variant="outline" onClick={() => { void actions.downloadRunSpec(spec) }}>{t('downloadRunSpec')}</Button>
      <p className={css.prose}>{input.description}</p>
      {spec.projectScript && <p><strong>{t('projectScript')}</strong> · {projectScriptLabel(spec.projectScript)}</p>}
      {input.riskLevel && <p><strong>{t('riskLevel')}</strong> · {t(input.riskLevel)}</p>}
      {input.workflow && <WorkflowDetails workflow={input.workflow} milestone={input.milestone} t={t} />}
      {input.constraints && <p className={css.prose}><strong>{t('constraints')}</strong><br />{input.constraints}</p>}
      <section><h3>{t('inputCriteria')}</h3><ol>{input.acceptance.map((criterion, i) => <li key={i}>{criterion}</li>)}</ol></section>
      {input.reviewFeedback && <section><h3>{t('reviewFeedback')}</h3><p className={css.prose}>{input.reviewFeedback}</p></section>}
      {input.materials.map((material, i) => <details key={i} className={css.history}>
        <summary>{material.reference}</summary><pre className={css.diff}>{material.text}</pre>
      </details>)}
    </div>}
  </Modal>
}

function StartRunDialog({ task, previous, milestone, route, actions, close, t }: {
  milestone?: number | undefined
  task: TaskView
  previous: TaskRunSummary | undefined
  route: TaskboardExecutionRoute
  actions: RunActions
  close: () => void
  t: Translate
}) {
  const [mode, setMode] = useState<WorkspaceMode>('original')
  const [executor, setExecutor] = useState<'dsh-sdk' | NativeTaskExecutor>('dsh-sdk')
  const [whenReady, setWhenReady] = useState(false)
  const [seen, setSeen] = useState<WorkspaceInspection>()
  const [failed, setFailed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [materials, setMaterials] = useState<TaskStartCommand['materials']>([])
  const [readingMaterials, setReadingMaterials] = useState(false)
  const [materialError, setMaterialError] = useState(false)
  const fileRead = useRef(0)
  const [busy, setBusy] = useState(false)
  const [check, setCheck] = useState(0)
  const [selected] = useState({ task, previous, milestone, route })
  const routeChanged = route.state !== 'configured' || route.model !== selected.route.model || route.provider !== selected.route.provider
    || (executor !== 'dsh-sdk' && !route.nativeExecutors?.includes(executor))
    || projectScriptLabel(route.projectScript) !== projectScriptLabel(selected.route.projectScript)
  const { inspectRun, startRun } = actions

  useEffect(() => {
    const controller = new AbortController()
    void inspectRun(selected.task, selected.previous, mode === 'resume').then((result) => {
      if (!controller.signal.aborted) {
        setSeen(result)
        setChecking(false)
      }
    }, () => {
      if (!controller.signal.aborted) {
        setFailed(true)
        setChecking(false)
      }
    })
    return () => { controller.abort() }
  }, [inspectRun, check, mode, selected])

  const inspect = (selection: WorkspaceMode, again = false) => {
    setFailed(false)
    setChecking(true)
    setMode(selection)
    if (selection !== 'isolated') setWhenReady(false)
    if (again) setCheck(value => value + 1)
  }
  const selectMaterials = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    const request = ++fileRead.current
    setReadingMaterials(true)
    setMaterialError(false)
    try {
      const contents = await Promise.all(files.map(async file => ({ reference: file.name, text: await file.text() })))
      if (request === fileRead.current) setMaterials(contents)
    } catch {
      if (request === fileRead.current) {
        setMaterials([])
        setMaterialError(true)
      }
    } finally {
      if (request === fileRead.current) setReadingMaterials(false)
    }
  }
  const submit = async () => {
    const { provider, model } = selected.route
    if (!seen || routeChanged || !provider || !model) return
    setBusy(true)
    try {
      if (await startRun(selected.task, {
        ...(executor !== 'dsh-sdk' && { nativeExecutor: executor }),
        confirmedRoute: { provider, model }, ...(selected.route.projectScript && { confirmedScript: selected.route.projectScript }),
        ...(whenReady && mode === 'isolated' && { whenReady: true as const }),
        previousRun: selected.previous?.runId ?? null, mode: mode === 'resume' ? 'resume' : 'fresh',
        confirmation: mode === 'isolated' ? null : seen, materials,
      })) close()
    } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={close} closeLabel={t('close')} title={t('startRun')}>
      <div className={css.form}>
        {!!selected.route.nativeExecutors?.length && <div className={css.controls} role="group" aria-label={t('executor')}>
          {(['dsh-sdk', ...selected.route.nativeExecutors] as const).map(option => <Pill key={option}
            active={executor === option} aria-pressed={executor === option}
            onClick={() => { setExecutor(option); if (option !== 'dsh-sdk' && mode === 'resume') inspect('original') }}>
            {t(option === 'dsh-sdk' ? 'sdkExecutor' : option)}
          </Pill>)}
        </div>}
        <div className={css.controls} role="group" aria-label={t('executionDirectory')}>
          {(['original', 'isolated', 'resume'] as const).map(option => (
            <Pill key={option} active={mode === option} aria-pressed={mode === option}
              disabled={(option === 'resume' && (!selected.previous?.receipt || executor !== 'dsh-sdk'
                || (selected.previous.authorization?.executor ?? 'dsh-sdk') !== 'dsh-sdk')) || (option === 'isolated' && !seen?.repository)}
              onClick={() => { if (option !== mode) inspect(option) }}>{t(option)}</Pill>
          ))}
        </div>
        {executor !== 'dsh-sdk' && <p>{t('nativePolicy')}</p>}
        <p>{selected.route.provider && selected.route.model && routeLabel({ provider: selected.route.provider, model: selected.route.model }, executor, t)} · {t('revision')} {selected.task.revision}</p>
        {selected.route.projectScript && <p><strong>{t('projectScript')}</strong> · {projectScriptLabel(selected.route.projectScript)}</p>}
        {selected.task.riskLevel && <p><strong>{t('riskLevel')}</strong> · {t(selected.task.riskLevel)}</p>}
        {selected.task.workflow && <WorkflowDetails workflow={selected.task.workflow} milestone={selected.milestone} t={t} />}
        {selected.previous && mode !== 'resume' && <p>{t('freshSessionContext')}</p>}
        {selected.previous && <PreviousCheckpoint point={selected.previous} t={t} />}
        {selected.previous?.sessionNotIncluded && mode === 'resume' && <p>{t('restoreSessionFiles')}</p>}
        {routeChanged && <div role="alert">{t('routeChanged')}</div>}
        {checking && <div role="status">{t('checkingDirectory')}</div>}
        {failed && <div role="alert">
          {t('directoryCheckFailed')} <Button variant="ghost" size="sm" onClick={() => { inspect(mode, true) }}>{t('retry')}</Button>
        </div>}
        {seen && !checking && !failed && <dl className={css.facts}>
          <dt>{t('projectDirectory')}</dt><dd>{seen.directory}</dd>
          {seen.branch && <><dt>{t('branch')}</dt><dd>{seen.branch}</dd></>}
          {seen.head && <><dt>{t('commit')}</dt><dd><code>{seen.head}</code></dd></>}
          {seen.dirty && <><dt>{t('status')}</dt><dd>{t('localChanges')}</dd></>}
        </dl>}
        {mode === 'isolated' && <Checkbox checked={whenReady} onChange={setWhenReady} label={t('claimOnce')} />}
        <label>{t('materials')}
          <input type="file" accept="text/*,.md,.json,.yaml,.yml,.ts,.js,.txt" multiple
            onChange={(event) => { void selectMaterials(event) }} />
        </label>
        {materialError && <div role="alert">{t('materialFailed')}</div>}
        <div className={css.formEnd}>
          <Button variant="ghost" onClick={close}>{t('cancel')}</Button>
          <Button variant="primary" disabled={busy || routeChanged || checking || failed || !seen || readingMaterials || materialError}
            onClick={() => { void submit() }}>{t('queueRun')}</Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Render Run status, launch choices and targeted stop controls.
 * @param props - task detail, launcher configuration and authenticated actions.
 * @returns the Run section and any active confirmation dialog.
 */
export function RunPanel({ detail, route, actions, t }: {
  detail: TaskDetail
  route: TaskboardExecutionRoute | null
  actions: RunActions
  t: Translate
}) {
  const { task, runs } = detail
  const [inputId, setInputId] = useState<TaskRunId>()
  const inputRun = runs.find(run => run.runId === inputId)
  const latest = runs.at(-1)
  const active = latest?.state === 'preparing' || latest?.state === 'running'
  const waiting = latest?.state === 'queued'
  const previous = runs.findLast(run => run.state !== 'queued' && run.state !== 'canceled')
  const [confirm, setConfirm] = useState<'start' | 'force' | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  return (
    <section className={css.section} aria-label={t('runs')}>
      <header className={css.detailHeading}>
        <h3>{t('runs')}</h3>
        {task.status === 'todo' && !waiting && !active && !task.archived && <Button variant="primary" size="sm"
          disabled={!route || route.state !== 'configured' || task.acceptance.length === 0 || !task.description.trim()}
          onClick={() => { setConfirm('start') }}>{t('startRun')}</Button>}
      </header>
      {task.status === 'todo' && route?.state !== 'configured' && <p className={css.muted}>{t('routeUnavailable')}</p>}
      {task.status === 'todo' && route?.state === 'configured' && task.acceptance.length === 0 && <p>{t('criteriaRequired')}</p>}
      {latest && <div className={css.section}>
        <div className={css.controls}>
          <Tag tone={latest.connection === 'suspect' ? 'warning' : 'neutral'}>{t(`run.${latest.state}`)}</Tag>
          {latest.control !== 'normal' && <Tag>{t(`control.${latest.control}`)}</Tag>}
          {latest.whenReady && <Tag>{t('authorizedOnce')}</Tag>}
          {latest.connection === 'suspect' && <Tag tone="warning">{t('connectionSuspect')}</Tag>}
          {latest.revision !== task.revision && <Tag tone="warning">{t('runRevision')} {latest.revision}</Tag>}
        </div>
        <Button size="sm" variant="ghost" onClick={() => { setInputId(latest.runId) }}>{t('savedInput')}</Button>
        {latest.route && <div>{routeLabel(latest.route, latest.authorization?.executor, t)}</div>}
        <NativeActivity run={latest} t={t} />
        {latest.lastEvent && <div className={css.muted}>{t('lastEvent')} <code>{latest.lastEvent.type}</code></div>}
        {latest.endReason && <div>{t('endReason')} {latest.endReason}</div>}
        {latest.launchFailure && <div>{t('launchFailure')} {latest.launchFailure}</div>}
        {latest.inputAttemptedAt && !latest.receipt && (!active || latest.connection === 'suspect') && <div>{t('inputUnknown')}</div>}
        {latest.sessionNotIncluded && <div>{t('sessionNotIncluded')}</div>}
        {latest.stopFailure && <div>{t(`stop.${latest.stopFailure}`)}</div>}
        <div className={css.controls}>
          {waiting && <Button variant="outline" size="sm"
            onClick={() => { void actions.cancelRun(task, latest.runId) }}>{t('cancelRun')}</Button>}
          {active && latest.control === 'normal' && <Button variant="outline" size="sm"
            onClick={() => { void actions.stopRun(task, latest.runId, false) }}>{t('stopRun')}</Button>}
          {active && latest.stopFailure && <>
            <Button variant="outline" size="sm" onClick={() => { void actions.recheckRun(task, latest.runId) }}>{t('recheckRun')}</Button>
            <Button variant="ghost" size="sm" onClick={() => { setAcknowledged(false); setConfirm('force') }}>{t('forceStop')}</Button>
          </>}
        </div>
      </div>}
      {runs.length > 1 && <details className={css.history}>
        <summary>{t('previousRuns')}</summary>
        <ol>{runs.slice(0, -1).map(run => (
          <li key={run.runId}>{t(`run.${run.state}`)} · {t('revision')} {run.revision}
            {run.route && <> · {routeLabel(run.route, run.authorization?.executor, t)}</>}
            <Button size="sm" variant="ghost" onClick={() => { setInputId(run.runId) }}>{t('savedInput')}</Button>
            <NativeActivity run={run} t={t} /></li>
        ))}</ol>
      </details>}
      {inputRun && <RunInputDialog key={inputRun.runId} projectId={task.projectId} taskId={task.id} runId={inputRun.runId}
        actions={actions} t={t} close={() => { setInputId(undefined) }} />}
      {confirm === 'start' && route && <StartRunDialog task={task} previous={previous} milestone={detail.nextMilestone} route={route} actions={actions} t={t}
        close={() => { setConfirm(null) }} />}
      {confirm === 'force' && latest && <Modal open onClose={() => { setConfirm(null) }} title={t('forceStop')} closeLabel={t('close')}
        footer={<Button variant="primary" disabled={!acknowledged} onClick={() => {
          void actions.stopRun(task, latest.runId, true).then((ok) => { if (ok) setConfirm(null) })
        }}>{t('forceStop')}</Button>}>
        <Checkbox checked={acknowledged} onChange={setAcknowledged} label={t('forceAcknowledge')} />
      </Modal>}
    </section>
  )
}
