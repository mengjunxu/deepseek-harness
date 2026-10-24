/** Opt-in Models settings card and subscription attribution. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import remote from '@deepseek-ai/dsh-experimental-chatgpt-plan/remote'
import type { ChatgptPlanState } from '../types.ts'
import { Panel, Attribution } from './Panel.tsx'
import type { Injected } from './Panel.tsx'
import { en, zh } from './locales.ts'

export const inject = ['slots', 'locale', 'remote']
/** Mount the generated Remote contribution before installing its UI consumers.
 * @param ctx - browser root with existing settings and conversation slots.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.remote.$mount(remote))
  ctx.inject(['remote.chatgptPlan'], (child) => {
    child.effect(() => child.locale.register('chatgpt.plan', { en, zh }))
    const t = child.locale.bind('chatgpt.plan') as Injected['t']
    const store = createSnapshotStore<ChatgptPlanState>({ connected: false, authorizing: false })
    const stream = child.remote.$stream<ChatgptPlanState>({ name: 'chatgpt-plan',
      open: signal => child.remote.chatgptPlan.watch(signal), ended: () => new Error('ChatGPT state stream ended') })
    let disposed = false
    child.effect(() => () => { disposed = true; return stream.dispose() })
    void (async () => {
      for await (const frame of stream) { store.set(frame.value); frame.accept() }
    })().catch(() => { if (!disposed) store.update((state) => { state.error = 'CONNECTION' }) })
    const run = async (operation: () => Promise<{ ok: boolean }>): Promise<void> => {
      try { const result = await operation(); if (!result.ok) throw new Error('Action failed') }
      catch (_requestFailed) { store.update((state) => { state.error = 'REQUEST' }) }
    }
    const injected = (): Injected => ({ hooks: { plan: store }, t,
      start: () => { void run(() => child.remote.chatgptPlan.startSignIn()) },
      cancel: () => { void run(() => child.remote.chatgptPlan.cancelSignIn()) },
      disconnect: () => { void run(() => child.remote.chatgptPlan.signOut()) },
      acknowledge: () => { void run(() => child.remote.chatgptPlan.acknowledgePlanUsage()) },
    })
    child.slots.inject('settings.models.footer', () => child.slots.register({
      name: 'settings.models.footer', id: 'chatgpt-plan', inject: injected,
    }, Panel))
    child.slots.inject('conversation.input.left', () => child.slots.register({
      name: 'conversation.input.left', id: 'chatgpt-plan', inject: () => ({ t }),
    }, Attribution))
  })
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'chatgpt.plan': keyof typeof en }
}
