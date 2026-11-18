---
schema_version: 1
task_id: dsh-p1-usage-records
state: DONE
previous_agent: Codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-11-15T15:09:25.796037+00:00"
---

# Checkpoint

Completed the bounded QR-05 settled-native-dispatch slice. Optional token-meter/request-records records one metadata-only Session event per observed dispatch settlement and offers a bounded replay projection. Exact Session ID + committed seq identifies each record. Route labels are captured before delegation, source comes from the captured registration, and the last adapter usage sample is copied immediately with an explicit field allowlist. No prompt, response body, error message or credential is copied. Adapter counters are not official billing or balance. App drain/unload aborts and waits owned streams before withdrawing contributions.

## Verification and recovery

See [verification.md](verification.md), evidence/tested-files.json and saved logs. Final source owners: 291 PASS, focused executable coverage 100%; final native accounting profiles: three PASS including automatic error-then-success retry; Python SDK: six PASS including retained V3 consumed through the real current writer. Removing only the built append fails the record-count oracle; exact bytes restored, SHA in negative-control.json matches the current emitted artifact. Full hygiene 18/18 PASS. Host typecheck/full build/full lint passed before final entry-only primitive-capture fix; scoped emit/lint and affected profiles passed afterward. Persistence history and all five historical references PASS; no released codec/generation modified. Four bilingual owner pairs PASS. Two introduced doc-sync defects were fixed and exact rechecks passed; three preexisting global debts remain, listed in verification.md.

The final regression exposed mutable caller-owned request labels during adapter I/O; source now captures model/intent/purpose before delegation and the finish discriminant at observation. Baseline first-turn prompt/tool bytes remain unchanged. The replay helper now preserves exact-model tool/streaming declarations; real native tests must use registered providers, because catch-all llm/stream replay bypasses dispatch. These durable findings are indexed in Memory and Architecture. No shared Workflow change is needed.

## Remaining scope and ownership

Parent QR-05 remains PARTIAL in the main Plan. Pre-dispatch refusals, process death before settlement, nonlocal/missing Sessions, virtual interception, Task/Run linkage, full policy history and authoritative measurement classification remain uncovered. Official balance/currency/external-executor accounting is not implemented. Next: inspect and implement the smallest pre-dispatch refusal audit slice in a new task without turning preparation into a billed-request claim.

All current and prior local changes remain on codely_bridge, uncommitted/unpushed; no PR. Task-owned files are listed by exact fingerprints; prior structured-output, route, boot/storage, consent, budget and publication work is preserved. Codex remains the sole writer while continuing the user-authorized Plan; no subagents. This completed Task is not a workspace handoff.

## Quota

Live get_usage_limits 2026-11-15T15:08:03.816Z: Codex 10080-minute window, used 64%, remaining 36%, reset Unix 1794907980. Query again before the next task/expensive stage. At <=10%, stop new work and save HANDOFF_READY, releasing workspace ownership.
