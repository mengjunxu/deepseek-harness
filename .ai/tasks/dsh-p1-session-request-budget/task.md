---
schema_version: 1
task_id: dsh-p1-session-request-budget
title: "Bound local requests per Session within atomic route budgets"
status: DONE
priority: P1
created_at: "2026-11-15T13:35:26.602708+00:00"
updated_at: "2026-11-15T13:51:51.934771+00:00"
---

# Goal

Enforce an optional persistent per-Session request cap within each configured route budget, without bypassing its shared capacity or execute reserve.

## Scope

Extend the existing request-budget-policy Config, atomic receipt owner and dispatch consumer. Count non-cancelled receipts for the exact captured Session ID; missing identity fails closed at reservation before native model dispatch when a Session cap applies. Read-only preparation may resolve model metadata and does not consume capacity. The cap is immutable for a persisted budget identity. Preserve existing no-cap records and behavior. Verify independent owners, restarted/resumed identity, zero cap, pre-dispatch cancellation, auxiliary calls, live Settings rejection and real profile/process/Session output.

Task caps, token/currency estimates, official balance, external executor accounting, Usage Ledger, UI, provider account calls and new Task/Session stores remain outside this bounded task. QR-04 remains PARTIAL. No commit, push or PR; preserve all existing local changes. Codex is sole writer and no other agent was started. Current branch codely_bridge; fixed-source fingerprints identify code rather than a guessed commit. Query weekly quota at each checkpoint and before expensive operations, stop at remaining <=10% and prepare HANDOFF_READY records.

## Acceptance criteria

- [x] Session caps count all intents and auxiliary attempts without permitting global/execute reserve bypass.
- [x] Missing Session identity is refused before native dispatch, including prepared calls, when the cap applies; uncapped rules keep existing behavior.
- [x] Cross-Host atomic decisions, cancellation refund, crash/restart charges and immutable definition changes preserve counts.
- [x] Real Loader/Settings and shipped-profile recorded/process acceptance pass, with focused implementation coverage.
- [x] Owner docs, generated Config/API records, main Plan and checkpoint reflect verified scope and remaining work.
