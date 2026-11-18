---
schema_version: 1
task_id: dsh-p1-budget-atomic-storage
title: "Provide atomic persisted record updates for quota reservation"
status: DONE
priority: P1
created_at: "2026-11-15T14:02:17+08:00"
updated_at: "2026-11-15T14:58:03+08:00"
---

# Goal

Allow quota reservations to read and update the latest persisted record atomically through the existing storage domain, so independent Hosts cannot both admit against stale cached balances.

## Scope

Add one optional atomic record-modification operation to the existing KV backend interface, implement it in SQLite with an immediate transaction, and expose a schema-validating consumer on domain tables. Preserve existing put/update semantics and unchanged storage formats. Backends without the operation must reject explicitly through the domain API; do not emulate atomicity using a process-local queue or create a second budget/Task store. This foundation does not itself mount budget policy or claim official remaining quota. Codex is sole writer on codely_bridge; preserve earlier local tasks and the publication review request. No account requests, commit, push or PR; weekly <=10% stops new work.

## Acceptance criteria

- [x] Two independent SQLite owners modifying one record observe the latest committed value and cannot lose updates.
- [x] Callback/serialization failures roll back; close, missing records, deletion and durability have explicit behavior.
- [x] Domain callbacks receive schema-validated fresh records, update local observations only after commit and emit normal invariant-compatible changes.
- [x] Unsupported backends fail without a process-local fallback; owning tests, public docs and gates reflect the new API.
