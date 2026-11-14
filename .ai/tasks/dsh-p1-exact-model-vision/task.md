---
schema_version: 1
task_id: dsh-p1-exact-model-vision
title: "QR-03 exact model vision admission"
status: DONE
priority: P1
created_at: "2026-11-12T08:42:50+08:00"
updated_at: "2026-11-12T08:42:50+08:00"
---

# Goal

Require exact image-input support when a call explicitly requires vision, using existing model metadata.

## Acceptance criteria

- [x] A Provider vision declaration alone cannot admit a text-only or unknown exact model.
- [x] prepareCall, resolveCallConfig and direct stream enforce the exact model check; no stream dispatch on rejection.
- [x] Image-capable models pass, Provider denial still wins, prepared metadata remains captured, and same-named models do not share capability facts across providers.
- [x] A keyless recorded Session captures the new failure through a shipped profile; existing policy snapshots retain behavior.
- [x] README/JSDoc, parent progress and task evidence updated with focused checks.

## Scope

Only explicit requiredCapabilities vision uses existing inputModalities. No new generic model capability type or assumptions about streaming/tools/structuredOutput/resume. QR-03 stays PARTIAL; UI/fallback work remains open. No Session type or loop changes, external model calls, credentials access, commit or push.
