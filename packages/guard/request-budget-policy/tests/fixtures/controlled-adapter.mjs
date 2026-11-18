/** External model stand-in controlled by the owning process test over IPC. */
import { LlmAdapter, resolveProviderPolicy } from '@deepseek-ai/dsh-llm'

export const name = 'controlled-local-model'
export const inject = ['llm']
export function apply(ctx) {
  if (process.send === undefined) throw new Error('Controlled model requires IPC')
  const resolve = Promise.withResolvers(), finish = Promise.withResolvers()
  let announced = false
  const message = (value) => {
    if (value === 'resolve') resolve.resolve()
    else if (value === 'finish') finish.resolve()
    else throw new Error('Unexpected controlled model message')
  }
  ctx.effect(() => {
    process.on('message', message)
    return () => { process.off('message', message); resolve.resolve(); finish.resolve() }
  })
  const adapter = new class extends LlmAdapter {
    providerInfo(provider) {
      return { id: provider, name: 'Controlled local model', policy: resolveProviderPolicy({ usageSource: 'local' }) }
    }
    async resolveModel(provider, model) {
      if (!announced) { announced = true; process.send('ready') }
      await resolve.promise
      return { provider, id: model, name: model }
    }
    async* stream(options) {
      process.send('submitted')
      const cancelled = Promise.withResolvers()
      const abort = () => { cancelled.resolve() }
      options.signal.addEventListener('abort', abort, { once: true })
      try {
        if (!options.signal.aborted) await Promise.race([finish.promise, cancelled.promise])
        if (options.signal.aborted) { yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'Controlled transport aborted' } } }; return }
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'LOCAL_BUDGET_OK' } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } finally { options.signal.removeEventListener('abort', abort) }
    }
  }()
  ctx.effect(() => ctx.llm.registerAdapter(['budget-fixture'], adapter))
}
