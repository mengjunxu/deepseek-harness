---
schema_version: 1
task_id: dsh-p1-publication-hygiene
title: "Repair existing publication gates around P1 model routes"
status: DONE
priority: P1
created_at: "2026-11-15T13:06:56+08:00"
updated_at: "2026-11-15T16:42:00+08:00"
---

# Goal

Make existing route/SIWC publication artifacts and dependency metadata pass the repository's real hygiene checks without hiding failures or inventing invariant companions.

## Scope

Audit and repair the agent-default-model/SIWC publication lists, SIWC CSS closure, omitted-invariant rationale, Codely fixture commands dependency and unclassified Host helper edges found by actual hygiene execution. Preserve all earlier completed local changes. No production provider requests, no new GUI behavior, no commit/push. One Codex writer. A new duplicate-install-safe Host export exception requires explicit human review under scripts/package-dependency-policy.ts; prepare the exact proposal and evidence before requesting it. Do not add that exception while approval is pending. Weekly <=10% stops new work.

## Acceptance criteria

- [x] Verify publication and omitted-companion facts from source before editing.
- [x] Published runtime entries have complete assets; manifests and resolver dependencies match actual use.
- [x] Host exports are classified accurately; any duplicate-safe exception has required explicit human review.
- [x] Relevant packaging/dependency/Loader checks and documentation pass or retain a precisely recorded external blocker.
