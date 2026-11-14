---
schema_version: 1
task_id: dsh-p1-exact-model-vision
state: DONE
previous_agent: none
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-11-12T08:42:50+08:00"
---

# Checkpoint

Codex owns this task. Previous turn ended with QR-02 done and ownership released; current Git matches its records plus preserved Taskboard/settings changes. No other writer observed. All pre-existing files preserved; no commit/push. Fixed tested ref null; source fingerprints to follow. Node 26.5.0 used for verification.

Quota start: only Codex 10080-minute window returned, 21% used; 300-minute remainder/reset UNKNOWN, user informed. Workflow/architecture and existing LLM request/policy paths loaded. No new architecture or Agent Note required: reuse exact input modalities and call resolution; no Session schema/loop changes.

Next: regression for Provider-supported vision with an exact model lacking image support.

## Step 1 checkpoint

Before-fix regression: 3 focused cases failed, 1 passed; Provider-supported vision admitted unknown/text-only exact models. After shared resolveCallWithInfo check, provider-policy/service suites PASS 115 tests under Node 26.5.0. New exact-model denial code UNSUPPORTED_MODEL_CAPABILITY applies to explicit vision only. Existing Provider checks remain first, prepared calls retain detached input modalities, other capability semantics unchanged. No type/event/loop changes.

Snapshot model-vision-required authored V3 input and Loader patch created; first build in progress. Next: refresh/replay under shipped headless profile; then README and generated JSDoc references. Codex keeps write ownership. No Architecture/Memory/WORKFLOW or new decision note needed at this checkpoint.

## Step 2 checkpoint

Built LLM tsc/tsdown PASS. Authored V3 and newly written V4 model-vision-required Session retained; production pi-ai preparation records exact-model denial as a tool error. Refresh PASS 1; final replay PASS 3 (new scenario plus two existing Provider policy cases). Initial refresh rejected a malformed authored V3 tool-result wrapper; fixture corrected to the actual V3 representation, with no normalizer changes.

README pair and request-resolution JSDoc updated. Cordis catalog generator wrote only the owning subsystem pair and tool-cordis API catalog; no signatures/types changed. QR-03 remains PARTIAL with exact vision done and remaining capability/UI/fallback work explicit. Next: final focused lint/pair/docs gates and source evidence. Architecture/Memory/WORKFLOW and formal decisions unchanged.

## Final checkpoint — 2026-11-12T08:48:15+08:00

DONE for exact vision; Codex releases task ownership. QR-03 remains PARTIAL. Explicit required vision now requires image in exact model inputModalities; missing/negative metadata rejects with UNSUPPORTED_MODEL_CAPABILITY before adapter streaming. Provider admission remains first, optional calls without vision are unchanged, other capabilities retain Provider-level requirements.

Owned files: LLM runtime, policy tests, new model-vision-required fixture and Session directory, LLM README pair/sidecar, generated LLM subsystem pair and tool-cordis API catalog, QR-03 checklist row and this task directory. Prior QR-02, Taskboard, PRD and user-settings changes retained. No commit/push/fetch this increment; branch codely_bridge still tracks without ahead/behind. Fixed tested ref null; final source/fixture fingerprints saved.

PASS: 115 unit tests, 1 snapshot refresh and 3 final replays, target tsc/tsdown, scope lint, 2 named pairs and diff check. FAIL: test:docs 18/2; doc-sync 36/6 in prior categories; none names this implementation/fixture. Exact commands, failed-first controls and limitations in evidence/verification.md. Tests use Node 26.5.0; no private credentials or real model call. No new Session types/loop changes; existing format generations preserved, no SDK projection changes required. Generated API text follows updated owning JSDoc.

Quota at final boundary: only 10080-minute Codex window returned (22% used); 300-minute remainder/reset UNKNOWN. No new architecture mechanism or durable decision: existing call resolution and model metadata reused. Architecture, Memory, WORKFLOW and Agent Notes need no update.

First remaining action: continue QR-03 with explicit exact-model declarations for capabilities not represented by current metadata, then user-selected route/fallback evidence. Define only capabilities with a verified owner; unknown must stay unknown, no implicit cross-source fallback. Preserve QR-04 budget/consent prerequisites for paid fallback and keep independent UI selection in VN4-02.
