/** Keyless native model and bounded IPC observations for the owning restart test. */
import { LlmAdapter, resolveProviderPolicy } from '@deepseek-ai/dsh-llm'

export const name = 'accounted-local-model'
export const inject = ['llm']

export function apply(ctx) {
  if (process.send === undefined) throw new Error('Accounting fixture requires IPC')
  const pending = []
  const send = (message) => {
    const sent = new Promise((resolve, reject) => {
      process.send(message, error => error ? reject(error) : resolve())
    })
    pending.push(sent)
    void sent.catch((_error) => undefined) // Application drain retains and reports the original rejection.
  }
  ctx.on('session/event', (session, event) => {
    if (event.type === 'step/start') send({ kind: 'step', sessionId: session.id, seq: event.seq, turn: event.data.turn })
    else if (event.type === 'llm/request-accounting') send({ kind: 'accounting', sessionId: session.id, record: event.data })
  })
  ctx.on('app-boot/before-dispose', () => Promise.all(pending).then(() => undefined))
  const adapter = new class extends LlmAdapter {
    providerInfo(provider) {
      return { id: provider, name: provider, policy: resolveProviderPolicy({ usageSource: 'local' }) }
    }
    async* stream() {
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ATTEMPT_LINK_OK' } }
      yield { type: 'usage', usage: { inputTokens: 2, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }()
  ctx.effect(() => ctx.llm.registerAdapter(['accounted-local'], adapter))
}
