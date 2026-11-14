---
schema_version: 1
task_id: dsh-p1-model-streaming-support
title: "QR-03 exact model streaming support"
status: DONE
priority: P1
created_at: "2026-11-14T22:53:41+08:00"
updated_at: "2026-11-14T22:53:41+08:00"
---

# Goal

Enforce the existing explicit streaming requirement against exact provider/model metadata, independent of tool support.

## Acceptance criteria

- [x] Unknown/unsupported exact streaming rejects before dispatch even if Provider streaming is supported.
- [x] Supported exact route passes; prepared metadata is captured and same model names on other Providers do not inherit it.
- [x] pi-ai models/modelOverrides configure tri-state streamingSupport; invalid initial/live configuration rejects, omission stays unknown.
- [x] Real Loader and keyless Session cover rejection and config capture; existing SDK intent routes retain behavior.
- [x] Owning docs, type references/catalogs and Plan updated with actual verification.

## Scope

Streaming means this exact route can produce incremental response content before its terminal result; the flag is an explicit declaration, not a timing guarantee or endpoint probe. The current consumer is LLM call admission for requiredCapabilities streaming, already exposed by GenerateOptions and IntentRoute. No new protocol control, UI, fallback, structured-output or native-session-resume claim; QR-03 stays PARTIAL. No private credentials, external model call, commit or push.
