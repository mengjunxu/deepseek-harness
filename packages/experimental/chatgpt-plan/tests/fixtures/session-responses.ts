/** Session-driven Responses transport for the keyless SIWC headless composition. */
import { readFile } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { parseSessionLog } from '@deepseek-ai/dsh-llm-replay'

const requestSchema = z.object({
  model: z.literal('siwc-fixture'), store: z.literal(false), stream: z.literal(true),
  input: z.array(z.unknown()),
  tools: z.array(z.object({ type: z.literal('namespace'), name: z.literal('dsh'),
    description: z.literal('Tools available in this DSH session.') })),
}).loose()

export const name = 'siwc-session-responses'
export const inject = ['credentials']

/** Mount fake account transport while the production SIWC adapter owns inference.
 * @param ctx - isolated headless fixture context with private credential storage.
 * @returns completion after the fake grant and exact transport guard are installed.
 */
export async function apply(ctx: Context): Promise<void> {
  const file = process.env.DSH_SNAPSHOT_FILE
  if (!file) throw new Error('SIWC fixture requires the selected Session file')
  const replies = parseSessionLog(await readFile(file, 'utf8')).flatMap((event) => {
    if (event.type !== 'assistant/message') return []
    if (event.data.message.source.provider !== 'chatgpt-plan' || event.data.usage === undefined
      || event.data.message.content.some(block => block.type !== 'text')) {
      throw new Error('SIWC fixture requires text-only ChatGPT plan replies with recorded usage')
    }
    return [{ text: event.data.message.content.map(block => block.type === 'text' ? block.text : '').join(''),
      usage: event.data.usage }]
  })
  if (replies.length === 0) throw new Error('SIWC fixture has no recorded replies')
  await ctx.credentials.modifyRecord(credentialKey('experimental-chatgpt-plan', 'default'), async () => ({
    kind: 'grant', payload: { clientId: 'oaiapp_snapshot', subject: 'snapshot-account',
      access: 'snapshot-access', refresh: 'snapshot-refresh', idToken: 'snapshot-id',
      expiresAt: Date.now() + 3_600_000, welcomeAcknowledged: true },
  }))
  ctx.effect(() => {
    const original = globalThis.fetch
    let call = 0
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init)
      if (request.url !== 'https://api.openai.com/v1/responses' || request.method !== 'POST'
        || request.headers.get('authorization') !== 'Bearer snapshot-access') {
        throw new Error(`Unexpected SIWC fixture request: ${request.method} ${request.url}`)
      }
      const body: unknown = await request.json()
      const parsed = requestSchema.parse(body)
      for (const field of ['max_output_tokens', 'temperature', 'previous_response_id']) {
        if (field in parsed) throw new Error(`SIWC payload contains forbidden field ${field}`)
      }
      const reply = replies[call++]
      if (!reply) throw new Error('SIWC requested more responses than its recorded Session')
      const id = `siwc-message-${call}`
      const events: object[] = [
        { type: 'response.created', response: { id: `siwc-response-${call}` } },
        { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id, role: 'assistant' } },
      ]
      for (let offset = 0; offset < reply.text.length; offset += 32) {
        events.push({ type: 'response.output_text.delta', output_index: 0, delta: reply.text.slice(offset, offset + 32) })
      }
      events.push({ type: 'response.output_item.done', output_index: 0, item: { type: 'message', id, role: 'assistant',
        content: [{ type: 'output_text', text: reply.text }] } },
      { type: 'response.completed', response: { status: 'completed', usage: {
        input_tokens: reply.usage.inputTokens, output_tokens: reply.usage.outputTokens,
        total_tokens: reply.usage.totalTokens ?? reply.usage.inputTokens + reply.usage.outputTokens,
      } } })
      return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    return () => { globalThis.fetch = original }
  })
}
