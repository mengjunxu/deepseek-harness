---
schema_version: 1
task_id: dsh-p1-routing-doc-graph-gate
title: "Restore routing relationship and derived-catalog documentation gates"
status: DONE
priority: P1
created_at: "2026-11-15T10:47:27+08:00"
updated_at: "2026-11-15T10:55:09+08:00"
---

# Goal

Generate current routing relationships by classifying the already-implemented ChatGPT plan service, and repair stale derived catalogs without changing runtime behavior.

## Acceptance criteria

- [x] Service-role entry matches the implemented owner, LLM adapter registration and remote consumers.
- [x] Relationship generator completes and documents agent/model-selection producer/consumer relations.
- [x] Client and skill package catalogs match their existing source inputs.
- [x] Focused generator checks and negative controls pass; remaining documentation failures stay explicit.

## Scope

Only generator policy/source-derived documentation and their verification. Existing completed browser acceptance remains separate and uncommitted. No runtime feature, public credential, UI behavior, package dependency or loop change. Codex is the sole writer. Continue authorized P1 progress with live weekly checks at each step; stop when remaining <=10%.
