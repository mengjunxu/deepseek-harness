---
schema_version: 1
task_id: dsh-p1-usage-measurement
title: "Preserve explicit token-count measurement in native request accounting"
status: DONE
priority: P1
created_at: "2026-11-16T04:22:30.146889+00:00"
updated_at: "2026-11-16T05:07:00.734442+00:00"
---

# Goal

Distinguish explicit estimated token counters from reported counts without interpreting either as official billing or account balance.

## Scope

Audit existing producer evidence, extend the owning additive vocabulary only where the source is known, and preserve it through native recording/projection and user disclosure. Old or unsupported evidence remains unknown. Reuse the existing Session/Turn usage and SDK owners. Do not infer measurement from a Provider's usageSource, invent provider billing authority or change frozen released codecs.

## Acceptance criteria

- [x] Audit actual producers and durable/UI consumers; specify conservative measurement semantics.
- [x] Add failure-first coverage and propagate explicit facts without changing token arithmetic or model input.
- [x] Verify actual composition, persistence compatibility and relevant SDK/Session/user output.
- [x] Update owner docs, main Plan, source evidence and quota checkpoint.

## Constraints

Codex sole writer on codely_bridge, continuing the same parent Plan; all earlier local changes preserved. No subagents, real paid calls, commit/push or PR. Apply repository lifecycle/CI, documentation/prose and Client UI guidance. Check live seven-day quota at steps and before expensive work, stop at <=10% with HANDOFF_READY.
