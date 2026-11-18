---
schema_version: 1
task_id: dsh-p1-native-structured-output
state: DONE
previous_agent: none
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-11-15T12:53:09+08:00"
---

# Checkpoint

Codex takes sole ownership after browser and doc-graph tasks completed. Preserve their uncommitted files. LlmCallConfig currently has no schema field; required structuredOutput is only a Provider declaration. The installed pi-ai SDK exposes onPayload and forwards it to both OpenAI completions and responses protocols. Agent-loop builds requests by spreading the recorded header, so an explicit new control can use existing flow; header equality and invariant checks must include it. Session format/type acknowledgement instructions have been read; do not change committed generations. Next: inspect existing JSON value, Ajv and assembly helpers, and establish schema/parser/output semantics before code changes. Latest live weekly usage: used 58%, remaining 42%, reset Unix 1794907980. No reset/credits or real model calls.

## Step 1 checkpoint

Installed SDK confirms native payload replacement hooks for OpenAI completions and responses. Scope: optional responseFormat {type: json_schema, name, schema, strict: true}; schema values reuse util-values JsonValue, schema compilation/output validation reuse Ajv2020. Format requests require explicit Provider support and exact-model structuredOutputSupport; no model-name inference. Final text completions must parse and satisfy the schema; tool-call finishes may continue, provider failures keep their failure and incomplete text cannot count as valid structured output. Reuse BlockAssembler instead of a second chunk assembler. Existing request/header spread carries the option; equality, prepared-call guard, durable reader and loop header invariant must include it. Intent routes supply the consumer. Native resume remains separate and is not implemented by this format.

Add Ajv to the LLM owner using the repository's existing version; no new validator implementation. pi-ai sends format through onPayload only for classified compatible APIs; unknown APIs reject. Snapshot replay will need the same explicit schema capability metadata/policy rather than bypassing admission. Persistent type acknowledgement and both SDK regression surfaces are required before completion. No code edited yet. Next: failed-first runtime tests, then the common format module and service checks.

## Step 2 checkpoint

Common response-format definition, synchronous Ajv schema compilation, native-format admission, prepared equality/immutability, durable request validation and completed-output validation are implemented. Failed-first tests initially failed all 11 cases; current LLM structured/provider/service tests PASS 135. Request reconstruction tests cover equal/missing/changed format in durable headers (structured+invariant PASS 21). Missing/invalid JSON, schema mismatch and incomplete completion fail explicitly; Provider failures/tool continuations keep their outcomes. A failed-first iterator cleanup test exposed a pending adapter iterator on schema rejection; validation now sits outside iterator-next failure handling and closes to quiescence.

Moved the existing LlmError class/options to the existing error owner and re-exported through the unchanged index API, avoiding a service/helper import cycle. Target LLM/loop tsc and focused lint PASS. Added Ajv at the existing repository version; offline install complete, incidental peer-variant rewrites removed from our lock edit, and frozen offline install PASS with only the 3-line importer addition. No native wire mapping or route consumer yet. Docs/persistence acknowledgement/recorded Session are still pending, so task remains IN_PROGRESS. Next: pi-ai native protocol mapping and intent-route format config, then Loader/loopback verification.

## Step 3 checkpoint

Native pi-ai completions/Responses payload hooks and exact configured-model support are implemented; unsupported protocol declarations reject. Intent routes capture validated formats per Turn and clear an inherited format when omitted. Actual loopback protocol, Loader/HMR and config/route tests PASS 70 across 4 files; expanded format/routing/invariant tests PASS 55 across 4 files. Host/Client tsc and scoped run-oxlint PASS. The helper test now uses an explicit protocol fixture rather than depending on SDK catalog membership. An initial eslint invocation failed because this repository uses run-oxlint; the owning runner passed. Weekly live window 10080 minutes: 58% used, 42% remaining, reset Unix 1794907980. No Memory/Architecture/Workflow update needed for this checkpoint. Codex retains sole write ownership; all changes local/uncommitted. Next: replay explicit capability metadata and a shipped-profile formatted Session, then persistence acknowledgement and both SDK regressions.

## Step 4 checkpoint

Replay exposes optional Provider policy and exact-model structured support without granting inferred admission. Replay owner tests PASS 145. New authored headless and SDK cases retain V3 inputs and generated V4 outputs; both refresh cases PASS, then targeted replay PASS 6 (the two native-format cases plus four existing SDK intent routes). Python SDK projection PASS 5, including the native-format header/result. New response-format modules PASS 50 focused tests and 100% statements/branches/functions/lines. Persistence recording reports exactly one optional-property-added at request/header.config.responseFormat, same-version allowed, and generates a new acknowledgement without altering accepted history. No Session-format bump. All runtime builds PASS. An incorrectly forwarded snapshot filter briefly refreshed extra scenarios; interrupted, inventoried and removed only 10 newly generated untracked V4 files; no committed generations changed. Current native fixture diffs reviewed for full schema, route, JSON result and completed outcome. Initial Python collection used the wrong PYTHONPATH; corrected python/sdk/src then all 5 cases passed. No new Memory/Workflow decisions. Next: owner README and canonical type documentation, catalog generation, pairing and required checks.

## Step 5 / completion checkpoint

Native strict JSON Schema requests, exact-model admission, output validation, intent routing and recorded headers are complete. Final owner tests PASS 380 across 10 files; replay/generator follow-up PASS 151 across 2 files (includes repeated owner cases), workflow guest tests PASS 38. New format modules have 100% focused coverage. Headless/SDK replay PASS 6 and Python SDK PASS 5; no real model API/GIF claim. Host/Client tsc and repository lint:contracts-ready PASS. Canonical types (481 primary/481 derivatives), nine named bilingual pairs, persistence acknowledgement (62 roots/9 history records), generated freshness, links and doc budgets PASS. Required generated workflow guest was refreshed and tested; capability-seam Chinese matrix was brought along with its generated English owner. Final doc-sync: 39 PASS/3 FAIL (existing legacy doc-typecheck, missing bilingual pairs, hard-wrapped legacy prose); test:docs 18 PASS/2 FAIL (same pairing/wrap baseline). No new failures remain in this task.

Architecture index and owning README pairs now record verified native-schema behavior; no new formal decision or Memory entry needed. Parent QR-03 remains PARTIAL for resume semantics and remaining product acceptance. All edits are local/uncommitted; Codex releases this task and continues the authorized next increment. Weekly check at 2026-11-15T11:58:15+08:00: 10080-minute window, 59% used / 41% remaining, reset Unix 1794907980. Evidence names and exact commands are in evidence/verification.md; fingerprints identify the working source.
