# Execution Plan

## Phase 1 — Repository reconnaissance and V0 setup

- [x] Read the full supplied V0–V2 plan and inspect repository state and entry files.
- [x] Map existing instruction, architecture, decision-note, and task-plan conventions.
- [x] Add the shared workflow, reference files, templates, and pilot records.
- [x] Add minimal links from Codex and Codely entry files.

Status: DONE

## Phase 2 — Bidirectional handoff pilot

- [ ] After the user authorizes the outbound task context, have Codely consume the Codex checkpoint and return a verified continuation.
- [ ] Have Codely return a checkpoint for Codex to resume and reconcile.
- [ ] Record each direction's evidence and limitations.

Status: BLOCKED

## Phase 3 — Repository verification and closeout

- [x] Run focused documentation checks and inspect the complete task diff.
- [x] Update the task checkpoint and remaining-work recommendations.

Status: DONE

## Verification

- Command: `codely --version` and `codely --help`
- Expected result: confirm installed CLI and project instruction-loading capability.
- Actual result: PASS; version `1.0.0-nightly.57`, and help states hierarchical `CODELY.md` loading is enabled.
- Tested code commit: NOT_APPLICABLE (workflow and docs only; no product code tested).
- Command: `pnpm run test:docs`
- Actual result: `pnpm run test:docs` FAIL; 17 gates passed and 3 failed. Translation pairing and markdown wrap reported existing planning documents, including tracked historical plans and untracked supplied plans. The documentation standard suite hit a Windows temp-cache `EPERM` in the aggregate run.
- Follow-up: `pnpm exec vitest run scripts/doc-standard.spec.ts` PASS; 22 tests passed with the narrow host permission needed for the temporary cache rename.
- Focused gates: `pnpm run verify-doc-budgets`, `pnpm run verify-repository-references`, Markdown links, and `git diff --check` PASS.
- Unrun checks and reason: `pnpm run doc-sync` was not run because the quick documentation aggregate reports existing pairing and wrap failures in planning documents.

### Existing documentation failures to revisit

The following are prior command results, not a fresh run on the next host. Preserve document ownership and apply the repository documentation rules before editing.

- Missing bilingual pairing: `docs/Generic_Agent_Harness_Architecture_Execute_Plan_v4.md`, `docs/Generic_Agent_Harness_v5_1_CN_Technical_Design_and_Codex_Implementation_Plan.md`, `docs/Generic_Agent_Harness_v5_ACP_Architecture_Execute_Plan.md`, `docs/MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan.md`, `docs/MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan_v2.md`, and the supplied workflow plan under `docs/workflows/`.
- Hard-wrapped paragraphs: the v4 plan, the v5 ACP plan, and the supplied workflow plan named above.
- Windows sandbox-only failure: the aggregate could not rename Vite's temporary SSR cache for `scripts/doc-standard.spec.ts`; the unchanged focused suite passed after the narrow host retry. This does not establish the next host's status.

## Phase 4 — Reusable Skill

- [x] Create a generic Skill for empty folders and existing repositories, with V0 templates, bidirectional verification, and a V1/V2 roadmap.
- [x] Validate Skill metadata, links, template rendering, archive integrity, and the installed copy's 11 files.
- [x] Save a portable Skill package in this task's `artifacts/` directory; the personal installation alone does not transfer through Git.

Status: DONE

## Phase 5 — Continue on another device

- [x] Record unfinished issues, current file ownership, saved verification evidence, and a receiving-agent prompt in `handoff.md`.
- [ ] Transfer the uncommitted task files and the required original untracked plans; no commit or push has been made.
- [ ] Compare the current branch with upstream; the local tracking ref reports three commits ahead of local HEAD, and remote freshness has not been checked in this turn.
- [ ] Resolve the missing fixed-baseline evidence and the real external-agent authorization/capability blocker, then perform both handoff directions.
- [ ] Recheck the new host and relevant documentation checks before V0 acceptance.

Status: BLOCKED
