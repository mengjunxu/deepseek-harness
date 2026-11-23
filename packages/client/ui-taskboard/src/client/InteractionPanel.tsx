/** Separate operator actions for native SDK approval and question requests. */
import { useState } from 'react'
import { Button, Checkbox, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TaskboardInbox, TaskInteractionReply, TaskPendingInteraction } from '@deepseek-ai/dsh-api-taskboard-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TaskboardPage.module.css'

type Translate = PropsLocale<'taskboard'>['t']

type QuestionRequest = Extract<TaskPendingInteraction, { kind: 'question' }>
type ApprovalRequest = Extract<TaskPendingInteraction, { kind: 'approval' }>
type QuestionReply = Extract<TaskInteractionReply, { kind: 'question' }>['result']

function QuestionCard({ request, respond, t }: {
  request: QuestionRequest
  respond: (result: QuestionReply) => Promise<boolean>
  t: Translate
}) {
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const ready = request.questions.every(question => (selected[question.id]?.length ?? 0) > 0 || !!custom[question.id]?.trim())
  const answer = async (cancelled: boolean) => {
    setBusy(true)
    try {
      await respond(cancelled ? { cancelled: true } : {
        answers: request.questions.map((question) => {
          const text = custom[question.id]?.trim()
          return { id: question.id, selected: selected[question.id] ?? [], ...text ? { custom: text } : {} }
        }),
      })
    } finally { setBusy(false) }
  }
  return (
    <article className={css.section}>
      <Tag tone="info">{t('question')}</Tag>
      {request.questions.map(question => (
        <fieldset key={question.id} className={css.question}>
          <legend>{question.question}</legend>
          {question.detail && <p className={css.prose}>{question.detail}</p>}
          {question.options?.map((option) => {
            const choices = selected[question.id] ?? []
            const checked = choices.includes(option.label)
            return <div key={option.label} className={css.option}>
              <Checkbox label={option.label} checked={checked} onChange={(value) => {
                const next = question.multiSelect ? value ? [...choices, option.label] : choices.filter(label => label !== option.label)
                  : value ? [option.label] : []
                setSelected(current => ({ ...current, [question.id]: next }))
                if (!question.multiSelect && value) setCustom(current => ({ ...current, [question.id]: '' }))
              }} />
              {option.description && <span className={css.muted}>{option.description}</span>}
            </div>
          })}
          <Input aria-label={t('customAnswer')} placeholder={t('customAnswer')} value={custom[question.id] ?? ''} onChange={(event) => {
            const value = event.target.value
            setCustom(current => ({ ...current, [question.id]: value }))
            if (!question.multiSelect && value.trim()) setSelected(current => ({ ...current, [question.id]: [] }))
          }} />
        </fieldset>
      ))}
      <div className={css.controls}>
        <Button variant="primary" size="sm" disabled={!ready || busy} onClick={() => { void answer(false) }}>{t('answer')}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => { void answer(true) }}>{t('dismissRequest')}</Button>
      </div>
    </article>
  )
}

function ApprovalCard({ request, respond, t }: {
  request: ApprovalRequest
  respond: (outcome: Extract<TaskInteractionReply, { kind: 'approval' }>['outcome']) => Promise<boolean>
  t: Translate
}) {
  const [busy, setBusy] = useState(false)
  const answer = async (outcome: Extract<TaskInteractionReply, { kind: 'approval' }>['outcome']) => {
    setBusy(true)
    try { await respond(outcome) } finally { setBusy(false) }
  }
  return (
    <article className={css.section}>
      <div className={css.controls}><Tag tone="warning">{t('approval')}</Tag><code>{request.toolName}</code></div>
      {request.reason && <p className={css.prose}>{request.reason}</p>}
      <div className={css.controls}>
        <Button variant="primary" size="sm" disabled={busy} onClick={() => { void answer('allowed-once') }}>{t('allowOnce')}</Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { void answer('rejected') }}>{t('rejectApproval')}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => { void answer('cancelled') }}>{t('dismissRequest')}</Button>
      </div>
    </article>
  )
}

/**
 * Render separately typed question and approval actions for the active Run.
 * @param props - the current authenticated inbox and its scoped response handler.
 * @returns the requests still accepting input.
 */
export function InteractionPanel({ inbox, respond, t }: {
  inbox: TaskboardInbox
  respond: (reply: TaskInteractionReply) => Promise<boolean>
  t: Translate
}) {
  const { projectId, taskId, runId } = inbox
  return <section className={css.section} aria-label={t('pending')}>
    <h3>{t('pending')}</h3>
    {inbox.requests.map((request) => {
      const target = { projectId, taskId, runId, requestId: request.requestId }
      return request.kind === 'question' ? (
        <QuestionCard key={request.requestId} request={request} t={t}
          respond={result => respond({ ...target, kind: 'question', result })} />
      ) : (
        <ApprovalCard key={request.requestId} request={request} t={t}
          respond={outcome => respond({ ...target, kind: 'approval', outcome })} />
      )
    })}
  </section>
}
