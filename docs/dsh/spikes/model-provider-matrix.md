# DSH model provider matrix

English | [中文](model-provider-matrix.zh.md)

Provider capability record for the DSH implementation plan: Mock evidence from 2026-10-22 and SIWC live evidence from 2026-10-23. It separates what this checkout verifies with automated tests from what needs a real provider account, and it records the SIWC decision instead of assuming it.

## Scope

The DSH plan requires two independent provider findings: an OpenAI API-key route, and a separate SIWC (Sign in with ChatGPT) finding. This page records both. It covers the chat model gateway only; it does not cover Codex execution, which belongs to P0-05.

## Routes present in this checkout

| Route | Owning package | Protocol | Credential |
|---|---|---|---|
| `deepseek` | `packages/llm/llm-deepseek` | Anthropic-compatible Messages | DeepSeek API key or official account |
| `openai` | `packages/llm/llm-pi-ai` | OpenAI Responses at `https://api.openai.com/v1` | `OPENAI_API_KEY` through pi-ai ambient discovery |
| `openai-codex` | `packages/llm/llm-pi-ai` | Codex Responses at `https://chatgpt.com/backend-api` | ChatGPT Plus/Pro OAuth |
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

The account's `GET https://api.openai.com/v1/models` returned seven visible models. A synthetic request to `POST https://api.openai.com/v1/responses` using `gpt-6.1-sol`, `store: false` and `stream: true` returned the expected `SIWC_OK` text and `response.completed`; usage was 13 input and 7 output tokens. See the [sanitized evidence](../../../.ai/tasks/dsh-p0-siwc/artifacts/siwc-result.json), [probe source](../../../.ai/tasks/dsh-p0-siwc/artifacts/siwc-probe.mjs) and [execution record](../../../.ai/tasks/dsh-p0-siwc/plan.md). These results establish account feasibility, not a shipped DSH Provider integration.

Integration must follow the [SIWC request restrictions](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) and handle [subscription permission and usage failures](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery). The probe does not mount a Provider or exercise token refresh, revocation, exhausted subscription limits, or DSH-session replay. The existing pi-ai `openai-codex` transport uses ChatGPT's backend endpoint and remains separate from this public Responses route.

Consequences for V0:

- SIWC is feasible for this account; product integration and lifecycle coverage remain P1 work.
- The API-key route requires its own real-account evidence; SIWC success does not clear that requirement.
- DeepSeek and Mock remain fallback options when a chosen account route is unavailable.

## Known limits

- Real API-key access and billing, and SIWC subscription-limit behavior, remain unverified.
- The verification covers text streaming and HTTP failure paths, not image input, tool-call round trips against OpenAI, or Responses reasoning items.
- Provider model identifiers and account eligibility change outside this repository; the matrix records route mechanics, not a frozen model list.

## Next task dependency

P0-03 supplies the chat provider findings for P1-05. SIWC live feasibility passed; P0-03 remains BLOCKED on independent real API-key validation. Product SIWC integration also requires authorization, credential lifecycle, request compatibility and error handling through the existing DSH services.
