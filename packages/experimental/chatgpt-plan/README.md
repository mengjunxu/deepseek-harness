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
| `requestTimeoutMs` | `120000` | Deadline for each network operation and inference request. |
| `attemptTimeoutMs` | `600000` | Complete browser-authorization deadline. |
| `contextWindow` | `262144` | Fallback capacity used for context accounting; configure for the selected models. |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The authorization flow owns PKCE, state, nonce and the temporary loopback listener. OpenID Connect verification checks the issuer, signature, audience, expiry and account identity before committing the grant through the existing authorization service. The issued client ID and host identity survive sign-out; access, refresh and ID tokens never cross Remote or enter Session events. Refresh uses the credential provider’s cross-process mutation lock.

The adapter reuses pi-ai request-history and stream conversion. The SIWC payload preserves conversation history and system instructions, uses `store: false` and `stream: true`, and groups function definitions in a namespace. Subscription-limit failures map to non-retryable QUOTA errors with the usage-settings destination. HTTP redirects are refused for credential-bearing requests.

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

This plugin adds no tool or prompt section. The selected model receives existing logged messages and tool schemas through the normal LLM service. The transport changes billing authorization, not the source of conversation history. Credentials and account labels are excluded from model content.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

The current integration is local and experimental.

- One active account registration is supported. A full saved-account/workspace picker is deferred.
- Input is text-only. Temperature, output-token caps, stop sequences and explicit reasoning controls are refused.
- A fallback context capacity is configured per plugin, rather than individually per account model.
- Live provider access, subscription limits and supported models depend on OpenAI and the selected account.

<a id="dev-note"></a>
## Dev Note

Live UI acceptance and recording status belong in the linked task checkpoint.
