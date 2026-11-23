/** One explicit, tool-free assessment of the sealed delivery's validation coverage. */
import type { Context } from '@deepseek-ai/cordis'
import { BlockAssembler, createUserMessage, type Message } from '@deepseek-ai/dsh-llm'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { CommandId, DeliveryId, ModelReviewAttempt, ModelReviewCommand } from './types.ts'

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Exact tool-free request authorized for one Taskboard delivery. */
    'taskboard/review-request': {
      commandId: CommandId
      deliveryId: DeliveryId
      snapshot: string
      provider: string
      model: string
      intent: 'review'
      system: string
      messages: Message[]
      maxTokens: number
    }
  }
}

/** Deployment-selected model and per-delivery request limits. */
export interface CoverageReviewConfig {
  /** Provider registered on the Web Host for coverage assessments. */
  provider: string
  /** Model offered to the operator before dispatch. */
  model: string
  /** Maximum output tokens requested for one assessment. */
  maxOutputTokens: number
  /** Deadline in milliseconds from reservation to assessment. */
  timeoutMs: number
  /** Maximum explicit requests for one sealed delivery, including failed attempts. */
  maxAttempts: number
}

/**
 * Persist the exact request before sending the redacted package to the selected model.
 * @param ctx - Host with its native model route and Session storage.
 * @param config - route and limits confirmed for this assessment.
 * @param command - authenticated operator selection.
 * @param attempt - committed request identifying the dedicated review Session.
 * @param reviewPackage - sealed delivery coverage without project text or paths.
 * @param signal - Host lifetime and request deadline.
 * @returns the reviewer's text for the human reviewer.
 */
export async function assessCoverage(ctx: Context, config: CoverageReviewConfig, command: ModelReviewCommand, attempt: ModelReviewAttempt,
  reviewPackage: string, signal: AbortSignal): Promise<string> {
  const llm = ctx.get('llm')
  const persistence = ctx.get('sessionPersistence')
  if (!llm || !persistence) throw new Error('review services unavailable')
  const sessionId = SessionId(attempt.sessionId)
  const session = Session.create(sessionId)
  const handle = await persistence.create(session.header, { signal })
  try {
    const { provider, model, maxOutputTokens: maxTokens } = config
    const system = [
      'Review the validation coverage in this JSON summary for a human deciding whether to accept a software delivery.',
      'Report failed or missing checks and what the recorded evidence can establish. The summary contains no source code.',
      command.language === 'zh' ? 'Write the assessment in Chinese.' : 'Write the assessment in English.',
    ].join(' ')
    const messages = [createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: reviewPackage }] })]
    const intent = 'review' as const
    const event = session.append('taskboard/review-request', { commandId: command.commandId, deliveryId: command.deliveryId,
      snapshot: command.snapshot, provider, model, intent, system, messages, maxTokens })
    await handle.append([event], { signal })
    await handle.flush({ signal })
    signal.throwIfAborted()
    const output = new BlockAssembler()
    let stopped = false
    for await (const chunk of llm.stream({ provider, model, sessionId, intent, system, messages, maxTokens, signal })) {
      signal.throwIfAborted()
      output.push(chunk)
      if (chunk.type === 'finish') stopped = chunk.reason.kind === 'stop'
    }
    signal.throwIfAborted()
    const blocks = output.blocks()
    if (!stopped || blocks.some(block => block.type !== 'text' && block.type !== 'reasoning')) throw new Error('incomplete model review')
    const summary = blocks.filter(block => block.type === 'text').map(block => block.text).join('').trim()
    if (!summary) throw new Error('model review returned no text')
    return summary
  } finally {
    await handle.close()
  }
}
