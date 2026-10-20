---
schema_version: 1
task_id: dsh-handoff-v0
title: "Establish the Codex and Codely manual handoff workflow"
status: BLOCKED
priority: P1
created_at: "2026-10-20T00:00:00+08:00"
updated_at: "2026-10-20T08:45:57+08:00"
---

# Goal

Establish a repository-backed V0 process for transferring a DSH task between Codex and Codely in either direction.

## Background

The repository has canonical Codex and Codely instruction files and active implemented Agent Notes, but it has no shared task checkpoint convention.

## Scope

### In scope
- Add shared workflow guidance, architecture and memory indexes, templates, and one pilot task checkpoint.
- Add minimal links from the existing agent entry files.
- Exercise Codex-to-Codely and Codely-to-Codex handoffs where the installed Codely environment permits.
- Preserve the detailed V1/V2 route in the supplied implementation plan without implementing a scheduler.
- Package the reusable `cross-agent-handoff` Skill requested by the user and preserve its portable artifact for another device.

### Out of scope
- Runtime packages, a task scheduler, V1 automation scripts, and V2 DSH-native task ownership.
- Changes to pre-existing MGSD checklist and untracked architecture-plan files.

## Acceptance criteria

- [x] Both agent entry files lead to the same workflow.
- [x] A new task can use the common templates and checkpoint fields.
- [ ] Codex-to-Codely handoff is exercised against the pilot checkpoint after outbound Codely context is authorized.
- [ ] Codely-to-Codex handoff is exercised and reconciled against the real repository state after outbound Codely context is authorized.
- [x] Existing changes remain intact and are listed separately from this task.
- [x] Validation results, limitations, and next-stage work are recorded.
- [x] The reusable Skill is validated and included as a portable task artifact.
- [ ] The next device has received the uncommitted task files and independently verified its environment.

## Dependencies and constraints

- Follow `AGENTS.md`, `CODELY.md`, `.ai/WORKFLOW.md`, and relevant active implemented Agent Notes.
- Keep the existing DSH architecture and session/task owners unchanged.
- The supplied V0–V2 implementation plan is an existing untracked file and must not be overwritten.

## User decisions

- Authorize sending the repository instructions, pilot task records, and Git status to the configured Codely model destination so the two live handoffs can be exercised.
