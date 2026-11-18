---
schema_version: 1
task_id: dsh-p1-preparation-records
title: "Audit native request preparation failures without counting submissions"
status: DONE
priority: P1
created_at: "2026-11-15T15:11:03.166121+00:00"
updated_at: "2026-11-15T15:31:50.094738+00:00"
---

# Goal

Persist bounded preparation-failure metadata for local Sessions without misreporting a refused lookup as a dispatched or billed request.

## Scope

Extend the opt-in token-meter/request-records owner with a separate preparation-failure event and bounded replay view. Cover explicit prepareCall and direct stream preparation; preserve captured route/source and classify failure using fixed categories without copying error text, credentials, prompt or schemas. The loop supplies Session identity separately from logged call controls. Successful preparation and settled dispatch accounting remain distinct; a missing native adapter may still be served by virtual middleware. No provider-acceptance, billing, full policy-decision, crash, Task/Run or external-executor claim. No new model-facing tool/prompt, GUI, real provider request, commit, push or PR.

## Acceptance criteria

- [x] Failure-first regression observes a missing local Session preparation record.
- [x] Prepared/direct routes emit one distinct failure record before native dispatch; success and later settlements do not double count.
- [x] Captured source/labels and fixed classifications survive replacement/mutation, preserve original failure and exclude private payloads.
- [x] Projection replay and actual headless/TypeScript/Python SDK flows verify the event and retained Session compatibility.
- [x] Scoped checks, affected docs, parent Plan and exact-source checkpoint reflect actual results.

## Constraints

Codex is sole workspace writer on codely_bridge; prior Tasks and uncommitted work are preserved. No child agent. Query Codex weekly 10080-minute quota at every step and before expensive stages; stop new work at <=10%, save HANDOFF_READY and release ownership. Follow existing persistence/type acknowledgement and model-visible/logged rules. This is a bounded QR-05 slice; parent completion is not implied.
