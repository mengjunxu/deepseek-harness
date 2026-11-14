# QR-02 configuration acceptance

QR-02 completion is limited to the acceptance criteria in Plan section 10.4. It does not close P1-05 (real Provider lifecycle), P1-07 (unified Run), VN4-02 (independent UI/Run binding), QR-03 (full routing), or the CG1 Gate.

| Configuration owner | Evidence |
|---|---|
| Auth: pi-ai apiKeyEnv and llm-pi-ai/provider credential records | Node 26 Loader suite: explicit key overrides grant; absent key refuses without grant fallback; replaced/deleted grants observed by next call |
| Provider: providers route dictionary | Same Loader suite: retained route/model; fake grant derivation uses an explicitly configured loopback completions protocol, not a real Codex endpoint |
| Usage: providers.route.policy | Previous and current Loader cases: credential changes retain policy, policy changes retain key, OAuth does not populate omitted policy or balances |
| Codex Executor: independent subagent-codex instances | 2 targeted existing tests: per-instance model/env/permission and HMR ownership; explicit native model on each ephemeral thread. Subprocess peer mocked; no native account launched |
| Codely Executor: command/checks in codely-local overlay | Existing lifecycle Loader scenario executed without model turn; subprocess executor fixture, not real Codely cloud authentication |

Supported/unknown mode matrix and old-name search: [previous mode audit](../../dsh-p1-auth-route-separation/evidence/modes.md). Codex native-model and external-agent have implementations; Codely external-agent is a local example, native-model remains unknown. No existing plugin removed or renamed. Provider policy is a declaration, not a billing verification. Account selection still uses existing provider-scoped records; a multi-account picker is not introduced.

Original QR-02 requirements are satisfied through existing implementations, these regressions and the previous source audit. The predecessor's remaining account/executor integration warning stays valid for broader product acceptance and does not become a claim that real accounts were tested here.
