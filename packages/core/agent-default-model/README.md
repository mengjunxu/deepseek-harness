---
description: "The deployment default model selection for users and maintainers choosing, configuring, or debugging which model freshly created agents start on."
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-default-model

English | [中文](README.zh.md)

## Summary

Give newly created agents a shared default provider and model when their sessions do not specify one. Provider, model, and reasoning effort are live Config fields. Saved selections update the active profile patch and apply to subsequent reads; per-session selection remains owned by the entry point.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this package wherever agents are created without an explicit model route. The service answers one question — which model should a fresh agent use? — so entry points that create agents consult it instead of re-implementing a default.

### Configure the default

The composition requires a provider and model. Consumers read the live references even when no configuration editor is mounted.

```yaml
- name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: deepseek
    model: deepseek-chat
```

| Field | Default | Meaning |
|---|---|---|
| `provider` | required | Registered provider route for fresh agents |
| `model` | required | Provider-owned model id for fresh agents |

The generated [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-agent-default-model) lists every accepted field. `reasoningEffort` is optional; saving a selection without it removes that field from the profile’s complete config override.

### Read and change the default

`currentSelection()` returns a detached `{ provider, model, reasoningEffort? }` for a newly created agent; `saveSelection()` stores the complete selection for later agents.

```text
const selection = ctx.agentDefaultModel.currentSelection()
await ctx.agentDefaultModel.saveSelection({ provider, model, reasoningEffort: 'high' })
```

Without a configuration editor, `saveSelection()` is a no-op. The service does not validate catalog membership; the consumer opening a model request owns availability diagnostics.

### Route explicit intents

The optional `@deepseek-ai/dsh-agent-default-model/intent-routing` plugin chooses a configured model for `chat`, `plan`, `review` or `execute`. Use it in headless or SDK scopes where this policy owns model selection. The plugin overrides the entry point's provider/model and clears inherited reasoning effort when its selected route omits effort; the interactive model selector does not edit this policy. `execute` classifies a model request and does not start an external executor.

Declare all four routes and an intent explicitly. The following local fixture routes require matching Provider declarations, available in the [complete SDK composition](../../../snapshots/sdk/intent-routing-chat/cordis.yml):

```yaml
- id: agent-intent-routing
  name: '@deepseek-ai/dsh-agent-default-model/intent-routing'
  config:
    routing:
      intent: chat
      routes:
        chat: { provider: intent-chat, model: chat-fixture, requiredCapabilities: [tools] }
        plan: { provider: intent-plan, model: plan-fixture, requiredCapabilities: [tools] }
        review: { provider: intent-review, model: review-fixture, requiredCapabilities: [tools] }
        execute: { provider: intent-execute, model: execute-fixture, requiredCapabilities: [tools] }
```

`routing` is one live configuration value. Each Turn captures its selected route before prompt assembly; changes affect a later Turn. The prompt's provider/model variables and the request header use that captured pair. An unavailable route fails at request preparation. Required capabilities must be declared supported by the Provider; unknown support rejects. An omitted requirement adds no capability restriction. The plugin never tries another intent's route after a limit, transport failure or interruption. The Session request header records intent, actual provider/model and requirements; no extra classification request is sent.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains how the service realizes the behavior above; the observable contract is covered in [Use this package](#use-this-package).

### Design concept

The service retains its validated Config references and samples them in `currentSelection()`. `saveSelection()` captures the submitted values and serializes profile writes in submission order, including overlapping callers. Each caller observes its own write failure; a rejected write does not prevent later saves. Session-specific selection takes precedence in the consumer.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Live default selection and profile-backed writes |
| [`src/intent-routing.ts`](src/intent-routing.ts) | Optional per-Turn intent selection and request routing |

### Behavior notes

`currentSelection()` returns a detached selection. A captured selection stays stable while later operations read updated Config references.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

The package-level contract is enough for most consumers; read these when you need the surrounding domain.

- [Core subsystem](../../../docs/subsystems/core.md) — the `Agent` handle and `AgentOptions` route selection.
- [agent-loop package](../agent-loop/README.md) — how agents resolve provider and model at request time.
- [Generated configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-agent-default-model) — every accepted config field and its source declaration.
- [Core group map](../README.md) — how the core packages compose.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the model selection and prompt provider/model variables supplied to request assembly; intent and capability requirements remain metadata and add no classification call.

#### KV Cache effect

The default affects fresh agents; an existing session retains its selection. The optional intent router captures provider/model before assembly and can change the route on a later Turn. Changing a rendered model name or provider can alter input tokens and prevent prefix reuse; metadata with unchanged rendered input contributes no model-input tokens.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the service's scope. They are current package constraints, not a task backlog.

- **Routing policy is separate from account and quota authorization** — provider capability declarations do not grant account access, reserve budget or authorize paid fallback; exact-model capability matching is not supplied by this plugin.
- **No independent runtime invariant** — default selection has no derived registry; the routing plugin keeps one private captured value per Turn. LLM admission and request/log reconstruction remain checked by their owning services.
- **One process-wide default** — the service owns a single default; per-session model selection remains the entry point's responsibility.
- **Persistence requires a profile configuration editor** — without it, saving a default does not retain the selection.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
