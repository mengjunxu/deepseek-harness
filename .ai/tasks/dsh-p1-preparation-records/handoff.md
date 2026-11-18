---
schema_version: 1
task_id: dsh-p1-preparation-records
state: DONE
previous_agent: Codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-11-15T15:31:50.094738+00:00"
---

# Checkpoint

Completed the bounded QR-05 native preparation-failure audit. Explicit prepareCall accepts optional invocation identity separately from call controls; the main loop supplies Session ID. Direct stream preparation observes its existing identity. Failed preparation emits detached captured route/source, stage and fixed category without arbitrary codes/messages/content. Original failures remain unchanged unless an observer also fails, in which case AggregateError retains both. Optional token-meter/request-records writes one distinct Session event and a bounded preparationFailures projection; audits do not increment settled requestAccounting or usage totals. Missing native adapters may still be served by outer virtual middleware.

## Evidence

[verification.md](verification.md) and evidence/tested-files.json identify exact source and commands. PASS: 639 owner tests/31 files with 100% focused executable coverage; actual headless and SDK profiles; nine adjacent/affected replays; corpus three; Python seven including retained V3; full build/347 client artifacts, latest Host build/typecheck, full and final scoped lint, hygiene 18/18. Disabling only the emitted audit append fails the fixed real SDK one-record oracle; exact bytes restored and artifact SHA matches negative-control.json. Persistence: 64 roots/11 history records and all five format references PASS. Six named bilingual pairs and eight doc budgets PASS. No historical generation/codec changed. Baseline first-turn prompt/tool bytes and new SDK prompt unchanged.

Doc-sync initially 37 PASS/5 FAIL; two introduced budget/historical-index defects were fixed and exact rechecks PASS. Remaining existing debts are legacy doc typecheck, missing corpus bilingual pairs and hardwrap. Do not report aggregate doc-sync PASS. The initial Python run overlapped the doc-typecheck Host rebuild; serial rerun passes. Root doc-typecheck/lint/typecheck wrappers rebuild Host artifacts, so actual SDK consumers and artifact negative controls must run after them. SDK wire goldens require both expected files in the owner; current new case has fixed notifications/result and successful final response.

## Remaining work and ownership

Main Plan QR-05 remains PARTIAL: full request/attempt and Task/Run association, authoritative report/estimate classification, full policy history, outer middleware refusals, process-death gaps, official balance and external-executor accounting remain open. Next: select the smallest request/attempt correlation slice using existing logged identities before adding a new product store. Current accounting records identify their own settlement but do not yet join concurrent main/auxiliary attempts, so never infer that join from event adjacency or current Provider directory state.

Owner READMEs, architecture, main Plan and persistence acknowledgements are updated. Memory/Architecture index verified scope and command sequencing; no Workflow change required. Codex remains sole workspace writer while continuing the user's Plan, no subagents. All prior/current modifications remain local, uncommitted/unpushed on codely_bridge, no PR. This is a completed Task checkpoint, not a workspace handoff.

## Quota

Live get_usage_limits 2026-11-15T15:28:26.434Z: Codex 10080-minute window, used 64%, remaining 36%, reset Unix 1794907980. Query before next task/expensive stage. At <=10%, stop new work, save HANDOFF_READY and release ownership.
