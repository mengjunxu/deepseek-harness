# Execution log

## Start (2026-11-15T15:34:02.619173+00:00)

Continuing user-authorized Plan. Audited GenerateOptions, step/start, loop retry, live AssistantStreamAttempt/LlmAttemptId and current accounting. Live attempt IDs reset per lifecycle; settled record identity alone does not join main and concurrent auxiliary calls. No other writer or child agent.

## Step 1 (2026-11-15T15:37:02.540184+00:00)

Selected optional LlmLoopAttemptRef: committed step/start SessionSeq plus a positive loop-owned attempt ordinal. The enclosing Session supplies the other identity component. step/start commits before preparation; the loop retries within that step, and new/resumed steps commit different sequence identities. Existing LlmAttemptId remains lifecycle-local and is not persisted. No new UUID or transcript. Explicit reference travels in invocation metadata, never call controls or model input. Missing/auxiliary/old references remain absent/unknown; do not infer joins from adjacency.

The actual main-loop policy-refusal regression FAILS at the missing loopAttempt field (evidence/before.log). Existing invariant already owns an event snapshot for request reconstruction; extend checks against that same snapshot without adding a new synchronous history read. Validate current step and ordinal from prior assistant settlements, not transient frame ids. Record/projection caches need version 2 to accept the new optional reference; old cached views rebuild, old events remain readable. No production change yet. Next: source types, loop producer, immutable record copies and invariant tests. No Memory/Workflow change yet; Codex sole writer, prior work local and preserved.

## Step 2 (2026-11-15T15:43:51.601123+00:00)

Implemented optional LlmLoopAttemptRef as a numeric branded step/start seq plus one-based attempt ordinal, carried in GenerateOptions/preparation context rather than call controls. The main loop captures the committed step sequence and increments ordinals on retries. Settlement and preparation producers detach the reference before asynchronous work; auxiliary/legacy calls omit it. Both bounded record caches advance to state version 2, reject invalid durable ordinals and rebuild old version-one caches without inventing attribution.

The existing loop request invariant compares the frozen reference with the current committed step and prior assistant settlements using its already-owned event snapshot; no new synchronous history read was introduced. It rejects missing/wrong-step/wrong-ordinal/mutable references. Existing invariant fixtures now carry actual step commit identities. PASS: 115 focused cases and 100% coverage for the helper, recorder/projection and invariant modules; actual persistent resume test PASS across separate runtime instances, with attempt 1 on different committed step identities. Core retry regression observes ordinals 1/2/3. Concurrent auxiliary settlement arrives first without claiming the main reference; main metadata stays captured despite caller mutation. Host typecheck and scoped lint PASS. The first typecheck exposed that SessionSeq is a BrandedNumber rather than string Branded; corrected the type without casts or a dependency cycle.

Next: persistent type successor acknowledgement, default model-byte evidence, actual native retry/current-vs-retained recordings, TypeScript/Python SDK expected outputs and process resume proof, docs/catalogs/final checks. No Memory/Workflow update yet; prior work local and preserved, Codex sole writer, no commit/push/PR.

## Interruption recovery (2026-11-16T02:27:48.343070+00:00)

Verified no prior owned test/build process remains. Branch and local modifications match the checkpoint; Codex remains sole writer. Live weekly quota is 35% remaining. Completed since Step 2: 1096 owner tests/61 files and focused coverage 100%; build/347 client artifacts, lint and stable post-build hygiene 18/18; five refreshed accounting profiles and nine affected replays. Type-equivalence and historical-reference defects were fixed with exact rechecks. A proposed Python SDK restart test exposed that session_prompt creates new identities and does not resume persisted Sessions. Removed only this new test; existing seven SDK cases remain. Do not add private SDK argv escapes. Verify restart attribution through supported headless --session-id in a dedicated keyless process case. SDK resume itself remains outside this slice.

## Step 3 (2026-11-16T02:30:12.057376+00:00)

Actual native current recordings carry explicit committed step identities; retry records share the step and carry attempts 1/2. Five affected accounting profile refreshes and nine current/adjacent replays PASS. Python SDK seven cases PASS against retained inputs and fixed expected metadata. Public SDK prompt creates Sessions rather than resuming them, so no private argv escape or new resume API was added. The failed proposed SDK restart test was removed; actual restart uses supported headless --session-id, first allowing the launcher to mint a fresh identity and then restoring that identity. Built two-Host case PASS, plus two independent copies PASS concurrently. The fixture waits pending IPC observations during application drain; process cleanup waits quiescence before deleting allocated roots.

Removing only emitted settlement loopAttempt makes the real SDK fixed metadata comparison fail while the request completes; exact bytes restored, hash in negative-control.json. 1096 owner tests/61 files PASS, focused executable coverage 100%; full build/347 client artifacts, coordinated full lint and stable post-build hygiene 18/18 PASS. The two-root successor persistence acknowledgement retains separate predecessors; no released generations/codecs changed. Both caches version 2 rebuild old version-one records without inventing joins.

Doc-sync initially 37 PASS/5 FAIL; introduced GenerateOptions type-equivalence and historical-index defects corrected by exact rechecks. Existing legacy doc typecheck, corpus pairing and hardwrap debts remain. Main Plan QR-05 remains PARTIAL; its verified attribution scope and remaining authoritative measurement/full policy/Task/Run/external/crash gaps are explicit. Owner docs and Memory/Architecture indexes updated; no Workflow change. Next: final pairing/history/corpus/source evidence. Codex sole writer; prior work local, no commit/push/PR.

## Step 4 completed (2026-11-16T02:32:47.149975+00:00)

Completed durable native request attribution. Optional loopAttempt is a numeric branded step/start seq plus a one-based step-local attempt ordinal, joined through the enclosing Session. The loop supplies a frozen reference before preparation and increments ordinals on retries. Settlement/preparation producers detach it before async work. Legacy and auxiliary calls make no claim. Both projection caches use version 2 and rebuild version-one data without inventing identity. Live LlmAttemptId remains lifecycle-local. Existing loop invariant checks the reference against its already-owned log snapshot; no new synchronous history read.

## Verified evidence

See verification.md, evidence/tested-files.json and saved logs. PASS: 1096 tests/61 files, focused executable coverage 100%; actual persistent owner resume; dedicated two-built-Host headless restart plus two independent concurrent copies; five profile refreshes/nine replays; Python SDK seven cases; full build/347 client artifacts, types, coordinated full and scoped lint, stable hygiene 18/18. Negative control omitting only emitted attribution fails the real SDK fixed metadata oracle; exact artifact SHA restored. Six named pairs, 483 type-equivalence blocks/483 derivatives, corpus three and all five format references PASS. History has 64 roots/12 acknowledgements; new successor adds two optional fields without editing predecessors or released generations/codecs. Baseline prompt/tools and SDK prompt bytes unchanged.

Doc-sync initially 37 PASS/5 FAIL; introduced type-equivalence and historical-index defects fixed and exact rechecks PASS. Three existing global debts remain: legacy doc typecheck, missing corpus bilingual pairs, hardwrap. Public SDK prompt creates identities; it was not extended or misused to resume persisted Sessions. Resume evidence uses supported headless --session-id. No private SDK argv escape. Process fixture drains IPC and waits child closure before cleanup.

## Remaining and ownership

QR-05 remains PARTIAL: authoritative report/estimate classification, full policy history, Task/Run and external-executor linkage, outer refusal/crash gaps and official balances remain open. Next dependency-ready slice: expose captured request usageSource in the existing Turn usage consumer/UI using explicit loop references, with unknown for legacy/missing attribution and no inference from current discovery. Do not treat adapter counters as official billing or balances.

Owner docs/architecture/Plan and Memory/Architecture indexes updated; no Workflow change. Codex remains sole workspace writer while continuing the user-authorized Plan, no subagents. Current and prior changes remain local/uncommitted/unpushed on codely_bridge, no PR. This is a completed Task, not a workspace handoff.

## Quota

Live get_usage_limits 2026-11-16T02:30:14.094Z: Codex 10080-minute window used 65%, remaining 35%, reset Unix 1794907980. Query before next Task/expensive step. At <=10%, stop new work, save HANDOFF_READY and release ownership.
