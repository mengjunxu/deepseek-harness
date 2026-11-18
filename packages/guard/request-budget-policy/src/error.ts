/** Owned local-budget refusals, distinguished from dispatch middleware defects. */
import { LlmError } from '@deepseek-ai/dsh-llm'

/** Failure owned by local budget accounting; serializable failure text contains no storage path or request content. */
export class BudgetError extends LlmError {}

/**
 * Require an unchanged declared source and finite allowance for a persisted identity.
 * @param same - whether the stored and requested definitions agree.
 */
export function assertDefinition(same: boolean): void {
  if (!same) throw new BudgetError('Local request budget identity has different persisted limits or usage source',
    'LOCAL_REQUEST_BUDGET_POLICY_CONFLICT')
}
