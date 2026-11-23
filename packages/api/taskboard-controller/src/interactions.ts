/** Bind pending SDK questions and approvals to the Run that owns their live transport. */
import { brandString } from '@deepseek-ai/dsh-brand'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { z } from 'zod'
import type { RuntimeBinding } from './execution-domain.ts'
import type { TaskExecutions } from './execution.ts'
import type { ProjectId, TaskId, TaskInteractionId, TaskInteractionReply, TaskPendingInteraction, TaskQuestionReply, TaskRunId } from './types.ts'

const identity = z.uuid().transform(brandString<TaskInteractionId>)
const lifecycleNotice = z.object({ requestId: identity, sessionId: z.string().min(1) })
const text = z.string().min(1)
const question = z.object({
  id: text, question: text, detail: z.string().optional(), header: z.string().optional(), multiSelect: z.boolean().optional(),
  options: z.array(z.object({ label: text, description: z.string().optional() })).optional(),
  intent: z.object({ kind: z.literal('plan-review'), approve: text, callId: text.optional() }).optional(),
})
const questionRequest = lifecycleNotice.extend({ questions: z.array(question).min(1) })
const approvalRequest = lifecycleNotice.extend({ toolName: text, callId: text.optional(), reason: z.string().optional() })
const outcome = z.enum(['allowed-once', 'rejected', 'cancelled'])
const questionReply = z.union([
  z.strictObject({ cancelled: z.literal(true) }),
  z.strictObject({ answers: z.array(z.strictObject({ id: text, selected: z.array(text), custom: z.string().optional() })) }),
])
const scope = z.strictObject({
  projectId: z.uuid().transform(brandString<ProjectId>), taskId: z.uuid().transform(brandString<TaskId>),
  runId: z.uuid().transform(brandString<TaskRunId>), requestId: identity,
})

/** Authenticated operator replies retain the owning Run and request kind. */
export const interactionReply = z.discriminatedUnion('kind', [
  scope.extend({ kind: z.literal('approval'), outcome }),
  scope.extend({ kind: z.literal('question'), result: questionReply }),
])

type SdkReply = TaskQuestionReply | { outcome: z.output<typeof outcome> }

interface Pending {
  owner: RuntimeBinding
  sessionId: SessionId
  request: TaskPendingInteraction
  response: PromiseWithResolvers<SdkReply>
  committed: Promise<void>
  ready: boolean
  answering: boolean
}

function sameRun(a: RuntimeBinding, b: RuntimeBinding): boolean {
  return a.runId === b.runId && a.runtimeId === b.runtimeId && a.generation === b.generation
}

function validAnswer(questions: Extract<TaskPendingInteraction, { kind: 'question' }>['questions'], result: TaskQuestionReply): boolean {
  if ('cancelled' in result) return true
  if (result.answers.length !== questions.length) return false
  const pending = new Map(questions.map(item => [item.id, item]))
  return result.answers.every(({ id, selected, custom }) => {
    const item = pending.get(id)
    if (!item || new Set(selected).size !== selected.length || (!selected.length && !custom?.trim())
      || (!item.multiSelect && (selected.length > 1 || (selected.length > 0 && custom?.trim())))
      || selected.some(label => !item.options?.some(option => option.label === label))) return false
    pending.delete(id)
    return true
  })
}

/** Holds the single live responder for each native SDK request. */
export class RunInteractions {
  private readonly pending = new Map<string, Pending>()

  /** @param executions - authoritative owner for Run and interaction records. */
  constructor(private readonly executions: TaskExecutions) {}

  /**
   * Admit a request received from the Run's exclusive SDK connection.
   * @param owner - Run and lease bound to that connection.
   * @param sessionId - root Session bound to that Run.
   * @param method - native SDK host-request method.
   * @param payload - raw SDK parameters.
   * @returns the operator response or native cancellation.
   */
  async request(owner: RuntimeBinding, sessionId: SessionId, method: string, payload: Record<string, unknown>): Promise<SdkReply> {
    let request: TaskPendingInteraction
    if (method === 'user-question/ask') {
      const { sessionId: actual, ...parsed } = questionRequest.parse(payload)
      if (actual !== sessionId) throw new Error('question belongs to another Run Session')
      request = { kind: 'question', ...parsed }
    } else if (method === 'approval/request') {
      const { sessionId: actual, ...parsed } = approvalRequest.parse(payload)
      if (actual !== sessionId) throw new Error('approval belongs to another Run Session')
      request = { kind: 'approval', ...parsed }
    } else {
      throw new Error('unsupported Taskboard SDK request')
    }
    const id = request.requestId
    const key = JSON.stringify([owner.runId, id])
    if (this.pending.has(key)) throw new Error('SDK request identity is already active')
    const response = Promise.withResolvers<SdkReply>()
    const committed = this.executions.interaction(owner, {
      kind: request.kind, requestId: id, sessionId, state: 'pending',
    })
    const entry: Pending = { owner, sessionId, request, response, committed, ready: false, answering: false }
    this.pending.set(key, entry)
    try {
      await committed
      entry.ready = true
      return await response.promise
    } finally {
      if (this.pending.get(key) === entry) this.pending.delete(key)
    }
  }

  /**
   * Read the payloads of this Run's pending SDK requests.
   * @param owner - original Run and lease binding.
   * @returns a detached view of active operator requests.
   */
  list(owner: RuntimeBinding): TaskPendingInteraction[] {
    return Array.from(this.pending.values())
      .filter(entry => entry.ready && !entry.answering && sameRun(entry.owner, owner))
      .map(entry => structuredClone(entry.request))
  }

  /**
   * Route one operator decision to exactly one live SDK request.
   * @param owner - original Run binding.
   * @param reply - validated operator response.
   * @returns after recording operator submission and delivering it to the live responder.
   */
  async answer(owner: RuntimeBinding, reply: TaskInteractionReply): Promise<void> {
    const { requestId } = reply
    const key = JSON.stringify([owner.runId, requestId])
    const entry = this.pending.get(key)
    if (!entry?.ready || entry.answering || !sameRun(entry.owner, owner) || entry.request.kind !== reply.kind) {
      throw new Error('SDK request is no longer pending for this Run')
    }
    let response: SdkReply
    if (reply.kind === 'question' && entry.request.kind === 'question') {
      if (!validAnswer(entry.request.questions, reply.result)) throw new Error('answer must match each offered question')
      response = reply.result
    } else if (reply.kind === 'approval') {
      response = { outcome: reply.outcome }
    } else throw new Error('SDK request kind does not match the response')
    entry.answering = true
    try {
      await this.executions.interaction(owner, { kind: reply.kind, requestId, sessionId: entry.sessionId, state: 'answered' })
      if (this.pending.get(key) !== entry) throw new Error('SDK request was withdrawn')
      this.pending.delete(key)
      entry.response.resolve(response)
    } finally {
      entry.answering = false
    }
  }

  /**
   * Withdraw the matching request after native cancellation.
   * @param owner - connection that emitted the notification.
   * @param method - SDK cancellation method.
   * @param payload - native cancellation identity.
   * @returns after updating the durable interaction when it is still pending.
   */
  async withdraw(owner: RuntimeBinding, method: string, payload: Record<string, unknown>): Promise<void> {
    const notice = lifecycleNotice.safeParse(payload)
    if (!notice.success) return
    const entry = this.pending.get(JSON.stringify([owner.runId, notice.data.requestId]))
    const kind = method === 'approval.cancelled' ? 'approval' : 'question'
    if (entry && entry.request.kind === kind && entry.sessionId === notice.data.sessionId && sameRun(entry.owner, owner)) {
      await this.cancel(entry)
    }
  }

  /**
   * Withdraw all requests owned by the closing SDK connection.
   * @param owner - original Run and lease binding.
   * @returns after recording withdrawal of still-pending interactions.
   */
  async close(owner: RuntimeBinding): Promise<void> {
    await Promise.all(Array.from(this.pending.values()).filter(entry => sameRun(entry.owner, owner)).map(entry => this.cancel(entry)))
  }

  private async cancel(entry: Pending): Promise<void> {
    const { kind, requestId } = entry.request
    this.pending.delete(JSON.stringify([entry.owner.runId, requestId]))
    entry.response.resolve(kind === 'question' ? { cancelled: true } : { outcome: 'cancelled' })
    await entry.committed
    await this.executions.interaction(entry.owner, { kind, requestId, sessionId: entry.sessionId, state: 'withdrawn' })
  }
}
