/** Explicit per-Turn model routing over Agent prompt and request waterfalls. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'
import { RequestIntentSchema, RequiredCapabilitiesSchema, ReasoningEffortId, LlmError, ResponseFormatSchema, resolveResponseFormat } from '@deepseek-ai/dsh-llm'
import type { LlmCallConfig, LlmProviderCapability, LlmRequestIntent, LlmResponseFormat } from '@deepseek-ai/dsh-llm'
import { agentCarrier } from '@deepseek-ai/dsh-agent'
import type { Agent, ModelSelection, ModelSelectionCapture } from '@deepseek-ai/dsh-agent'

/** One explicit route; omission of effort restores the chosen model's default. */
export interface ConfiguredIntentRoute {
  /** Native JSON Schema response requested for this intent, when set. */
  responseFormat?: LlmResponseFormat
  /** Fixed-route mode; omission preserves the configured route. */
  selection?: 'configured'
  /** Registered provider route. */
  provider: string
  /** Exact provider-owned model id. */
  model: string
  /** Provider-owned effort id, when explicitly selected. */
  reasoningEffort?: string
  /** Provider capabilities required before the route can prepare a request. */
  requiredCapabilities?: LlmProviderCapability[]
}

/** Use the entry's current model selection while retaining this intent's requirements. */
export interface EntryIntentRoute {
  /** Native response schema applied to the entry-selected model. */
  responseFormat?: LlmResponseFormat
  /** Resolve through the installed entry selection owner; absence fails before a request. */
  selection: 'entry'
  /** Capabilities required of the user-selected route. */
  requiredCapabilities?: LlmProviderCapability[]
}

/** Explicit configured route or entry-owned model selection for one intent. */
export type IntentRoute = ConfiguredIntentRoute | EntryIntentRoute

/** Complete operator policy; there is no implicit intent, route or fallback. */
export interface IntentRoutingPolicy {
  /** Purpose captured for each new Turn. */
  intent: LlmRequestIntent
  /** An explicit model selection mode for every conversational intent. */
  routes: Record<LlmRequestIntent, IntentRoute>
}

/** Live operator policy; a Turn captures one immutable value before prompt assembly. */
export interface Config {
  /** Complete intent selection and route table, updated atomically by configuration. */
  routing: Volatile<IntentRoutingPolicy>
}

const configuredRoute = Schema.object({
  selection: Schema.const('configured'),
  provider: Schema.string().pattern(/\S/).required(),
  model: Schema.string().pattern(/\S/).required(),
  reasoningEffort: Schema.string().pattern(/\S/),
  requiredCapabilities: RequiredCapabilitiesSchema,
  responseFormat: ResponseFormatSchema,
}).required()

const route = Schema.transform(Schema.union([
  configuredRoute,
  Schema.object({
    selection: Schema.const('entry').required(),
    provider: Schema.const(undefined),
    model: Schema.const(undefined),
    reasoningEffort: Schema.const(undefined),
    requiredCapabilities: RequiredCapabilitiesSchema,
    responseFormat: ResponseFormatSchema,
  }).required(),
]).required(), (value) => {
  // Schemastery preserves null on an optional field before its own transform runs.
  if (value.responseFormat === null) throw new LlmError('A response format must be omitted or contain a schema', 'INVALID_RESPONSE_FORMAT')
  return value
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
  const turns = new WeakMap<Agent, { signal: AbortSignal; call: LlmCallConfig; entry: boolean }>()
  const entrySelection = (agent: Agent): ModelSelectionCapture => {
    const access = ctx.bail(agentCarrier(agent), 'agent/model-selection', { agent })
    if (access === undefined) {
      throw new LlmError('Entry intent routing requires an installed model selection owner', 'ENTRY_MODEL_SELECTION_UNAVAILABLE')
    }
    return access
  }
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const { agent, signal } = context
    if (agent === undefined || signal === undefined) return next()
    let turn = turns.get(agent)
    if (turn?.signal !== signal) {
      const policy = config.routing.get()
      const selected = policy.routes[policy.intent]
      let choice: ModelSelection
      if (selected.selection === 'entry') {
        const current = entrySelection(agent).current
        if (current === undefined) {
          throw new LlmError('Entry intent routing requires a selected model', 'ENTRY_MODEL_SELECTION_UNAVAILABLE')
        }
        choice = { ...current }
      } else {
        choice = {
          provider: selected.provider, model: selected.model,
          ...selected.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(selected.reasoningEffort) },
        }
      }
      const responseFormat: LlmResponseFormat | undefined = selected.responseFormat === undefined
        ? undefined : resolveResponseFormat(selected.responseFormat)
      const call: LlmCallConfig = {
        ...choice, intent: policy.intent,
        ...responseFormat === undefined ? {} : { responseFormat },
        ...selected.requiredCapabilities === undefined ? {} : { requiredCapabilities: [...selected.requiredCapabilities] },
      }
      deepFreeze(call)
      turn = { signal, call, entry: selected.selection === 'entry' }
      turns.set(agent, turn)
    }
    const captured = turn
    const assembly = await next()
    // The entry captures each step; apply the Turn choice after it so notices and dispatch agree.
    if (captured.entry) {
      entrySelection(agent).capture({
        provider: captured.call.provider, model: captured.call.model,
        ...captured.call.reasoningEffort === undefined ? {} : { reasoningEffort: captured.call.reasoningEffort },
      })
    }
    return { ...assembly, variables: { ...assembly.variables, provider: captured.call.provider, model: captured.call.model } }
  }, { prepend: true })
  ctx.on('agent/request', async ({ agent, signal }, next): Promise<LlmCallConfig> => {
    const turn = turns.get(agent)
    if (turn?.signal !== signal) throw new Error('Intent routing requires prompt assembly for this Turn')
    const proposed = await next()
    const { reasoningEffort: _effort, requiredCapabilities: _requirements, responseFormat: _format, ...controls } = proposed
    return { ...controls, ...turn.call }
  }, { prepend: true })
}
