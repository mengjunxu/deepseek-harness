---
schema_version: 1
task_id: dsh-p1-usage-records
title: "Record native model usage with replayable route and accounting attribution"
status: DONE
priority: P1
created_at: "2026-11-15T13:54:47.163741+00:00"
updated_at: "2026-11-15T15:09:25.796037+00:00"
---

# Goal

Expose replayable native model-attempt accounting using the existing Session log and token-meter, with explicit known/unknown attribution and no duplicate transcript or fabricated official balance.

## Scope

Audit existing attempt/usage events and projections, identify the smallest missing data and production consumer, and implement that bounded QR-05 slice. Preserve captured serving-route ownership across provider replacement; keep reported counters distinct from local estimates and official balance. Use durable Session relationships for deduplication and retries rather than arrival count or message content. Persist no prompt/credential payload in accounting metadata. Include relevant failure, cancellation, replay and actual profile acceptance. This first slice records one settlement per dispatch observed by the opt-in token-meter/request-records plugin, with Session ID + committed seq as identity. A bounded Session projection exposes record count, source counts and last-record metadata; existing asynchronous Session history remains the record reader. Raw adapter-returned token samples are labeled adapter-reported, not official billing, and remain distinct from TokenMeter heuristic measurements. Calls without a live Session, pre-dispatch admission failures and process death before settlement remain explicitly outside coverage.

Task/Run linkage is unknown until the product domain supplies it; do not invent a Task store or claim external-executor accounting. Official balance queries, new GUI, real provider calls and currency pricing are outside this slice. QR-04/05 parent completion depends on their full remaining acceptance and must not be inferred from this task. No commit/push/PR; preserve all earlier local changes.

## Acceptance criteria

- [x] Source audit selects a minimal complete accounting producer/record/consumer path and exercises intended missing behavior before implementation.
- [x] Observed settled native dispatches with a live local Session have stable replay/deduplication identity and truthful route/source/measurement attribution or explicit unknown values.
- [x] Successful, retried, failed and cancelled attempts do not double count; replay and live consumption agree.
- [x] Storage and model-facing outputs retain no credentials or copied transcript, with immutable metadata and ordinary lifecycle ownership.
- [x] Focused tests, actual composition/snapshots, docs and final source evidence are recorded without hiding prior gate debt.

## Constraints

Codex is sole writer on codely_bridge, with no child agents. Prior shared and Session-budget tasks are DONE. Check Codex 10080-minute quota at each step and before expensive stages; stop new work at remaining <=10%, save HANDOFF_READY and release ownership. No new model/context or persistent type may bypass its owning rules and compatibility evidence.
