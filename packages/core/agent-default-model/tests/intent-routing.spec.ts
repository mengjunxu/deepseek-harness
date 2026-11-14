/** Explicit routing captures one policy per Turn across asynchronous prompt assembly. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished } from 'vitest'
import AgentRegistry, { agentEvents, installModelSelection, type Agent, type ModelSelectionRef } from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import LlmRuntime, { createUserMessage, ReasoningEffortId, type LlmCallConfig, type LlmRequestIntent } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import * as Routing from '../src/intent-routing.ts'

const routes = {
  chat: { provider: 'chat-provider', model: 'chat-model' },
  plan: { provider: 'plan-provider', model: 'plan-model', requiredCapabilities: ['tools'] },
  review: { provider: 'review-provider', model: 'review-model' },
  execute: { provider: 'execute-provider', model: 'execute-model', reasoningEffort: 'high' },
}
const seed: LlmCallConfig = { provider: 'seed', model: 'seed', temperature: 0.2 }

async function fixture(intent: LlmRequestIntent = 'chat', options: { entry?: boolean; selection?: ModelSelectionRef } = {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SystemPrompt)
  const configuredRoutes = options.entry ? { ...routes, [intent]: { selection: 'entry', requiredCapabilities: ['tools'] } } : routes
  const live = await liveConfig(ctx, Routing, { routing: { intent, routes: configuredRoutes } })
  const agent = { session: Session.create(SessionId('intent-route')) } as Agent
  const disposeSelection = options.selection === undefined ? undefined : installModelSelection(ctx, options.selection)
  const request = (signal: AbortSignal) => agentEvents(ctx, agent).waterfall(
    'agent/request', { turn: 1, step: 1, signal }, () => Promise.resolve(seed),
  )
  const assemble = (signal: AbortSignal) => ctx.systemPrompt.assemble({ agent, signal })
  return { ctx, agent, live, request, assemble, disposeSelection }
}

it.each(['chat', 'plan', 'review', 'execute'] as const)('routes %s using its explicit pair and preserves sampling controls', async (intent) => {
  const { request, assemble } = await fixture(intent)
  const signal = new AbortController().signal
  const assembly = await assemble(signal)
  expect(assembly.variables).toMatchObject({ provider: `${intent}-provider`, model: `${intent}-model` })
  expect(await request(signal)).toMatchObject({ provider: `${intent}-provider`, model: `${intent}-model`, intent, temperature: 0.2 })
})

it('captures policy before an asynchronous assembly and keeps it until the next Turn', async () => {
  const { ctx, live, request, assemble } = await fixture()
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  onTestFinished(() => { release.resolve(undefined) })
  const disposeBarrier = ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    entered.resolve(undefined)
    await release.promise
    return next()
  })
  const firstSignal = new AbortController().signal
  const pending = assemble(firstSignal)
  await entered.promise
  await live.update({ routing: { intent: 'plan' } })
  release.resolve(undefined)
  expect((await pending).variables).toMatchObject({ provider: 'chat-provider', model: 'chat-model' })
  expect(await request(firstSignal)).toMatchObject({ intent: 'chat', provider: 'chat-provider' })
  disposeBarrier()
  await assemble(firstSignal)
  expect(await request(firstSignal)).toMatchObject({ intent: 'chat' })
  const nextSignal = new AbortController().signal
  await assemble(nextSignal)
  expect(await request(nextSignal)).toMatchObject({ intent: 'plan', requiredCapabilities: ['tools'] })
})

it('rejects incomplete or invalid configuration, and removes both waterfalls on unload', async () => {
  for (const routing of [{ intent: 'chat', routes: {} }, { intent: 'guess', routes }, { intent: 'chat', routes: { ...routes, chat: { provider: ' ', model: 'm' } } }]) {
    const input: Record<string, unknown> = { routing }
    expect(() => Routing.Config(input)).toThrow()
  }
  const { ctx, live, request, assemble } = await fixture()
  const signal = new AbortController().signal
  await expect(request(signal)).rejects.toThrow('requires prompt assembly')
  await assemble(signal)
  await live.fiber.dispose()
  expect((await assemble(signal)).variables).toEqual({})
  expect(await request(signal)).toEqual(seed)
  expect((await ctx.systemPrompt.assemble()).variables).toEqual({})
})

it.each(['RATE_LIMIT', 'TRANSPORT'].flatMap(code => [false, true].map(entry => ({ code, entry }))))('keeps a failed $code request on its chosen route (entry=$entry)', async ({ code, entry }) => {
  const { LlmAdapter, LlmError, resolveProviderPolicy } = await import('@deepseek-ai/dsh-llm')
  const selection: ModelSelectionRef = { current: routes.plan, assembled: undefined }
  const { ctx, request, assemble } = await fixture('plan', entry ? { entry, selection } : {})
  const calls: string[] = []
  const adapter = new class extends LlmAdapter {
    override providerInfo(provider: string) {
      return { id: provider, name: provider, policy: resolveProviderPolicy({ capabilities: { tools: 'supported' } }) }
    }
    override resolveModel(provider: string, model: string) {
      return Promise.resolve({ provider, id: model, name: model, toolSupport: 'supported' as const })
    }
    override async *stream(options: import('@deepseek-ai/dsh-llm').GenerateOptions): AsyncIterable<never> {
      calls.push(options.provider)
      throw new LlmError('Fixture provider failed', code)
    }
  }()
  ctx.effect(() => ctx.llm.registerAdapter(Object.values(routes).map(route => route.provider), adapter))
  const signal = new AbortController().signal
  await assemble(signal)
  const config = await request(signal)
  const call = await ctx.llm.prepareCall(config)
  const chunks = []
  for await (const chunk of call.stream({ ...call.config, messages: [] })) chunks.push(chunk)
  expect(chunks).toMatchObject([{ type: 'finish', reason: { kind: 'error', failure: { code } } }])
  expect(calls).toEqual(['plan-provider'])
  expect(await request(signal)).toMatchObject({ provider: 'plan-provider', intent: 'plan' })
})

it('uses entry selection for a whole Turn and keeps pending choices and switch notices consistent', async () => {
  const selection: ModelSelectionRef = {
    current: { provider: 'picked-one', model: 'm1', reasoningEffort: ReasoningEffortId('high') }, assembled: undefined,
  }
  const { ctx, agent, request, assemble } = await fixture('plan', { entry: true, selection })
  const first = new AbortController().signal
  expect((await assemble(first)).variables).toMatchObject({ provider: 'picked-one', model: 'm1' })
  const initial = await request(first)
  expect(initial).toMatchObject({ provider: 'picked-one', model: 'm1', intent: 'plan', requiredCapabilities: ['tools'], reasoningEffort: 'high' })
  agent.session.append('request/header', { header: { config: initial }, reason: 'initial' })
  selection.current = { provider: 'picked-two', model: 'm2' }
  expect((await assemble(first)).variables).toMatchObject({ provider: 'picked-one', model: 'm1' })
  expect(await request(first)).toMatchObject({ provider: 'picked-one', model: 'm1', reasoningEffort: 'high' })
  expect(selection.current).toEqual({ provider: 'picked-two', model: 'm2' })
  const input = createUserMessage({ content: [{ type: 'text', text: 'continue' }], source: { kind: 'user' } })
  const enter = (signal: AbortSignal) => agentEvents(ctx, agent).waterfall('agent/pre-step', {
    turn: 1, step: 2, signal, messages: [input],
  }, () => Promise.resolve({ kind: 'enter' as const, messages: [input] }))
  expect(await enter(first)).toEqual({ kind: 'enter', messages: [input] })
  const second = new AbortController().signal
  expect((await assemble(second)).variables).toMatchObject({ provider: 'picked-two', model: 'm2' })
  const next = await request(second)
  expect(next).toMatchObject({ provider: 'picked-two', model: 'm2', intent: 'plan', requiredCapabilities: ['tools'] })
  expect(next).not.toHaveProperty('reasoningEffort')
  expect(await enter(second)).toMatchObject({ kind: 'enter', messages: [input, {
    source: { kind: 'model-selection' },
    content: [{ type: 'text', text: '[model changed: assistant turns above this point were generated by picked-one/m1; the session continues with picked-two/m2]' }],
  }] })
})

it('captures entry choice before asynchronous assembly and fails if the owner disappears', async () => {
  const selection: ModelSelectionRef = { current: { provider: 'first', model: 'm1' }, assembled: undefined }
  const { ctx, assemble, request, disposeSelection } = await fixture('chat', { entry: true, selection })
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  onTestFinished(() => { release.resolve(undefined) })
  const dispose = ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
    entered.resolve(undefined)
    await release.promise
    return next()
  })
  const signal = new AbortController().signal
  const pending = assemble(signal)
  await entered.promise
  selection.current = { provider: 'second', model: 'm2' }
  release.resolve(undefined)
  expect((await pending).variables).toMatchObject({ provider: 'first', model: 'm1' })
  expect(await request(signal)).toMatchObject({ provider: 'first', model: 'm1' })
  dispose()
  disposeSelection?.()
  await expect(assemble(signal)).rejects.toMatchObject({ code: 'ENTRY_MODEL_SELECTION_UNAVAILABLE' })
})

it('rejects entry routes without selection and rejects ambiguous entry configuration', async () => {
  const missing = await fixture('chat', { entry: true })
  await expect(missing.assemble(new AbortController().signal)).rejects.toMatchObject({ code: 'ENTRY_MODEL_SELECTION_UNAVAILABLE' })
  const empty = await fixture('chat', { entry: true, selection: { current: undefined, assembled: undefined } })
  await expect(empty.assemble(new AbortController().signal)).rejects.toMatchObject({ code: 'ENTRY_MODEL_SELECTION_UNAVAILABLE' })
  for (const conflict of [{ provider: 'x' }, { model: 'm' }, { reasoningEffort: 'high' }]) {
    const input: Record<string, unknown> = { routing: { intent: 'chat', routes: { ...routes, chat: { selection: 'entry', ...conflict } } } }
    expect(() => Routing.Config(input)).toThrow()
  }
})
