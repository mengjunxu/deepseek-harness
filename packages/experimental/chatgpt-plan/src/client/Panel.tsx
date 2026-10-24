/** ChatGPT plan settings and composer attribution, driven by safe Host state. */
import type { ReactNode } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ChatgptPlanState } from '../types.ts'
import type { en } from './locales.ts'
import css from './Panel.module.css'

export interface Injected {
  hooks: { plan: SnapshotStore<ChatgptPlanState> }
  start: () => void
  cancel: () => void
  disconnect: () => void
  acknowledge: () => void
  t: (key: keyof typeof en) => string
}
const usage = 'https://chatgpt.com/settings/usage'

/** Render a subscription account card in the existing Models extension area. */
export function Panel({ usePlan, start, cancel, disconnect, acknowledge, t }: PropsRuntime<'settings.models.footer'> & InjectFace<Injected>): ReactNode {
  const state = usePlan(value => value)
  return <section className={css.card}>
    <h3>{t('title')}</h3>
    <p>{t('description')}</p>
    <p>{state.authorizing ? t('pending') : state.connected ? t('connected') : t('signedOut')}</p>
    {state.email ? <p>{state.email}</p> : null}
    {state.error ? <p role="alert">{t('failed')}</p> : null}
    <div className={css.actions}>
      {state.authorizing ? <>
        {state.authorizationUrl ? <a href={state.authorizationUrl} target="_blank" rel="noreferrer">{t('open')}</a> : null}
        <Button onClick={cancel}>{t('cancel')}</Button>
      </> : <Button onClick={state.connected ? disconnect : start}>{t(state.connected ? 'disconnect' : 'connect')}</Button>}
      <a href={usage} target="_blank" rel="noreferrer">{t('manage')}</a>
    </div>
    <Modal open={state.connected && state.needsWelcome === true} title={t('welcome')} onClose={acknowledge} closeLabel={t('close')}>
      <p>{t('description')}</p><Button onClick={acknowledge}>{t('gotIt')}</Button>
    </Modal>
  </section>
}

/** Show attribution only when this session selects the ChatGPT plan route. */
export function Attribution({ useProjection, t }: PropsRuntime<'conversation.input.left'> & { t: Injected['t'] }): ReactNode {
  const provider = useProjection('modelSelection', snapshot => snapshot?.next?.provider)
  if (provider !== 'chatgpt-plan') return null
  return <a href={usage} target="_blank" rel="noreferrer" className={css.attribution}>{t('connected')}</a>
}
