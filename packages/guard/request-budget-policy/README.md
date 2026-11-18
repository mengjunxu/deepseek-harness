---
description: "Limit local LLM request counts and preserve execute slots across Hosts, for operators configuring optional durable budgets."
kind: "package-reference"
---

# @deepseek-ai/dsh-request-budget-policy

English | [中文](README.zh.md)

## Summary

Limit how many registered model attempts can use a configured group of routes, including auxiliary calls. Reserve slots for requests explicitly labeled `execute`, and retain usage across restarts and cooperating Hosts sharing one atomic backend. These are operator-defined local request counts; official provider balance remains unknown.

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

Mount this optional plugin with the LLM and storage services. Route the `request_budget` domain to SQLite; the JSON backend lacks atomic record modification and protected requests remain refused. Keep the default backend for other domains as configured by your application.

```yaml
- id: storage-sqlite
  name: '@deepseek-ai/dsh-storage-sqlite'
  config:
    path: ./local-request-budgets.db
- id: storage-domain
  config:
    backend: json
    routes:
      request_budget: sqlite
- id: request-budget-policy
  name: '@deepseek-ai/dsh-request-budget-policy'
  config:
    budgets:
      - id: development-period
        usageSource: local
        maxRequests: 10
        maxRequestsPerSession: 3
        reserveExecuteRequests: 2
        routes:
          - provider: local-model
            models: [model]
```

| Field | Default | Meaning |
|---|---|---|
| `budgets` | `[]` | Live allowance collection; null resets to an empty list |
| `id` | Required | Persistent allowance identity; use a new identity to start a new local period |
| `usageSource` | Required | Exact captured Provider declaration; absent declarations match only explicit `unknown` |
| `maxRequests` | Required | Nonnegative safe integer, shared across all matching routes and intents |
| `maxRequestsPerSession` | Omitted | Optional nonnegative safe integer per exact Session ID within this allowance |
| `reserveExecuteRequests` | `0` | Slots usable only with explicit `intent: execute`, at most `maxRequests` |
| `routes` | Required | Nonempty exact provider/model allowlist, unique across the collection |

The [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-request-budget-policy) lists accepted fields. Matching is case-sensitive. The allowance counts requests without an intent and auxiliary requests against the ordinary portion. It does not identify business intent or authorize payment; [paid-route-policy](../paid-route-policy/README.md) can require API-metered presets independently.

Capacity, execute reserve and source are immutable for a persisted identity, including an allowance with zero capacity. A locally known conflicting edit rejects before settings persistence; another Host's conflicting definition refuses activation. Route membership can change without resetting counts. Removing a rule or unmounting the plugin explicitly removes its protection for future calls. Initialization, unavailable/invalid storage and unsupported atomic backends refuse protected routes with `LOCAL_REQUEST_BUDGET_UNAVAILABLE`; source mismatch yields `LOCAL_REQUEST_BUDGET_SOURCE_CHANGED`. Repair the backend or select a matching immutable identity, then reload or apply valid rules.

The `dsh` launcher requires this configured policy to activate regardless of entry id. Invalid initial configuration fails startup and blocks inference with `ADMISSION_POLICY_INACTIVE` before the startup audit. Direct embedders must enforce the same activation requirement.

A Session cap counts every intent and auxiliary attempt against the same exact durable Session ID. Resuming that ID keeps its charge; another Session has its own cap within the shared allowance. A missing identity returns `LOCAL_REQUEST_BUDGET_SESSION_REQUIRED`; a zero or exhausted Session cap returns `LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED`. Both refuse before native model dispatch, including prepared calls. Read-only preparation may resolve model metadata and never reserves capacity. Cancelled pre-delegation attempts release both limits; settled or abandoned attempts retain both charges. The Session cap is immutable for a stored budget ID, including adding or removing it; choose a new budget identity for a different definition. Omission preserves uncapped records and imposes no Session identity requirement.

Preparation checks source and readiness without consuming a slot. Dispatch reserves atomically, then commits immediately before invoking its continuation. Ordinary requests reaching the execute reserve receive `LOCAL_REQUEST_BUDGET_EXECUTE_RESERVED`; a full allowance receives `LOCAL_REQUEST_BUDGET_EXHAUSTED`. Cancellation or rule revocation observed before delegation records a cancellation and releases that local slot. After delegation, outcomes and downstream refusals retain the charge conservatively. Plugin disposal aborts owned transports and drains receipt writes before closing storage. Whole-application shutdown uses the launcher’s awaited `app-boot/before-dispose` phase; embedders call `disposeApplication` from app-boot. Live rule edits block unstarted reservations; already delegated requests retain their outcome.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Pure `llm/admission` stays installed independently of storage readiness. `llm/dispatch` carries captured registration metadata and adds lifetime cancellation while preserving the caller signal. Every allowance definition and its UUID receipts occupy one atomic `request_budget` record, so independently loaded Hosts cannot admit from stale cached counts. The callback reads only its fresh record and captured data. It performs no I/O or configuration reads. Repeated identical reservations and transitions are idempotent; conflicting identities and invalid transitions refuse.

| File | Responsibility |
|---|---|
| [`src/config.ts`](src/config.ts) | Live rule validation and duplicate refusal |
| [`src/index.ts`](src/index.ts) | Admission, live activation and storage ownership |
| [`src/runtime.ts`](src/runtime.ts) | Reservation, cancellation and drain lifecycle |
| [`src/store.ts`](src/store.ts) | Durable schemas and atomic receipt transitions |

No runtime invariant companion is published: fresh atomic receipt updates enforce capacity and immutable definitions directly, without an independently stored count or usage projection.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [LLM service](../../llm/llm/README.md) — admission and registered dispatch.
- [Storage domains](../../storage/storage-domain/README.md) — atomic record updates.
- [SQLite backend](../../storage/storage-sqlite/README.md) — cross-Host transactions.
- [Guard family](../README.md) — independent optional policies.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the consumer that records a budget refusal in a Session or tool result.

#### KV Cache effect

Allowed requests retain their prompt and tool declarations. Budget configuration and receipts add no model input; a recorded refusal can appear in later history. API discovery exposes dispatch documentation only when requested.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

This plugin counts local registered-dispatch attempts.

- It does not fetch official Codex/ChatGPT balances, estimate tokens or currency, enforce Task caps, or account for external executors.
- Session caps apply within one allowance and one exact ID. They do not aggregate unrelated allowances, forked Sessions or child-agent Sessions; shared capacity still applies.
- Crashed pending or committed receipts retain their charge. There is no automatic clock reset, refund inference or abandoned-attempt reclamation.
- Receipts accumulate within an allowance record; archival and bounded retention remain deferred. Use finite periods and capacities appropriate for the deployment.
- The operator must mount this policy in every cooperating Host and route them to the same atomic database. Another process can bypass local rules or directly edit storage.
- Downstream middleware refusal after delegation can consume a slot without provider I/O. Transport abort does not establish a provider-side refund.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
