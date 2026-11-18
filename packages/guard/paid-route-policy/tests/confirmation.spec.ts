/** Native confirmation reuses real Agents, approval audit and downstream accounting. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished } from 'vitest'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionStore, { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import LlmRuntime, { createUserMessage, type GenerateOptions } from '@deepseek-ai/dsh-llm'
import Approval, { type ApprovalOutcome, type ApprovalRequest } from '@deepseek-ai/dsh-user-approval'
import * as Records from '../../../llm/token-meter/src/request-records.ts'
import { disposeApplication } from '@deepseek-ai/dsh-app-boot'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import * as Policy from '../src/index.ts'
import { Adapter } from './adapter.ts'

async function fixture(options: { approval?: boolean; preset?: boolean; openTurn?: boolean } = {}) {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  await ctx.plugin(LlmRuntime); await ctx.plugin(SessionStore); await ctx.plugin(SessionProjections)
  await ctx.plugin(SystemPrompt); await ctx.plugin(Tools); await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  if (options.approval !== false) await ctx.plugin(Approval)
  await ctx.plugin(Records)
  const adapter = new Adapter()
  ctx.effect(() => ctx.llm.registerAdapter(['paid'], adapter))
  let reservations = 0
  ctx.on('llm/dispatch', async function* (_dispatch, next) { reservations++; yield* next() })
  const live = await liveConfig(ctx, Policy, { onMissingGrant: 'ask',
    grants: options.preset ? [{ provider: 'paid', models: ['m'] }] : [] })
  const agent = await ctx.agentLoop.create(SessionId('confirmation-session'), { provider: 'paid', model: 'm' })
  if (options.openTurn !== false) agent.session.append('turn/start', { turn: 1 })
  const call: GenerateOptions = { provider: 'paid', model: 'm', messages: [], sessionId: agent.id,
    loopAttempt: { stepStartSeq: SessionSeq(4), attempt: 1 } }
  return { ctx, agent, adapter, live, call, reservations: () => reservations }
}

it('asks once per dispatch and records the exact route/attempt before any reservation', async () => {
  const { ctx, agent, adapter, call, reservations } = await fixture()
  const asked: ApprovalRequest[] = []
  ctx.on('approval/request', (req) => {
    expect(reservations()).toBe(asked.length)
    expect(adapter.calls).toBe(asked.length)
    expect(req.agent).toBe(agent)
    asked.push(req)
    return Promise.resolve<ApprovalOutcome>('allowed-once')
  })
  for (const attempt of [1, 2]) {
    const prepared = await ctx.llm.prepareCall(call)
    expect(asked).toHaveLength(attempt - 1)
    await Array.fromAsync(prepared.stream({ ...call, loopAttempt: { stepStartSeq: SessionSeq(4), attempt } }))
  }
  expect(adapter.calls).toBe(2)
  expect(asked.map(req => req.reason)).toEqual([1, 2].map(n => `API-metered native inference "paid"/"m"; step/start 4, attempt ${n}`))
  expect(asked[0]?.displayReason?.['zh']).toContain('费用和官方余额未知')
  const audit = agent.session.snapshotEvents().filter(event => event.type.startsWith('approval/'))
  expect(audit.map(event => event.type)).toEqual(['approval/asked', 'approval/decided', 'approval/asked', 'approval/decided'])
  expect(audit[0]?.data).toMatchObject({ toolName: 'llm', reason: asked[0]?.reason })
  expect(audit[0]?.data).not.toHaveProperty('displayReason')
  expect(agent.session.snapshotEvents().filter(e => e.type === 'llm/request-accounting')).toHaveLength(2)
})

it.each(['rejected', 'unavailable'] as const)('keeps %s decisions out of reservations and settled counts', async (outcome) => {
  const { ctx, agent, adapter, call, reservations } = await fixture()
  if (outcome === 'rejected') ctx.on('approval/request', () => Promise.resolve<ApprovalOutcome>(outcome))
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1)).toMatchObject({ reason: { kind: 'error',
    failure: { code: outcome === 'rejected' ? 'PAID_ROUTE_CONSENT_DENIED' : 'PAID_ROUTE_CONSENT_UNAVAILABLE' } } })
  expect(adapter.calls).toBe(0); expect(reservations()).toBe(0)
  expect(agent.session.snapshotEvents().filter(e => e.type === 'llm/request-accounting')).toHaveLength(0)
  expect(agent.session.snapshotEvents().find(e => e.type === 'approval/decided')?.data).toMatchObject({ outcome })
})

it('uses exact presets without asking and does not classify another source as paid', async () => {
  const { ctx, call, adapter, live } = await fixture({ preset: true })
  ctx.on('approval/request', () => { throw new Error('Preset must not ask') })
  await Array.fromAsync(ctx.llm.stream(call))
  expect(adapter.calls).toBe(1)
  await live.update({ grants: [] })
  const local = new Adapter('local')
  ctx.effect(() => ctx.llm.registerAdapter(['local'], local))
  await Array.fromAsync(ctx.llm.stream({ ...call, provider: 'local' }))
  expect(local.calls).toBe(1)
})

it.each(['service', 'agent', 'session'] as const)('fails closed without the live %s', async (missing) => {
  const { ctx, call, adapter, reservations } = await fixture({ approval: missing !== 'service' })
  const { sessionId: _sessionId, ...anonymous } = call
  const request = missing === 'agent' ? { ...call, sessionId: SessionId('absent') }
    : missing === 'session' ? anonymous : call
  expect((await Array.fromAsync(ctx.llm.stream(request))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'PAID_ROUTE_CONSENT_UNAVAILABLE' } } })
  expect(adapter.calls).toBe(0); expect(reservations()).toBe(0)
})

it.each(['caller', 'unload', 'shutdown', 'revoke'] as const)('withdraws pending consent on %s without native work', async (owner) => {
  const { ctx, agent, adapter, call, live, reservations } = await fixture()
  const entered = Promise.withResolvers<undefined>(), answer = Promise.withResolvers<ApprovalOutcome>()
  const caller = new AbortController()
  ctx.on('approval/request', () => { entered.resolve(undefined); return answer.promise })
  const pending = Array.fromAsync(ctx.llm.stream({ ...call, signal: caller.signal }))
  onTestFinished(async () => { caller.abort(); answer.resolve('allowed-once'); await pending })
  await entered.promise
  expect(reservations()).toBe(0)
  if (owner === 'caller') caller.abort()
  else if (owner === 'unload') await live.fiber.dispose()
  else if (owner === 'shutdown') await disposeApplication(ctx)
  else await live.update({ onMissingGrant: 'deny' })
  answer.resolve('allowed-once')
  expect((await pending).at(-1)).toMatchObject({ reason: { failure: { code: owner === 'revoke' ? 'PAID_ROUTE_CONSENT_REVOKED' : 'ABORTED' } } })
  expect(adapter.calls).toBe(0); expect(reservations()).toBe(0)
  expect(agent.session.snapshotEvents().find(e => e.type === 'approval/decided')?.data)
    .toMatchObject({ outcome: owner === 'revoke' ? 'allowed-once' : 'cancelled' })
})

it('does not share one grant with a simultaneous request or an auxiliary request', async () => {
  const { ctx, call, adapter, reservations } = await fixture()
  const entered = Promise.withResolvers<undefined>()
  const first = Promise.withResolvers<ApprovalOutcome>(), second = Promise.withResolvers<ApprovalOutcome>()
  const requests: ApprovalRequest[] = []
  ctx.on('approval/request', (req) => {
    requests.push(req)
    if (requests.length === 2) entered.resolve(undefined)
    return requests.length === 1 ? first.promise : second.promise
  })
  const one = Array.fromAsync(ctx.llm.stream(call))
  const { loopAttempt: _loopAttempt, ...auxiliary } = call
  const two = Array.fromAsync(ctx.llm.stream({ ...auxiliary, purpose: 'compaction' }))
  onTestFinished(async () => { first.resolve('rejected'); second.resolve('rejected'); await Promise.all([one, two]) })
  await entered.promise
  first.resolve('allowed-once'); await one
  expect(adapter.calls).toBe(1); expect(reservations()).toBe(1)
  second.resolve('rejected'); await two
  expect(adapter.calls).toBe(1)
  expect(requests[1]?.reason).toBe('API-metered native inference "paid"/"m"; purpose compaction')
})

it('honors the Session never policy and skips already cancelled requests', async () => {
  const { ctx, call, agent, adapter } = await fixture()
  ctx.approval.setPolicy(agent, 'never')
  ctx.on('approval/request', () => { throw new Error('Never must not ask') })
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1)).toMatchObject({ reason: { failure: { code: 'PAID_ROUTE_CONSENT_DENIED' } } })
  const controller = new AbortController(); controller.abort()
  expect((await Array.fromAsync(ctx.llm.stream({ ...call, signal: controller.signal }))).at(-1)).toMatchObject({ reason: { kind: 'aborted' } })
  expect(adapter.calls).toBe(0)
  expect(agent.session.snapshotEvents().filter(e => e.type === 'approval/asked')).toHaveLength(1)
})

it('observes a missing-grant policy change before its authorization listener runs', async () => {
  const { ctx, call, live, adapter, reservations } = await fixture()
  ctx.on('llm/authorize', async function* (_dispatch, next) {
    await live.update({ onMissingGrant: 'deny' })
    yield* next()
  }, { prepend: true })
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'PAID_ROUTE_CONSENT_REQUIRED' } } })
  expect(adapter.calls).toBe(0); expect(reservations()).toBe(0)
})

it('does not turn a revoked preset into implicit consent while ask mode remains enabled', async () => {
  const { ctx, call, live, adapter } = await fixture({ preset: true })
  ctx.on('approval/request', () => { throw new Error('A revoked preset must not ask after reservation') })
  ctx.on('llm/dispatch', async function* (_dispatch, next) {
    await live.update({ grants: [] })
    yield* next()
  })
  expect((await Array.fromAsync(ctx.llm.stream(call))).at(-1))
    .toMatchObject({ reason: { failure: { code: 'PAID_ROUTE_CONSENT_REVOKED' } } })
  expect(adapter.calls).toBe(0)
})

it('asks again on a real loop retry and stops when the second request is denied', async () => {
  const { ctx, agent, adapter, reservations } = await fixture({ openTurn: false })
  let questions = 0, nativeCalls = 0
  const reasons: string[] = []
  ctx.on('approval/request', (req) => {
    reasons.push(req.reason ?? '')
    questions++
    return Promise.resolve<ApprovalOutcome>(questions === 1 ? 'allowed-once' : 'rejected')
  })
  adapter.stream = async function* () {
    nativeCalls++
    yield { type: 'finish', reason: { kind: 'error', failure: { code: 'RATE_LIMIT', message: 'Fixture busy' } } }
  }
  ctx.on('agent/request-error', async ({ failure }) => failure.code === 'RATE_LIMIT' ? { kind: 'retry' } : undefined)
  agent.followup(createUserMessage({ content: [{ type: 'text', text: 'Answer once.' }], source: { kind: 'user' } }))
  await agent.whenIdle()
  expect(questions).toBe(2); expect(nativeCalls).toBe(1); expect(reservations()).toBe(1)
  const events = agent.session.snapshotEvents(), stepSeq = events.find(e => e.type === 'step/start')?.seq
  expect(reasons).toEqual([1, 2].map(attempt => `API-metered native inference "paid"/"m"; step/start ${stepSeq}, attempt ${attempt}`))
  expect(events.filter(e => e.type === 'llm/request-accounting')).toHaveLength(1)
  expect(events.findLast(e => e.type === 'turn/end')?.data).toMatchObject({ reason: { kind: 'error' } })
})
