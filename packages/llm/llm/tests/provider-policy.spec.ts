import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, resolveProviderPolicy } from '../src/index.ts'
import type { GenerateOptions, LlmProviderPolicy, StreamChunk } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
async function fixture(policy?: LlmProviderPolicy) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  let prepared = 0
  let dispatched = 0
  const adapter = new class extends LlmAdapter {
    override providerInfo(provider: string) { return { id: provider, name: provider, ...policy === undefined ? {} : { policy } } }
    override prepareCall(provider: string, model: string, signal?: AbortSignal) {
      prepared += 1
      return super.prepareCall(provider, model, signal)
    }
    override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
      dispatched += 1
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }()
  return { ctx, adapter, setPolicy: (value: LlmProviderPolicy) => { policy = value }, counts: () => ({ prepared, dispatched }) }
}

it('keeps undeclared usage, balance and capabilities unknown', () => {
  const policy = resolveProviderPolicy({})
  expect(policy.usageSource).toBe('unknown')
  expect(policy.balance).toEqual({ status: 'unknown' })
  expect(Object.values(policy.capabilities)).toEqual(Array(5).fill('unknown'))
  expect(Object.isFrozen(policy.capabilities)).toBe(true)
})

it.each([
  { usageSource: 'chatgpt_regular' },
  { usageSource: 'chatgpt_web_unofficial' },
  { usageSource: 'experimental_unverified' },
  { availability: 'gated' },
  { capabilities: { tools: true } },
  { balance: { status: 'unknown', remaining: 100 } },
])('rejects an invalid or unapproved provider policy: %j', (input) => {
  expect(() => resolveProviderPolicy(input)).toThrow('Invalid LLM provider policy')
})

it.each(['gated', 'auth_required', 'limited', 'unconfigured', 'unavailable'] as const)(
  'lists %s routes but refuses preparation and direct dispatch without invoking the adapter', async (availability) => {
    const policy = resolveProviderPolicy({ usageSource: 'chatgpt_web_unofficial', availability, gateReason: 'Admission required' })
    const { ctx, adapter, counts } = await fixture(policy)
    ctx.llm.registerAdapter(['web'], adapter)
    expect(ctx.llm.listProviders()[0]?.policy).toEqual(policy)
    await expect(ctx.llm.prepareCall({ provider: 'web', model: 'same-name' })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
    const chunks = []
    for await (const chunk of ctx.llm.stream({ provider: 'web', model: 'same-name', messages: [] })) chunks.push(chunk)
    expect(chunks).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'PROVIDER_UNAVAILABLE' } } }])
    expect(counts()).toEqual({ prepared: 0, dispatched: 0 })
  },
)

it('rejects regular-chat routes atomically even without explicit metadata', async () => {
  const { ctx, adapter } = await fixture()
  expect(() => ctx.llm.registerAdapter(['allowed', 'chatgpt_regular'], adapter)).toThrow('not an inference provider')
  expect(ctx.llm.listProviders()).toEqual([])
})

it('retains the admitted generation for a prepared call while blocking new calls after replacement', async () => {
  const { ctx, adapter, counts, setPolicy } = await fixture(resolveProviderPolicy({ usageSource: 'api_metered' }))
  const handle = ctx.llm.registerAdapter(['route'], adapter)
  const call = await ctx.llm.prepareCall({ provider: 'route', model: 'same-name' })
  setPolicy(resolveProviderPolicy({ availability: 'gated', gateReason: 'Closed' }))
  handle.replace(['route'])
  await expect(ctx.llm.prepareCall({ provider: 'route', model: 'same-name' })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
  const chunks = []
  for await (const chunk of call.stream({ ...call.config, messages: [] })) chunks.push(chunk)
  expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'stop' } }])
  expect(counts()).toEqual({ prepared: 1, dispatched: 1 })
  handle()
  expect(ctx.llm.listProviders()).toEqual([])
})

it('detaches returned metadata without changing admission or another provider with the same model', async () => {
  const { ctx, adapter } = await fixture(resolveProviderPolicy({ availability: 'gated', gateReason: 'Closed' }))
  ctx.llm.registerAdapter(['web'], adapter)
  const publicPolicy = ctx.llm.listProviders()[0]?.policy
  expect(publicPolicy).toBeDefined()
  if (publicPolicy !== undefined) Object.assign(publicPolicy, { availability: 'ready' })
  await expect(ctx.llm.prepareCall({ provider: 'web', model: 'same-name' })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' })
  const ready = await fixture()
  ctx.llm.registerAdapter(['local'], ready.adapter)
  await expect(ctx.llm.prepareCall({ provider: 'local', model: 'same-name' })).resolves.toMatchObject({ config: { provider: 'local' } })
})

it.each(['unknown', 'unsupported'] as const)('refuses a required %s capability before preparing or dispatching', async (support) => {
  const { ctx, adapter, counts } = await fixture(resolveProviderPolicy({ capabilities: { tools: support } }))
  ctx.llm.registerAdapter(['route'], adapter)
  const config = { provider: 'route', model: 'm', intent: 'execute', requiredCapabilities: ['tools'] } as const
  await expect(ctx.llm.prepareCall({ ...config, requiredCapabilities: ['tools'] }))
    .rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER_CAPABILITY' })
  const chunks = []
  for await (const chunk of ctx.llm.stream({ ...config, requiredCapabilities: ['tools'], messages: [] })) chunks.push(chunk)
  expect(chunks).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'UNSUPPORTED_PROVIDER_CAPABILITY' } } }])
  expect(counts()).toEqual({ prepared: 0, dispatched: 0 })
})

it('requires an explicit declaration even on legacy routes, and binds policy fields to prepared calls', async () => {
  const { ctx, adapter, counts, setPolicy } = await fixture()
  const handle = ctx.llm.registerAdapter(['route'], adapter)
  await expect(ctx.llm.prepareCall({ provider: 'route', model: 'm', requiredCapabilities: ['tools'] }))
    .rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER_CAPABILITY' })
  setPolicy(resolveProviderPolicy({ capabilities: { tools: 'supported' } }))
  handle.replace(['route'])
  const call = await ctx.llm.prepareCall({ provider: 'route', model: 'm', intent: 'execute', requiredCapabilities: ['tools'] })
  expect(() => call.stream({ ...call.config, intent: 'chat', messages: [] })).toThrow('prepared LLM call config changed')
  expect(() => call.stream({ ...call.config, requiredCapabilities: [], messages: [] })).toThrow('prepared LLM call config changed')
  const chunks = []
  for await (const chunk of call.stream({ ...call.config, messages: [] })) chunks.push(chunk)
  expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'stop' } }])
  expect(counts()).toEqual({ prepared: 1, dispatched: 1 })
})

it('refuses virtual routes for explicit policy without changing legacy middleware admission', async () => {
  const { ctx } = await fixture()
  for (const policy of [{ intent: 'chat' as const }, { requiredCapabilities: [] }]) {
    await expect(ctx.llm.prepareCall({ provider: 'virtual', model: 'm', ...policy }))
      .rejects.toMatchObject({ code: 'POLICY_ROUTE_UNAVAILABLE' })
  }
  const chunks = []
  for await (const chunk of ctx.llm.stream({ provider: 'virtual', model: 'm', intent: 'chat', messages: [] })) chunks.push(chunk)
  expect(chunks).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'POLICY_ROUTE_UNAVAILABLE' } } }])
  await expect(ctx.llm.prepareCall({ provider: 'virtual', model: 'm' })).rejects.toMatchObject({ code: 'NO_ADAPTER' })
})
