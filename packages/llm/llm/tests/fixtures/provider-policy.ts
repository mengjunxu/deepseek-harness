/** Exercise provider admission from a logged tool occurrence through the real Loader. */
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, resolveProviderPolicy } from '../../src/index.ts'
import type { GenerateOptions, StreamChunk } from '../../src/types.ts'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'provider-policy-snapshot'
export const inject = ['llm', 'tools']

class GatedAdapter extends LlmAdapter {
  override providerInfo(provider: string) {
    return { id: provider, name: provider, policy: resolveProviderPolicy({
      usageSource: 'chatgpt_web_unofficial', availability: 'gated', gateReason: 'Web admission required',
    }) }
  }
  override stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('Gated adapter must never be invoked')
  }
}

export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['gated-web'], new GatedAdapter())
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.name === 'bash' && typeof exec.arguments === 'object' && exec.arguments !== null
      && 'command' in exec.arguments && exec.arguments.command === 'printf POLICY_PROBE') {
      await ctx.llm.prepareCall({ provider: 'gated-web', model: 'fixture' })
      throw new Error('Gated provider was admitted')
    }
    return next()
  })
}
