---
description: "MGSD implementation status and Codely handoff checklist, mapped to the architecture plan with local DSH work first and remote dispatch deferred."
---

# MGSD implementation checklist and Codely handoff

English | [中文](MGSD_Implementation_Checklist.zh.md)

## Summary

This checklist lets Codely continue the MGSD implementation from the current checkout. The source plan is `docs/MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan.md`, especially its numbered Phase 0–21 sections. The user's current order is local DSH integration first, then remote task dispatch. The local Codely execution prototype works; the complete local task workflow and distributed MVP remain incomplete.

Status date: 2026-10-07, Asia/Shanghai. A checked item has implementation and recorded verification. An unchecked item marked **partial** has only the stated subset. An unchecked item marked **unverified** has no evidence in this checkout; it does not assert that another machine lacks it. Historical results must be rerun after relevant code or environment changes.

## Table of Contents

- [Take over this checkout](#take-over)
- [Completed local work](#completed-local-work)
- [Original phase mapping](#phase-mapping)
- [Next local checklist](#next-local-checklist)
- [Remote checklist](#remote-checklist)
- [Verification and blockers](#verification)
- [Codely handoff prompt](#handoff-prompt)
- [Maintain this checklist](#maintenance)

<a id="take-over"></a>
## Take over this checkout

Start at `F:\Agents\deepseek-harness` on this machine. The inspected branch is `codely_bridge`; inspect the branch and status again before editing. The prototype and L1 acceptance changes are in the current checkout. Transfer the working diff before continuing on another machine.

Read these files in order:

1. [Root instructions](../AGENTS.md) and [Codely context](../CODELY.md).
2. This checklist and the source plan's component responsibilities, Phase 5–12, Phase 17–18, and MVP acceptance criteria.
3. [L1 implementation summary](MGSD_L1_Local_DSH_Implementation_Summary.md) for responsibilities, execution flow, acceptance, and limits; [local Codely guide](user/guide/codely-local.md) for configuration, behavior, and recorded results.
4. [L2 implementation summary](MGSD_L2_Local_DSH_Implementation_Summary.md) for durable workflow, approval, recovery, acceptance, and L3 handoff.
5. [Executor experiment](MGSD_Codely_Executor_Validation_Report.md) for the observed exit-code, prompt-transport, auto-save, and sandbox limitations.
6. [Architecture](architecture.md), [testing policy](testing.md), and [defensive patterns](defensive-patterns.md) before implementation work.

Preserve the existing `.codely-cli/settings.json` change and the current execution, test, guide, and checklist edits. Inspect only task-relevant files; do not add local settings or editor data wholesale. Do not reset, clean, auto-commit, or auto-push the checkout.

| Existing file | What the next executor should inspect |
|---|---|
| [Overlay](../apps/cli/config/examples/codely-local/cordis.patch.yml) | Opt-in loading. The Codely producer requests quiet completion per job; other jobs keep their configured delivery. |
| [Command plugin](../apps/cli/config/examples/codely-local/plugin.mjs) | Direct human commands, session ownership, directory admission, deadline, and effect-owned teardown. |
| [Execution runner](../apps/cli/config/examples/codely-local/run.mjs) | Codely argv, separate stdout/stderr, independent checks, bounded collection, and process cleanup. |
| [Test entry](../apps/cli/tests/codely-local.spec.ts) | Three Vitest cases, including 13 nested deterministic Node tests and two real Loader/process scenarios. |
| [Loader driver](../apps/cli/tests/fixtures/codely-local/driver.ts) | Real overlay execution, file assertions, failed validation, cancellation, cross-session denial, unload, and model-call count. |
| [Live smoke](../apps/cli/tests/fixtures/codely-local/live.ts) | Real authenticated Codely in a disposable directory with an external content check. |
| [Web acceptance](../apps/web/tests/codely-local.snapshot.ts) | Built Web profile, in-page picker, executor/validator outcomes, model-call tripwire, browser replay, and workspace oracle. |
| [MGSD Core](../packages/experimental/mgsd-workflow/README.md) | Durable local requests, legal transitions, exact approvals, budgets, and restart recovery. |
| [MGSD adapter and guide](user/guide/mgsd-local.md) | Human commands, Core-to-runner wiring, acceptance commands, and remaining L3/L4 limits. |

<a id="completed-local-work"></a>
## Completed local work

These checks describe the local prototype, not completion of whole original phases. Detailed evidence belongs in the local guide and executor report linked above.

- [x] Current host Node is `v26.10.0`, within this checkout's declared engines range; Git is `2.42.0.windows.2`.
- [x] Non-interactive Codely file editing and JSON/stream output were tested on Windows.
- [x] `/codely run <task>`, `status`, `output <id>`, and `cancel <id>` are implemented through existing DSH commands and jobs.
- [x] Unicode multiline prompts pass as one argv value without a Windows shell shim.
- [x] DSH runs configured validation commands independently; an executor exit 0 followed by validation exit 23 produces failure.
- [x] Output retention is bounded and earlier-output loss is reported.
- [x] Same-directory concurrent admission, foreign-session output denial, manual cancellation, and plugin-unload cleanup have Loader/process coverage.
- [x] The real Codely smoke generated the expected file, passed the independent check, and recorded zero DSH model calls.
- [x] The Web overlay loads the opt-in plugin; each Codely job requests quiet completion without changing other jobs' delivery.
- [x] English/Chinese local instructions and website mapping exist; prior lint/Host build and website checks passed.
- [x] Deadline, cancellation during final cleanup, cleanup failure, and Windows parent/child termination have dedicated automated evidence dated 2026-10-06.
- [ ] **Partial:** stdout carries raw stream JSON; task facts are durable in L2, while structured stream parsing and full-stream recovery remain unimplemented.
- [ ] **Partial:** root `CODELY.md` contains repository context; the MGSD task/envelope protocol and its Codely skill are not implemented.
- [x] Real Web acceptance shows run/status/output/cancel, independent exit-23 failure, persisted command rows after reload, and zero DSH model calls.
- [x] The keyless current-format Session fixture replays from the built shipped Web profile and matches its UI and complete workspace oracles.

<a id="phase-mapping"></a>
## Original phase mapping

Retain original numbers for traceability. Complete the local prerequisites before activating remote dispatch; the user's adjusted order postpones original Phase 1–3. Existing generic DSH facilities are dependencies, not evidence that the MGSD-specific phase is complete.

| Original phase | Current status | Acceptance still required |
|---|---|---|
| 0 — Environment/accounts | Partial | Current local Node/Git and real Codely are verified; both-node accounts, tool versions, and runner-user authentication are unverified. |
| 1 — Private Control Repo | Deferred / unverified | Private visibility, trusted writers, and committed control files. |
| 2 — Self-hosted runners | Deferred / unverified | Home and Office runner service identity, labels, and online state. |
| 3 — Dispatch smoke | Deferred / unverified | Home-to-Office task-print dispatch and observed run result. |
| 4 — Node local config | Local subset complete | Alias mapping and local directories are validated; remote capabilities are deferred. |
| 5 — Harness Core | Local subset complete | Immutable tasks, SQLite TaskStore, and independent Core exist; worktrees, context, and automated expert adapters belong to L3/L4. |
| 6 — FSM | Local complete | Persistence, restart interruption, approval invalidation, budgets, and two-review limit are verified. |
| 7 — Worktree service | Partial | Automatic task branches/worktrees, commit pinning, collision/failure handling, retained records, and primary-checkout checks exist; authorized removal remains pending. |
| 8 — Context Builder | Pending | Local file/history/log selection, output budgets, and reproducible context packet. |
| 9 — Codex adapter | Pending | Read-only planner/reviewer, risk budgets, CLI/version checks, and mocked command coverage. |
| 10 — Codely protocol | Partial | Repository context exists; enforce task state, approved plan, allowed files, and execution reporting. |
| 11 — Codely harness skill | Pending | Task/context/envelope discovery and real Harness CLI instructions. |
| 12 — Local E2E | Partial | Executor smoke works; full task preparation, worktree, context, approval, execution, validation, and risk-based review do not. |
| 13 — GitHub to Harness | Deferred | Runner-side controlled entry, local alias resolution, and real end-to-end routing. |
| 14 — `agent` CLI | Deferred | `nodes/send/status/approve/cancel`, task identities, and GitHub invocation tests. |
| 15 — Multi-node approval | Deferred | Two-stage plan/execute flow and local approval verification. |
| 16 — Cancel | Partial | Durable local cancellation and exit facts exist; remote queued-run cancellation and Unity checkpoints are deferred. |
| 17 — DSH integration | Partial | Core-backed source overlay and profile acceptance exist; an installable bundle remains. |
| 18 — DSH status UI | Partial | Existing job/command output is reused; Task/Plan/Review/Node views and browser acceptance remain. |
| 19 — Codely subagents | Deferred | Read-only scout and restricted test runner after the local workflow is stable. |
| 20 — Advanced index | Deferred | File/symbol/Unity indices after basic context generation is sufficient and measured. |
| 21 — Capability scheduling | Deferred | Manual target routing first; capability selection and child tasks after MVP. |

<a id="next-local-checklist"></a>
## Next local checklist

Work through one item group at a time. **L1 and L2** are complete; start L3 task worktrees and context. L3–L5 remain planned deliverables. [L2 operations and verification](user/guide/mgsd-local.md) record implementation, acceptance, and limits.

### L1 — Finish acceptance of the current DSH prototype

- [x] Reproduced the focused suite: three Vitest cases passed, including 13 Node tests; five reporting assertions failed before the fix and passed afterward.
- [x] Added deadline expiry, deadline/cancellation during final cleanup, and cleanup-failure regressions; timeout and observed exit facts are reported independently.
- [x] Verified parent and child termination with the actual Windows provider after cancellation and unload; this does not establish filesystem confinement.
- [x] Started the real Web profile with Codely and the in-page picker overlays; selected an isolated project and exercised run/status/output/cancel in Edge.
- [x] Observed successful execution and exit-23 validation failure; the model tripwire and empty call ledger confirmed no DSH model requests. Per-job quiet completion prevents preset wakeups.
- [x] Added and replayed the required keyless current-format Session scenario with UI and full workspace oracles; registered its owner in the corpus adapter list.
- [x] Recorded reproducible browser, real Codely, replay, and lifecycle commands and observed results in the English and Chinese guide. A PR GIF is not applicable because no PR is being opened.

L1 acceptance: CLI/Loader and browser paths show the same outcomes, failed checks cannot produce success, cancellation/unload/deadlines settle after managed cleanup, and recorded output replays without an API key. All criteria passed on 2026-10-07; see the guide's Dev Note and verification record for commands and outcomes.

### L2 — Local task data and deterministic workflow (Phase 4–6; Section 22)

- [x] Implement node-local configuration, immutable task request, runtime state, branded task identifiers, and a durable TaskStore.
- [x] Keep the MGSD workflow Core free of DSH/Cordis imports; the current DSH subprocess wrapper remains an adapter, not the independent Core.
- [x] Implement explicit legal transitions and interruption/restart recovery; reject `queued → executing` and unapproved execution.
- [x] Resolve the plan's `NEEDS_REPLAN` wording against its FSM state list explicitly; scope expansion must invalidate execution approval.
- [x] Enforce risk/budget decisions and at most two review/fix cycles; a second failed review ends in `needs_human`.
- [x] Persist task/execution/validation/cancellation facts and distinguish task IDs from process-local job IDs.

L2 acceptance passed on 2026-10-07: serialization/restart, invalid transitions, approval injection rejection, 43 Core cases with per-file 100% coverage, real Loader acceptance, and keyless Web replay. Exact commands/results belong to the [L2 guide](user/guide/mgsd-local.md#verification). `source: expert` is currently a trusted human attestation; automated experts and enforced file scope belong to L4.

### L3 — Worktree and context (Phase 7–8; Section 23)

- [x] Resolve an allowed local repo alias, pin the base ref, and create one branch/worktree per task; fail on collisions and never fall back to the primary checkout.
- [x] Keep dirty primary files and indices unchanged during isolated execution; acquire exclusive cross-process ownership for each task worktree. This is not OS confinement.
- [ ] Account for `.codely-cli/auto-saves` before diff/allowed-file checks and retain appropriate audit evidence locally.
- [ ] Build context using local Git/search/log tools with explicit file/log/byte budgets; defer embeddings and advanced indices.
- [ ] **Partial:** task worktrees and workspace records are retained; no removal command or automatic cleanup is provided. Result-retention checks and explicit disposal authority remain pending.

L3 worktree acceptance passes for separate disposable task worktrees, byte-identical dirty primary files/indices, failed preparation with no executor, and independent-process lock denial. Full L3 remains incomplete until context limits, auto-save auditing, and authorized disposal are covered; evidence belongs in the [local guide](user/guide/mgsd-local.md#dev-note).

### L4 — Plan, execution envelope, and Codely protocol (Phase 9–11)

- [ ] Implement planner/reviewer interfaces and risk-based read-only Codex invocation; use mocks in command-generation tests and no Codex call for trivial tasks.
- [ ] Persist the plan, allowed/forbidden files, acceptance checks, and human approval tied to the approved plan version.
- [ ] Generate an execution envelope and enforce allowed-file/approval policy outside the model; updated plans require updated approval.
- [ ] Extend the project protocol without replacing DSH's existing `AGENTS.md` or root Codely repository context.
- [ ] Add the Codely harness-workflow skill only after its task/status/envelope/report commands exist and are verified.

L4 acceptance: plan/review do not edit business code, unapproved execution is denied, scope expansion cannot self-authorize, and Codely can discover the exact task inputs and report completion.

### L5 — Complete local engineering workflow (Phase 12, 16–18)

- [ ] Run one harmless task through create/prepare/context/policy/approval/worktree/execution/independent validation/report.
- [ ] Exercise risk-based review, one failed review/fix cycle, the two-cycle cap, cancellation, and restart recovery.
- [ ] Make DSH views consume the authoritative Core task state; keep a single FSM implementation.
- [ ] Package the local adapter using current bundle/profile APIs after the Core stabilizes; verify the installed artifact and configuration.
- [ ] Record a local acceptance matrix and known limitations before beginning the remote milestone.

L5 acceptance: the complete local workflow is reproducible, task data survives restart, checks determine acceptance, approval is enforced, and the normal checkout stays unchanged.

<a id="remote-checklist"></a>
## Remote checklist

These items are the second implementation stage. Run them after L5 acceptance. Preserve the original plan's distributed MVP acceptance list when defining the release milestone.

- [ ] **R0 — Security/data prerequisites (Sections 13–14):** verify the selected execution account/confinement with outside-read/write sentinels; define Standard/Restricted upload policy; keep credentials and sensitive source/diffs/logs node-local.
- [ ] **R1 — Routing smoke (Phase 1–4):** private Control Repo, trusted writers, both runner identities/labels, local node configuration, and controlled `workflow_dispatch` print smoke.
- [ ] **R2 — Controlled execution (Phase 13–14):** engineering-intent schema, runner-side Harness entry, `agent` commands, stable task/run correlation, and Home-to-Office worktree execution.
- [ ] **R3 — Approval/cancel (Phase 15–16):** separate plan/execute/cancel flows, local approval validation, queued and running cancellation, and retained cancelled worktrees.
- [ ] **R4 — Distributed MVP (Section 24.2):** independently verify every remote MVP criterion on both nodes, including high-risk plan/review, test results, review cap, and primary-checkout protection. Start remote development only after local DSH passes Section 24.1.
- [ ] **Later (Phase 19–21, Section 31):** specialist subagents, advanced context/Unity indices, capability scheduling, editor/ADB integration, and measured Hub migration criteria.

Remote dispatch is not currently configured by this prototype. Private repositories, runner registration, account permissions, and data-upload approval require the user's actual account/project choices; do not infer them from example names or paths in the source plan.

<a id="verification"></a>
## Verification and blockers

The following existing entry runs keyless executor and Loader/process coverage. Its recorded result on 2026-10-04 was two passing Vitest cases, including six nested Node tests. The latest focused lifecycle rerun on 2026-10-06 passed three files and 147 tests, including 13 nested Node tests. The Web acceptance and keyless replay were rerun on 2026-10-07; exact commands and outcomes are in the local guide's Dev Note.

```powershell
node node_modules/vitest/vitest.mjs run apps/cli/tests/codely-local.spec.ts
```

For the separately invoked live smoke, configure `DSH_CODELY_COMMAND` using the local guide, then use the existing entry below. It requires local Codely authentication and calls its model. The live fixture replaces its own validation argv with a trusted file-content check and removes its disposable project after teardown.

```powershell
node --import tsx/esm apps/cli/tests/fixtures/codely-local/live.ts
```

Known handoff facts:

- Current Codely launch uses `node.exe` plus its installed JavaScript entry, not `codely.cmd`; locate the entry rather than copying a user-specific absolute path.
- The Node upgrade is verified; `v26.10.0` is the Node.js version, not the Codely version. The earlier executor report's Node v22.18.0 and Codely nightly version describe its dated experiment.
- Dependency files were downloaded; root postinstall failed on the existing submodule Git `core.worktree` configuration. Do not change common Git configuration merely to unblock a command without checking its owners.
- The earlier pinned-pnpm invocation used `pnpm_config_verify_deps_before_run=false` to avoid repeating installation. This does not certify a fresh clone's dependencies; use normal installation/setup for a new environment.
- Prior `lint` with Host build and `docs:check` passed. On 2026-10-07, documentation checks were rerun after the L1 edits; see the final handoff record in the local guide. Do not call the repository fully green if the source plan's bilingual pairing or TypeScript examples still fail.
- The 2026-10-04 plan revision defines local DSH acceptance in Section 24.1 and remote acceptance in Section 24.2. Checklist pairing, Markdown links, `lint`, and `git diff --check` pass. The plan's hard wrapping is corrected and the wrap check passes; full documentation checks still report its pre-existing missing bilingual pair and non-compiling TypeScript examples. These documentation issues do not mark local or remote implementation complete.
- Root `CODELY.md` is existing repository context. MGSD TaskStore/FSM, worktree automation, execution-envelope enforcement, and durable stream audit are not completed by the current local-job plugin. Browser acceptance and keyless replay now cover the Codely-local prototype; they do not complete those later milestones.

<a id="handoff-prompt"></a>
## Codely handoff prompt

Paste this prompt into Codely with the current working directory set to this checkout. Both language editions retain the same prompt.

```text
Continue the MGSD work in the current deepseek-harness checkout.

Read AGENTS.md, CODELY.md, and docs/MGSD_Implementation_Checklist.zh.md first.
Use docs/MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan.md
for the final architecture, and this checklist for current status and order.

The user chose local DSH integration first and remote dispatch second.
L1 and L2 acceptance passed on 2026-10-07; L3 worktrees are implemented.
Continue its unchecked context, auto-save auditing, and disposal items.
Inspect git status and preserve the uncommitted prototype and user files.
Read the existing plugin, runner, overlay, tests, and local user guide.
Read docs/user/guide/mgsd-local.md and the experimental MGSD Core README.
Use the current checklist as the status source. Rerun only relevant checks
after changes; current evidence includes 147 lifecycle tests, the authenticated
real Codely smoke, and the Edge browser acceptance plus keyless v4 replay.

Codely is the primary execution loop. DSH owns deterministic execution,
state, validation, and presentation. Keep DSH model-call count zero for
/codely execution and job completion. Normal chat is a separate DSH path.
Configured independent checks determine acceptance; exit 0 from Codely alone
does not. Do not treat worktrees or strict path policy as OS confinement.

Keep the existing workflow Core independent of DSH/Cordis.
Reuse the current adapter; do not duplicate task state machines.
Do not configure GitHub runners, remote dispatch, or upload project data
until the user starts that second stage. Do not reset, clean, auto-commit,
or auto-push user changes.

For each completed item, update both checklist languages and their pairing
record with file evidence, exact checks run, observed result, and remaining
limitations. Leave partial or unverified items unchecked. Finish the current
local milestone before moving to the next dependent milestone.
```

<a id="maintenance"></a>
## Maintain this checklist

After each implementation slice, retain stable L/R and original Phase identifiers, check only items with observed acceptance evidence, and update both language editions plus the pairing record. Store detailed runtime evidence in the local guide or task report rather than copying raw prompts/logs into this checklist. Record which milestone is next and why any dependency is blocked. When switching machines, verify that every referenced untracked implementation file transferred before continuing.

### Dev Note

This is an implementation handoff snapshot, not a declaration that the distributed architecture is shipped. The original plan contains proposed APIs and installation examples; verify them against the current repository and installed tools before implementation. The local prototype intentionally covers a narrower slice than the original complete Harness Core and MVP.
