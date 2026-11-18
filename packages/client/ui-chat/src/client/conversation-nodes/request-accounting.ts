/** Step-scoped accounting evidence joined by explicit durable references. */
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SessionEvent } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-token-meter/client'

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationStepDataMap {
    /** Native records explicitly linked to this committed Step. */
    'request-accounting': readonly SessionEvent<'llm/request-accounting'>[]
  }
}

/** Supply accounting evidence without a transcript row or an arrival-order association. */
export const requestAccountingDefinition: ConversationNodeDefinition<null> = {
  kind: 'request-accounting', target: 'chat',
  match: (event) => {
    if (event.type === 'step/start') return { id: String(event.seq), role: 'start' }
    if (event.type === 'llm/request-accounting' && event.data.loopAttempt !== undefined) {
      return { id: String(event.data.loopAttempt.stepStartSeq), role: 'update' }
    }
    return null
  },
  start: () => null,
  update: () => null,
  publication: () => 'none',
  buildLocationData: (context, scope) => {
    if (scope !== 'step' || context.start?.event.type !== 'step/start') return null
    return { kind: 'step', turn: context.start.event.data.turn, step: context.start.event.data.step,
      key: 'request-accounting',
      value: context.matches.flatMap(match => match.event.type === 'llm/request-accounting' ? [match.event] : []) }
  },
  buildViewNode: () => null,
}
