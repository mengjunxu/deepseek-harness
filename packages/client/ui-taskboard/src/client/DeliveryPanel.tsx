/** Delivery evidence and explicit human review. */
import { projectScriptLabel } from './project-script.ts'
import { useEffect, useState } from 'react'
import { Button, Input, Modal, PathLabel, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  CommandId, DeliveryFileDiff, DeliveryId, DeliverySummary, ReviewSummary, ModelReviewRoute, TaskDeliveryDetail,
  TaskReviewCommand, TaskView,
} from '@deepseek-ai/dsh-api-taskboard-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TaskboardPage.module.css'

type Translate = PropsLocale<'taskboard'>['t']
type Decision = Pick<TaskReviewCommand, 'verdict' | 'feedback' | 'waivers' | 'assessmentId'>
type DiffResult = { path: string; result: DeliveryFileDiff | null }

/** Delivery reads and the operator-only review action. */
export interface DeliveryActions {
  requestCoverageReview: (task: TaskView, delivery: DeliverySummary, route: ModelReviewRoute) => Promise<boolean>
  downloadReviewPackage: (task: TaskView, id: DeliveryId) => Promise<boolean>
  getDelivery: (task: TaskView, id: DeliveryId) => Promise<TaskDeliveryDetail>
  getDiff: (task: TaskView, id: DeliveryId, path: string) => Promise<DeliveryFileDiff>
  reviewDelivery: (task: TaskView, delivery: DeliverySummary, decision: Decision) => Promise<boolean>
}

/**
 * Display sealed evidence, a read-only comparison and review controls.
 * @param props - immutable delivery selection, task and authenticated review actions.
 * @returns the selected delivery’s modal.
 */
export function DeliveryPanel({ task, selected, current, reviews, actions, t, close }: {
  task: TaskView
  selected: DeliverySummary
  current: boolean
  reviews: ReviewSummary[]
  actions: DeliveryActions
  t: Translate
  close: () => void
}) {
  const [delivery, setDelivery] = useState<TaskDeliveryDetail>()
  const [failed, setFailed] = useState(false)
  const [diff, setDiff] = useState<DiffResult>()
  const [feedback, setFeedback] = useState('')
  const [assessmentId, setAssessmentId] = useState<CommandId>()
  const [reasons, setReasons] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [expiredRequest, setExpiredRequest] = useState<string>()
  const [selection] = useState({ task, id: selected.id })
  const { getDelivery, getDiff, reviewDelivery } = actions
  useEffect(() => {
    const controller = new AbortController()
    void getDelivery(selection.task, selection.id).then((value) => {
      if (!controller.signal.aborted) setDelivery(value)
    }, () => {
      if (!controller.signal.aborted) setFailed(true)
    })
    return () => { controller.abort() }
  }, [getDelivery, selection])

  const coverageReview = async (request: boolean) => {
    if (!delivery || reviewBusy) return
    setReviewBusy(true)
    try {
      if (request && delivery.reviewRoute) await actions.requestCoverageReview(task, selected, delivery.reviewRoute)
      setDelivery(await getDelivery(selection.task, selection.id))
    } catch {
      setFailed(true)
    } finally { setReviewBusy(false) }
  }
  const latest = delivery?.modelReviews.at(-1)
  useEffect(() => {
    if (latest?.state !== 'requested') return
    const timer = setTimeout(() => { setExpiredRequest(latest.commandId) }, Math.max(0, Date.parse(latest.expiresAt) - Date.now()))
    return () => { clearTimeout(timer) }
  }, [latest])
  const pending = latest?.state === 'requested' && latest.commandId !== expiredRequest && Date.parse(latest.expiresAt) > Date.now()
  const required = delivery?.verification.flatMap((item, index) =>
    item.status === 'failed' || item.status === 'not-run' ? [{ item, index }] : []) ?? []
  const reasonRequired = delivery?.validationResults.some(check => check.status !== 'passed')
  const canReview = !!delivery && current && reviews.length === 0 && task.status === 'in_review'
  const stale = delivery?.revision !== task.revision
  const compare = (path: string) => {
    setDiff({ path, result: null })
    void getDiff(task, selected.id, path).then((result) => {
      setDiff(current => current?.path === path ? { path, result } : current)
    }, () => {
      setDiff(current => current?.path === path ? undefined : current)
      setFailed(true)
    })
  }
  const decide = async (verdict: Decision['verdict']) => {
    setBusy(true)
    try {
      const waivers = verdict === 'accept' ? required.map(({ item, index }) => ({ criterion: item.criterion, reason: reasons[index] ?? '' })) : []
      if (await reviewDelivery(task, selected, { verdict, feedback, waivers, ...(verdict === 'return' && assessmentId && { assessmentId }) })) close()
    } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={close} closeLabel={t('close')} title={t('review')} className={css.reviewModal ?? ''} contentClassName={css.reviewContent ?? ''}>
      {failed && <p role="alert">{t('deliveryReadFailed')}</p>}
      {!delivery && !failed && <p role="status">{t('loading')}</p>}
      {delivery && <div className={css.section}>
        <header className={css.section}>
          <h3>{delivery.summary}</h3>
          {delivery.milestone && <p>{t('milestone')} {delivery.milestone.position}/{delivery.milestone.total} · {delivery.milestone.goal}</p>}
          <div className={css.controls}>
            <Tag>{t('delivery')} {delivery.version}</Tag><Tag>{t('revision')} {delivery.revision}</Tag>
            {stale && <Tag tone="warning">{t('staleDelivery')}</Tag>}
          </div>
        </header>
        {delivery.changes.length > 0 && <section className={css.section}>
          <h3>{t('changes')}</h3>
          <ul>{delivery.changes.map((change, index) => <li key={index}>{change}</li>)}</ul>
        </section>}
        <section className={css.section}>
          <h3>{t('verification')}</h3>
          <ol>{delivery.verification.map((item, index) => (
            <li key={index}>
              <Tag tone={item.status === 'passed' ? 'success' : 'neutral'}>{t(`check.${item.status}`)}</Tag> {item.criterion}
              <div className={css.prose}>{item.evidence}</div>
            </li>
          ))}</ol>
        </section>
        {!latest && <p>{t(delivery.modelReviewStatus === 'not-requested' ? 'modelReviewNotRequested' : 'modelReviewNotRecorded')}</p>}
        {delivery.modelReviews.map(attempt => <section key={attempt.commandId} className={css.section}>
          <h3>{t('coverageReview')}</h3>
          <p>{attempt.provider} · {attempt.model} · {t(`review.${attempt.state}`)}</p>
          <time className={css.muted} dateTime={attempt.requestedAt}>{new Date(attempt.requestedAt).toLocaleString()}</time>
          {attempt.summary && <p className={css.prose}>{attempt.summary}</p>}
          {canReview && attempt.state === 'completed' && attempt.summary && !feedback && <Button variant="outline" onClick={() => {
            setFeedback(attempt.summary ?? '')
            setAssessmentId(attempt.commandId)
          }}>{t('draftReturn')}</Button>}
        </section>)}
        {delivery.reviewRoute && <div>
          <p>{t('reviewSendsSummary')} {delivery.reviewRoute.provider} · {delivery.reviewRoute.model}</p>
          {!pending && latest?.state !== 'completed' && delivery.modelReviews.length < delivery.reviewRoute.maxAttempts &&
            <Button variant="outline" disabled={reviewBusy} onClick={() => { void coverageReview(true) }}>{t('requestCoverageReview')}</Button>}
          {latest?.state === 'requested' && <Button variant="ghost" disabled={reviewBusy}
            onClick={() => { void coverageReview(false) }}>{t('refreshReview')}</Button>}
          {reviewBusy && <span role="status">{t('loading')}</span>}
          {!pending && latest?.state === 'requested' && <p>{t('reviewDeadlineElapsed')}</p>}
          {!pending && latest?.state !== 'completed' && delivery.modelReviews.length >= delivery.reviewRoute.maxAttempts && <p>{t('reviewLimit')}</p>}
        </div>}
        <div><Button variant="ghost" size="sm" onClick={() => {
          void actions.downloadReviewPackage(task, delivery.id)
        }}>{t('downloadReviewPackage')}</Button></div>
        {delivery.validationResults.map(check => <section key={check.check} className={css.section}>
          <h3>{check.check === 'git-diff-check' ? t('gitDiffCheck') : projectScriptLabel(delivery.code?.projectScriptCheck?.script)}</h3>
          <Tag tone={check.status === 'passed' ? 'success' : 'warning'}>{t(`check.${check.status}`)}</Tag>
          {check.exitCode !== null && <div>{t('checkExitCode')} <code>{check.exitCode}</code></div>}
          {check.reason && <p>{t(`check.${check.reason}`)}</p>}
          {check.observedAt && <time dateTime={check.observedAt}>{new Date(check.observedAt).toLocaleString()}</time>}
        </section>)}
        {delivery.knownIssues.length + delivery.unfinished.length > 0 && <section className={css.section}>
          <h3>{t('remainingWork')}</h3>
          <ul>{[...delivery.knownIssues, ...delivery.unfinished].map((item, index) => <li key={index}>{item}</li>)}</ul>
        </section>}
        {delivery.code && <section className={css.section}>
          <h3>{t('reviewFiles')}</h3>
          {delivery.code.head ? <div className={css.muted}>
            {t('baseline')} <code>{delivery.code.baseline?.slice(0, 12)}</code> · {t('commit')} <code>{delivery.code.head.slice(0, 12)}</code>
          </div> : <div className={css.muted}>{t('declaredFiles')}</div>}
          <div className={css.controls}>{delivery.code.files.map(file => (
            <Button key={file.path} variant="outline" size="sm" onClick={() => { setFailed(false); compare(file.path) }}>
              <PathLabel path={file.path} />
            </Button>
          ))}</div>
          {diff?.result && ('text' in diff.result
            ? <pre className={css.diff} aria-label={diff.path}>{diff.result.text}</pre>
            : <p>{t(`diff.${diff.result.kind}`)}</p>)}
          {diff && !diff.result && <p role="status">{t('loading')}</p>}
        </section>}
        {reviews.map(review => <section className={css.section} key={review.commandId} aria-label={t('humanDecision')}>
          <h3>{t(review.verdict === 'accept' ? 'activity.accepted' : 'activity.returned')}</h3>
          <time className={css.muted} dateTime={review.time}>{new Date(review.time).toLocaleString()}</time>
          {review.assessmentId && <p>{t('returnAssessment')} · {review.assessmentId}</p>}
          {review.feedback && <p className={css.prose}>{review.feedback}</p>}
          {review.waivers.length > 0 && <div>
            <h4>{t('humanWaiver')}</h4>
            <ol>{review.waivers.map((waiver, index) =>
              <li key={index}>{waiver.criterion}<div className={css.prose}>{waiver.reason}</div></li>)}</ol>
          </div>}
        </section>)}
        {canReview && <div className={css.form}>
          {required.length > 0 && !stale && <section className={css.section}>
            <h3>{t('humanWaiver')}</h3>
            {required.map(({ item, index }) => <label key={index}>{item.criterion}
              <Input aria-label={item.criterion} placeholder={t('waiverReason')} value={reasons[index] ?? ''} onChange={(event) => {
                const reason = event.target.value
                setReasons(previous => ({ ...previous, [index]: reason }))
              }} />
            </label>)}
          </section>}
          <label>{t(reasonRequired && !assessmentId ? 'projectCheckReason' : 'reviewFeedback')}<textarea value={feedback} onChange={(event) => {
            setFeedback(event.target.value)
            if (!event.target.value) setAssessmentId(undefined)
          }} /></label>
          {assessmentId && <div><Button variant="ghost" onClick={() => { setFeedback(''); setAssessmentId(undefined) }}>{t('discardReturnDraft')}</Button></div>}
          <div className={css.formEnd}>
            <Button variant="outline" disabled={busy || !feedback.trim()} onClick={() => { void decide('return') }}>{t('returnDelivery')}</Button>
            <Button variant="primary" disabled={busy || stale || !!assessmentId || (reasonRequired && !feedback.trim()) || required.some(({ index }) => !reasons[index]?.trim())}
              onClick={() => { void decide('accept') }}>{t(delivery.milestone && delivery.milestone.position < delivery.milestone.total ? 'acceptStage' : 'acceptDelivery')}</Button>
          </div>
        </div>}
      </div>}
    </Modal>
  )
}
