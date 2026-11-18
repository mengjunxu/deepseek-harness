---
schema_version: 1
task_id: dsh-p1-session-request-budget
state: DONE
previous_agent: Codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-11-15T13:51:51.934771+00:00"
---

# Checkpoint

The bounded QR-04 per-Session local request-cap task is DONE. Optional maxRequestsPerSession is immutable within each persisted budget identity; fresh non-cancelled receipts atomically enforce the exact Session ID cap in addition to global capacity and execute reserves. All intents and auxiliary purposes share that cap. Missing identity refuses before native model dispatch, including prepared calls; read-only preparation may resolve model metadata and never consumes capacity. Duplicate receipts remain idempotent. Known pre-delegation cancellation refunds both counts; abandoned/committed/settled attempts retain both charges. Existing uncapped records remain readable and unchanged. No LLM API, loop, SDK projection, Session format or physical schema change is introduced.

## Verification and records

See [executed checks](evidence/verification.md) and [fixed-source identity](evidence/completion-fingerprints.json). 51 owner tests PASS with 100% implementation coverage. Five real built-dsh process scenarios PASS; two independent overlapping runs each PASS all five. The same-Session case proves the second Host refuses while global capacity remains and preserves the count after restart. Disabling the Session comparison fails the native-entry oracle, then restores exact built bytes; the final build has the same hash. Eight current Session replays, one retained-V3 replay and three corpus cases PASS. Only the new untracked V4 was temporarily moved, with exact restoration.

Full build (347 Client artifacts), full lint and hygiene 18/18 PASS. Global doc-sync initially 38/4; its new stale Config catalog was regenerated and the exact check passes. Three prior documentation debts remain: legacy typecheck, missing bilingual pairs and hardwrap. Named owner pairing and doc budgets PASS. Baseline prompt/tool bytes add zero tokens. README pair, generated Config/persistence catalogs, main Plan and Memory are updated. This scoped extension reuses existing guard/storage architecture and needs no new Note or Workflow rule.

## Remaining scope and ownership

QR-04 remains PARTIAL: official balance, token/currency, Task caps, credits and per-call consent UI are not provided. Session caps do not aggregate unrelated budget identities or fork/child identities; their global allowance still applies. User authorized continuous Plan work. Next: select the next dependency-ready QR-04/05 slice and create its Task before editing; do not reopen this completed task without new evidence. Codex remains the sole workspace writer, no subagents, all prior local changes preserved, no commit/push/PR.

## Quota

Live get_usage_limits 2026-11-15T13:50:53.768Z: Codex 10080-minute window, used 63%, remaining 37%, reset Unix 1794907980. Query before the next task and expensive stage. At <=10% stop new work, save HANDOFF_READY and release ownership; no account/credit workarounds.
