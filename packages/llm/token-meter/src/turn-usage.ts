import { lastAssistantStreamChunk } from '@deepseek-ai/dsh-llm/assistant-stream'
import type { AssistantMessage, LlmUsageSource, TokenUsage } from '@deepseek-ai/dsh-llm/types'
import type {} from '@deepseek-ai/dsh-llm-retry/types'
import type { SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { RequestAccountingRecord } from './request-record-types.ts'

/** One counted model route and its captured usage-source declaration. */
export interface TurnTokenUsageRoute {
  readonly provider: string
  readonly model: string
  /** Unknown without unique accounting explicitly linked to this loop attempt. */
  readonly usageSource: LlmUsageSource
}

/** Arithmetic totals from recorded adapter token samples for one completed Turn. */
export interface TurnTokenUsage {
  /** Absent when all samples are unknown; mixed includes different or partially unknown measurements. */
  readonly measurement?: NonNullable<TokenUsage['measurement']> | 'mixed'
  /** Sum of uncached prompt input across all attempts. */
  readonly uncachedInputTokens: number
  readonly outputTokens: number
  /** Exact aggregate prompt plus output total across all attempts. */
  readonly totalTokens: number
  /** Present only when every attempt reported the bucket. */
  readonly cacheReadTokens?: number
  /** Present only when every attempt reported the bucket. */
  readonly cacheWriteTokens?: number
  /** Output subset, present only when every attempt reported it. */
  readonly reasoningTokens?: number
  /** Present only when every counted attempt has provider/model attribution. */
  readonly routes?: readonly TurnTokenUsageRoute[]
}

interface NormalizedAttempt {
  readonly measurement?: TokenUsage['measurement']
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly reasoningTokens?: number
  readonly route?: TurnTokenUsageRoute
}

type AttemptState =
  | { readonly kind: 'idle' }
  | {
    readonly kind: 'open'
    readonly turn: number
    readonly step: number
    readonly sample?: TokenUsage
  }
  | {
    readonly kind: 'finishClosed'
    readonly turn: number
    readonly step: number
  }
  | {
    readonly kind: 'settled'
    readonly turn: number
    readonly step: number
    readonly by: 'message' | 'retry'
  }

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isMeasurement(value: unknown): value is NonNullable<TokenUsage['measurement']> {
  return value === 'provider-reported' || value === 'estimated'
}

function safeSum(values: readonly number[]): number | undefined {
  let total = 0
  for (const value of values) {
    total += value
    if (!Number.isSafeInteger(total)) return undefined
  }
  return total
}

function messageRoute(message: AssistantMessage): TurnTokenUsageRoute | undefined {
  const { provider, model } = message.source
  return provider.length > 0 && model.length > 0 ? { provider, model, usageSource: 'unknown' } : undefined
}

function streamUsage(stream: SessionEvent<'assistant/message'>['data']['stream']): TokenUsage | undefined {
  return lastAssistantStreamChunk(stream, 'usage')?.usage
}

function normalizeUsage(usage: TokenUsage, route?: TurnTokenUsageRoute): NormalizedAttempt | undefined {
  if (usage.measurement !== undefined && !isMeasurement(usage.measurement)) return undefined
  const {
    inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens,
  } = usage
  if (!isCount(inputTokens) || !isCount(outputTokens)) return undefined
  if (cacheReadTokens !== undefined && !isCount(cacheReadTokens)) return undefined
  if (cacheWriteTokens !== undefined && !isCount(cacheWriteTokens)) return undefined
  if (reasoningTokens !== undefined && (!isCount(reasoningTokens) || reasoningTokens > outputTokens)) {
    return undefined
  }

  const knownPrompt = safeSum([
    inputTokens,
    ...cacheReadTokens === undefined ? [] : [cacheReadTokens],
    ...cacheWriteTokens === undefined ? [] : [cacheWriteTokens],
  ])
  if (knownPrompt === undefined) return undefined

  let exactTotal: number
  if (totalTokens !== undefined) {
    if (!isCount(totalTokens)) return undefined
    const exactPrompt = totalTokens - outputTokens
    if (!isCount(exactPrompt) || exactPrompt < knownPrompt) return undefined
    if (cacheReadTokens !== undefined && cacheWriteTokens !== undefined && exactPrompt !== knownPrompt) {
      return undefined
    }
    exactTotal = totalTokens
  } else {
    if (cacheReadTokens === undefined || cacheWriteTokens === undefined) return undefined
    const derivedTotal = safeSum([knownPrompt, outputTokens])
    if (derivedTotal === undefined) return undefined
    exactTotal = derivedTotal
  }

  return {
    ...usage.measurement === undefined ? {} : { measurement: usage.measurement },
    inputTokens,
    outputTokens,
    totalTokens: exactTotal,
    ...cacheReadTokens === undefined ? {} : { cacheReadTokens },
    ...cacheWriteTokens === undefined ? {} : { cacheWriteTokens },
    ...reasoningTokens === undefined ? {} : { reasoningTokens },
    ...route === undefined ? {} : { route },
  }
}

function aggregateAttempts(attempts: readonly NormalizedAttempt[]): TurnTokenUsage | undefined {
  const [first] = attempts
  if (first === undefined) return undefined
  const inputTokens = safeSum(attempts.map(attempt => attempt.inputTokens))
  const outputTokens = safeSum(attempts.map(attempt => attempt.outputTokens))
  const totalTokens = safeSum(attempts.map(attempt => attempt.totalTokens))
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined) return undefined

  const cacheRead = attempts.map(attempt => attempt.cacheReadTokens)
  const cacheWrite = attempts.map(attempt => attempt.cacheWriteTokens)
  const reasoning = attempts.map(attempt => attempt.reasoningTokens)
  const cacheReadTokens = cacheRead.every(isCount) ? safeSum(cacheRead) : undefined
  const cacheWriteTokens = cacheWrite.every(isCount) ? safeSum(cacheWrite) : undefined
  const reasoningTokens = reasoning.every(isCount) ? safeSum(reasoning) : undefined
  const measurements = new Set(attempts.map(attempt => attempt.measurement))
  const measurement = measurements.size > 1 ? 'mixed' : first.measurement
  // A present cache bucket is bounded by exact prompt, and reasoning is bounded
  // by output. Safe required aggregates therefore imply safe optional sums.

  let routes: readonly TurnTokenUsageRoute[] | undefined
  const attributed = attempts.map(attempt => attempt.route)
  if (attributed.every((route): route is TurnTokenUsageRoute => route !== undefined)) {
    const unique = new Map<string, TurnTokenUsageRoute>()
    for (const route of attributed) unique.set(`${route.provider}\0${route.model}\0${route.usageSource}`, route)
    routes = [...unique.values()]
  }

  return {
    ...measurement === undefined ? {} : { measurement },
    uncachedInputTokens: inputTokens,
    outputTokens,
    totalTokens,
    ...cacheReadTokens === undefined ? {} : { cacheReadTokens },
    ...cacheWriteTokens === undefined ? {} : { cacheWriteTokens },
    ...reasoningTokens === undefined ? {} : { reasoningTokens },
    ...routes === undefined ? {} : { routes },
  }
}

function sameAttempt(
  state: Exclude<AttemptState, { kind: 'idle' }>,
  turn: number,
  step: number,
): boolean {
  return state.turn === turn && state.step === step
}

/**
 * Fold one complete Turn's durable attempts into recorded token totals and source declarations.
 *
 * No attempt is inferred from a usage sample. Any missing lifecycle boundary,
 * incomplete attempt usage, unsafe count, or contradictory exact total makes
 * the whole disclosure unavailable.
 * @param events - Turn-local durable events from `turn/start` through `turn/end`.
 * @returns recorded aggregate usage, or undefined when lifecycle/count evidence is incomplete.
 */
export function deriveTurnTokenUsage(events: readonly SessionEvent[]): TurnTokenUsage | undefined {
  let state: AttemptState = { kind: 'idle' }
  const attempts: NormalizedAttempt[] = []
  let turn: number | undefined
  let sawEnd = false
  let invalid = false
  let stepStartSeq: SessionSeq | undefined, attempt = 0
  const accounting = new Map<string, RequestAccountingRecord | null>()
  for (const event of events) {
    if (event.type !== 'llm/request-accounting' || event.data.loopAttempt === undefined) continue
    const ref = event.data.loopAttempt, key = `${ref.stepStartSeq}:${ref.attempt}`
    accounting.set(key, accounting.has(key) ? null : event.data)
  }

  const closeOpen = (route?: TurnTokenUsageRoute): boolean => {
    if (state.kind !== 'open' || state.sample === undefined) return false
    const captured = accounting.get(`${stepStartSeq}:${attempt}`)
    const attributed = captured && (route === undefined
      || (route.provider === captured.provider && route.model === captured.model))
      ? { provider: captured.provider, model: captured.model, usageSource: captured.usageSource } : route
    const normalized = normalizeUsage(state.sample, attributed)
    if (normalized === undefined) return false
    attempts.push(normalized)
    return true
  }

  for (const event of events) {
    if (invalid) break
    if (event.type === 'turn/start') {
      if (turn !== undefined || state.kind !== 'idle') invalid = true
      else turn = event.data.turn
      continue
    }
    if (turn === undefined) {
      invalid = true
      break
    }
    if (event.type === 'turn/end') {
      if (event.data.turn !== turn || state.kind !== 'idle' || sawEnd) invalid = true
      else sawEnd = true
      continue
    }
    if (sawEnd) {
      invalid = true
      break
    }
    if (event.type === 'step/start') {
      if (event.data.turn !== turn || state.kind !== 'idle') invalid = true
      else {
        state = { kind: 'open', turn, step: event.data.step }
        stepStartSeq = event.seq; attempt = 1
      }
      continue
    }
    if (event.type === 'llm/retry-started') {
      if (event.data.turn !== turn
        || state.kind !== 'settled'
        || state.by !== 'retry'
        || !sameAttempt(state, event.data.turn, event.data.step)) invalid = true
      else { state = { kind: 'open', turn, step: event.data.step }; attempt += 1 }
      continue
    }
    if (event.type === 'assistant/attempt') {
      if (event.data.turn !== turn
        || state.kind !== 'open'
        || !sameAttempt(state, event.data.turn, event.data.step)) {
        invalid = true
        continue
      }
      const sample: TokenUsage | undefined = streamUsage(event.data.stream) ?? state.sample
      state = { kind: 'open', turn, step: event.data.step, ...(sample === undefined ? {} : { sample }) }
      if (!closeOpen()) invalid = true
      else state = { kind: 'finishClosed', turn, step: event.data.step }
      continue
    }
    if (event.type === 'assistant/message') {
      if (event.data.turn !== turn
        || state.kind !== 'open'
        || !sameAttempt(state, event.data.turn, event.data.step)) {
        invalid = true
        continue
      }
      const sample = event.data.usage ?? streamUsage(event.data.stream)
      if (sample !== undefined) state = { ...state, sample }
      if (!closeOpen(messageRoute(event.data.message))) invalid = true
      else state = { kind: 'settled', turn, step: event.data.step, by: 'message' }
      continue
    }
    if (event.type === 'llm/retry') {
      if (event.data.turn !== turn || state.kind === 'idle'
        || !sameAttempt(state, event.data.turn, event.data.step)) {
        invalid = true
        continue
      }
      if (state.kind === 'settled' || (state.kind === 'open' && !closeOpen())) invalid = true
      if (!invalid) state = { kind: 'settled', turn, step: event.data.step, by: 'retry' }
      continue
    }
    if (event.type === 'step/end') {
      if (event.data.turn !== turn || state.kind === 'idle'
        || !sameAttempt(state, event.data.turn, event.data.step)) {
        invalid = true
        continue
      }
      if (state.kind === 'open' && !closeOpen()) invalid = true
      if (!invalid) state = { kind: 'idle' }
    }
  }

  return invalid || !sawEnd || state.kind !== 'idle' ? undefined : aggregateAttempts(attempts)
}
