---
schema_version: 1
task_id: dsh-p1-entry-routing-web-acceptance
title: "Entry routing browser integration and weekly allowance checkpoints"
status: DONE
priority: P1
created_at: "2026-11-15T10:30:46+08:00"
updated_at: "2026-11-15T10:46:58+08:00"
---

# Goal

Verify entry-selected intent routing through the existing browser picker and real Web composition while following the user-directed weekly allowance stop rule.

## Acceptance criteria

- [x] Shared workflow checks the 10080-minute Codex weekly window at every step and stops when remaining allowance is at most 10%.
- [x] Keyless browser integration sends the picker-selected model with the configured intent and requirements.
- [x] Mid-Turn changes remain pending until the next Turn; request route and model-switch notices agree.
- [x] Failed requests retain their error outcome; another route runs only after an explicit user selection.
- [x] Deterministic barriers and private test resources have awaited teardown; targeted checks and product limits recorded.
- [x] Parent Plan and Task checkpoint reflect verified scope and remaining real-model/GIF acceptance.

## Scope

Existing Web picker/API/loop with explicit entry intent routing. Keyless replay validates the actual Web composition without a real Provider call. No new widget, provider registry, loop, durable format, private credential, automatic paid fallback, PR or remote publication. Preceding publication completed with a clean tree. Codex is the sole writer. User requests sustained progress; continue subsequent authorized plan work after each completed step while weekly remaining exceeds 10%.
