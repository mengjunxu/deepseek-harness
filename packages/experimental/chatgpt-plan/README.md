---
description: "Connect a local DSH Web UI to a ChatGPT subscription through official SIWC authorization."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-chatgpt-plan

English | [中文](README.zh.md)

## Summary

Connect a ChatGPT Plus or Pro account from DSH Models settings, then select its available models in the existing model picker. Eligible requests use the account’s ChatGPT plan through the public Responses API. This experimental plugin is explicitly enabled and leaves API-key routes separate. Tokens remain in the Host credential store.

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

Mount the built plugin beside `llm`, `credentials`, `authorization`, the authenticated Remote Gateway and the Models UI. It registers the `chatgpt-plan` provider without modifying the agent loop or replacing another provider. The normal Web profile already supplies those prerequisites.

The repository validation starts the normal `web` profile with an absolute-path overlay pointing at this package’s built `lib/index.js`, fresh data directories and the in-page picker overlay. See the [task record](../../../.ai/tasks/dsh-siwc-ui/plan.md) for commands and the distinction between tests and live evidence.

In Settings → Models, choose Continue with ChatGPT, then open the sign-in page. Complete consent in the browser. The settings card shows the validated account and plan usage; the model picker reads that account’s current model list. Manage usage opens ChatGPT settings. Disconnect requires confirmed remote revocation before clearing local tokens; a network failure retains the account for retry.

| Field | Default | Meaning |
|---|---|---|
| `appName` | `DeepSeek Harness` | Application name displayed during registration. |
| `requestTimeoutMs` | `600000` | Total deadline for each network operation, including the complete inference stream. |
| `attemptTimeoutMs` | `600000` | Complete browser-authorization deadline. |
| `contextWindow` | `262144` | Fallback capacity used for context accounting; configure for the selected models. |

Model discovery queries the account catalog. Inference uses the exact selected model ID without fetching that catalog again; the Responses endpoint validates model access. Catalog rate limits can block discovery but do not block requests to an already selected model.

Streaming text does not complete a request. The stream must reach a terminal response event before its total deadline; otherwise the adapter reports TIMEOUT, preserves partial output, and identifies `requestTimeoutMs` as the setting to adjust. Caller cancellation remains ABORTED, and an upstream stream ending without a terminal event remains TRANSPORT.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The authorization flow owns PKCE, state, nonce and the temporary loopback listener. OpenID Connect verification checks the issuer, signature, audience, expiry and account identity before committing the grant through the existing authorization service. The issued client ID and host identity survive sign-out; access, refresh and ID tokens never cross Remote or enter Session events. Refresh uses the credential provider’s cross-process mutation lock.

The adapter reuses pi-ai request-history and stream conversion. The SIWC payload preserves conversation history and system instructions, uses `store: false` and `stream: true`, and groups function definitions in a namespace with the required description. Explicit subscription-limit failures map to QUOTA; usage-check unavailability maps to SERVER, and other HTTP 429 responses from account requests map to RATE_LIMIT. Account-request failures retain the endpoint path, HTTP status, request ID when present, and response body. A subscription limit can apply to this app even when the account has remaining usage; manage app limits in ChatGPT settings → Usage. HTTP redirects are refused for credential-bearing requests.

No `./invariant` installer is published: credential records are the sole account authority, state views read those records directly, and framework-owned registrations have no independent package-maintained index to compare.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Official SIWC registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) — public-client authorization.
- [SIWC restrictions](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) — supported request fields.
- [Credentials](../../credentials/credentials/README.md) — secret storage and refresh locking.
- [Authorization](../../credentials/authorization/README.md) — attempt cancellation and commit ownership.

-----

<a id="model-experience"></a>
## Model Experience

### Namespaced tool definitions

#### What the model sees

The selected model receives existing logged messages and tool schemas through the normal LLM service. When tools are present, their definitions are grouped under namespace `dsh` with description `Tools available in this DSH session.`; this plugin registers no additional callable tool or system-prompt section. Credentials and account labels are excluded from model content.

#### Token effect

The namespace name and description add request tokens whenever tools are present. History and individual tool-schema sizes remain owned by their producers; account authorization adds no conversation content.

#### KV Cache effect

Namespace metadata repeats across requests. Changes to the selected model, retained history or available tools can change the reusable prefix; provider-side cache availability is not controlled by this plugin.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

The current integration is local and experimental.

- One active account registration is supported. A full saved-account/workspace picker is deferred.
- Input is text-only. Temperature, output-token caps, stop sequences and explicit reasoning controls are refused.
- A fallback context capacity is configured per plugin, rather than individually per account model.
- Live provider access, subscription limits and supported models depend on OpenAI and the selected account.
- SIWC uses Codex / ChatGPT Work usage, planned as `work_codex_shared`, not ordinary ChatGPT chat allowance; see [OpenAI's explanation](https://learn.chatgpt.com/docs/sign-in-with-chatgpt). Intent-aware quota protection and a Usage Ledger are not implemented by this plugin.

<a id="dev-note"></a>
### Dev Note

Live UI acceptance and recording status belong in the linked task checkpoint.
