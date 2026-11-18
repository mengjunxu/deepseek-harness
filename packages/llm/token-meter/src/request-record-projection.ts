/** Bounded source/count view reconstructed from committed accounting settlements. */
import { z } from 'zod'
import { LLM_USAGE_SOURCES } from '@deepseek-ai/dsh-llm'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import type { RequestAccountingProjection, RequestPreparationFailureProjection } from './request-record-types.ts'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const loopAttempt = z.object({ stepStartSeq: count.transform(SessionSeq), attempt: count.positive() }).strict()
const tokens = z.object({
  measurement: z.enum(['provider-reported', 'estimated']).optional(),
  inputTokens: count, outputTokens: count, totalTokens: count.optional(),
  cacheReadTokens: count.optional(), cacheWriteTokens: count.optional(), reasoningTokens: count.optional(),
}).strict().transform(({ measurement, totalTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, ...required }) => ({
  ...required,
  ...measurement === undefined ? {} : { measurement },
  ...totalTokens === undefined ? {} : { totalTokens },
  ...cacheReadTokens === undefined ? {} : { cacheReadTokens },
  ...cacheWriteTokens === undefined ? {} : { cacheWriteTokens },
  ...reasoningTokens === undefined ? {} : { reasoningTokens },
}))
const record = z.object({
  provider: z.string(), model: z.string(), usageSource: z.enum(LLM_USAGE_SOURCES),
  intent: z.enum(['chat', 'plan', 'review', 'execute']).optional(),
  purpose: z.enum(['compaction', 'session-title']).optional(),
  loopAttempt: loopAttempt.optional(),
  outcome: z.enum(['completed', 'error', 'aborted', 'unknown']), finishKind: z.string().optional(),
  usage: z.discriminatedUnion('kind', [z.object({ kind: z.literal('unknown') }).strict(),
    z.object({ kind: z.literal('adapter-reported'), tokens }).strict()]),
}).strict().transform(({ intent, purpose, finishKind, loopAttempt, ...required }) => ({
  ...required,
  ...intent === undefined ? {} : { intent },
  ...purpose === undefined ? {} : { purpose },
  ...finishKind === undefined ? {} : { finishKind },
  ...loopAttempt === undefined ? {} : { loopAttempt },
}))
const stateSchema = z.object({
  recordCount: count,
  bySource: z.partialRecord(z.enum(LLM_USAGE_SOURCES), count),
  last: z.object({ seq: count.transform(SessionSeq), record }).strict().optional(),
}).strict().transform(({ last, ...required }) => ({ ...required, ...last === undefined ? {} : { last } }))

/** Replay the committed sequence once; repeated view reads never add usage or request counts. */
export const requestAccountingProjection = {
  key: 'requestAccounting', stateVersion: 3, stateSchema,
  init: (): RequestAccountingProjection => ({ recordCount: 0, bySource: {} }),
  apply: (state, event) => {
    if (event.type !== 'llm/request-accounting') return state
    const source = event.data.usageSource
    return { recordCount: state.recordCount + 1,
      bySource: { ...state.bySource, [source]: (state.bySource[source] ?? 0) + 1 },
      last: { seq: event.seq, record: event.data } }
  },
  wire: { viewSchema: stateSchema, view: state => state },
} satisfies ProjectionDefinition<'requestAccounting', RequestAccountingProjection>

const preparationRecord = z.object({
  provider: z.string(), model: z.string(), usageSource: z.enum(LLM_USAGE_SOURCES),
  intent: z.enum(['chat', 'plan', 'review', 'execute']).optional(),
  purpose: z.enum(['compaction', 'session-title']).optional(),
  loopAttempt: loopAttempt.optional(),
  stage: z.enum(['prepare', 'stream']),
  category: z.enum(['aborted', 'admission', 'capability', 'route', 'credentials', 'unknown']),
}).strict().transform(({ intent, purpose, loopAttempt, ...required }) => ({ ...required,
  ...intent === undefined ? {} : { intent }, ...purpose === undefined ? {} : { purpose },
  ...loopAttempt === undefined ? {} : { loopAttempt } }))
const preparationState = z.object({ recordCount: count,
  last: z.object({ seq: count.transform(SessionSeq), record: preparationRecord }).strict().optional(),
}).strict().transform(({ last, ...required }) => ({ ...required, ...last === undefined ? {} : { last } }))

/** Preparation counts remain separate from native settlement and usage totals. */
export const requestPreparationFailureProjection = {
  key: 'preparationFailures', stateVersion: 2, stateSchema: preparationState,
  init: (): RequestPreparationFailureProjection => ({ recordCount: 0 }),
  apply: (state, event) => event.type === 'llm/preparation-failed'
    ? { recordCount: state.recordCount + 1, last: { seq: event.seq, record: event.data } } : state,
  wire: { viewSchema: preparationState, view: state => state },
} satisfies ProjectionDefinition<'preparationFailures', RequestPreparationFailureProjection>
