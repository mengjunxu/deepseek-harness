/** Native SDK question replies and withdrawal on the stdio transport. @module */
import { randomUUID } from 'node:crypto'
import { UserQuestionError, type AskUserQuestionRequest, type AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions'
import type { JsonRpcTransportPeer } from '@deepseek-ai/dsh-sdk-protocol'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAnswer(value: unknown, request: AskUserQuestionRequest): AskUserQuestionAnswer {
  const invalid = () => new UserQuestionError('answer each question id exactly once with its selected labels or custom text', 'BAD_ANSWER')
  if (!isRecord(value)) throw invalid()
  if ('cancelled' in value) {
    if (value.cancelled !== true || Object.keys(value).length !== 1) throw invalid()
    throw new UserQuestionError('SDK user dismissed the question', 'ASK_CANCELLED')
  }
  if (!Array.isArray(value.answers) || value.answers.length !== request.questions.length) throw invalid()
  const pending = new Map(request.questions.map(question => [question.id, question]))
  const answers = value.answers.map((item: unknown) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !Array.isArray(item.selected)
      || !item.selected.every((s: unknown): s is string => typeof s === 'string')
      || (item.custom !== undefined && typeof item.custom !== 'string')) throw invalid()
    const question = pending.get(item.id)
    if (question === undefined || new Set(item.selected).size !== item.selected.length
      || (item.selected.length === 0 && !item.custom?.trim())
      || (!question.multiSelect && (item.selected.length > 1 || (item.selected.length > 0 && item.custom?.trim())))
      || item.selected.some(label => !question.options?.some(option => option.label === label))) throw invalid()
    pending.delete(item.id)
    return { id: item.id, selected: item.selected, ...item.custom === undefined ? {} : { custom: item.custom } }
  })
  return { answers }
}

/**
 * Wait for a reply to this request and withdraw it when the tool or runtime stops.
 * @param peer - transport to the owning SDK client.
 * @param sessionId - owning Session identity.
 * @param request - question payload and optional tool cancellation signal.
 * @param lifetime - cancellation at server shutdown.
 * @returns the user's validated answers.
 */
export async function askClient(
  peer: JsonRpcTransportPeer, sessionId: string, request: AskUserQuestionRequest, lifetime: AbortSignal,
): Promise<AskUserQuestionAnswer> {
  const identity = { sessionId, requestId: randomUUID() }
  const signal = request.signal === undefined ? lifetime : AbortSignal.any([lifetime, request.signal])
  signal.throwIfAborted()
  const withdraw = (): void => { peer.notify('user-question.cancelled', identity) }
  signal.addEventListener('abort', withdraw, { once: true })
  try {
    const reply = await peer.request('user-question/ask', { ...identity, questions: request.questions }, signal)
    return parseAnswer(reply, request)
  } finally {
    signal.removeEventListener('abort', withdraw)
  }
}
