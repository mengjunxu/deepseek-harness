---
schema_version: 1
task_id: dsh-p1-request-attempt-link
state: DONE
previous_agent: Codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-11-16T02:32:47.149975+00:00"
---

# Checkpoint

Completed durable native request attribution. Optional loopAttempt is a numeric branded step/start seq plus a one-based step-local attempt ordinal, joined through the enclosing Session. The loop supplies a frozen reference before preparation and increments ordinals on retries. Settlement/preparation producers detach it before async work. Legacy and auxiliary calls make no claim. Both projection caches use version 2 and rebuild version-one data without inventing identity. Live LlmAttemptId remains lifecycle-local. Existing loop invariant checks the reference against its already-owned log snapshot; no new synchronous history read.

## Verified evidence

See verification.md, evidence/tested-files.json and saved logs. PASS: 1096 tests/61 files, focused executable coverage 100%; actual persistent owner resume; dedicated two-built-Host headless restart plus two independent concurrent copies; five profile refreshes/nine replays; Python SDK seven cases; full build/347 client artifacts, types, coordinated full and scoped lint, stable hygiene 18/18. Negative control omitting only emitted attribution fails the real SDK fixed metadata oracle; exact artifact SHA restored. Six named pairs, 483 type-equivalence blocks/483 derivatives, corpus three and all five format references PASS. History has 64 roots/12 acknowledgements; new successor adds two optional fields without editing predecessors or released generations/codecs. Baseline prompt/tools and SDK prompt bytes unchanged.

Doc-sync initially 37 PASS/5 FAIL; introduced type-equivalence and historical-index defects fixed and exact rechecks PASS. Three existing global debts remain: legacy doc typecheck, missing corpus bilingual pairs, hardwrap. Public SDK prompt creates identities; it was not extended or misused to resume persisted Sessions. Resume evidence uses supported headless --session-id. No private SDK argv escape. Process fixture drains IPC and waits child closure before cleanup.

## Remaining and ownership

QR-05 remains PARTIAL: authoritative report/estimate classification, full policy history, Task/Run and external-executor linkage, outer refusal/crash gaps and official balances remain open. Next dependency-ready slice: expose captured request usageSource in the existing Turn usage consumer/UI using explicit loop references, with unknown for legacy/missing attribution and no inference from current discovery. Do not treat adapter counters as official billing or balances.

Owner docs/architecture/Plan and Memory/Architecture indexes updated; no Workflow change. Codex remains sole workspace writer while continuing the user-authorized Plan, no subagents. Current and prior changes remain local/uncommitted/unpushed on codely_bridge, no PR. This is a completed Task, not a workspace handoff.

## Quota

Live get_usage_limits 2026-11-16T02:30:14.094Z: Codex 10080-minute window used 65%, remaining 35%, reset Unix 1794907980. Query before next Task/expensive step. At <=10%, stop new work, save HANDOFF_READY and release ownership.
