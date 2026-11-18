---
schema_version: 1
task_id: dsh-p1-request-attempt-link
title: "Join native accounting to durable loop request attempts"
status: DONE
priority: P1
created_at: "2026-11-15T15:34:02.619173+00:00"
updated_at: "2026-11-16T02:32:47.149975+00:00"
---

# Goal

Identify which durable loop attempt produced each observed native accounting/preparation record, without guessing from neighboring events or current Provider metadata.

## Scope

Audit existing request/live-attempt identities and introduce only the missing durable join under current owners. Reuse a logged step identity plus a loop-owned attempt ordinal if no suitable durable request identity exists; do not persist the existing lifecycle-local LlmAttemptId as a global identity. Carry model-hidden invocation metadata separately from call controls and capture it before async work. Native settlement/preparation records and bounded views consume the explicit join. Preserve legacy absence as unknown and keep concurrent auxiliary calls distinct. Include relevant runtime invariant, actual retry/resume, dual SDK/persistence and documentation evidence. No new transcript, Task store, provider submission guarantee, GUI, real provider call, commit/push/PR.

## Acceptance criteria

- [x] Source audit proves current identity limits and a failure-first test exposes the missing durable join.
- [x] Actual loop requests and preparation failures retain exact Session/step/attempt attribution across retries and replacement, without copied content or model input changes.
- [x] Auxiliary/missing/old attribution stays explicit; runtime checks reject broken owned relationships.
- [x] Actual profiles, both SDKs and retained logs verify the join, with scoped checks and persistence acknowledgement.
- [x] Plan, docs and exact-source checkpoint describe the verified bounded scope.

## Constraints

Codex is sole workspace writer on codely_bridge; completed native accounting/preparation tasks and all prior local changes remain preserved. No child agents. Query weekly Codex 10080-minute quota at each step and before expensive stages. At <=10%, stop new work and save HANDOFF_READY/release ownership. Follow source/artifact sequencing: root doc-typecheck/lint/typecheck wrappers rebuild Host outputs; run built consumers afterward.
