---
description: "Preset consent for exact API-metered provider/model routes, for operators configuring optional paid-inference protection."
kind: "package-reference"
---

# @deepseek-ai/dsh-paid-route-policy

English | [中文](README.zh.md)

## Summary

Require an exact preset or one-request confirmation before a declared API-metered provider/model route can run. Grants name exact pairs and can be revoked through live profile settings. The policy is optional, grants nothing by default, and leaves service balances unknown.

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

Mount this plugin when an operator requires preset consent for routes whose Provider policy declares `usageSource: api_metered`. It does not activate itself in the base profile or select a fallback route.

```yaml
- id: paid-route-policy
  name: '@deepseek-ai/dsh-paid-route-policy'
  config:
    grants:
      - provider: paid
        models: [m]
```

To ask when no preset matches, use `onMissingGrant: ask` or launch Web with `pnpm dsh web --patch apps/cli/config/examples/paid-route-confirmation.yml`. The default is `deny`. The existing approval composer shows the captured route, unknown charge/balance and one-request scope. Each retry or auxiliary call requires its own decision. Exact presets skip the question.

```yaml
- id: paid-route-policy
  name: '@deepseek-ai/dsh-paid-route-policy'
  config:
    onMissingGrant: ask
```

Confirmation requires a live Agent with an open Turn, the existing approval service and an answerer. `approval/policy: never` rejects without prompting; missing services, Agent or answerer fail closed. A Session's permission preset may select `never`, including the shipped danger-full-access preset. This policy does not change that setting. `approval/asked` records the exact route and supplied step/attempt or auxiliary purpose in its reason; `approval/decided` pairs the outcome. Display translations are not persisted or sent to the model.

The preset approves every call on the exact `paid`/`m` pair, including auxiliary calls using that pair. Matching is case-sensitive; another Provider, another model or an empty `grants` list does not match. The preset establishes permission, not credentials, model availability or a monetary allowance. The [configuration catalog](../../../docs/config-catalog.md#deepseek-aidsh-paid-route-policy) owns the accepted fields.

In the default deny mode, preparation without a match throws `PAID_ROUTE_CONSENT_REQUIRED` before adapter preparation; direct streaming yields the same failure as its terminal error. Prepared calls and asynchronous lookup paths recheck current grants before adapter stream dispatch. Revocation blocks an unstarted dispatch and does not cancel a stream that has already started. Invalid grant writes reject before persistence. Other admission refusals still apply; multiple policies must all delegate.

The `dsh` launcher requires this configured policy to activate regardless of entry id. An inactive enabled policy blocks inference with `ADMISSION_POLICY_INACTIVE` before the startup audit; invalid initial configuration fails startup. Direct embedders must enforce the same activation requirement.

The [approved headless composition](../../../snapshots/session/model-paid-route-approved/cordis.snapshot.yml) supplies an exact preset, while the [refusal composition](../../../snapshots/session/model-paid-route-required/cordis.snapshot.yml) grants nothing. Both replay locally without a paid provider call.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The plugin subscribes to `llm/admission` and `llm/authorize`. The LLM service passes the serving registration's captured Provider metadata, independently of current discovery after replacement. The synchronous admission listener reads validated live grants and returns a refusal or delegates without I/O or resource reservation. The authorization phase precedes `llm/dispatch` reservations and accounting regardless of listener registration order. Rejection (`PAID_ROUTE_CONSENT_DENIED`), unavailable confirmation (`PAID_ROUTE_CONSENT_UNAVAILABLE`), withdrawal (`ABORTED`) or revoked ask mode (`PAID_ROUTE_CONSENT_REVOKED`) never delegates. Approval audit write defects remain thrown. Current admission and composed cancellation are checked again before any reservation. Disposal or application shutdown cancels and drains pending confirmations; a late answer cannot release a withdrawn request.

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Registered-route admission and policy activation |
| [`src/config.ts`](src/config.ts) | Live preset and missing-grant validation |
| [`src/confirmation.ts`](src/confirmation.ts) | One-request approval, cancellation and draining |

No runtime invariant companion is published; each decision derives directly from captured Provider metadata, request controls and validated grants, without a second stored projection; approval audit pairing belongs to user-approval.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [LLM service](../../llm/llm/README.md) — Provider declarations and prepared-call admission.
- [LLM subsystem](../../../docs/subsystems/llm-streaming.md) — typed admission event.
- [Guard family](../README.md) — optional model and tool policies.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the consumer that records an admission refusal in a Session or tool result.

#### KV Cache effect

Allowed calls keep their prompt and tool declarations. Refusal text can enter later history through the consumer's recorded error; preset changes do not themselves add model input.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

This plugin provides operator presets and opt-in one-request confirmation for declared metered routes.

- Only `api_metered` declarations are checked; other or absent usage sources retain existing behavior and are not classified as free.
- Presets are trusted profile configuration and apply until revoked; one-request grants last only for the awaiting invocation. There is no expiry schedule or account-balance lookup.
- Token/currency budgets and purchase/credits protection remain deferred; [request-budget-policy](../request-budget-policy/README.md) provides independent local attempt reservations and execute slots.
- In-flight calls retain their outcome; revocation blocks future dispatches and does not establish provider-side cancellation or refunds.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
