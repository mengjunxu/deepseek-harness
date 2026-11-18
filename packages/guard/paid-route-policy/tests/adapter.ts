/** Test adapter whose mutable declaration is captured by each route registration. */
import { LlmAdapter, resolveProviderPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmUsageSource, StreamChunk } from '@deepseek-ai/dsh-llm'

/** Counts capability lookup and dispatch independently of policy decisions. */
export class Adapter extends LlmAdapter {
  resolutions = 0
  calls = 0
  constructor(public source: LlmUsageSource = 'api_metered') { super() }
  override providerInfo(provider: string) {
    return { id: provider, name: provider, policy: resolveProviderPolicy({ usageSource: this.source }) }
  }
  override resolveModel(provider: string, model: string) {
    this.resolutions++
    return Promise.resolve({ provider, id: model, name: model })
  }
  override async* stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.calls++
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'ok' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}
