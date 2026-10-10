---
description: "Implementation status, four-mode feasibility checks, and DSH native workflow handoff mapped to Generic Agent Harness v4."
---

# MGSD implementation checklist and Codely handoff

English | [中文](MGSD_Implementation_Checklist.zh.md)

## Summary

This checklist follows the [Generic Agent Harness v4 execution plan](Generic_Agent_Harness_Architecture_Execute_Plan_v4.md) (2026-10-10). DSH is the sole harness foundation; Codex and Codely each retain separate `subscription` and `external-agent` routes. Complete Phase 0S first, then accept Phases 0–8 in order; local work precedes remote dispatch. The older MGSD plan is only a historical mapping for existing L1–L5/R0–R4 identifiers.

Checklist updated: 2026-10-10, Asia/Shanghai. Existing implementation evidence comes from earlier local acceptance; this documentation update does not rerun that acceptance. A checked item has implementation and recorded evidence; **partial** covers only the stated subset; **unverified** means this checklist has no evidence. Rerun after relevant code or environment changes. Accepted L1/L2 and partial L3 worktrees do not establish completion of corresponding v4 phases.

## Table of Contents

- [Take over this checkout](#take-over)
- [Completed local work](#completed-local-work)
- [v4 phases and existing milestones](#phase-mapping)
- [Next local checklist](#next-local-checklist)
- [Remote checklist](#remote-checklist)
- [Verification and blockers](#verification)
- [Codely handoff prompt](#handoff-prompt)
- [Maintain this checklist](#maintenance)

<a id="take-over"></a>
## Take over this checkout

Continue from the current checkout. Inspect its actual path, branch, and Git status before editing; historical Windows paths and branches are not current-machine configuration. Transfer the required working diff before switching machines.

Read these files in order:

1. [Root instructions](../AGENTS.md) and [Codely context](../CODELY.md).
2. This checklist and the v4 plan’s sections 0–2, Phase 0S, Phases 0–8, release checks in sections 10–11, and prototype migration in section 14.
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

- [x] Windows acceptance recorded Node `v26.10.0` and Git `2.42.0.windows.2`; inspect current-host versions separately.
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
## v4 phases and existing milestones

v4 Phase numbers do not correspond to the older Phases 0–21. This table retains existing L/R identifiers for evidence tracking; new items use v4 Phase/M identifiers. Existing DSH capabilities provide the reuse foundation; MGSD prototype acceptance does not replace v4 adapter and cross-project acceptance.

| v4 phase / release milestone | Existing evidence / identifier | Remaining v4 acceptance |
|---|---|---|
| 0S / M0S — Four-mode feasibility | L1 historical Codely CLI and Web evidence; partial | Independent probes/Mocks for four routes, subscription authorization and security review, local route, compatibility matrix, and Go/No-Go. |
| 0 / M0 — Independent framework repository | Prototype in the current DSH repository; unverified | Independent framework repository, pinned toolchain, buildable artifacts, and domain-neutral configuration; this documentation update does not migrate code. |
| 1 / M1 — Task and persistence | L2 immutable requests, SQLite, FSM, approval, budgets, and interruption records; partial | Separate Task/Attempt/Session Link/Checkpoint, atomic Version/CAS updates, idempotent Operation records, migrations, and CLI skeleton. |
| 2 / M2 — Memory, Context, Skills | L3 context remains incomplete | Layered memory, Proposal review/conflict/merge, local retrieval, injection audit, sensitive-scope isolation, and progressive loading. |
| 3 / M3 — Dual routing and Workflow | L1/L2 Codely execution and deterministic workflow; partial | Separate Native LLM and External subagent registration, four adapters, capability probes, Fake E2E, configurable roles, and cross-platform tests. |
| 4 / M4 — Workspace and Permit | L3 worktrees, pinned commits, primary checkout protection, and process locks; partial | Technical ExecutionPermit, scope/stale-approval checks, auto-save audit, authorized cleanup, and complete local E2E. |
| 5 / M4 — Session and recovery | L2 interruption recovery and L1 Session replay; partial | Native Session Tree/Fork/compaction observation, Checkpoint, operation idempotency, Resume/Handoff, and fault injection. |
| 6 / M5 — Multi-device coordination | Older R0–R4; deferred / unverified | Private Control Repo, Runners, Durable Inbox, Reconciler, offline redelivery, approval/cancellation, and duplicate-write prevention. |
| 7 / M6 — DSH UI and release | Source overlay/command output from older L5; partial | Dual selectors, measured readiness, Task/Session/Attempt links, independent four-route E2E, installation, and rollback. |
| 8 — Advanced capabilities | Older advanced indexing/scheduling; deferred | Validate capability routing, deferred tool loading, hybrid retrieval, DAGs, multiple coordinators, and protocol compatibility after MVP. |

A `subscription` route remains `blocked/experimental` until supplier authorization and real E2E pass; interfaces or Mocks do not make it `ready`. Production MVP can use legitimate local/external-agent routes; requiring both subscription routes in production creates a separate supplier-support Go/No-Go condition.

<a id="next-local-checklist"></a>
## Next local checklist

Next is v4 Phase 0S: produce the four-mode feasibility report before dependent stages. L1–L3 below retain existing acceptance and gaps; subsequent implementation follows M0S–M6. [L2 operation and verification](user/guide/mgsd-local.md) owns detailed implementation evidence.

### L1 — Finish acceptance of the current DSH prototype

- [x] Reproduced the focused suite: three Vitest cases passed, including 13 Node tests; five reporting assertions failed before the fix and passed afterward.
- [x] Added deadline expiry, deadline/cancellation during final cleanup, and cleanup-failure regressions; timeout and observed exit facts are reported independently.
- [x] Verified parent and child termination with the actual Windows provider after cancellation and unload; this does not establish filesystem confinement.
- [x] Started the real Web profile with Codely and the in-page picker overlays; selected an isolated project and exercised run/status/output/cancel in Edge.
- [x] Observed successful execution and exit-23 validation failure; the model tripwire and empty call ledger confirmed no DSH model requests. Per-job quiet completion prevents preset wakeups.
- [x] Added and replayed the required keyless current-format Session scenario with UI and full workspace oracles; registered its owner in the corpus adapter list.
- [x] Recorded reproducible browser, real Codely, replay, and lifecycle commands and observed results in the English and Chinese guide. A PR GIF is not applicable because no PR is being opened.

L1 acceptance: CLI/Loader and browser paths show the same outcomes, failed checks cannot produce success, cancellation/unload/deadlines settle after managed cleanup, and recorded output replays without an API key. All criteria passed on 2026-10-07; see the guide's Dev Note and verification record for commands and outcomes.

### L2 — Local task data and deterministic workflow (existing evidence; v4 Phase 1/3)

- [x] Implement node-local configuration, immutable task request, runtime state, branded task identifiers, and a durable TaskStore.
- [x] Keep the MGSD workflow Core free of DSH/Cordis imports; the current DSH subprocess wrapper remains an adapter, not the independent Core.
- [x] Implement explicit legal transitions and interruption/restart recovery; reject `queued → executing` and unapproved execution.
- [x] Resolve the plan's `NEEDS_REPLAN` wording against its FSM state list explicitly; scope expansion must invalidate execution approval.
- [x] Enforce risk/budget decisions and at most two review/fix cycles; a second failed review ends in `needs_human`.
- [x] Persist task/execution/validation/cancellation facts and distinguish task IDs from process-local job IDs.

L2 acceptance passed on 2026-10-07: serialization/restart, invalid transitions, approval injection rejection, 43 Core cases with per-file 100% coverage, real Loader acceptance, and keyless Web replay. Exact commands/results belong to the [L2 guide](user/guide/mgsd-local.md#verification). `source: expert` is currently a trusted human attestation; automated experts and enforced file scope belong to L4.

### L3 — Worktree and context (existing evidence; v4 Phase 2/4)

- [x] Resolve an allowed local repo alias, pin the base ref, and create one branch/worktree per task; fail on collisions and never fall back to the primary checkout.
- [x] Keep dirty primary files and indices unchanged during isolated execution; acquire exclusive cross-process ownership for each task worktree. This is not OS confinement.
- [ ] Account for `.codely-cli/auto-saves` before diff/allowed-file checks and retain appropriate audit evidence locally.
- [ ] Build context using local Git/search/log tools with explicit file/log/byte budgets; defer embeddings and advanced indices.
- [ ] **Partial:** task worktrees and workspace records are retained; no removal command or automatic cleanup is provided. Result-retention checks and explicit disposal authority remain pending.

L3 worktree acceptance passes for separate disposable task worktrees, byte-identical dirty primary files/indices, failed preparation with no executor, and independent-process lock denial. Full L3 remains incomplete until context limits, auto-save auditing, and authorized disposal are covered; evidence belongs in the [local guide](user/guide/mgsd-local.md#dev-note).

### M0S — Four-mode feasibility (v4 Phase 0S; next)

- [ ] Pin DSH/Node/plugin/CLI versions and record suppliers, login status, licenses, compatibility, and credential management; do not read or print private tokens.
- [ ] Record capabilities, Loop Owner, billing source, and `ready/experimental/blocked/unavailable` status separately for `subscription.codex`, `subscription.codely`, `external.codex`, and `external.codely`; provide four independent Mocks.
- [ ] Review pi2dsh, dsh-codex-subscription, and dsh-codely referenced by v4; confirm supplier authorization before subscription access, otherwise keep blocked and send no real requests.
- [ ] Validate DSH Web/local without extra paid API keys and at least one real External delegation in an isolated profile; default to `allowPaidApi: false` and reject silent paid fallback after authentication/quota failures.
- [ ] Deliver a redacted `dual-mode-feasibility` report, compatibility matrix, four-route test list, and Go/No-Go. Answer separately whether each Native subscription route can legally serve as a real DSH LLM Provider.

M0S acceptance: each route has independent evidence, and blocked never appears ready; record Mock success separately from real authorization/E2E. Stop to deliver this report, then continue using the staged prompts in v4 section 12.

### M0–M1 — Framework and Task persistence (v4 Phase 0–1; follows L2)

- [ ] Define the independent framework repository and migration scope, pin pnpm/TypeScript/DSH, and exclude databases/caches/logs/credentials; preserve the prototype and user changes without automatically moving code.
- [ ] Test pure domain structures independently; launch the product through DSH profiles and reuse Web/Agent/Tool/Session without a second generic loop or Session store.
- [ ] Separate Task, Attempt, DSH Session Link, external native Session, Checkpoint, and Memory identifiers; SQLite stores only extension business facts/indices, not copies of DSH Session events.
- [ ] Complete schema versions, migrations, Version/CAS, atomic event/state commits, and Operation idempotency identifiers; test concurrency, invalid transitions, and restart.
- [ ] Implement and test doctor/init/new/status/events operations through actual profiles/services; command names in the plan are proposed interfaces, not existing entry points.

M0–M1 acceptance: the independent framework builds without project-specific domain assumptions, and DSH is the sole runtime foundation; old Task data has explicit migration/rejection and original DSH Session records remain intact.

### M2 — Context, Memory, and Skills (v4 Phase 2; follows L3 context)

- [ ] Implement user/Workspace/Task/Session memory layers and Proposal → verification → human approval → merge; handle rejection, conflicts, sources, and sensitivity.
- [ ] Retrieve locally with FTS/rg/git, retain source references/hashes/versions, and deduplicate/trim by role, risk, and file/log/byte budgets; online embeddings are unnecessary.
- [ ] Adapt Native injection and External ContextPacket separately and audit Stored/Retrieved/Injected; unreviewed memory cannot become accepted facts, and other Workspaces cannot see sensitive data.
- [ ] Scan skill metadata and load progressively; initialization writes only to explicit targets and preserves existing `AGENTS.md`, `CODELY.md`, and knowledge files.

M2 acceptance: reproducible context builds without model calls; unrelated stored content is not injected, and tests establish sensitive-data isolation and lazy loading.

### M3 — Dual-mode adapters and workflow (v4 Phase 3; follows L4)

- [ ] Delegate ModelProviderRegistry to the DSH LLM seam and AgentRuntimeRegistry to the DSH subagent seam; reject two primary loops in one Attempt.
- [ ] Implement independent Codex/Codely Native streaming/tool-call/tool-result/error/cancel Mocks; validate real subscription requests only after authorization, and never wrap a complete CLI agent loop as a single completion.
- [ ] Prefer the existing DSH Codex provider for External Codex; probe Codely ACP and explicitly degrade to controlled stream-json CLI when insufficient; retain cancellation/timeouts/results and external IDs without fabricating hidden events.
- [ ] Validate Windows/macOS/Linux ProcessRunner argv, cwd, UTF-8, separate output, deadlines, process-tree cleanup, and redaction; existing Windows evidence does not replace cross-platform acceptance.
- [ ] Use FakeAgent for direct, plan-execute-review, and research; make roles configurable, initially external Codex planning/review and Codely execution, replaceable without Core edits.
- [ ] Bind human approval to Plan/Scope/BaseCommit snapshots and exclude it from Executor tools; retain budgets and the two review/fix limit, invalidating approval on scope expansion.

M3 acceptance: Fake E2E and independent four-adapter tests pass; DSH executes Native tools, External controls its own loop, and agents cannot authorize themselves.

### M4 — Permit, local E2E, and recovery (v4 Phase 4–5; follows L3–L5)

- [ ] Complete unchecked L3 auto-save audit, result retention, and explicitly authorized cleanup; issue technical ExecutionPermits checking Plan SHA, allowed paths/operations, BaseCommit, expiry, and workspace ownership.
- [ ] Test rejection of unauthorized paths/symlinks/stale Permits/base changes/duplicate writers; worktrees and prompts do not replace OS confinement, and unauthorized results stop at needs_human.
- [ ] Run create/context/plan/approval/worktree/execute/independent checks/review/report in two unrelated fixture Git repositories, retaining failed worktrees and user changes in the primary checkout.
- [ ] Reuse DSH Session observation, Tree/Fork, and context compaction with redacted projections; compaction must not delete or modify original events, and no duplicate Session Store is created.
- [ ] Save Checkpoints at preparation, planning, approval, before side effects, after tests, execution, review, and interruption; verify Git/approval/Operation before recovery and first confirm old processes stopped.
- [ ] Create a new Attempt when native Session resume is unavailable or modes change, explicitly using projections/Checkpoints; do not promise lossless cross-product continuation.
- [ ] Inject interruption during planning/editing/testing/Checkpoint writes, cancellation, stale checkpoints, and changed plans; verify idempotency and explainable recovery.

M4 acceptance: complete local workflow, enforced approval/Permit, no repeated side effects, and recovery evidence pass; Task and DSH Session facts remain intact before starting remote work.

<a id="remote-checklist"></a>
## Remote checklist

After M4 local acceptance, enter v4 Phase 6, then complete Phase 7 release acceptance. Older R0–R4 map to M5 below; older L5 UI/packaging items map to M6. DSH is required from the start; Phase 7 completes integration and release rather than introducing DSH.

### M5 — Multi-device (v4 Phase 6; follows R0–R4)

- [ ] Confirm project data policy, Private Control Repo, and trusted writers; use isolated low-privilege Runner users and validate outside-directory sentinels and upload policy.
- [ ] Verify two Runner labels/identities and print-only dispatch; remote inputs contain only allowlisted repoAlias/target/workflow and task references, never arbitrary shell, paths, or confidential text.
- [ ] Implement Durable Inbox, separate Task and Actions Attempt, stable deliveryId, and Reconciler; simulate redelivery after the 24h queue lifetime without losing the Task.
- [ ] Implement send/status/approve/cancel/resume; approval binds Plan Hash and starts a new execute stage without occupying a Runner while awaiting a human.
- [ ] Test running/queued cancellation, disconnection, repeated dispatch, stale workers/leases, and safe manual migration; first revoke old write authority, and never treat Actions concurrency as a strongly consistent lease.
- [ ] Accept Standard/Restricted projections; never upload credentials, complete Sessions, source code, or sensitive logs to the coordination repository.

### M6 — DSH UI and release (v4 Phase 7; follows L5)

- [ ] Expose Task/Workflow/Memory/permission audit through DSH plugin services, reuse native Agent/Session/Tool and a single FSM, and verify installable bundle/profile artifacts.
- [ ] Separate Model Selector from Agent/Role Selector; show measured readiness, Mode, Loop Owner, authentication status, capabilities, quota source, data destinations, and Task/Session/Attempt links for four routes.
- [ ] Independently test text/tool round trips/reconnect/rejection/cancel and 401/429 for every ready route; run the five planned real test categories for authorized subscriptions, while unauthorized routes send no requests.
- [ ] Verify Session replay, switch audit and ContextPacket, Checkpoint/Pause on quota/authentication failure, no paid fallback, and data retention after plugin disablement.
- [ ] Complete contract/integration/security/recovery acceptance in two unrelated projects and record compatibility, installation, troubleshooting, upgrade, and rollback; alpha publication is an optional later action.

### Phase 8 — Advanced capabilities after MVP

- [ ] Add capability routing, deferred Tool/MCP loading, hybrid retrieval, DAGs, multiple Coordinators, granular approval, observability, and cross-node version compatibility according to needs and measurements; test each adapter/workflow first.

Remote accounts, repositories, Runners, upload policies, and subscription authorization remain unverified; example names and paths are not real configuration. This request updates the checklist only, without configuring remote resources or enabling supplier routes.

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

- Windows Node/Git, Codely login, and installation-entry evidence belongs to that machine at verification time; inspect actual versions and CLI capabilities on a new host instead of copying user-specific paths.
- The existing Core has TaskStore/FSM and the adapter has worktrees; enforced file scope, structured stream recovery, and complete v4 Attempt/Checkpoint/Memory and dual-registry acceptance remain missing.
- Existing guides record the older Windows postinstall/submodule and documentation-check issues; do not infer current-host blockers or alter global Git configuration without confirmation.
- M0S supplier authorization, community-plugin review, four-mode matrix, and no-paid-fallback acceptance lack evidence; successful Codely external CLI execution does not establish subscription availability.
- Validate v4 proposed directories, interfaces, and commands against actual repository services and `dsh` profile launch rules; this update does not migrate code, call real models, or rerun local behavior acceptance.

<a id="handoff-prompt"></a>
## Codely handoff prompt

Paste this prompt into Codely with the current working directory set to this checkout. Both language editions retain the same prompt.

```text
Continue from the current deepseek-harness checkout.
Read AGENTS.md, CODELY.md, and docs/MGSD_Implementation_Checklist.zh.md.
Use docs/Generic_Agent_Harness_Architecture_Execute_Plan_v4.md as the
architecture baseline; use the checklist for implementation evidence.

Start with Phase 0S / Prompt S and deliver its feasibility report, then stop.
Do not jump directly into the remaining L3 work or migrate repositories.
Inspect git status and preserve user files and existing prototype changes.
L1/L2 passed historical acceptance; L3 worktrees are partially implemented.
Those results do not establish v4 milestone acceptance on this host.

DSH is the only harness foundation: reuse its Web UI, Agent Loop, tools,
Session events, subagents, and plugin lifecycle. Keep pure domain tests
independent, but launch supported applications only through dsh profiles.
Native subscription uses the DSH loop; external-agent uses the product loop.
One Attempt has one primary loop owner. Existing /codely direct execution
keeps zero DSH model calls; this is not a rule for Native subscription.

Assess four routes independently: Codex/Codely subscription/external-agent.
Do not activate subscription routes without supplier authorization and real
Native streaming/tool-loop acceptance. Never extract private auth caches.
Default allowPaidApi=false; no silent paid API fallback. Report blocked
routes honestly; local/external-agent workflows can remain usable.

Keep DSH Session logs authoritative. SQLite holds Task/Attempt/indices and
Checkpoint metadata, not a duplicate Session store. Approval binds the
Plan/Scope/BaseCommit snapshot; writes require enforced permits/worktrees.
Independent checks determine acceptance. Preserve failed worktrees.

Do not configure GitHub runners, dispatch tasks, upload project data,
reset, clean, auto-commit, or auto-push. For each accepted milestone update
both checklist languages and their pairing record with actual evidence,
checks run, limitations, and rollback. Leave unverified items unchecked.
```

<a id="maintenance"></a>
## Maintain this checklist

After each implementation slice, retain stable L/R and original Phase identifiers, check only items with observed acceptance evidence, and update both language editions plus the pairing record. Store detailed runtime evidence in the local guide or task report rather than copying raw prompts/logs into this checklist. Record which milestone is next and why any dependency is blocked. When switching machines, verify that every referenced untracked implementation file transferred before continuing.

### Dev Note

This is a v4 implementation handoff snapshot. The existing MGSD prototype supplies reusable evidence but does not deliver the generic dual-mode MVP. Independent-repository migration, supplier authorization, and real remote acceptance remain pending.
