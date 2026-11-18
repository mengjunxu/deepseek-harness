/** Exact grants bind captured adapter metadata and are revocable before dispatch. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished } from 'vitest'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import type { AdapterRegistrationHandle, LlmUsageSource, StreamChunk } from '@deepseek-ai/dsh-llm'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import * as Policy from '../src/index.ts'
import { Adapter } from './adapter.ts'


const call = { provider: 'paid', model: 'm' }
const grants = [{ provider: 'paid', models: ['m'] }]

async function fixture(approved = false, source: LlmUsageSource = 'api_metered') {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(LlmRuntime)
  const adapter = new Adapter(source)
  let registration!: AdapterRegistrationHandle
  ctx.effect(() => { registration = ctx.llm.registerAdapter(['paid', 'other'], adapter); return registration })
  const live = await liveConfig(ctx, Policy, { grants: approved ? grants : [] })
  return { ctx, adapter, live, registration }
}

it('refuses unapproved preparation and direct streaming before adapter work', async () => {
  const { ctx, adapter } = await fixture()
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'PAID_ROUTE_CONSENT_REQUIRED' })
  const chunks = await Array.fromAsync(ctx.llm.stream({ ...call, messages: [] }))
  expect(chunks).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'PAID_ROUTE_CONSENT_REQUIRED' } } }])
  expect(adapter.resolutions).toBe(0)
  expect(adapter.calls).toBe(0)
})

it('grants an exact provider/model pair and refuses sibling routes and models', async () => {
  const { ctx, adapter } = await fixture(true)
  for (const rejected of [{ ...call, provider: 'other' }, { ...call, model: 'M' }]) {
    await expect(ctx.llm.prepareCall(rejected)).rejects.toMatchObject({ code: 'PAID_ROUTE_CONSENT_REQUIRED' })
  }
  const prepared = await ctx.llm.prepareCall(call)
  expect((await Array.fromAsync(prepared.stream({ ...prepared.config, messages: [] }))).at(-1))
    .toEqual({ type: 'finish', reason: { kind: 'stop' } })
  expect(adapter.calls).toBe(1)
  expect(ctx.llm.listProviders()[0]?.policy?.balance).toEqual({ status: 'unknown' })
})

it('revokes a prepared request before streaming and permits a later explicit grant', async () => {
  const { ctx, adapter, live } = await fixture(true)
  const prepared = await ctx.llm.prepareCall(call)
  await live.update({ grants: [] })
  const chunks = await Array.fromAsync(prepared.stream({ ...prepared.config, messages: [] }))
  expect(chunks.at(-1)).toMatchObject({ reason: { kind: 'error', failure: { code: 'PAID_ROUTE_CONSENT_REQUIRED' } } })
  expect(adapter.calls).toBe(0)
  await live.update({ grants })
  expect((await Array.fromAsync(ctx.llm.stream({ ...call, messages: [] }))).at(-1))
    .toEqual({ type: 'finish', reason: { kind: 'stop' } })
})

it('checks the prepared metered source after discovery changes to a local replacement', async () => {
  const { ctx, adapter, registration, live } = await fixture(true)
  const prepared = await ctx.llm.prepareCall(call)
  adapter.source = 'local'
  registration.replace(['paid', 'other'])
  await live.update({ grants: [] })
  expect((await Array.fromAsync(prepared.stream({ ...prepared.config, messages: [] }))).at(-1))
    .toMatchObject({ reason: { kind: 'error', failure: { code: 'PAID_ROUTE_CONSENT_REQUIRED' } } })
  expect(adapter.calls).toBe(0)
  await expect(ctx.llm.prepareCall(call)).resolves.toMatchObject({ config: call })
})

it('retains a prepared local source after discovery changes to an unapproved metered replacement', async () => {
  const { ctx, adapter, registration } = await fixture(false, 'local')
  const prepared = await ctx.llm.prepareCall(call)
  adapter.source = 'api_metered'
  registration.replace(['paid', 'other'])
  expect((await Array.fromAsync(prepared.stream({ ...prepared.config, messages: [] }))).at(-1))
    .toEqual({ type: 'finish', reason: { kind: 'stop' } })
  expect(adapter.calls).toBe(1)
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'PAID_ROUTE_CONSENT_REQUIRED' })
})

it.each(['local', 'third_party', 'unknown', 'work_codex_shared'] as const)('does not infer a price for %s', async (source) => {
  const { ctx } = await fixture(false, source)
  await expect(ctx.llm.prepareCall(call)).resolves.toMatchObject({ config: call })
  expect(ctx.llm.listProviders()[0]?.policy?.balance).toEqual({ status: 'unknown' })
})

it('does not override another refusal and withdraws its listener on unload', async () => {
  const { ctx, live } = await fixture(true)
  const dispose = ctx.on('llm/admission', () => ({ code: 'OTHER_POLICY', message: 'Another policy refused' }))
  await expect(ctx.llm.prepareCall(call)).rejects.toMatchObject({ code: 'OTHER_POLICY' })
  dispose()
  await live.update({ grants: [] })
  await live.fiber.dispose()
  await expect(ctx.llm.prepareCall(call)).resolves.toMatchObject({ config: call })
})

it('validates preset configuration and grants nothing when omitted', () => {
  expect(Policy.Config({}).grants.get()).toEqual([])
  for (const grant of [{ provider: ' ', models: ['m'] }, { provider: 'paid', models: [] }, { provider: 'paid', models: [' '] }]) {
    expect(() => Policy.Config({ grants: [grant] })).toThrow()
  }
})

it('rechecks consent after asynchronous model lookup before constructing the adapter stream', async () => {
  const { ctx, adapter, live } = await fixture(true)
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const resolve = adapter.resolveModel.bind(adapter)
  adapter.resolveModel = async (provider, model) => {
    entered.resolve(undefined)
    await release.promise
    return resolve(provider, model)
  }
  const pending = Array.fromAsync(ctx.llm.stream({ ...call, messages: [] }))
  let chunks: StreamChunk[]
  try {
    await entered.promise
    await live.update({ grants: [] })
  } finally {
    release.resolve(undefined)
    chunks = await pending
  }
  expect(chunks.at(-1)).toMatchObject({ reason: { kind: 'error', failure: { code: 'PAID_ROUTE_CONSENT_REQUIRED' } } })
  expect(adapter.calls).toBe(0)
})

it.each([
  { grants: [null] }, { grants: [{ provider: 'paid', models: null }] },
])('rejects malformed preset configuration %j before admission', (input) => {
  const raw: Record<string, unknown> = input
  expect(() => Policy.Config(raw)).toThrow()
})

it('resets an explicit null list to the default empty preset list', () => {
  expect(Policy.Config({ grants: null }).grants.get()).toEqual([])
})
