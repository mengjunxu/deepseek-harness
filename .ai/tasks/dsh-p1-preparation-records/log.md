# Execution log

## Start (2026-11-15T15:11:03.166121+00:00)

Created the next dependency-ready QR-05 slice after verified settled native accounting. Inspected actual prepareCall, adapterStream, loop fallback and Cordis event semantics. No other writer or child agent; prior changes preserved.

## Step 1 (2026-11-15T15:12:02.861101+00:00)

Source audit selects a distinct metadata-only llm/preparation-failed observation for prepareCall and adapterStream preparation. Its fixed category excludes raw error text/codes; captured source and route labels are independent of later discovery/mutation. A separate bounded preparationFailures projection never increments settled requestAccounting. Invocation Session/purpose metadata is optional and separate from LlmCallConfig; agent-loop supplies its actual Session. Cordis parallel awaits observer completion; observer defects retain the primary error in AggregateError. Recording stays opt-in; no observed failure asserts native/provider acceptance or billing. The direct policy-bearing missing-route owner regression FAILS at zero events versus one (evidence/before.log). No production implementation yet. Next: implement observation, producer/projection and focused behavior coverage. No Memory/Workflow change yet; Codex sole writer, earlier local work preserved.

## Step 2 (2026-11-15T15:17:29.850303+00:00)

Implemented metadata-only llm/preparation-failed observation in explicit prepareCall and direct stream preparation, before native dispatch. Optional invocation context carries Session/purpose separately from call controls; the main loop supplies Session ID. Captured registration/primitive labels survive lookup-time replacement/mutation. Fixed categories exclude arbitrary codes/error text/credentials. Awaited observer defects retain the primary failure in AggregateError; ordinary preparation failures preserve original rejection/chunk behavior. Optional token-meter/request-records appends a distinct Session event and preparationFailures count/last-record projection without incrementing settled dispatch counts. Successful virtual middleware can still complete after a missing native adapter audit.

PASS: 138 owner tests across token-meter recording and LLM service, with 100% coverage of new executable preparation helper/recording/projection modules. Coverage initially exposed two absent-optional-field parser paths; valid checkpoint tests now cover records with and without optional labels, without weakening the gate. A test had passed a structurally wider GenerateOptions object then incorrectly expected prepareCall to erase its existing extra Session field; corrected the test to pass actual call controls and independent invocation context. Host typecheck PASS. Scoped lint PASS after parentheses/line-length fixes. Main-loop identity regression is running next, then actual composition and persistence/SDK/docs verification. No Memory/Workflow change yet; all prior local changes preserved, Codex sole writer, no commit/push/PR.

Step 2 lint correction: the rerun still found a long checkpoint expression after the first fixes. Split that expression and rerun before claiming a final PASS. Main-loop policy-bearing virtual-route regression PASS and observes the exact Session identity in preparation metadata.

## Step 3 (2026-11-15T15:28:24.708010+00:00)

Actual headless and TypeScript SDK profiles each log one capability preparation audit before the later native request completes and produces one settlement. SDK protocol notifications/result are fixed, with permanent expected final reply INTENT_OK. New owners retain unchanged V3 replay input and generate V4 through the actual migration/current writer. Python SDK seven cases PASS, including explicit native registration and exactly one preparation event from retained V3. Removing only the built preparation append makes that real SDK fixed assertion fail at 0 != 1; exact bytes restored and SHA verified. No real provider account called.

Broadened affected owners: 639 PASS across 31 files, 100% focused preparation/recording/projection coverage. Main-loop regression confirms actual Session identity reaches the separate preparation context before a header is admitted. Full build PASS (347 client artifacts), latest Host rebuild PASS, full lint PASS, hygiene 18/18 PASS. Nine affected/adjacent profile replays and corpus three tests PASS. Registered the event/context types with their LLM reference page rather than adding a type-link exception. Persistence acknowledgement adds one required event root, same-version; no released generation or codec modified.

One initial profile refresh did not create SDK wire files because protocol-golden ownership is selected by file presence. Seeded only the new owner's wire files from the existing accounting case, then refreshed actual SDK protocol and verified fixed successful response/record counts. The first Python run overlapped doc-sync's doc-typecheck wrapper, which rebuilds Host artifacts and temporarily removed the CLI; rerunning after the aggregate settled passed all seven. This is command sequencing evidence, not a product fix. Scoped lint initially had an outstanding long expression and the fixture incorrectly used Scoped<Agent>.session; split the expression and read agent.session from the actual event payload. Final lint/build passed.

Doc-sync: 37 PASS/5 FAIL. Two introduced failures (architecture word budget and refreshed historical-format index) were corrected; exact budget and five-format checks PASS. Three existing global debts remain: legacy doc typecheck, missing corpus bilingual pairs, hardwrap. Owner READMEs/architecture/Plan, persistence evidence and Memory/Architecture lookup are updated. Next: final named pairing/history/source checks and fixed-source checkpoint. No Workflow change; Codex sole writer, prior work local and preserved, no commit/push/PR.

## Step 4 completed (2026-11-15T15:31:50.094738+00:00)

Completed the bounded QR-05 native preparation-failure audit. Explicit prepareCall accepts optional invocation identity separately from call controls; the main loop supplies Session ID. Direct stream preparation observes its existing identity. Failed preparation emits detached captured route/source, stage and fixed category without arbitrary codes/messages/content. Original failures remain unchanged unless an observer also fails, in which case AggregateError retains both. Optional token-meter/request-records writes one distinct Session event and a bounded preparationFailures projection; audits do not increment settled requestAccounting or usage totals. Missing native adapters may still be served by outer virtual middleware.

## Evidence

[verification.md](verification.md) and evidence/tested-files.json identify exact source and commands. PASS: 639 owner tests/31 files with 100% focused executable coverage; actual headless and SDK profiles; nine adjacent/affected replays; corpus three; Python seven including retained V3; full build/347 client artifacts, latest Host build/typecheck, full and final scoped lint, hygiene 18/18. Disabling only the emitted audit append fails the fixed real SDK one-record oracle; exact bytes restored and artifact SHA matches negative-control.json. Persistence: 64 roots/11 history records and all five format references PASS. Six named bilingual pairs and eight doc budgets PASS. No historical generation/codec changed. Baseline first-turn prompt/tool bytes and new SDK prompt unchanged.

Doc-sync initially 37 PASS/5 FAIL; two introduced budget/historical-index defects were fixed and exact rechecks PASS. Remaining existing debts are legacy doc typecheck, missing corpus bilingual pairs and hardwrap. Do not report aggregate doc-sync PASS. The initial Python run overlapped the doc-typecheck Host rebuild; serial rerun passes. Root doc-typecheck/lint/typecheck wrappers rebuild Host artifacts, so actual SDK consumers and artifact negative controls must run after them. SDK wire goldens require both expected files in the owner; current new case has fixed notifications/result and successful final response.

## Remaining work and ownership

Main Plan QR-05 remains PARTIAL: full request/attempt and Task/Run association, authoritative report/estimate classification, full policy history, outer middleware refusals, process-death gaps, official balance and external-executor accounting remain open. Next: select the smallest request/attempt correlation slice using existing logged identities before adding a new product store. Current accounting records identify their own settlement but do not yet join concurrent main/auxiliary attempts, so never infer that join from event adjacency or current Provider directory state.

Owner READMEs, architecture, main Plan and persistence acknowledgements are updated. Memory/Architecture index verified scope and command sequencing; no Workflow change required. Codex remains sole workspace writer while continuing the user's Plan, no subagents. All prior/current modifications remain local, uncommitted/unpushed on codely_bridge, no PR. This is a completed Task checkpoint, not a workspace handoff.

## Quota

Live get_usage_limits 2026-11-15T15:28:26.434Z: Codex 10080-minute window, used 64%, remaining 36%, reset Unix 1794907980. Query before next task/expensive stage. At <=10%, stop new work, save HANDOFF_READY and release ownership.
