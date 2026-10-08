---
description: "MGSD L2 local task workflow implementation, approval and recovery design, acceptance evidence, and L3 handoff."
---

# MGSD L2: local task workflow implementation summary

English | [中文](MGSD_L2_Local_DSH_Implementation_Summary.zh.md)

## Summary

L2 lets users create durable local tasks, approve an exact plan revision, run Codely with independent checks, and inspect retained results after restart. Standard tasks require review; a second failed review requires human intervention. Human commands control the workflow without requesting a DSH model turn. L2 does not provide worktree isolation, automated expert invocation, or remote dispatch.

The [checklist](MGSD_Implementation_Checklist.md) owns completion status. The [local guide](user/guide/mgsd-local.md) owns setup and runnable verification commands. This reference summarizes implementation responsibilities and acceptance evidence for the next maintainer.

## Table of Contents

- [Delivered scope](#scope)
- [Execution responsibilities](#responsibilities)
- [Implementation design](#implementation)
- [Acceptance](#acceptance)
- [Source map](#files)
- [Limits and L3 handoff](#handoff)
- [Dev Note](#dev-note)

<a id="scope"></a>
## Delivered scope

L1 owns managed executor processes. L2 owns the local task lifecycle that admits those processes and retains their outcomes.

| Capability | Observable result |
|---|---|
| Durable task records | Immutable requests and append-only facts survive restart in a private SQLite database. |
| Explicit approval | Execution requires approval of the current plan revision and digest. |
| Risk-based review | Trivial tasks finish after checks; standard tasks require review; high-risk tasks require expert-labelled planning and review. |
| Bounded repair | One fix can follow the first failed review; a second failed review enters `needs_human`. |
| Cancellation and recovery | Cancellation intent is durable; interrupted execution needs replanning and renewed approval. |
| Resource budgets | Explicit attempt, expert-input, and elapsed-time limits prevent unbounded retries. |

<a id="responsibilities"></a>
## Execution responsibilities

The workflow engine decides whether a task can execute. The adapter connects that decision to existing DSH lifecycle services.

| Component | Responsibility |
|---|---|
| Human operator | Supplies requests, plans, approvals, and review decisions. |
| MGSD Core | Validates durable input, enforces transitions and budgets, and derives state from facts. |
| `/mgsd` adapter | Enforces Session ownership and repository selection; connects Core to jobs and subprocesses. |
| L1 runner | Runs Codely and independent checks, bounds output, and awaits managed cleanup. |
| Codely | Executes the original task goal. It cannot grant workflow approval through its output. |

```text
create -> planning -> plan_ready -> approved -> executing
  executing -> independent checks + cleanup
    trivial: success -> completed
    standard/high_risk: success -> reviewing
      pass -> completed
      first failure -> review_failed -> fixing -> executing
      second failure -> needs_human
```

This diagram omits admission stages and failure branches. The [library reference](../packages/experimental/mgsd-workflow/README.md) owns exact lifecycle semantics.

<a id="implementation"></a>
## Implementation design

The implementation separates durable workflow decisions from process execution. It uses existing extension points without changing the agent loop.

<details>
<summary>Core, persistence, approvals, and lifecycle</summary>

### Independent Core and durable facts

`CoreWorkflow` uses Node APIs and SQLite without runtime DSH or Cordis imports. The DSH facade binds branded task, Session, and job identifiers. Strict JSON validation rejects unknown fields at configuration and durable-data inputs.

SQLite stores immutable requests and ordered append-only facts. Each read reconstructs state from validated facts; transactions keep appends atomic. A monotonic schema version rejects unknown future versions. A PID/token lease refuses a second live controller and permits takeover after the recorded process has exited.

The database is distinct from existing Session logs. It does not modify released Session generations, and a Session export does not include the task database. Raw job output remains process-local rather than durable.

### Approval and risk

A proposal creates a plan revision. Approval records that revision, its digest, and the trusted human actor. Replacement plans invalidate approval, and execution rejects stale approvals before spawning a process. Plans cannot inject state or approval fields.

Every risk level requires human approval. High-risk planning and review require `source:"expert"` and expert budget. In this adapter, that field is a trusted human attestation, not evidence of an automated Codex invocation.

### Execution facts and settlement

The adapter checks Session ownership and the real configured repository path before execution. Core reserves the attempt before spawning. The reused runner reports executor and validator exits separately before cleanup; the adapter settles the task only after managed cleanup.

Successful settlement requires the executor and every expected check to exit successfully. A successful standard/high-risk execution still requires review. Command execution requests no DSH model turn, although existing completion notices can appear in a later ordinary chat turn.

### Budgets, cancellation, and restart

Execution attempts include fixes. Expert-labelled proposals and reviews consume expert budget. Total elapsed time starts at task creation and includes planning; expired admission persists `needs_human` without spawning an executor. Runtime deadlines cancel managed execution.

Cancellation records intent before aborting and awaits cleanup. Expanding scope during execution first stops the active job, then enters `needs_replan`. Restart converts incomplete active states to `interrupted` and revokes approval; stable approved and terminal records remain readable. No restart automatically respawns or reattaches an executor.

</details>

<a id="acceptance"></a>
## Acceptance

Acceptance covers workflow decisions, real DSH process lifecycle, and built Web command replay. The dated results below are recorded evidence, not a claim that every repository aggregate passes.

| Concern | Verification owner |
|---|---|
| Immutable facts, approval, budgets, review limits, recovery, corruption, and controller ownership | [Core tests](../packages/experimental/mgsd-workflow/tests/workflow.spec.ts) |
| Actual Loader, managed executor/checks, Session denial, cancellation, and unload | [CLI acceptance](../apps/cli/tests/mgsd-local.spec.ts) and [driver](../apps/cli/tests/fixtures/mgsd-local/driver.ts) |
| Built Web, retained command rows, no model calls, and workspace results | [Web scenario](../apps/web/tests/mgsd-local.snapshot.ts) and [recorded fixture](../snapshots/web/mgsd-local/) |

Use the [guide verification section](user/guide/mgsd-local.md#verification) to reproduce the focused checks. These cases use disposable directories and test executors; they do not establish a new live Codely/model-API acceptance result.

<a id="files"></a>
## Source map

Start with the owning reference, then follow the implementation or acceptance entry needed for the change.

| Entry | Purpose |
|---|---|
| [Package README](../packages/experimental/mgsd-workflow/README.md) | Library semantics and limits. |
| [Core](../packages/experimental/mgsd-workflow/src/core.ts) | SQLite storage, state reconstruction, transitions, and budgets. |
| [Types](../packages/experimental/mgsd-workflow/src/types.ts), [validation](../packages/experimental/mgsd-workflow/src/validation.ts), [facade](../packages/experimental/mgsd-workflow/src/index.ts) | Records, JSON checks, and DSH identifiers. |
| [Overlay](../apps/cli/config/examples/mgsd-local/cordis.patch.yml) and [adapter](../apps/cli/config/examples/mgsd-local/plugin.mjs) | Opt-in human commands and lifecycle wiring. |
| [L1 runner](../apps/cli/config/examples/codely-local/run.mjs) | Reused managed execution and process-exit observations. |
| [Local guide](user/guide/mgsd-local.md) | Private node/database configuration and human command use. |

<a id="handoff"></a>
## Limits and L3 handoff

L2 provides a durable local workflow, not a complete isolated agent workspace. The [L3 checklist](MGSD_Implementation_Checklist.md#next-local-checklist) is the next implementation owner.

- L3: pin a base commit and create one branch/worktree per task, preserve the main checkout, and enforce cross-process workspace ownership.
- L3: prepare bounded local context and audit Codely auto-saves; retain inspectable results and define safe cleanup.
- L4: automate trusted read-only planning/review and enforce the approved execution envelope.
- Remote dispatch remains a second-stage extension, outside L2.

Core preparation states alone do not establish Git isolation; the [local adapter guide](user/guide/mgsd-local.md) owns worktree preparation and execution locks. Allowed files are approval data, not enforced filesystem restrictions; Codely receives the original immutable goal. The Core controller lease protects one database, not repositories across processes. Enable only one local executor overlay per project.

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Recorded verification — 2026-10-07, Windows</summary>

This dated record summarizes the L2 implementation session. It is not a second status queue or a repository-wide green-check assertion; the guide retains the acceptance commands and aggregate diagnostics.

| Verification | Recorded result |
|---|---|
| Focused Core, CLI/Loader, and documentation tests | Four files, 69 Vitest cases passed; existing runner coverage includes 13 nested Node tests. |
| New package coverage | Per-file statements, branches, functions, and lines reached 100%. |
| Built Web replay | MGSD and L1 scenarios passed; command rows, zero model calls, and workspace results were checked. |
| Recorded-session corpus | All three ownership/header/version cases passed. |
| Concurrent Core runs | Two overlapping processes each passed 43 cases with separate temporary databases. |
| Build and focused static checks | Full build, Host build, lint, package constraints, and focused declaration/build checks passed. |

Repository-wide aggregates retain existing failures: the architecture plan lacks a Chinese pair and has non-compiling TypeScript examples; the Cordis catalog is stale; Windows hygiene encounters an ACP symlink represented as link text. New L2 failures found during the aggregates were corrected and their owning checks passed. See the [guide acceptance record](user/guide/mgsd-local.md#dev-note) for exact initial counts and remaining diagnostics.

For this summary update, two named bilingual pairs and `git diff --check` passed. `test:docs` reported 19 pass/1 fail; `doc-sync` reported 39 pass/3 fail, with only the existing documentation failures listed above. `lint` passed. Functional acceptance was not rerun for this documentation-only update.

</details>
