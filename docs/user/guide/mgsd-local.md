---
description: "Configure human-approved local MGSD tasks and inspect their durable state, validation, review, and restart behavior."
---

# Run durable local MGSD tasks

English | [中文](mgsd-local.zh.md)

## Summary

Use `/mgsd` to create a local task, propose a plan, explicitly approve its revision, and execute Codely with independent checks. Task facts survive DSH restarts. The second failed review requires human intervention. These human commands make no DSH model calls; normal chat is separate.

## Table of Contents

- [Configure](#configure)
- [Commands](#commands)
- [Recovery and limits](#recovery)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="configure"></a>
## Configure

Use a built development checkout and an authenticated Codely installation. Configure the executable, trusted independent checks, and process limits as described in the [Codely guide](codely-local.md). Enable only one of the Codely/MGSD overlays per project: their in-process directory admission maps are separate. Start with a disposable project; this feature does not confine filesystem or network access.

Create a private node JSON file outside the project with existing absolute directories. `workspaceRoot` identifies local workspace storage; it is not yet a managed worktree root. `defaultBaseRef` is snapshotted as text, not resolved to a Git commit. The accepted configuration deliberately contains no remote capabilities.

```json
{"nodeId":"local","workspaceRoot":"F:/Agents","repos":{"project":{"path":"F:/Agents/my-project","defaultBaseRef":"HEAD"}}}
```

Set `DSH_MGSD_NODE_CONFIG` to that file and `DSH_MGSD_DATABASE` to a private SQLite path, both absolute. The database parent directory is created when necessary. Keep requests, plans, checks, and database files local; they may contain project information. Do not commit the private files.

The opt-in [MGSD overlay](../../../apps/cli/config/examples/mgsd-local/cordis.patch.yml) runs with the shipped Web profile. The recorded acceptance starts the built `dsh` CLI with `web --patch <MGSD-overlay> --patch <picker-overlay> --patch <test-runtime> --no-open --port 0`; the picker/test runtime are acceptance-only. The [Web scenario](../../../apps/web/tests/mgsd-local.snapshot.ts) owns the exact launch environment and arguments.

<a id="commands"></a>
## Commands

Select the configured repository directory for the Session before creating or running a task. The following command JSON matches the automated acceptance; replace task goals, paths, criteria, and budgets deliberately.

```text
/mgsd create {"title":"Local task","prompt":"success","repoAlias":"project","risk":"trivial","budget":{"maxExecutionAttempts":2,"maxExpertCalls":0,"maxDurationMs":60000}}
/mgsd plan TASK-ID {"summary":"Write result","allowedFiles":["result.txt"],"acceptanceCriteria":["Independent check passes"],"source":"human"}
/mgsd approve TASK-ID 1
/mgsd run TASK-ID
/mgsd status TASK-ID
/mgsd output TASK-ID
```

Replace `TASK-ID` with the returned `TASK-<uuid>`. `/mgsd status` lists only this Session’s tasks. The approval must name the current plan revision; replanning invalidates it. `/mgsd run` returns a separate process-local job ID. A successful job does not mean a standard/high-risk task has completed review.

| Operation | Meaning |
|---|---|
| `review <id> {"passed":false,"source":"human","findings":"Missing case"}` | Record review of an executed standard task. |
| `fix <id>` then `run <id>` | Execute one fix after the first failed review, consuming another attempt. |
| `replan <id> <reason>` | Revoke approval; stop active execution before `needs_replan`. |
| `cancel <id>` | Persist cancellation and await active managed cleanup. |
| `resume <id>` | Move an interrupted task to replanning without spawning a process. |

High-risk plans and reviews require `source:"expert"` and available expert-call budget. In this human-only adapter, this field is a trusted human attestation, not proof of a Codex call. Every risk level requires human approval. Trivial tasks skip external expert input and review; standard tasks require review; high-risk tasks require expert-labelled planning and review.

<a id="recovery"></a>
## Recovery and limits

Reopen the same database and Session to inspect retained tasks. Incomplete active states become `interrupted` and lose approval; no job is automatically relaunched. Resume, propose a new plan, and approve the new revision before execution. Stable approved or terminal tasks remain readable. A second live controller cannot open the database.

Task facts, exit codes, cancellation intent, and settlement survive restart. Raw output remains in the process-local jobs registry and is unavailable after restart. The adapter logs command results through existing Session events without requesting a model turn; existing job completion notices can reach a later ordinary chat turn. Retain the database separately from exported Session logs.

Budgets are explicit: execution attempts include fixes; expert-labelled proposals/reviews consume expert budget; total time includes planning. Expired admission persists `needs_human` without spawning an executor. Runtime deadlines cancel managed work. A second failed review also ends in `needs_human`; there is no automatic third review or terminal reset.

The [library limitations](../../../packages/experimental/mgsd-workflow/README.md#known-limitations-and-deferred-work) also apply. Worktree creation, Git commit pinning, enforced allowed-file envelopes, automated expert invocation, and remote dispatch are not provided by this milestone. The executor receives the immutable original goal; plans are approval records, not yet an executor envelope.

<a id="verification"></a>
## Verification

Run the focused checks from the repository root after a Host build. They use disposable directories and test executors, not real Codely credentials or model APIs.

```powershell
node node_modules/vitest/vitest.mjs run packages/experimental/mgsd-workflow/tests/workflow.spec.ts apps/cli/tests/mgsd-local.spec.ts apps/cli/tests/codely-local.spec.ts scripts/doc-standard.spec.ts --coverage --coverage.include='packages/experimental/mgsd-workflow/src/**/*.ts'
$env:DSH_SNAPSHOT = 'replay'
$env:DSH_TEST_BROWSER_CHANNEL = 'msedge'
node node_modules/vitest/vitest.mjs run --config vitest.web.config.ts apps/web/tests/mgsd-local.snapshot.ts apps/web/tests/codely-local.snapshot.ts
```

Observed on Windows, 2026-10-07: four files passed 69 Vitest cases (43 Core, four CLI/Loader, and 22 documentation cases), including the existing 13 nested runner tests. The new package reached per-file 100% statement/branch/function/line coverage. Web replay passed both MGSD and L1 scenarios, preserving command rows after reload, zero model calls, and the complete workspace oracle. [Core tests](../../../packages/experimental/mgsd-workflow/tests/workflow.spec.ts) verify restart, stale approval, corruption rejection, independent exits, budgets, and review limits; the [Loader driver](../../../apps/cli/tests/fixtures/mgsd-local/driver.ts) verifies real managed execution, cross-Session denial, unload, and durable cancellation after reopening.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Acceptance record — click to expand</summary>

Two independently spawned Vitest processes started at 16:14:25 on the same host and each passed all 43 Core cases; their lifetimes overlapped and each owned its own temporary database. The recorded-session corpus check passed all three ownership/header/version cases after the MGSD sidecars were added. Final named bilingual checks passed four pairs, and `git diff --check` passed. The user’s local settings and Codely context edits were preserved.

Full build and final Host build passed. Lint, public-package validation, NodeNext consumers, persistence history, and focused package constraints were exercised. `test:docs` initially reported 18 pass/2 fail; the new Chinese Summary heading was corrected and its 22 owning tests passed. `doc-sync` initially reported 37 pass/5 fail; new export JSDoc and config-catalog failures were corrected and their checks passed. The remaining existing failures are the architecture plan’s missing Chinese pair, its non-compiling TypeScript examples, and a stale Cordis catalog. Hygiene initially reported 14 pass/4 fail; the new dependency placement and invariant explanation were corrected and their checks passed. Its remaining Windows-checkout failure is the ACP config symlink stored as link text, also present at HEAD. These results do not establish green repository-wide aggregates. No L2 commit, push, remote runner, or upload is part of this acceptance.

</details>
