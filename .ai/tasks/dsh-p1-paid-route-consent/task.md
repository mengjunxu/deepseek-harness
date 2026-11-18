---
schema_version: 1
task_id: dsh-p1-paid-route-consent
title: "Require explicit preset consent for declared metered routes"
status: DONE
priority: P1
created_at: "2026-11-15T12:12:12+08:00"
updated_at: "2026-11-15T13:03:49+08:00"
---

# Goal

Deliver the first independent QR-04 increment: an optional policy refuses declared API-metered inference without a preset exact provider/model grant, including after grant revocation and prepared-call route replacement.

## Scope

Use the existing LLM registered-adapter path and Cordis extension points. A pure synchronous admission hook receives the captured registration metadata and request controls; a small optional guard plugin supplies the consumer. Do not change agent-loop or add a budget/usage store. No interactive consent UI, automatic fallback, per-task limits, balance inference, reserve/settle/cancel ledger, real API calls, commit or push in this increment. QR-04 remains PARTIAL. Prior tasks are DONE and their local changes must remain intact. Codex owns the workspace; weekly <=10% stops work.

## Acceptance criteria

- [x] Declared api_metered routes require an explicit exact provider/model preset when the policy is mounted; defaults grant nothing.
- [x] Preparation and direct dispatch refuse before adapter preparation/streaming, and revocation rechecks a prepared call before streaming.
- [x] The guard sees the prepared registration's captured usage source, independently of replacement/current discovery metadata.
- [x] Other policy refusals compose, unload withdraws the policy, and other/unknown sources are not labeled free or metered by inference.
- [x] Failed-first tests, Loader configuration and a recorded keyless Session cover the feature; docs/catalogs/Plan/checkpoints and weekly checks are current.
