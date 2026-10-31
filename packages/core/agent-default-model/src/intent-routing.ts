/** Explicit per-Turn model routing over Agent prompt and request waterfalls. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { RequestIntentSchema, RequiredCapabilitiesSchema, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmCallConfig, LlmProviderCapability, LlmRequestIntent } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'

/** One explicit route; omission of effort restores the chosen model's default. */
export interface IntentRoute {
  /** Registered provider route. */
  provider: string
  /** Exact provider-owned model id. */
  model: string
  /** Provider-owned effort id, when explicitly selected. */
  reasoningEffort?: string
  /** Provider capabilities required before the route can prepare a request. */
  requiredCapabilities?: LlmProviderCapability[]
}

/** Complete operator policy; there is no implicit intent, route or fallback. */
export interface IntentRoutingPolicy {
  /** Purpose captured for each new Turn. */
  intent: LlmRequestIntent
  /** An explicit provider/model pair for every conversational intent. */
  routes: Record<LlmRequestIntent, IntentRoute>
}

/** Live operator policy; a Turn captures one immutable value before prompt assembly. */
export interface Config {
  /** Complete intent selection and route table, updated atomically by configuration. */
  routing: Volatile<IntentRoutingPolicy>
}

const route = Schema.object({
  provider: Schema.string().pattern(/\S/).required(),
  model: Schema.string().pattern(/\S/).required(),
  reasoningEffort: Schema.string().pattern(/\S/),
  requiredCapabilities: RequiredCapabilitiesSchema,
}).required()

/** Runtime configuration for the opt-in intent-routing plugin. */
export const Config = Schema.object({
  routing: Schema.object({
    intent: RequestIntentSchema.required(),
    routes: Schema.object({ chat: route, plan: route, review: route, execute: route }).required(),
  }).required().volatile(),
})

/** Cordis plugin name. */
export const name = 'agent-intent-routing'
/** Services whose Agent-scoped events and terminal admission this plugin uses. */
export const inject = ['agents', 'llm', 'systemPrompt']

/**
 * Route each Turn using one explicit operator policy, without trying alternate routes.
 * Prompt variables and request headers use the same captured provider/model pair.
 * @param ctx - context whose Agents this policy controls.
 * @param config - live policy; changes affect a later Turn, including after a failed request.
 */
export function apply(ctx: Context, config: Config): void {
  const turns = new WeakMap<Agent, { signal: AbortSignal; call: LlmCallConfig }>()
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const { agent, signal } = context
    if (agent === undefined || signal === undefined) return next()
    let turn = turns.get(agent)
    if (turn?.signal !== signal) {
      const policy = config.routing.get()
      const selected = policy.routes[policy.intent]
      const call = deepFreeze<LlmCallConfig>({
        provider: selected.provider, model: selected.model, intent: policy.intent,
        ...selected.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(selected.reasoningEffort) },
        ...selected.requiredCapabilities === undefined ? {} : { requiredCapabilities: [...selected.requiredCapabilities] },
      })
      turn = { signal, call }
      turns.set(agent, turn)
    }
    const captured = turn
    const assembly = await next()
    return { ...assembly, variables: { ...assembly.variables, provider: captured.call.provider, model: captured.call.model } }
  }, { prepend: true })
  ctx.on('agent/request', async ({ agent, signal }, next): Promise<LlmCallConfig> => {
    const turn = turns.get(agent)
    if (turn?.signal !== signal) throw new Error('Intent routing requires prompt assembly for this Turn')
    const proposed = await next()
    const { reasoningEffort: _effort, requiredCapabilities: _requirements, ...controls } = proposed
    return { ...controls, ...turn.call }
  }, { prepend: true })
}
