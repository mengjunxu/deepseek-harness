---
schema_version: 1
task_id: dsh-p1-local-request-budget
title: "Protect local request slots with durable reservations"
status: DONE
priority: P1
created_at: "2026-11-15T15:03:36+08:00"
updated_at: "2026-11-15T10:20:57.634401+00:00"
---

# Goal

Protect finite local model-request budgets across Hosts, preserve configured slots for execute intent, and persist idempotent reservation/cancellation/settlement without claiming official quota or authorizing extra payment.

## Scope

Use the existing atomic storage domain for an opt-in guard with exact provider/model and declared usage-source matching. Extend registered LLM dispatch through a documented plugin outlet so storage reservation runs before provider IO, captured registration metadata stays fixed and pure admission is rechecked after asynchronous policy work. Compose lifetime cancellation and drain cleanup during unload/reload. The guard must fail closed while storage is missing, unsupported or invalid. Keep the production feature complete across API definition, storage implementation and LLM consumer; do not stop at an unused store.

Local request counts are distinct from official balance, token/currency budgets, external executor usage and Session/Task caps. Those remain explicit later work; QR-04 stays PARTIAL. No new Task store or Session transcript, no GUI, no production account requests, commit, push or PR. Preserve all earlier local changes and the completed exact publication safe-export review. Codex remains sole writer; check weekly limits at each step and before expensive stages, stop at remaining <=10%.

## Acceptance criteria

- [x] Exact-route local budgets reserve before dispatch; non-execute calls cannot consume configured execute slots.
- [x] Reserve/submit/cancel/settle are durable and idempotent; possibly submitted or crashed calls retain their charge conservatively.
- [x] Independent Hosts cannot both over-admit; reload/restart cannot reset a budget identity or lose outstanding reservations.
- [x] Provider source changes, unavailable storage, invalid rules, asynchronous revocation and disposal refuse or settle safely before unapproved IO.
- [x] Loader, lifecycle/concurrency, keyless Session and relevant artifact/doc checks provide fixed-source evidence; official balance remains unknown unless separately reported.
