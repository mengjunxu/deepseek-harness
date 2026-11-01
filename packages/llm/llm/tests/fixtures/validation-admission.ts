/** Keyless SDK composition exercising a real gated registration with an isolated-home grant. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { LlmAdapter, resolveProviderPolicy } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '../../src/index.ts'

export const name = 'web-validation-snapshot'
export const inject = ['llm']

class ValidationAdapter extends LlmAdapter {
  override providerInfo(provider: string) {
    return { id: provider, name: 'Mock Web validation', policy: resolveProviderPolicy({
      usageSource: 'chatgpt_web_unofficial', availability: 'gated', gateReason: 'Validation only',
    }) }
  }
  override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: 'VALIDATION_OK' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'VALIDATION_OK' } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/**
 * Register one mock attempt in the fixture's temporary Harness home.
 * @param ctx - Loader-owned fixture scope.
 */
export function apply(ctx: Context): void {
  const locateHome = ctx.get('dshHomePath') as (() => string)
  ctx.llm.registerAdapter(['web-validation'], new ValidationAdapter(), {
    scope: 'isolated-web-poc', home: locateHome(), provider: 'web-validation', models: ['fixture'],
    expiresAt: new Date(Date.now() + 60_000).toISOString(), maxCalls: 1,
  })
  ctx.on('agent/request', async (_payload, next) => ({ ...await next(), provider: 'web-validation', model: 'fixture' }))
}
