# DSH model provider matrix

English | [中文](model-provider-matrix.zh.md)

Provider capability record for the DSH implementation plan, updated by the 2026-10-26 source and evidence audit. It separates historical Mock/probe results, the experimental SIWC integration, and remaining real-account acceptance. Current work is tracked in the [SIWC task](../../../../.ai/tasks/dsh-siwc-ui/handoff.md) and the [plan audit](../../../../.ai/tasks/dsh-chatgpt-plan-update/handoff.md).

## Scope

The DSH plan requires two independent provider findings: an OpenAI API-key route, and a separate SIWC (Sign in with ChatGPT) finding. This page records both. It covers the chat model gateway only; it does not cover Codex execution, which belongs to P0-05.

## Routes present in this checkout

| Route | Owning package | Protocol | Credential |
|---|---|---|---|
| `deepseek` | `packages/llm/llm-deepseek` | Anthropic-compatible Messages | DeepSeek API key or official account |
| `openai` | `packages/llm/llm-pi-ai` | OpenAI Responses at `https://api.openai.com/v1` | `OPENAI_API_KEY` through pi-ai ambient discovery |
| `openai-codex` | `packages/llm/llm-pi-ai` | Codex Responses at `https://chatgpt.com/backend-api` | ChatGPT Plus/Pro OAuth |
| `chatgpt-plan` (opt-in) | `packages/experimental/chatgpt-plan` | Public Responses at `https://api.openai.com/v1` | SIWC plan permission; `work_codex_shared` usage |
| `azure-openai-responses` | `packages/llm/llm-pi-ai` | Azure Responses | pi-ai provider sign-in |
| `anthropic` | `packages/llm/llm-pi-ai` | Anthropic Messages | API key or OAuth |
| Hand-declared gateway | `packages/llm/llm-pi-ai` | `openai-completions` or `openai-responses` | `apiKeyEnv` reference |

pi-ai is `@earendil-works/pi-ai` 0.85.1 in this checkout. The `openai` route is not a special DSH implementation: it is one entry in pi-ai's generated provider catalog, and the adapter resolves each request from the current profile snapshot.

## OpenAI API-key route

The catalog route needs no wire description, only a credential and an optional endpoint:

```yaml
- name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      openai:
        apiKeyEnv: OPENAI_API_KEY
        models:
          - id: gpt-5
            contextWindow: 400000
```

A gateway that is not in the catalog declares its own protocol, endpoint, and models:

```yaml
- name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      openai-gateway:
        displayName: OpenAI-compatible gateway
        apiKeyEnv: OPENAI_API_KEY
        api: openai-completions
        baseURL: https://gateway.example/v1
        models:
          - id: gateway-model
            contextWindow: 65536
            maxTokens: 4096
```

`apiKeyEnv` holds a credential reference, not the secret. A reference that resolves to nothing fails the request with `MISSING_CREDENTIAL` before any network request; the adapter does not fall back to an unrelated ambient key. Omitting `apiKeyEnv` entirely defers to pi-ai's provider-native discovery.

## Failure classification

`packages/llm/llm-pi-ai/src/stream.ts` maps provider failures to stable codes. The retry policy in `packages/llm/llm/src/retry-policy.ts` decides which codes are retried: default mode retries `EMPTY_RESPONSE`, `RATE_LIMIT`, `SERVER`, `TIMEOUT`, and `TRANSPORT` up to five times with bounded exponential backoff.

| Provider condition | Failure code | Retried by default |
|---|---|---|
| Rejected key (`401`, `403`) | `AUTH` | No |
| Exhausted account quota | `QUOTA` | No |
| Transient rate limit (`429`) | `RATE_LIMIT` | Yes |
| Credential reference resolves to nothing | `MISSING_CREDENTIAL` | No |
| Request beyond the model context window | `CONTEXT_WINDOW_EXCEEDED` | No |
| Rejected request body (`400`, `413`) | `INVALID_REQUEST` | No |
| Provider `5xx` | `SERVER` | Yes |
| Stream closed before the terminal event | `TRANSPORT` | Yes |
| Completed response with no content | `EMPTY_RESPONSE` | Yes |

A completed stream is reported as `stop` only after the provider's terminal event arrives. A truncated stream produces an error finish, so a dropped connection cannot be recorded as a successful turn.

## Verification record

Mock-backed evidence, executed on 2026-10-22 in this checkout:

| Case | Route shape | Result |
|---|---|---|
| Streamed text completion | Catalog `openai` route, Responses protocol | Passed; `/responses`, bearer key, usage recorded |
| Streamed text completion | Hand-declared `openai-completions` route | Passed; `/v1/chat/completions`, bearer key, usage recorded |
| Rejected key (`401`) | Both route shapes | Passed; error finish with `AUTH` |
| Exhausted quota (`429` with `insufficient_quota`) | `openai-completions` route | Passed; error finish with `QUOTA` |
| Unconfigured credential | `openai-completions` route | Passed; `MISSING_CREDENTIAL` with zero requests sent |

Reproduce with:

```
corepack pnpm exec vitest run packages/llm/llm-pi-ai/tests/openai-route-matrix.spec.ts
```

Real API-key evidence: **BLOCKED**. No real OpenAI API-key request has been verified. The Mock endpoint cannot establish account model access or billing behavior. The independent SIWC result below uses a Plus subscription and does not validate the API-key route.

## SIWC status

The independent P0 probe **passed** on 2026-10-23 with the user's Plus account. The browser registered DeepSeek Harness through the [official SIWC flow](https://developers.openai.com/siwc/token-sharing-open-source/sign-in). The probe validated the callback state and ID-token signature, issuer, audience, expiry and nonce, then confirmed the granted `chatgpt.tokens.use.direct` permission. Credentials remain in an owner-only directory outside Git.

The account's `GET https://api.openai.com/v1/models` returned seven visible models. A synthetic request to `POST https://api.openai.com/v1/responses` using `gpt-6.1-sol`, `store: false` and `stream: true` returned the expected `SIWC_OK` text and `response.completed`; usage was 13 input and 7 output tokens. See the [sanitized evidence](../../../../.ai/tasks/dsh-p0-siwc/artifacts/siwc-result.json), [probe source](../../../../.ai/tasks/dsh-p0-siwc/artifacts/siwc-probe.mjs) and [execution record](../../../../.ai/tasks/dsh-p0-siwc/plan.md). These results establish account feasibility, not a shipped DSH Provider integration.

The experimental `chatgpt-plan` Provider and Models settings extension are now implemented as an explicit opt-in. Source covers OAuth/OIDC, credentials, account models, refresh/revocation and pi-ai request/stream translation. The retained local Session evidence includes three completed conversation turns. The prior repair runs passed 19 focused tests, package Host/Client type checks, scoped lint and a Host plugin build; the current documentation audit does not rerun those product tests. See the [execution record](../../../../.ai/tasks/dsh-siwc-ui/plan.md) for commands and limits.

Integration follows the [SIWC request restrictions](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) and [error guidance](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery). Local repairs add the required tool-namespace description, preserve rate-limit diagnostics, distinguish usage unavailability from quota exhaustion, extend the total stream deadline to 600000 ms and classify it as TIMEOUT, and stop fetching the model catalog before every inference. These repairs remain uncommitted and require live revalidation; Loader composition, recorded Session snapshots, GIF and complete network lifecycle/restart acceptance remain unfinished. The independent probe does not substitute for that acceptance. The pi-ai `openai-codex` transport remains a separate model route, not the Codex external-agent adapter.

According to [OpenAI's plan-usage documentation](https://learn.chatgpt.com/docs/sign-in-with-chatgpt), SIWC requests use Codex / ChatGPT Work usage, classified by the merged plan as `work_codex_shared`; they do not use ordinary ChatGPT chat allowance or grant conversations/Memory access. Account and app limits can differ. This classification is documented, but UsageSource metadata, intent-aware routing, quota protection, paid-fallback consent and a Usage Ledger are target features in QR-01..06, not implemented guarantees. No confirmed ordinary-chat Provider is available to DSH's own UI; an optional ChatGPT → DSH MCP ingress would be a separate entry direction.

Consequences for V0:

- SIWC has an experimental product integration and local successful turns; complete product/lifecycle acceptance remains P1-05 work.
- The API-key route requires its own real-account evidence; SIWC success does not clear that requirement.
- DeepSeek and Mock remain configurable alternatives; automatic model or billing-source fallback requires the planned explicit policy and consent.

## Known limits

- Real API-key access and billing, and SIWC subscription-limit behavior, remain unverified.
- The evidence includes text streaming and local tool activity; real tool-call, image, reasoning and lifecycle coverage is not a complete Provider capability matrix.
- Provider model identifiers and account eligibility change outside this repository; the matrix records route mechanics, not a frozen model list.

## Next task dependency

P0-03 remains BLOCKED on independent real API-key validation. P1-05 is Partial for the opt-in SIWC integration. The merged plan prioritizes CG1 quota-aware routing after the user approves that phase, retaining the remaining P0 probes and P1-05 product acceptance as separate evidence obligations.
