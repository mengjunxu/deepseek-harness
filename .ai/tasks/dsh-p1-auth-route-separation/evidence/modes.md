# QR-02 source audit

Scope: repository source only; no account credentials, private global configuration or external model services inspected. Supported means an implementation and referenced evidence exist, not full product acceptance.

| Product / mode | Status | Authentication owner | Provider / executor and usage source | Evidence / remaining acceptance |
|---|---|---|---|---|
| Codex native-model | supported implementation; account compatibility unknown | pi-ai credential records / configured key reference | llm-pi-ai openai-codex; usage policy explicitly configured, never inferred from OAuth | packages/llm/llm-pi-ai/src/auth.ts, provider.ts, login.ts; real account integration not rerun |
| Official SIWC native-model | supported experimental implementation | chatgpt-plan authorization and Host credentials | chatgpt-plan; work_codex_shared | packages/experimental/chatgpt-plan/src/index.ts; P1-05 retains Loader/snapshot/lifecycle acceptance |
| Codex external-agent | supported pinned implementation | native Codex configuration and authentication | subagent-codex app-server; no automatic LLM policy selection | packages/subagent/subagent-codex/README.md; P0 executor evidence; common Run integration remains P1-07 |
| Codely native-model | unknown | no verified owner | no verified model adapter | no provider found in tracked packages/apps; do not infer support from CLI |
| Codely external-agent | supported local example | Codely native authentication | apps/cli/config/examples/codely-local; no automatic LLM policy selection | P0 executor probes and apps/cli/tests/codely-local.spec.ts; common Run/approval integration remains P1-07 |

The identifiers pi2dsh, dsh-codex-oauth and dsh-codely were not found as independent package/plugin declarations in packages/apps. Existing path strings containing dsh-codely name temporary test directories. No plugin removed or renamed; external/global installations remain uninspected.

The Loader regression uses fake credential values and a loopback model server. Its work_codex_shared declaration checks configuration independence, not whether that server or account actually consumes a subscription. QR-02 cannot be marked DONE from this test: stored OAuth switching, executor/account integration and remaining mode acceptance need separate evidence.
