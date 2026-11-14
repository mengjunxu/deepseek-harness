---
schema_version: 1
task_id: dsh-p1-entry-model-routing
state: DONE
previous_agent: none
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-11-14T23:56:44+08:00"
---

# Checkpoint

Codex owns this new task; previous turns ended and released ownership. Git matches prior model-capability/glossary/Taskboard records; preserve all existing edits and user settings. No other writer observed. No commit/push/fetch; fixed tested ref null. Node 26 for checks.

Quota start: only 10080-minute Codex window returned (57% used), required 300-minute remainder/reset UNKNOWN; user informed. No reset or credits used. Reuse entry installModelSelection across Web/API/headless/ACP; SDK without this owner must fail entry mode explicitly rather than infer selection. Query/capture is process-local and no model-visible data is introduced outside existing messages/headers. Next: scoped selection access and entry route tests.

## Implementation checkpoint

Codex remains the sole writer. Scoped capture and entry routes implemented; 38 focused Agent/default-model/API tests PASS, including route freezing across asynchronous assembly, pending next-Turn selection, notices, missing/disposed owner, ambiguous config, two-Agent isolation and no alternate provider on RATE_LIMIT/TRANSPORT. Scope test initially exposed an invariant-companion startup race; awaiting the initial SystemPrompt plugin before scopes fixes teardown ordering (no product change). Prior 35-test pass preceded that added isolation test.

Target core Agent/default-model tsc and host tsdown PASS. New headless profile authored V3 and refresh-generated V4 PASS; replay entry plus three exact-capability scenarios PASS (4). Existing TypeScript SDK intent fixtures PASS (4); Python SDK pending. Docs are being updated; no Architecture/Memory/WORKFLOW change needed for this reuse of existing selection ownership. Parent QR-03 remains PARTIAL; GUI/real model NOT_RUN. Next: Python SDK and existing selection consumers; generators and documentation checks.

Quota at this checkpoint: current Codex response exposes only the 10080-minute window, 57% used; 300-minute remainder/reset UNKNOWN. No reset/credits used.

## Integration checkpoint

PASS Python SDK 4 and 80 existing default-model/loop-admission/session-reference consumer tests. PASS target core Agent/default-model/API host tsc, type-equivalence 480 blocks and derivative pairs. Catalog generators complete; new live event is cataloged, no durable Session event added. README/type reference pairs updated, three pair records regenerated. An accidental ESLint invocation fails because this repository uses Oxlint; correct scoped Oxlint and scoped-event checks in progress. Parent QR-03 now links this backend evidence and retains GUI/fallback acceptance as pending. Next: finish scoped checks, documentation aggregates, source fingerprints and final task record. Codex retains write ownership.

## Documentation checkpoint

First doc-sync completed 36 PASS / 6 FAIL. Its doc-typecheck/build exposed two task-owned test typing omissions: invalid entry config needed a Record<string, unknown> parser input, and scope invariant's exhaustive Agent event rows needed the new query. Both corrected. PASS rerun intent/scope 16 tests; PASS whole host TypeScript program (including tests). Generated scoped resolver and its negative carrier/subject checks now cover the query. PASS scoped-event freshness, Cordis catalog, export JSDoc and persistence gates within doc-sync. test:docs 18 PASS / 2 FAIL (existing pairing/wrap). Five named pairs PASS. Next: rerun only the affected doc-typecheck gate and scoped lint, then close the backend increment; GUI and real-model acceptance remain NOT_RUN.

## Final checkpoint

DONE for this backend increment. Codex stopped work and released write ownership; no next writer assigned. Same branch and broad dirty working copy preserved, no commit/push/fetch. Fixed commit fields remain null; evidence/source-sha256.txt identifies code. Task-owned files: Agent model-selection source/tests/README pair, default-model intent-routing source/tests/README pair, API agent.host test, scope generated resolver and invariant test, core type/API reference pair and pairing records, catalog type map/manifest, regenerated runtime API catalog, entry-model-routing Session scenario, parent Plan status and this task record. Pre-existing LLM/pi-ai/config/persistence/glossary/Taskboard/settings edits preserved; generated shared catalogs include those earlier changes.

Final evidence: 121 unique focused tests; headless 4, TypeScript SDK 4, Python SDK 4 replay cases PASS. Whole host tsc, target build, 480 type-equiv blocks, five named pairs, scoped Oxlint and diff check PASS. First doc-sync 36/6 exposed task test typing errors, corrected; affected doc-typecheck rerun passes host build then fails only legacy document compilation. test:docs remains 18/2. No global documentation-green claim; complete commands, failures and limits in evidence/verification.md. Docs graph refresh unverified behind existing missing chatgptPlan role classification.

Final quota query: only 10080-minute Codex window, 57% used; required 300-minute remaining/reset UNKNOWN. User informed; no reset or credit used. Architecture/Memory/Workflow/Agent Note update unnecessary. GUI, real model and paid fallback acceptance NOT_RUN; no default profile auto-enabled. QR-03 still PARTIAL. Next authorized continuation: choose the next QR-03 acceptance increment from parent Plan; read this checkpoint and Git before claiming ownership. Do not add more capability metadata in place of product-flow acceptance.
