/** Validated operator presets and missing-grant behavior. */
import type { Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

/** Live operator preauthorization; every grant names exact model ids on one provider route. */
export interface Config {
  /** Missing exact grants deny by default; ask requires an available live Agent and approval answerer. */
  onMissingGrant: Volatile<'deny' | 'ask'>
  /** Complete preset grants; an empty list permits no declared API-metered route. */
  grants: Volatile<{
    /** Registered Provider route approved for declared API-metered inference. */
    provider: string
    /** Non-empty exact model allowlist, including auxiliary calls on these pairs. */
    models: string[]
  }[]>
}

/** Validated preset grants; provider/model matching is exact and case-sensitive. */
export const Config = Schema.object({
  onMissingGrant: Schema.union(['deny', 'ask']).default('deny').volatile(),
  grants: Schema.array(Schema.object({
    provider: Schema.string().pattern(/\S/).required(),
    models: Schema.array(Schema.string().pattern(/\S/).required()).min(1).required(),
  }).required()).default([]).volatile(),
})

/**
 * Match live operator preauthorization without changing the configured collection.
 * @param config - validated current policy.
 * @param provider - captured registered route.
 * @param model - resolved exact model.
 * @returns whether a preset permits this pair.
 */
export function hasGrant(config: Config, provider: string, model: string): boolean {
  return config.grants.get().some(grant => grant.provider === provider && grant.models.includes(model))
}
