import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { defaultDshHome } from '@deepseek-ai/dsh-home-paths'
import LlmRuntime, { LlmAdapter, LlmError, resolveProviderPolicy } from '../src/index.ts'
import type { GenerateOptions, LlmValidationAdmission, StreamChunk } from '../src/index.ts'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { vi.restoreAllMocks(); for (const dispose of cleanup.splice(0)) await dispose() })

async function fixture(gate?: Promise<void>, started?: () => void) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-web-admission-'))
  const ctx = new Context()
  cleanup.push(async () => { await ctx.fiber.dispose(); rmSync(home, { recursive: true, force: true }) })
  ctx.provide('dshHomePath', () => home)
  await ctx.plugin(LlmRuntime)
  let prepared = 0
  let dispatched = 0
  const adapter = new class extends LlmAdapter {
    override providerInfo(provider: string) {
      return { id: provider, name: provider, policy: resolveProviderPolicy({ usageSource: 'chatgpt_web_unofficial', availability: 'gated', gateReason: 'Web approval required' }) }
    }
    override async prepareCall(provider: string, model: string, signal?: AbortSignal) {
      prepared += 1
      started?.()
      await gate
      return super.prepareCall(provider, model, signal)
    }
    override async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
      dispatched += 1
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }()
  const grant: LlmValidationAdmission = { scope: 'isolated-web-poc', home, provider: 'web', models: ['allowed'], expiresAt: new Date(Date.now() + 60_000).toISOString(), maxCalls: 1 }
  const config = { provider: 'web', model: 'allowed' }
  const stream = (model = 'allowed') => collect(ctx.llm.stream({ ...config, model, messages: [] }))
  return { ctx, home, adapter, grant, config, stream, counts: () => ({ prepared, dispatched }) }
}

async function collect(chunks: AsyncIterable<StreamChunk>) {
  const result: StreamChunk[] = []
  for await (const chunk of chunks) result.push(chunk)
  return result
}

it('keeps ordinary registration gated and refuses unrelated models before adapter preparation', async () => {
  const f = await fixture()
  const plain = f.ctx.llm.registerAdapter(['web'], f.adapter)
  expect(await f.stream()).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'PROVIDER_UNAVAILABLE' } } }])
  plain()
  f.ctx.llm.registerAdapter(['web'], f.adapter, f.grant)
  await expect(f.ctx.llm.prepareCall({ ...f.config, model: 'other' })).rejects.toBeInstanceOf(LlmError)
  expect(await f.stream('other')).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'VALIDATION_ADMISSION_DENIED' } } }])
  expect(f.counts()).toEqual({ prepared: 0, dispatched: 0 })
  expect(f.ctx.llm.listProviders()[0]?.policy?.availability).toBe('gated')
})

it('consumes one preparation slot atomically while another call is still preparing', async () => {
  let release!: () => void
  let signalStarted!: () => void
  const started = new Promise<void>((resolve) => { signalStarted = resolve })
  const gate = new Promise<void>((resolve) => { release = resolve })
  const f = await fixture(gate, signalStarted)
  f.ctx.llm.registerAdapter(['web'], f.adapter, f.grant)
  const first = f.stream()
  await started
  try {
    expect(await f.stream()).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'VALIDATION_ADMISSION_DENIED' } } }])
    expect(f.counts()).toEqual({ prepared: 1, dispatched: 0 })
  } finally { release() }
  expect(await first).toEqual([{ type: 'finish', reason: { kind: 'stop' } }])
  expect(f.counts()).toEqual({ prepared: 1, dispatched: 1 })
})

it('rejects a prepared call at the expiry instant without sleeping', async () => {
  const f = await fixture()
  f.ctx.llm.registerAdapter(['web'], f.adapter, f.grant)
  const call = await f.ctx.llm.prepareCall(f.config)
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(f.grant.expiresAt))
  expect(await collect(call.stream({ ...call.config, messages: [] }))).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'VALIDATION_ADMISSION_DENIED' } } }])
  expect(f.counts().dispatched).toBe(0)
})

it('revokes prepared reservations on replacement without renewing the shared budget', async () => {
  const f = await fixture()
  const handle = f.ctx.llm.registerAdapter(['web'], f.adapter, { ...f.grant, maxCalls: 2 })
  const call = await f.ctx.llm.prepareCall(f.config)
  expect(() => { handle.replace(['other']) }).toThrow('Validation approval requires its sole gated Web route')
  handle.replace(['web'])
  expect(await collect(call.stream({ ...call.config, messages: [] }))).toMatchObject([{ type: 'finish', reason: { kind: 'error' } }])
  expect(await f.stream()).toEqual([{ type: 'finish', reason: { kind: 'stop' } }])
  expect(await f.stream()).toMatchObject([{ type: 'finish', reason: { kind: 'error' } }])
  expect(f.counts()).toEqual({ prepared: 2, dispatched: 1 })
})

it('revokes unstarted dispatch when its owning fiber is disposed', async () => {
  const f = await fixture()
  f.ctx.llm.registerAdapter(['web'], f.adapter, f.grant)
  const call = await f.ctx.llm.prepareCall(f.config)
  await f.ctx.fiber.dispose()
  expect(await collect(call.stream({ ...call.config, messages: [] }))).toMatchObject([{ type: 'finish', reason: { kind: 'error' } }])
  expect(f.counts().dispatched).toBe(0)
})

it('refuses mismatched homes, the default home, invalid bounds and expired grants', async () => {
  const f = await fixture()
  for (const input of [
    { ...f.grant, home: tmpdir() }, { ...f.grant, home: 'relative' },
    { ...f.grant, maxCalls: 0 }, { ...f.grant, maxCalls: 1.5 },
    { ...f.grant, models: [] }, { ...f.grant, models: [''] }, { ...f.grant, provider: '' },
    { ...f.grant, expiresAt: 'invalid' }, { ...f.grant, expiresAt: '2000-01-01T00:00:00Z' },
  ]) {
    expect(() => f.ctx.llm.registerAdapter(['web'], f.adapter, input)).toThrow()
  }
  const ctx = new Context()
  cleanup.push(() => ctx.fiber.dispose())
  ctx.provide('dshHomePath', () => defaultDshHome())
  await ctx.plugin(LlmRuntime)
  expect(() => ctx.llm.registerAdapter(['web'], f.adapter, { ...f.grant, home: defaultDshHome() })).toThrow()
  expect(f.ctx.llm.listProviders()).toEqual([])
})

it('refuses direct dispatch when approval is revoked during asynchronous preparation', async () => {
  let release!: () => void
  let signalStarted!: () => void
  const started = new Promise<void>((resolve) => { signalStarted = resolve })
  const gate = new Promise<void>((resolve) => { release = resolve })
  const f = await fixture(gate, signalStarted)
  const handle = f.ctx.llm.registerAdapter(['web'], f.adapter, f.grant)
  const pending = f.stream()
  await started
  handle.replace([])
  release()
  expect(await pending).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code: 'VALIDATION_ADMISSION_DENIED' } } }])
  expect(f.counts()).toEqual({ prepared: 1, dispatched: 0 })
})
