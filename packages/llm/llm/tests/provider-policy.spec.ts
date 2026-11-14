import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { LlmAdapter, resolveProviderPolicy } from '../src/index.ts'
import type { GenerateOptions, LlmCapabilitySupport, LlmProviderPolicy, ModelModality, StreamChunk } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose() })
async function fixture(
  policy?: LlmProviderPolicy,
  modalities?: readonly ModelModality[],
  toolSupport?: LlmCapabilitySupport,
  streamingSupport?: LlmCapabilitySupport,
) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(LlmRuntime)
  let prepared = 0
  let dispatched = 0
  const adapter = new class extends LlmAdapter {
    override providerInfo(provider: string) { return { id: provider, name: provider, ...policy === undefined ? {} : { policy } } }
    override resolveModel(provider: string, model: string) {
      return Promise.resolve({ provider, id: model, name: model,
        ...modalities === undefined ? {} : { inputModalities: modalities },
        ...toolSupport === undefined ? {} : { toolSupport },
        ...streamingSupport === undefined ? {} : { streamingSupport } })
    }
    override prepareCall(provider: string, model: string, signal?: AbortSignal) {
      prepared += 1
      return super.prepareCall(provider, model, signal)
    }
    override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
      dispatched += 1
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }()
  return {
    ctx, adapter,
    setToolSupport: (value: LlmCapabilitySupport) => { toolSupport = value },
    setStreamingSupport: (value: LlmCapabilitySupport) => { streamingSupport = value },
    setPolicy: (value: LlmProviderPolicy) => { policy = value },
    counts: () => ({ prepared, dispatched }),
  }
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
  const { ctx, adapter, counts, setPolicy } = await fixture(undefined, undefined, 'supported')
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

it.each([undefined, ['text'] as const])('rejects required vision for exact model modalities %j despite Provider support', async (modalities) => {
  const { ctx, adapter, counts } = await fixture(resolveProviderPolicy({ capabilities: { vision: 'supported' } }), modalities)
  ctx.llm.registerAdapter(['route'], adapter)
  const config = { provider: 'route', model: 'same-name', requiredCapabilities: ['vision'] as ['vision'] }
  await expect(ctx.llm.prepareCall(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  await expect(ctx.llm.resolveCallConfig(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  const chunks = []
  for await (const chunk of ctx.llm.stream({ ...config, messages: [] })) chunks.push(chunk)
  expect(chunks).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'UNSUPPORTED_MODEL_CAPABILITY' } } }])
  expect(counts()).toEqual({ prepared: 2, dispatched: 0 })
})

it('captures exact image support without borrowing it for another Provider with the same model id', async () => {
  const policy = resolveProviderPolicy({ capabilities: { vision: 'supported' } })
  const modalities: ModelModality[] = ['text', 'image']
  const image = await fixture(policy, modalities)
  const text = await fixture(policy, ['text'])
  image.ctx.llm.registerAdapter(['image-route'], image.adapter)
  image.ctx.llm.registerAdapter(['text-route'], text.adapter)
  const config = { provider: 'image-route', model: 'same-name', requiredCapabilities: ['vision'] as ['vision'] }
  const call = await image.ctx.llm.prepareCall(config)
  await expect(image.ctx.llm.prepareCall({ ...config, provider: 'text-route' }))
    .rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  modalities.splice(1, 1)
  await expect(image.ctx.llm.prepareCall(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  const chunks = []
  for await (const chunk of call.stream({ ...call.config, messages: [] })) chunks.push(chunk)
  expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'stop' } }])
  expect(text.counts().dispatched).toBe(0)
  expect(image.counts().dispatched).toBe(1)
})

it('still requires Provider vision admission when the exact model accepts images', async () => {
  const { ctx, adapter, counts } = await fixture(resolveProviderPolicy({ capabilities: { vision: 'unknown' } }), ['image'])
  ctx.llm.registerAdapter(['route'], adapter)
  await expect(ctx.llm.prepareCall({ provider: 'route', model: 'm', requiredCapabilities: ['vision'] }))
    .rejects.toMatchObject({ code: 'UNSUPPORTED_PROVIDER_CAPABILITY' })
  expect(counts()).toEqual({ prepared: 0, dispatched: 0 })
})

it.each([undefined, 'unknown', 'unsupported'] as const)('rejects required tools for exact support %s despite Provider support', async (support) => {
  const { ctx, adapter, counts } = await fixture(resolveProviderPolicy({ capabilities: { tools: 'supported' } }), undefined, support)
  ctx.llm.registerAdapter(['route'], adapter)
  const config = { provider: 'route', model: 'same-name', requiredCapabilities: ['tools'] as ['tools'] }
  await expect(ctx.llm.prepareCall(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  await expect(ctx.llm.resolveCallConfig(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  const chunks = []
  for await (const chunk of ctx.llm.stream({ ...config, messages: [] })) chunks.push(chunk)
  expect(chunks).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'UNSUPPORTED_MODEL_CAPABILITY' } } }])
  expect(counts()).toEqual({ prepared: 2, dispatched: 0 })
})

it('captures exact tool support and does not borrow it from another Provider', async () => {
  const policy = resolveProviderPolicy({ capabilities: { tools: 'supported' } })
  const supported = await fixture(policy, undefined, 'supported')
  const unsupported = await fixture(policy, undefined, 'unsupported')
  supported.ctx.llm.registerAdapter(['supported'], supported.adapter)
  supported.ctx.llm.registerAdapter(['unsupported'], unsupported.adapter)
  const config = { provider: 'supported', model: 'same-name', requiredCapabilities: ['tools'] as ['tools'] }
  const call = await supported.ctx.llm.prepareCall(config)
  await expect(supported.ctx.llm.prepareCall({ ...config, provider: 'unsupported' }))
    .rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  supported.setToolSupport('unknown')
  await expect(supported.ctx.llm.prepareCall(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  const chunks = []
  for await (const chunk of call.stream({ ...call.config, messages: [] })) chunks.push(chunk)
  expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'stop' } }])
  expect(unsupported.counts().dispatched).toBe(0)
})

it.each([undefined, 'unknown', 'unsupported'] as const)('rejects required streaming for exact support %s despite Provider support', async (support) => {
  const { ctx, adapter, counts } = await fixture(
    resolveProviderPolicy({ capabilities: { streaming: 'supported' } }), undefined, undefined, support,
  )
  ctx.llm.registerAdapter(['route'], adapter)
  const config = { provider: 'route', model: 'same-name', requiredCapabilities: ['streaming'] as ['streaming'] }
  await expect(ctx.llm.prepareCall(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  await expect(ctx.llm.resolveCallConfig(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  const chunks = []
  for await (const chunk of ctx.llm.stream({ ...config, messages: [] })) chunks.push(chunk)
  expect(chunks).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'UNSUPPORTED_MODEL_CAPABILITY' } } }])
  expect(counts()).toEqual({ prepared: 2, dispatched: 0 })
})

it('captures exact streaming support and keeps same-name Provider capability independent', async () => {
  const policy = resolveProviderPolicy({ capabilities: { streaming: 'supported' } })
  const supported = await fixture(policy, undefined, undefined, 'supported')
  const unsupported = await fixture(policy, undefined, undefined, 'unsupported')
  supported.ctx.llm.registerAdapter(['supported'], supported.adapter)
  supported.ctx.llm.registerAdapter(['unsupported'], unsupported.adapter)
  const config = { provider: 'supported', model: 'same-name', requiredCapabilities: ['streaming'] as ['streaming'] }
  const call = await supported.ctx.llm.prepareCall(config)
  await expect(supported.ctx.llm.prepareCall({ ...config, provider: 'unsupported' }))
    .rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  supported.setStreamingSupport('unknown')
  await expect(supported.ctx.llm.prepareCall(config)).rejects.toMatchObject({ code: 'UNSUPPORTED_MODEL_CAPABILITY' })
  const chunks = []
  for await (const chunk of call.stream({ ...call.config, messages: [] })) chunks.push(chunk)
  expect(chunks).toEqual([{ type: 'finish', reason: { kind: 'stop' } }])
  expect(unsupported.counts().dispatched).toBe(0)
})
