---
schema_version: 1
task_id: dsh-p1-resume-semantics
title: "Separate model history, DSH restore and native executor resume"
status: DONE
priority: P1
created_at: "2026-11-15T11:58:38+08:00"
updated_at: "2026-11-15T12:53:09+08:00"
---

# Goal

Make resume capability claims precise for existing model routes and execution providers, and reject declarations that claim an operation the adapter does not implement.

## Scope

QR-03 continuation after native JSON Schema completion. Inspect installed implementations first, reuse current LLM and subagent seams, then make the smallest verified correction. No new resume service or speculative native resume API; no real cloud calls, GUI, commit or push. All prior local changes belong to completed tasks and must be preserved. Codex is the sole writer. Weekly remaining <=10% stops new work.

## Acceptance criteria

- [x] Identify model-context replay, DSH Session restore and native external-agent continuation separately from source.
- [x] Existing configuration and diagnostics cannot present unsupported native resume as implemented capability.
- [x] Focused parser/Loader or runtime behavior tests demonstrate rejection without provider I/O where applicable.
- [x] Owning docs and parent Checklist state the verified scope; Task records, checks and quota are current.
