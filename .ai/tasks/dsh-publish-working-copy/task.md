---
schema_version: 1
task_id: dsh-publish-working-copy
title: "Commit and publish current working-copy changes"
status: DONE
priority: P1
created_at: "2026-11-14T23:59:51+08:00"
updated_at: "2026-11-15T00:03:35+08:00"
---

# Goal

Commit and push every change present when the user requested publication, retaining existing verification limits.

## Acceptance criteria

- [x] All initial tracked changes and untracked files are committed, including Codely settings and evidence.
- [x] Relevant evidence matches the content; normal Git hooks run without bypass.
- [x] Remote branch matches the published local content; final status and CI availability are reported.

## Scope

User explicitly authorized all current changes. No new feature work, history rewrite, branch switch, PR creation or merge. Codex is sole writer; preceding implementation tasks are complete and released. Existing documentation failures remain disclosed and no passing check is repeated solely for publication.
