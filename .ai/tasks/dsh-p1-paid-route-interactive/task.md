---
schema_version: 1
task_id: dsh-p1-paid-route-interactive
title: "Confirm one API-metered native request before local reservation"
status: DONE
priority: P1
created_at: "2026-11-16T03:56:37.675694+00:00"
updated_at: "2026-11-16T04:20:31.806382+00:00"
---

# Goal

Allow an explicitly configured API-metered native route to ask the human for one request, before reserving local budget or dispatching model I/O.

## Scope

Audit and reuse the existing user-approval service, its Session audit and existing UI answerer. Preserve exact preset grants and default behavior. Bind confirmation to one captured native dispatch; deny, unavailable and cancellation remain closed. Do not add a second approval store, infer official balance or authorize automatic route fallback. No real paid calls, commit/push or PR.

## Acceptance criteria

- [x] Existing approval and dispatch owners audited; exact scope and ordering documented.
- [x] Opt-in request confirmation is bound to captured route and one attempt; no approval means no reservation/native call.
- [x] Preset mode and policy revocation remain enforced; retries and lifecycle cancellation are covered.
- [x] Actual composition, relevant recorded Session/SDK/user output, owner docs and source evidence verified.

## Ownership and constraints

Codex remains sole writer in this workspace on codely_bridge; this is continuation by the same Agent, no other writer or subagent. Preserve all earlier local modifications. Follow WORKFLOW quota stops and artifact producer/consumer ordering. Step checkpoints query the live seven-day quota. No shared rule or previously approved security exception is broadened.
