import { describe, expect, it, onTestFinished } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as AgentLoopInvariant from '@deepseek-ai/dsh-agent-loop/invariant'
import { createUserMessage, markAgentLoopRequest, type GenerateOptions  } from '@deepseek-ai/dsh-llm'
import type { ContextFormed } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'x': { kind: 'x' } & ContextFormed
  }
}

async function setup(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(InvariantRegistry)
  await ctx.plugin(AgentLoopInvariant)
  return ctx
}

function dispatch(ctx: Context, options: unknown): void {
  void ctx.waterfall('llm/stream', options as never, () => (async function* () {})() as never)
}

function loopRequest<T extends object>(options: T): Readonly<T> {
  markAgentLoopRequest(options as GenerateOptions)
  return Object.freeze(options)
}

async function requestSetup() {
  const ctx = await setup()
  const session = ctx.sessions.create(SessionId('req-check'))
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  const boundary = session.deriveMessages()
  const loopAttempt = Object.freeze({ stepStartSeq: session.append('step/start', { turn: 1, step: 1 }).seq, attempt: 1 })
  session.append('request/header', { header: { config: { provider: 'mock', model: 'm' } }, reason: 'initial' })
  return { ctx, session, boundary, loopAttempt }
}

describe('request-reconstruction invariant', () => {
  it('accepts a frozen request equal to the boundary derivation and folded header', async () => {
    const { ctx, session, boundary, loopAttempt } = await requestSetup()
    const options = loopRequest({ model: 'm', messages: Object.freeze(boundary), sessionId: session.id, loopAttempt })
    expect(() => { dispatch(ctx, options) }).not.toThrow()
  })

  it.each(['missing', 'different-step', 'different-attempt', 'mutable'] as const)(
    'rejects %s durable attempt attribution', async (kind) => {
      const { ctx, session, boundary, loopAttempt } = await requestSetup()
      onTestFinished(() => ctx.fiber.dispose())
      const candidate = kind === 'missing' ? undefined
        : kind === 'different-step' ? Object.freeze({ ...loopAttempt, stepStartSeq: SessionSeq(loopAttempt.stepStartSeq + 1) })
          : kind === 'different-attempt' ? Object.freeze({ ...loopAttempt, attempt: 2 }) : { ...loopAttempt }
      const options = loopRequest({ model: 'm', messages: Object.freeze(boundary), sessionId: session.id,
        ...candidate === undefined ? {} : { loopAttempt: candidate } })
      expect(() => { dispatch(ctx, options) }).toThrow(/frozen durable step and attempt ordinal/)
    },
  )

  it('matches the retry ordinal to committed assistant attempts within the current step', async () => {
    const { ctx, session, boundary, loopAttempt } = await requestSetup()
    onTestFinished(() => ctx.fiber.dispose())
    session.append('assistant/attempt', { turn: 1, step: 1, stream: [] })
    const base = { model: 'm', messages: Object.freeze(boundary), sessionId: session.id }
    expect(() => { dispatch(ctx, loopRequest({ ...base, loopAttempt })) }).toThrow(/durable step and attempt ordinal/)
    expect(() => { dispatch(ctx, loopRequest({ ...base, loopAttempt: Object.freeze({ ...loopAttempt, attempt: 2 }) })) }).not.toThrow()
  })

  it('includes context appended inside the open step before dispatch', async () => {
    const { ctx, session, loopAttempt } = await requestSetup()
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: '[step context]' }], source: { kind: 'x' },
    }), { surfaceOp: 'append' })
    const options = loopRequest({
      model: 'm',
      messages: Object.freeze(session.deriveMessages()),
      sessionId: session.id, loopAttempt,
    })
    expect(() => { dispatch(ctx, options) }).not.toThrow()
  })

  it('requires the messages to equal the boundary derivation exactly (no unlogged prefix)', async () => {
    const { ctx, session, boundary, loopAttempt } = await requestSetup()
    const extra = { role: 'user' as const, content: [{ type: 'text' as const, text: '<system-reminder>catalog</system-reminder>' }] }
    expect(() => { dispatch(ctx, loopRequest({ model: 'm', messages: Object.freeze([...boundary]), sessionId: session.id, loopAttempt })) })
      .not.toThrow()
    expect(() => { dispatch(ctx, loopRequest({ model: 'm', messages: Object.freeze([extra, ...boundary]), sessionId: session.id, loopAttempt })) })
      .toThrow(/diverges from the dispatch-time durable derivation/)
    expect(() => { dispatch(ctx, loopRequest({ model: 'm', messages: Object.freeze([...boundary, extra]), sessionId: session.id, loopAttempt })) })
      .toThrow(/diverges from the dispatch-time durable derivation/)
  })

  it('requires native response formats to match the durable request header', async () => {
    const { ctx, session, boundary, loopAttempt } = await requestSetup()
    onTestFinished(() => ctx.fiber.dispose())
    const responseFormat = { type: 'json_schema' as const, name: 'result', schema: { type: 'object' }, strict: true as const }
    session.append('request/header', {
      header: { config: { provider: 'mock', model: 'm', responseFormat } }, reason: 'change',
    })
    const base = { model: 'm', messages: Object.freeze(boundary), sessionId: session.id, loopAttempt }
    expect(() => { dispatch(ctx, loopRequest({ ...base, responseFormat: structuredClone(responseFormat) })) }).not.toThrow()
    expect(() => { dispatch(ctx, loopRequest(base)) }).toThrow(/diverges from the folded request header/)
    expect(() => { dispatch(ctx, loopRequest({ ...base, responseFormat: { ...responseFormat, name: 'changed' } })) })
      .toThrow(/diverges from the folded request header/)
  })

  it('rejects message and header divergence', async () => {
    const { ctx, session, boundary, loopAttempt } = await requestSetup()
    const divergent = [...boundary, { role: 'user', content: [{ type: 'text', text: 'phantom' }] }]
    expect(() => { dispatch(ctx, loopRequest({ model: 'm', messages: Object.freeze(divergent), sessionId: session.id, loopAttempt })) })
      .toThrow(/diverges from the dispatch-time durable derivation/)
    expect(() => { dispatch(ctx, loopRequest({ model: 'other', messages: Object.freeze(boundary), sessionId: session.id, loopAttempt })) })
      .toThrow(/diverges from the folded request header/)
    // The system prompt is surface node 0 inside `messages`; a `system` field is an unlogged prefix.
    expect(() => { dispatch(ctx, loopRequest({ model: 'm', system: 'unlogged', messages: Object.freeze(boundary), sessionId: session.id, loopAttempt })) })
      .toThrow(/diverges from the folded request header/)
  })

  it('rejects loop requests with no boundary or header', async () => {
    const ctx = await setup()
    const session = ctx.sessions.create(SessionId('req-bare'))
    session.append('turn/start', { turn: 1 })
    const bare = loopRequest({ model: 'm', messages: Object.freeze([]), sessionId: session.id })
    expect(() => { dispatch(ctx, bare) }).toThrow(/no step\/start/)
    session.append('step/start', { turn: 1, step: 1 })
    expect(() => { dispatch(ctx, bare) }).toThrow(/no request\/header event/)
  })

  it('rejects an unfrozen messages array but skips requests outside the loop contract', async () => {
    const { ctx, session, boundary, loopAttempt } = await requestSetup()
    expect(() => { dispatch(ctx, loopRequest({ model: 'm', messages: [...boundary], sessionId: session.id, loopAttempt })) })
      .toThrow(/frozen messages array/)
    expect(() => { dispatch(ctx, { model: 'summarizer', messages: [], sessionId: session.id, loopAttempt }) }).not.toThrow()
    expect(() => { dispatch(ctx, Object.freeze({ model: 'm', messages: Object.freeze([]) })) }).not.toThrow()
    expect(() => { dispatch(ctx, Object.freeze({ model: 'm', messages: Object.freeze([]), sessionId: SessionId('ghost') })) })
      .not.toThrow()

    const directSession = ctx.sessions.create(SessionId('direct-one-shot'))
    expect(() => {
      dispatch(ctx, Object.freeze({ model: 'one-shot', messages: Object.freeze([]), sessionId: directSession.id }))
    }).not.toThrow()
  })

  it('rejects malformed requests carrying the loop marker', async () => {
    const { ctx, session, loopAttempt } = await requestSetup()
    const messages: GenerateOptions['messages'] = []
    Object.freeze(messages)
    expect(() => {
      dispatch(ctx, markAgentLoopRequest({ provider: 'p', model: 'm', messages, sessionId: session.id, loopAttempt }))
    }).toThrow(/request must be frozen/)
    expect(() => {
      dispatch(ctx, loopRequest({ model: 'm', messages: Object.freeze([]) }))
    }).toThrow(/carry a session id/)
    expect(() => {
      dispatch(ctx, loopRequest({
        model: 'm',
        messages: Object.freeze([]),
        sessionId: SessionId('missing-loop-session'),
      }))
    }).toThrow(/live session id/)
  })

  it('prepends ahead of a short-circuiting stream listener', async () => {
    const ctx = new Context()
    await ctx.plugin(SessionStore)
    ctx.on('llm/stream', () => (async function* () {})() as never)
    await ctx.plugin(InvariantRegistry)
    await ctx.plugin(AgentLoopInvariant)
    const session = ctx.sessions.create(SessionId('prepend-check'))
    session.append('turn/start', { turn: 1 })
    session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    const loopAttempt = Object.freeze({ stepStartSeq: session.append('step/start', { turn: 1, step: 1 }).seq, attempt: 1 })
    session.append('request/header', { header: { config: { provider: 'mock', model: 'm' } }, reason: 'initial' })
    const divergent = loopRequest({
      model: 'm',
      messages: Object.freeze([{ role: 'user', content: [{ type: 'text', text: 'phantom' }] }]),
      sessionId: session.id, loopAttempt,
    })
    expect(() => { dispatch(ctx, divergent) }).toThrow(/diverges from the dispatch-time durable derivation/)
  })
})
