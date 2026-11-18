# Execution log

## Start (2026-11-15T13:35:26.602708+00:00)

User authorized continuous Plan work with a <=10% weekly stop. Selected QR-04 per-Session local request caps after the completed shared-budget prerequisite. Current branch codely_bridge and actual dirty tree match the prior checkpoint; all previous local/untracked changes remain preserved. Codex remains sole writer; no delegation.

## Step 1 (2026-11-15T13:36:33.883213+00:00)

Confirmed primary agent-loop, session-title and compaction calls propagate the durable Session ID. Existing atomic request receipts already retain that ID, so no additional counter, Session event, Task store or loop change is needed. An optional maxRequestsPerSession belongs to the immutable budget definition; absence preserves earlier uncapped records. All intents and auxiliary purposes share the exact Session limit. Missing Session identity fails pure admission and the atomic reservation path. Scope is per budget and exact Session identity, not aggregate across unrelated budget identities, Session descendants or external executors. No automatic identity or period reset.

Failure-first Vitest config/store run: 9 FAIL / 20 PASS for the intended missing validation, Session cap, missing-id and immutable-definition behavior. Evidence: evidence/before.log. No production code changed. Next: implement Config/definition optional cap and check fresh atomic receipts before insert; add early admission and direct dispatch evidence. No new Memory/Workflow change at this step. Codex remains sole writer; existing local changes preserved.

## Step 2 (2026-11-15T13:40:22.972723+00:00)

Optional nonnegative safe-integer maxRequestsPerSession is validated and immutable in each persisted budget definition. Atomic reservation checks exact non-cancelled Session receipts, including execute and auxiliary attempts, before insertion. Missing identity and exhausted Session capacity return owned failures without native adapter entry. Shared capacity and execute reserve still apply. Prior records omit the optional field and remain readable without a migration or reset; adding/removing/changing an activated cap requires another budget identity.

A TypeScript check corrected the Step 1 design assumption: pure admission/prepareCall takes LlmCallConfig without Session metadata, intentionally separate from GenerateOptions. The owner therefore enforces identity in the atomic reservation before native dispatch, including prepared calls; read-only preparation may resolve capabilities. No LLM API, loop, Session event or SDK projection change is needed. Tests assert zero native calls rather than forbidding a legitimate setup capability lookup. Task acceptance wording is corrected to this exact guarantee.

PASS: 50 budget owner tests, 100% statements/branches/functions/lines across the implementation; Host TypeScript build and scoped lint. Cases include immutable optional caps, zero/missing identity, duplicate reservation, Session separation, execute reserve, cancelled refund, auxiliary/crash charges and independent owner restart. Next: actual Settings persistence/restart, built profile same-Session overlap and a recorded Session refusal. No new Memory/Workflow update at this step. Latest quota recorded next before beginning Step 3.

## Step 3 (2026-11-15T13:45:48.840306+00:00)

Actual Loader/Settings cases PASS for both uncapped and capped rules. Invalid additions/changes to the stored Session cap reject before file persistence; resuming the same identity keeps its consumed count and another Session can still spend the shared execute slot. Owner suite now 51 PASS with 100% implementation coverage, including live revocation/pre-delegation cancellation refund for the capped Session. Host build PASS.

Five built-dsh process cases PASS. The new case seeds a real persisted Session, copies only its closed test Session files into independent private homes, and resumes that same identity in two Hosts sharing SQLite. Explicit IPC barriers put both at model resolution before the first reserves the last Session slot. The second refuses while global capacity remains; restart still refuses, and two settled receipts are read externally. Existing global finish/SIGTERM/crash/invalid-config cases remain green. The newly authored retained-V3 Session refusal refreshes to current V4 through the real headless profile. Initial refresh missed its cordis.yml composition owner; added the owned patch, then refresh PASS. No committed generation is moved or changed.

README pairs and generated Config catalogs describe exact-ID/per-budget scope and remaining Task/token/currency/external limits. Next: built negative control, independent simultaneous test processes, replay/retained-V3/corpus evidence and final gates. No Memory/Workflow change yet; verified conclusion indexed at final completion. Quota get_usage_limits 2026-11-15T13:45:22.557Z, 10080 minutes, used 63% / remaining 37%, reset Unix 1794907980. Codex retains sole ownership; no commit/push/PR.

## Completion (2026-11-15T13:51:51.934771+00:00)

Task and Plan DONE. All behavior and final checks are detailed in evidence/verification.md. Config catalog stale after JSDoc was regenerated and passed its exact check; only the three existing global docs debts remain. Fixed-source/artifact SHA-256 evidence saved. Main Plan keeps QR-04 PARTIAL and names the completed per-budget Session count cap; Memory indexes verified scope. No Architecture/Workflow or new Note needed. Codex sole writer, all existing changes local, no commit/push/PR. Quota 2026-11-15T13:50:53.768Z, source get_usage_limits, 10080-minute window, used 63%, remaining 37%, reset 1794907980.
