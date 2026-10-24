import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import * as LlmPiAi from '@deepseek-ai/dsh-llm-pi-ai'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

/**
 * P0-03 provider matrix: the OpenAI-compatible route against a local endpoint.
 *
 * These cases pin the four paths the DSH provider matrix records for an
 * API-key route: a completed stream, credential rejection, quota exhaustion,
 * and a credential that was never configured. The endpoint is local, so the
 * evidence is mock-backed, not a real OpenAI call.
 */

const OPENAI_KEY_ENV = 'OPENAI_API_KEY'

/** A minimal complete text generation in the OpenAI Responses event shape. */
const responsesEvents = [
  '{"type":"response.created","response":{"id":"resp_mock"}}',
  '{"type":"response.output_item.added","output_index":0,"item":{"type":"message","id":"msg_mock","role":"assistant"}}',
  '{"type":"response.output_text.delta","output_index":0,"delta":"hello"}',
  '{"type":"response.output_item.done","output_index":0,"item":{"type":"message","id":"msg_mock","role":"assistant","content":[{"type":"output_text","text":"hello"}]}}',
  '{"type":"response.completed","response":{"id":"resp_mock","status":"completed","usage":{"input_tokens":3,"output_tokens":1,"total_tokens":4},"output":[{"type":"message","id":"msg_mock","role":"assistant","content":[{"type":"output_text","text":"hello"}]}]}}',
]

afterEach(async () => {
  vi.unstubAllEnvs()
  await closeMockServers()
})

beforeEach(() => {
  vi.stubEnv(OPENAI_KEY_ENV, 'test-key')
})

async function openAiRoute(baseURL: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmPiAi, {
    providers: {
      openai: {
        apiKeyEnv: OPENAI_KEY_ENV,
        api: 'openai-completions',
        baseURL: `${baseURL}/v1`,
        models: [{ id: 'gpt-mock', contextWindow: 65_536, maxTokens: 4096 }],
      },
    },
  })
  return ctx
}

/** The catalog `openai` route shape: Responses protocol, endpoint overridden for the test. */
async function openAiResponsesRoute(baseURL: string): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(LlmPiAi, {
    providers: {
      openai: {
        apiKeyEnv: OPENAI_KEY_ENV,
        baseURL,
        models: [{ id: 'gpt-mock', contextWindow: 65_536, maxTokens: 4096 }],
      },
    },
  })
  return ctx
}

const options: Omit<GenerateOptions, 'provider'> = {
  model: 'gpt-mock',
  messages: [createUserMessage({
    content: [{ type: 'text', text: 'hi' }],
    source: { kind: 'model', provider: 'openai', model: 'gpt-mock' },
  })],
}

function openAiError(message: string, type: string, code?: string): string {
  return JSON.stringify({ error: { message, type, ...code === undefined ? {} : { code } } })
}

describe('OpenAI API-key route capability matrix', () => {
  it('completes a streamed text response with usage', async () => {
    const server = await mockServer([{ events: textEvents }])
    const ctx = await openAiRoute(server.url)
    const result = await assemble(ctx, { ...options, provider: 'openai' })

    expect(result.message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(result.usage).toMatchObject({ inputTokens: 3, outputTokens: 1 })
    expect(server.paths).toEqual(['/v1/chat/completions'])
    expect(server.headers[0]?.authorization).toBe('Bearer test-key')
  })

  it('reports a rejected key as AUTH without completing the turn', async () => {
    const server = await mockServer([{
      status: 401,
      body: openAiError('Incorrect API key provided: test-key.', 'invalid_request_error', 'invalid_api_key'),
    }])
    const ctx = await openAiRoute(server.url)
    const result = await assemble(ctx, { ...options, provider: 'openai' })

    expect(result.finish).toMatchObject({ kind: 'error', failure: { code: 'AUTH' } })
    expect(result.message.content).toEqual([])
  })

  it('reports exhausted account quota as QUOTA, not a rate limit', async () => {
    const server = await mockServer([{
      status: 429,
      body: openAiError(
        'You exceeded your current quota, please check your plan and billing details.',
        'insufficient_quota',
        'insufficient_quota',
      ),
    }])
    const ctx = await openAiRoute(server.url)
    const result = await assemble(ctx, { ...options, provider: 'openai' })

    expect(result.finish).toMatchObject({ kind: 'error', failure: { code: 'QUOTA' } })
  })

  it('fails an unconfigured credential before any request is sent', async () => {
    vi.stubEnv(OPENAI_KEY_ENV, '')
    const server = await mockServer([{ events: textEvents }])
    const ctx = await openAiRoute(server.url)
    const result = await assemble(ctx, { ...options, provider: 'openai' })

    expect(result.finish).toMatchObject({ kind: 'error', failure: { code: 'MISSING_CREDENTIAL' } })
    expect(server.requests).toHaveLength(0)
  })

  it('completes a streamed response on the catalog Responses route', async () => {
    const server = await mockServer([{ events: responsesEvents }])
    const ctx = await openAiResponsesRoute(server.url)
    const result = await assemble(ctx, { ...options, provider: 'openai' })

    expect(result.message.content).toEqual([{ type: 'text', text: 'hello' }])
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(result.usage).toMatchObject({ inputTokens: 3, outputTokens: 1, totalTokens: 4 })
    expect(server.paths).toEqual(['/responses'])
    expect(server.headers[0]?.authorization).toBe('Bearer test-key')
  })

  it('reports a rejected key on the catalog Responses route as AUTH', async () => {
    const server = await mockServer([{
      status: 401,
      body: openAiError('Incorrect API key provided: test-key.', 'invalid_request_error', 'invalid_api_key'),
    }])
    const ctx = await openAiResponsesRoute(server.url)
    const result = await assemble(ctx, { ...options, provider: 'openai' })

    expect(result.finish).toMatchObject({ kind: 'error', failure: { code: 'AUTH' } })
  })
})
