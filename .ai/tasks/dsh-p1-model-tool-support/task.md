---
schema_version: 1
task_id: dsh-p1-model-tool-support
title: "QR-03 exact model tool support"
status: DONE
priority: P1
created_at: "2026-11-12T13:45:55+08:00"
updated_at: "2026-11-12T13:45:55+08:00"
---

# Goal

Require an exact model tool-support declaration for explicit tools requirements, backed by pi-ai model configuration.

## Acceptance criteria

- [x] Unknown/unsupported exact tool support rejects before streaming despite Provider tools support.
- [x] Supported exact model admits explicit tools; prepared facts and cross-Provider model identities stay isolated.
- [x] pi-ai models/modelOverrides accept tri-state toolSupport, preserve absence, reject invalid configuration and capture changes for the next call.
- [x] Update all explicit-tools consumers/fixtures; keyless recorded Session covers rejection and SDK intent routes continue to replay.
- [x] Owning docs/types/catalogs and parent progress updated; focused behavior, build and documentation checks recorded.

## Scope

Tool-call support only; streaming/structuredOutput/resume remain Provider-level until they have exact metadata owners. No implicit inference from model names, protocols, OAuth or successful text. No new registry, budget/fallback, UI, Session type or loop change; QR-03 remains PARTIAL. No external model calls, private credential access, commit or push.
