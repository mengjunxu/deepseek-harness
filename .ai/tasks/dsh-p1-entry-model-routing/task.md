---
schema_version: 1
task_id: dsh-p1-entry-model-routing
title: "QR-03 entry-selected intent routes"
status: DONE
priority: P1
created_at: "2026-11-14T23:35:14+08:00"
updated_at: "2026-11-14T23:56:44+08:00"
---

# Goal

Let an explicitly configured intent use the entry point's model selection for the next Turn while preserving intent requirements and consistent prompts/headers/notices.

## Acceptance criteria

- [x] New entry route consumes the existing installModelSelection owner, preserves effort and intent requirements, and captures one route per Turn.
- [x] Mid-Turn changes wait for the next Turn; prompt variables, request config and model-switch notices agree.
- [x] Missing entry selection fails loudly; entry routes reject mixed fixed model/effort config; failures never choose another route.
- [x] Query/capture contribution disposes with its owner and keeps current user choice intact.
- [x] Real profile Session and targeted selection/controller tests verify integration; existing configured routing/SDK behavior remains valid.
- [x] Owning docs/catalogs and parent progress updated; GUI acceptance is reported separately.

## Scope

Existing model selection owner gains a scoped process-local read/capture capability. No new selection store, Session event, loop change, automatic fallback or paid-source consent. Opt-in entry intent routes only; default fixed routes preserve their configuration. No new GUI widgets, real model calls, private credentials, commit or push. QR-03 remains PARTIAL.
