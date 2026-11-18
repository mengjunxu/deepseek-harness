---
description: "Model and tool policy plugins for repeated calls, tool deadlines and preset API-metered route consent, for users and maintainers composing guards."
kind: "package-group"
---

# guard/ — model and tool policies

English | [中文](README.zh.md)

## Summary

`guard/` contains policies around model and tool operations. `repeat-tool-reminder` advises a model to change repeated tool calls; `timeout-policy` enforces declared tool deadlines. Both ship enabled in the base bundle. `paid-route-policy` requires exact presets for declared API-metered model routes and activates when explicitly mounted.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

Each package README explains its activation, configuration and failure behavior.

| Package | What it provides |
|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.md) | Reminds the model when it repeats the same tool call, so it changes approach or finishes |
| [`timeout-policy/`](timeout-policy/README.md) | Times out tool calls that declare a limit, so the model gets a clear error instead of waiting forever |
| [`paid-route-policy/`](paid-route-policy/README.md) | Requires a preset for an exact declared API-metered Provider/model route |
| [`request-budget-policy/`](request-budget-policy/README.md) | Counts durable local requests and preserves execute slots across Hosts |

-----

<a id="related-documentation"></a>
## Related documentation

Start with the tools subsystem reference for the tool-call pipeline, then the reminder's configuration and the timeout-library decision behind the policy.

- [LLM subsystem reference](../../docs/subsystems/llm-streaming.md) — registered-route admission and preset consent.
- [Tools subsystem reference](../../docs/subsystems/tools.md) — the tool-call pipeline and tool policy decisions.
- [Generated configuration catalog](../../docs/config-catalog.md#deepseek-aidsh-repeat-tool-reminder) — every accepted field of the repeat-call reminder.
- [Timeout deadline library Agent Note](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md) — the timing/termination split `timeout-policy` enforces.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
