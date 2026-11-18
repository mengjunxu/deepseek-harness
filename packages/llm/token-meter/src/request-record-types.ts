/** Metadata-only accounting for settled registered dispatches with a live local Session. */
import type { LlmLoopAttemptRef, LlmPreparationFailure, LlmRequestIntent, LlmUsageSource, TokenUsage } from '@deepseek-ai/dsh-llm/types'
import type { SessionSeq } from '@deepseek-ai/dsh-session/types'

/** One observed dispatch settlement; provider acceptance and official billing remain unknown. */
export interface RequestAccountingRecord {
  /** Captured serving registration, rather than the current discovery directory. */
  readonly provider: string
  /** Exact resolved request model. */
  readonly model: string
  /** Captured declaration; absent Provider policy is recorded as unknown. */
  readonly usageSource: LlmUsageSource
  /** Explicit request intent, when supplied. */
  readonly intent?: LlmRequestIntent
  /** Existing auxiliary classification, when supplied. */
  readonly purpose?: 'compaction' | 'session-title'
  /** Explicit loop invocation, when supplied; auxiliary and legacy calls make no claim. */
  readonly loopAttempt?: LlmLoopAttemptRef
  /** Observed terminal result; unknown includes consumer closure without a terminal chunk. */
  readonly outcome: 'completed' | 'error' | 'aborted' | 'unknown'
  /** Terminal discriminant only; provider messages and replay payloads are excluded. */
  readonly finishKind?: string
  /** Adapter-returned counters may themselves be estimates; no official accuracy is inferred. */
  readonly usage: { readonly kind: 'unknown' } | { readonly kind: 'adapter-reported'; readonly tokens: Readonly<TokenUsage> }
}

/** Bounded replay view; historical records remain in the existing asynchronous Session history. */
export interface RequestAccountingProjection {
  /** Count of accounting settlements, not confirmed provider submissions or billed requests. */
  readonly recordCount: number
  /** Settlement counts grouped by the captured source declaration. */
  readonly bySource: Readonly<Partial<Record<LlmUsageSource, number>>>
  /** Last settlement and its durable identity within this Session. */
  readonly last?: { readonly seq: SessionSeq; readonly record: RequestAccountingRecord }
}

/** Preparation audit metadata; the enclosing Session supplies identity without copying it. */
export type RequestPreparationFailureRecord = Omit<LlmPreparationFailure, 'sessionId'>

/** Bounded preparation audit view, independent of observed dispatch settlements. */
export interface RequestPreparationFailureProjection {
  /** Observed preparation failures, not dispatched or billed request count. */
  readonly recordCount: number
  /** Last failure and its committed identity within this Session. */
  readonly last?: { readonly seq: SessionSeq; readonly record: RequestPreparationFailureRecord }
}

declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Settled native dispatch metadata; the enclosing Session and committed seq identify this record. */
    'llm/request-accounting': RequestAccountingRecord
    /** Preparation failed before the native outlet; later virtual completion remains possible. */
    'llm/preparation-failed': RequestPreparationFailureRecord
  }
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionMap {
    requestAccounting: RequestAccountingProjection
    preparationFailures: RequestPreparationFailureProjection
  }
  interface SessionProjectionStateMap {
    requestAccounting: RequestAccountingProjection
    preparationFailures: RequestPreparationFailureProjection
  }
}
