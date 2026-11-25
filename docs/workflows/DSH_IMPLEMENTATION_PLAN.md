# DSH v2 — Codex and Codely implementation plan <a id="dsh-v2--codex--codely-通用开发执行计划"></a>

English | [中文](DSH_IMPLEMENTATION_PLAN.zh.md)

> Updated November 23, 2026. Implementation and acceptance are in progress. Full product acceptance is pending.
>
> **Requirements come exclusively from the two current Markdown PRDs in `docs/myPlan/`**: [main PRD vNext.4](../myPlan/DSH_PRD_vNext_4_2026-10-27.md) and [Taskboard PRD v0.1](../myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md). This plan breaks down implementation, tracks progress and links evidence. Historical plans linked by either PRD add no requirements.
>
> The two PRDs define goals and constraints. Main PRD D-01–D-10 govern product decisions. Taskboard FR01–FR14, AC01–AC20 and NFR01–NFR09 govern detailed workbench behavior. The original Word document locates the source draft and does not extend current Markdown requirements.
>
> [Progress](#12-有效-checklist-与任务证据) · [Available features](#14-p1-当前实现范围) · [Web feasibility](#15-当前第一优先web-chatgpt-provider-可行性验证) · [Taskboard implementation](#16-taskboard-增量实施计划). P/CG/QR/VN4/TBOARD identifiers track work. Neither an identifier nor an existing underlying component establishes completion.

## 0. Required first step for implementing agents <a id="0-给执行-agent-的第一条指令必须遵循"></a>

Read both myPlan PRDs and the requirement mapping for the current task. Follow [WORKFLOW](../../.ai/WORKFLOW.md) to verify Task, actual Git state and sole write ownership. Use repository architecture, code and tests to assess implementation and completion evidence. The PRDs determine product scope. Historical business examples, proposals and removed documents impose no prerequisites.

Save recoverable records at each step and read the seven-day Codex quota. At or below 10% remaining, stop starting development, tests and background work, complete safe shutdown, mark `HANDOFF_READY` and release write ownership. Record live quota only in the current Task.

## 1. Required product goals and scope <a id="1-不可妥协的产品目标与范围"></a>

### 1.1 Required experience <a id="11-必须实现的体验"></a>

- Ordinary chat creates no Task, starts no Executor and makes no additional Planner or Reviewer call. Simple engineering work uses a minimal TaskSpec, native executor loop and deterministic verification.
- ChatGPT Web and SIWC are peer providers. Select Provider, Executor and Workflow independently. Submitted Turns and existing Runs retain their bindings.
- By default Codex and Codely run their native agent loops as `external-agent`. The existing `native-model/subscription` integration is a separate mode.
- Track Task, Run, Delivery and human Review separately. Only user acceptance of the specified valid Delivery completes a task.
- Show quota source, unknown counts, additional charges and switches. Changing source or model and incurring additional charges each require explicit user action.

Sources include main PRD sections 0–5 and 8–9 and decisions D-01–D-10, and Taskboard PRD sections 2–8.

### 1.2 Exclusions and deferred scope <a id="12-明确不做或推迟"></a>

Separate plans and model review are optional. Do not rebuild native Codex/Codely planners or claim access to official ChatGPT Memory. Reverse MCP/native tools are optional. Teams, cross-machine work, complex automatic claiming and a full editor follow Taskboard G3/G4 and main PRD M3/M4. They are outside the Taskboard MVP prerequisites.

### 1.3 Limits to recheck during implementation <a id="13-已知边界实施时重新验证"></a>

A controlled Web proof of concept does not authorize production. OAuth sign-in does not establish ordinary ChatGPT quota. SDK control of Harness alone does not launch a native executor. Verify Session recovery, native executor resume and environment restoration separately. A new session cannot stand in for recovery, and SDK idle or final text cannot stand in for human acceptance.

## 2. Recommended architecture — local-first modular monolith <a id="2-推荐架构local-first-modular-monolith"></a>

On November 16, 2026, the user chose the existing DSH Web app, host and authentication for the first workbench. The task service owns its business database and each Run starts a dedicated runtime through the official TypeScript SDK. See the [deployment and ownership decision](../../.ai/tasks/dsh-tboard-00/decision.md).

### 2.1 Existing stack and storage ownership <a id="21-已有技术栈与存储归属"></a>

| Owner | PRD requirements | Implementation scope |
|---|---|---|
| Product task service | Business state, versions, launch intent, Delivery, human acceptance, directory/runtime leases | Establish a single state owner in G0. Implement database and migrations in TBOARD-02. |
| Harness | Session, model and tool facts, original permission semantics | Session logs own execution facts. The task database stores references and business records. |
| Harness Adapter | Create/restore Session, submit input, handle questions/approvals and stop the target runtime | Use the verified public TypeScript SDK and supported dsh profiles. |
| Executor | Native Codex/Codely loops, progress, results and supported cancellation/recovery | Verify each driver capability. A model provider cannot substitute for an executor. |
| UI | Chat, selectors, board, pending items and acceptance | Reuse the existing DSH Web host and authentication. |

### 2.2 Reuse of existing modules <a id="22-目录复用"></a>

Inspect SDK, Session, storage, workspace, sandbox, interaction, subprocess/jobs, workflow, deliverables and existing client extension APIs first. Existing code is a candidate for evaluation. It does not determine the new task model, state machine or review process. `.ai/tasks/` stores developer records only.

### 2.3 Processes and ownership <a id="23-进程边界"></a>

Execute serially by default. Each active Run owns a dedicated runtime linked to a real Session, persistent dshHome and normalized working directory. Closing the UI leaves execution running. Stop targets only the specified runtime. Retain ownership until exit is confirmed. Never let two control paths take over a Session simultaneously or automatically delete work.

## 3. Target semantics to map to existing types before implementation <a id="3-目标语义实施前映射现有类型不作为第二套已发布-schema"></a>

### 3.1 TaskSpec v1 — minimum executable objective <a id="31-taskspec-v1最小可执行目标"></a>

Persist objective, constraints, input artifacts, workspace, executor, acceptance criteria, risk, workflow version and authorization for formal tasks. Preserve task versions and Run input snapshots. Ordinary chat creates none of these execution objects. Main FR-EX-04 and Taskboard FR02/03 and section 11 specify the fields. This plan publishes no additional JSON Schema or executor defaults.

| Object | Required information |
|---|---|
| Project / Task | Directory, baseline, runtime configuration reference, title, objective/description, acceptance criteria, priority, labels, state and version |
| Run / SessionRef | Previous Run, frozen input, real Session, runtime, dshHome, compatible versions, directory lease and end reason |
| Delivery | Task, Run, requirement version, delivery version, code snapshot, per-criterion verification, known issues and unfinished items |
| Human Review | Specified Delivery and code fingerprint, accept/return decision, actor, reason and time |
| Event / Interaction / Lease | Source identity and cursor, real request identity and withdrawal, execution and directory ownership and reconciliation outcome |

### 3.2 States and transitions <a id="32-状态模型与转移"></a>

Use Taskboard section 7 Task states `backlog / todo / in_progress / in_review / blocked / done / canceled` and section 8 Run states `queued / preparing / running / finished / failed / canceled / interrupted`. Store control state and connection state separately. Waiting for an answer or approval need not block the business task.

At start, atomically check expected version, task/Session/directory ownership and idempotency key. Enter review only with a valid Delivery, ended Run, no pending questions or approvals and an identifiable snapshot. Only human acceptance sets done. Stopping a Run, canceling a Task and returning a Delivery are distinct. Retry and continuation create new Runs and retain history.

### 3.3 ExecutorAdapter v1 — language-independent behavior <a id="33-executoradapter-v1语言无关语义"></a>

Declare each driver capability verified, unsupported or unknown, including launch, progress, output, permission callbacks, cancel, result and resume. Use `external-agent` for engineering work. A model request alone does not establish native execution. Recovery must not automatically replay side effects. Explain unsupported operations without claiming success.

### 3.4 Verification and review <a id="34-verification--review-契约"></a>

For deterministic checks record the actual command, directory, exit code, evidence and uncovered risks. Never pass an unexecuted check. Trigger model review by workflow and `none / on-risk / required-by-user`. Record skipped when unrequested. A model accept, successful Run or passed checks cannot substitute for human acceptance of a Delivery. Disclose failed or unexecuted checks for review. A human must explain any waiver.

### 3.5 Conversations and events <a id="35-conversation--event-合约"></a>

DSH Sessions store model and tool facts. Product Events retain source identity, a product cursor and a redacted payload reference. Judge input acceptance, activity end, runtime exit and delivery acceptance separately. Deduplicate events, preserve terminal states on late arrivals and reconcile unknown input acceptance before resending. See main FR-RL and FR-MEM and Taskboard FR04/06/08/13.

### 3.6 Minimum memory behavior <a id="36-最小-memory-语义"></a>

Link Memory and Checkpoint to Task, Run and Workspace by reference. ContextBuilder selects relevant history, tasks, files and snapshots and records actual model-visible input. Rebuild context on provider switch. Import and fork do not restore official web sessions. Isolate authorization by project and do not copy sign-in cookies or credentials.

## 4. Milestones, dependencies and development tasks <a id="4-里程碑依赖与具体开发任务"></a>

Main PRD section 10 defines M0–M4. Taskboard section 15 defines G0–G4. P/CG/VN4 IDs track implementation. Current PRDs own scope and acceptance.

### P0 — Repository baseline and integration feasibility <a id="p0--repository-baseline--integration-spikes实施第一关"></a>

P0-01..06 identify historical code audits, mocks and provider/executor feasibility work. Sections 12–13 hold evidence. These do not replace Taskboard G0 or adopt old task-domain implementations as product requirements.

### P1 — V0 single-machine workflow after Web feasibility <a id="p1--v0单机最小闭环web-前置验证后推进"></a>

| ID | Delivery objective | Dependencies and acceptance sources |
|---|---|---|
| P1-01 | Types for TaskSpec/requirement versions, Task/Run/Delivery/human Review and verification, with JSON validation and error semantics | TBOARD-00, FR-EX-04, Taskboard FR02/03/10/12 and section 11 |
| P1-02 | Persist task records and Session references, transactions, migrations and backup | P1-01, TBOARD-01, Taskboard NFR03/07/09 |
| P1-03 | Expected versions, legal transitions, idempotent starts and durable launch intent | P1-02, Taskboard FR05, sections 7–8 and AC02/13/17 |
| P1-04 | Task and acceptance commands, actor and scope checks, event cursors and UI disconnect | P1-02, Taskboard FR04/06/13 and section 11 |
| P1-05 | Real SIWC and existing provider chat, status, credentials and lifecycle | FR-CP, FR-SIWC, UAT-01/02/07 |
| P1-06 | Chat/task context, input snapshots, Session/Run and Checkpoint references | FR-MEM, Taskboard FR03/08 |
| P1-07 | Independent Codex/Codely selection and common Run capability, event and cancel adapter | FR-EX-01..06, TBOARD-01 |
| P1-08 | Default serial queue, runtime/Session ownership and restart reconciliation | P1-02/03, Taskboard FR05/07/08, AC11–18 |
| P1-09 | Permissions, directories/worktrees, alias and nested-directory locks, stop isolation | FR-SEC, Taskboard FR01/07/09/13, AC12/15/18/19 |
| P1-10 | ValidationResult, per-criterion evidence, code snapshot and read-only diff | FR-EX-07, Taskboard FR10/11, AC05–08 |
| P1-11 | Optional model review, bounded repair and separate human acceptance, return and waiver | FR-EX-08..10, Taskboard FR12/14 |
| P1-12 | Chat and independent selectors, task/run details, pending interactions and acceptance | FR-CP/EX/TASK, TBOARD-07 |
| P1-13 | Complete demo on a verified configuration, release, backup/restore and upgrade guidance | TBOARD-09, all P0 features and AC01–AC20 |

M1 requires an end-to-end task through a supported provider, native executor and deterministic verification. The Taskboard MVP additionally requires G0–G2, AC01–AC20 and a real coding acceptance workflow. Track mock demos separately.

### P2 — V1 shared memory, recovery and agent handoff <a id="p2--v1共享记忆恢复与-agent-无缝替换"></a>

P2-01 scoped memory, P2-02 budgeted ContextBuilder, P2-03 artifact/verification/delivery references, P2-04 Task/Run restart and unknown-state reconciliation, P2-05 executor handoff in a new Run, P2-06 task-scoped call and repair budgets, P2-07 optional PlanRevision and versioned workflows. Sources are FR-MEM, FR-EX-06/08/09, FR-Q and Taskboard recovery requirements. Keep required G2 work in the MVP.

### P3 — V2 multi-PC workers and remote execution <a id="p3--v2多-pc-worker-与远程执行"></a>

P3-01..06 track node identity/capabilities, authorized channels, claim/lease/fencing, code and artifact synchronization, remote cancellation/recovery and independent node acceptance, respectively. Do not copy sensitive credentials across devices. This work is beyond the single-machine MVP.

### P4 — Extensions beyond V2 <a id="p4--后续扩展不阻塞-v2"></a>

Track optional main PRD M4 gateway, Scope Broker and tool bridge separately from Taskboard G3/G4 limited parallelism, dependencies, controlled claiming, teams and PR/CI. Agent-generated workflows, complex scheduling and a full editor stay outside the first release.

## 5. Shared development workflow for Codex and Codely <a id="5-开发协作codex-与-codely-一致执行规范"></a>

Follow [.ai/WORKFLOW.md](../../.ai/WORKFLOW.md) for claiming tasks, sole write ownership, checkpoints, Git safety and weekly quota stopping rules. Record applicable FR/AC/UAT, scope, actual validation and next step in every implementation Task. Keep developer records in `.ai` separate from product business data. Product workflows do not define developer coordination rules.

## 6. Test plan and failure injection matrix <a id="6-测试计划--故障注入矩阵"></a>

Main product acceptance uses UAT-01–16 in [main PRD section 11](../myPlan/DSH_PRD_vNext_4_2026-10-27.md#11-关键验收用例uat). Taskboard uses AC01–AC20 and the G0 integration matrix. The following T identifiers denote check categories in this plan.

| Category | Required evidence |
|---|---|
| T01 Data validation | Reject invalid or missing inputs, versions and scopes and launch without an acceptance criterion. |
| T02 Idempotency | Double-clicks, replay and database write failure after launch cause no additional execution. |
| T03 Lifecycle | Closing the UI preserves execution. Stop targets only the specified runtime. |
| T04 Recovery | Crashes, restarts, an old runtime still running and no resend of unknown input. |
| T05 Events | Original source, deduplication, reordering, broken streams and preservation of terminal states. |
| T06 Permissions | Allow, deny, cancel, revoke, late responses, configuration failure and path aliases. |
| T07 Provider | Capability mismatch, quotas, authentication, stream loss and explicit switching. |
| T08 Verification | Distinguish failed, not run and inapplicable from passed. Include selected untracked files in the code snapshot. |
| T09 Acceptance | Human acceptance, return and waiver, stale delivery and denial of unauthorized agent actions. |
| T10 Memory | Workspace isolation, complete references, and import without approval or process recovery. |
| T11 Executor | Independent selection, native loop and cancellation/recovery according to verified capability. |
| T12 Future workers | Stale-owner and concurrent-write protection in future cross-device scope only. |

## 7. Security, reliability and rollback <a id="7-安全可靠性和回滚要求"></a>

Execution and acceptance writes validate actor, task, runId, expected version and idempotency key. The server binds agent write scope. Default to loopback. Keep credentials out of tasks, logs, Memory and exports. Reject new execution and acceptance commands on disk or persistence failure. Acknowledge success only after persistence.

Backups include version, manifest and integrity checks. Restore into a new database or instance without active execution. Reject corrupt, incompatible or colliding imports without overwrite or merge. Import starts no process and replays no input or approval. Stop, termination and acceptance preserve directories. On incompatible upgrades preserve data and provide a recovery path.

## 8. Stage submission and acceptance template <a id="8-各阶段提交与验收模板"></a>

For each item record requirement ID, tested source fingerprint, versions, OS, profile, redacted configuration, Task/Run/Session/runtime identities, directory, actions, raw results, exit confirmation, persistence outcome and limitations. Distinguish PASS, FAIL, NOT_RUN and unsupported. Record static review, mock, real product process and real provider evidence separately.

### Project definition of done <a id="全项目-definition-of-done"></a>

Implement current PRD scope, pass deterministic checks and recorded replays, retain failure evidence for critical data, permission and recovery paths, provide reproducible user steps and complete human Taskboard acceptance. Existing unit tests or SDK functionality cannot substitute for end-to-end acceptance. G2 release requires more than a G1 demo.

## 9. Change control <a id="9-变更规则"></a>

Update both myPlan PRDs for requirement changes, then map the changes to tasks and acceptance here. Code, historical plans, old business examples and reference repositories do not create requirements. Retain evidence and completed code. Stop work on withdrawn scope without automatic resumption from an old checkpoint. Derive task status from implementation and acceptance of its current objective.

## 10. ChatGPT integration stages and current status <a id="10-chatgpt-接入增量阶段与现状审计"></a>

### 10.1 Verified implementation and gaps <a id="101-当前实现目标与缺口"></a>

| Capability | Verified scope | Outstanding product acceptance |
|---|---|---|
| Provider metadata, intent and precise capabilities | QR-01/02, known/unknown/unsupported and configuration ownership | Complete peer Web/SIWC UI and account lifecycle |
| Per-Turn selection and capability rejection | QR-03 real Web composition, controlled model and SDK replay | All explicit fallback flows and real-model GUI acceptance |
| Local budgets and payment authorization | QR-04 atomic request slots, Session cap, preset or per-use confirmation | Official balances, token/currency and Task budgets, and status display |
| Usage, source and accounting basis | QR-05/06 native records, preparation failures, attempt references and dialog | Full policy, Task, Run and external executor ledger |
| Taskboard | Local macOS G0, tasks and deliveries, restart recovery, real coding and human acceptance tested | Pending G2 performance retest on an 8-core, 16 GB Mac. See the [Taskboard checklist](#1210-taskboard-增量-checklist). |

### 10.2 Providers, execution modes and quotas <a id="102-provider执行模式与额度"></a>

Retain explicit sources `work_codex_shared / chatgpt_web_unofficial / api_metered / third_party / local / experimental_unverified / unknown`. Ordinary `chatgpt_regular` is outside DSH's active model providers. Display provider balances, adapter counts, local estimates and local budgets separately. Executor mode and authentication method do not determine the charging source.

### 10.3 Stage dependencies and ownership <a id="103-阶段依赖与任务归属"></a>

The controlled Web proof of concept passed. Follow with M0 independent selection and task contracts and G0 integration decisions and checks, then M1/G1 execution, verification, delivery and human acceptance, then G2 recovery and release. M2 production Web admission remains independent. CG IDs group provider, quota, task, reliability and tool-bridge work. Old incremental plans add no requirements.

### 10.4 CG1 tasks and acceptance <a id="104-cg1-的明确任务与验收"></a>

| ID | Requirements | Acceptance focus |
|---|---|---|
| QR-01 | FR-CP-02/03/05/06, FR-Q-01 | Three-state source and capability information, with unknown balances identified. |
| QR-02 | FR-EX-01..03, D-05/D-07 | Independent provider, executor, authentication and billing responsibilities. |
| QR-03 | FR-CP-04/05, FR-Q-02 | Capture actual route, reject capability mismatches, switch next Turn and confirm fallback. |
| QR-04 | FR-Q-02/03, FR-SIWC-03 | Local budgets, reserved execution quota and explicit consent to additional charges. |
| QR-05 | FR-Q-01, FR-RL-01 | Associate requests, actual routes, accounting basis, policy, Task and Run. |
| QR-06 | FR-CP-06, FR-Q-01/02 | UI for cost, unknowns, budgets, consent and fallback. |

### 10.5 Data ownership and decision log <a id="105-数据归属与-decision-log"></a>

The Task database owns business state, requirement versions, Runs, Deliveries and human Reviews. Harness Session logs own model and tool facts. Actual references connect the stores without duplicating execution authority. TBOARD-00 confirmed the Web Host task service as sole writer to the business database. Historical business models and mandatory planning/review do not define this product. Developer records and Git are outside the live task queue.

## 11. vNext.4 incremental implementation roadmap after P0 consolidation <a id="11-vnext4-增量实施路线p0-合并结果"></a>

This section maps main PRD D-01–D-10, FR modules and M0–M4 plus Taskboard requirements. Retain VN4 identifiers and use acceptance identifiers from the current PRDs.

| myPlan requirement scope | Implementation tasks | Acceptance source |
|---|---|---|
| FR-CP-01–06 | VN4-01/02, QR-01/03/06 | Main UAT-02/07/08/15 |
| FR-SIWC-01–04 | P1-05, QR-01/04 | Main UAT-01/07/08 |
| FR-WEB-01–05 | WB-01, VN4-06, optional entry in VN4-10 | Main UAT-02/07/08, D-09 |
| FR-EX-01–10 | P1-01/07/10/11/12, VN4-02..05, TBOARD-06 | Main UAT-03–06/13/15 and Taskboard delivery acceptance |
| FR-TB-01–05 | VN4-10, P3-07/08 | Main UAT-12/13 and M4 |
| FR-MEM-01–05 | P1-02/06, P2-01..05, VN4-08/11 | Main UAT-08/09/14 |
| FR-Q-01–03 | QR-01..06, P2-06 | Main UAT-10 |
| FR-RL-01–03 | VN4-07, P1-03/08, TBOARD-03/05/08 | Main UAT-11/16, Taskboard AC02/13/14/17 |
| FR-SEC-01–03 | VN4-09, P1-09, TBOARD-04/05 | Main UAT-07/12, Taskboard AC09/10/12/15/18/19 |
| FR-TASK-01–07, Taskboard FR01–FR14 | TBOARD-00..09, P1-01..04/08..13 | Taskboard AC01–AC20, NFR01–NFR09, G0–G2 |

| ID | Current objective | Tasks and acceptance sources |
|---|---|---|
| VN4-00 | Separate requirements from implementation and map tasks to the two current PRDs | Document verification only, no product acceptance |
| VN4-01 | Peer Web/SIWC providers with capability and cost metadata | QR-01..03, FR-CP/SIWC/WEB |
| VN4-02 | Select Provider/Executor/Workflow independently and pin to Turn/Run | P1-07/12, FR-CP-04, FR-EX-01/02, UAT-02/09/15 |
| VN4-03 | TaskSpec, requirement versions and optional Plan | P1-01..03, TBOARD-02, FR-EX-04, Taskboard FR02/03 |
| VN4-04 | Adaptive templates, user override and optional model review | P1-11, P2-07, main PRD 3.1/3.2, D-03/04/08 |
| VN4-05 | End-to-end supported provider and native Codex/Codely execution | P1-05/07/10, UAT-01/03/04/13/15 |
| VN4-06 | Controlled prerequisite Web validation and independent production integration | WB-01, FR-WEB-01..04, D-09, UAT-07/08 |
| VN4-07 | Attempts, submission receipts, terminal states, tool completion and budgets | QR-04/05, FR-RL, FR-Q, AC02/13/14/17 |
| VN4-08 | Task/Run/Memory/Checkpoint, recovery and import | P1-02/06, P2-01..05, FR-MEM, AC11/16/20 |
| VN4-09 | Protected credentials, permissions and approvals, directory isolation and redaction | P1-09, TBOARD-04/05, FR-SEC, AC09/10/12/15/18/19 |
| VN4-10 | Optional inbound gateway, Scope Broker and tool bridge | P3-07/08, FR-TB, M4 |
| VN4-11 | Future workers, cross-device use, diagnostics and reliable upgrades | P3-01..06, FR-MEM-05, M3, Taskboard G4 |

### 11.1 Historical requirements and decision conflicts <a id="111-旧需求处理与决策冲突"></a>

The old fixed Planner/Reviewer pipeline, prescribed business state machine, core rebuild, universal ACP prerequisite and fixed division of Codex/Codely work are outside current requirements. Use main D-01–D-10 and the Taskboard PRD. Section 16.1 records the TBOARD-00 entry decision.

## 12. Current checklist and task evidence <a id="12-有效-checklist-与任务证据"></a>

DONE indicates evidence for the stated row scope. PARTIAL indicates validation of part of its current objective. TODO indicates no matching implementation acceptance yet. Track underlying infrastructure and product tasks separately. An older business database, generic jobs or existing Sessions do not establish Taskboard functionality. Document edits do not pass unchecked UAT or AC cases.

### 12.1 P0 baseline and feasibility (Gate 0) <a id="121-p0基线与可行性验证gate-0"></a>

| ID | Status | Validation and limits |
|---|---|---|
| P0-01 | DONE | Historical code and environment baseline audit. Taskboard completion requires separate evidence. |
| P0-02 | DONE | Mock errors and transport recovery foundations. Full real-account paths remain unverified. |
| P0-03 | DONE | The user waived the API-key route. Its result remains NOT_RUN. SIWC product acceptance remains PARTIAL. |
| P0-04 | DONE | Native Codely process, local controlled model and adapter probes. Unified Run acceptance pending. |
| P0-05 | DONE | Controlled model, permissions, cancellation and cleanup on the pinned Codex product and adapter. No claim of native resume. |
| P0-06 | DONE | Historical feasibility baseline consolidated. Current architecture and ownership follow myPlan/G0. |

See the [baseline](../../.ai/tasks/dsh-p0-baseline/handoff.md), [executor probes](../../.ai/tasks/dsh-p0-executor-probes/handoff.md) and [SIWC probe](../../.ai/tasks/dsh-p0-siwc/handoff.md) for evidence. Current requirements come from the PRDs.

### 12.2 P1 / V0 single-machine MVP workflow (highest priority) <a id="122-p1--v0单机-mvp-闭环最高优先"></a>

| ID | Status | Verified and outstanding work |
|---|---|---|
| P1-01 | PARTIAL | Web/SQLite links Run input, delivery and human decisions to their respective requirement versions after recovery. [Local acceptance](../../.ai/tasks/dsh-p1-revision-lineage/handoff.md). [Execution constraints](../../.ai/tasks/dsh-p1-task-constraints/handoff.md) are present in requirement history, SDK input and the task-read tool. [SDK route confirmation](../../.ai/tasks/dsh-p1-confirmed-sdk-route/handoff.md) covers configuration changes and old command replay. [SDK patch content checks](../../.ai/tasks/dsh-p1-sdk-patch-identity/handoff.md) cover replacement at the original path after queueing and continuation of old Sessions. [Risk level](../../.ai/tasks/dsh-p1-task-risk/handoff.md) is tied to the revision and confirmed input. [SDK launch authorization](../../.ai/tasks/dsh-p1-run-authorization/handoff.md) distinguishes an operator-confirmed route from deployment defaults. [Quick and standard workflows](../../.ai/tasks/dsh-p1-versioned-workflow/handoff.md) bind to the revision and SDK input. The [per-Run TaskSpec](../../.ai/tasks/dsh-p1-run-task-spec/handoff.md) includes workspace baseline, materials and launch authorization. [Native executor authorization](../../.ai/tasks/dsh-p1-native-executor-selection/handoff.md) links operator command and Run and is checked on backup restoration. |
| P1-02 | DONE | Local Web/SQLite commits tasks and activity atomically. [Recovery and compatible upgrades](../../.ai/tasks/dsh-tboard-08/handoff.md) and [a second business backup restore](../../.ai/tasks/dsh-p1-business-backup/handoff.md) passed. Two Run receipts match two original Session inputs. Restored deliveries and human decisions persist. A Run canceled in the queue retains that state. [Recovery history checks](../../.ai/tasks/dsh-p1-restored-run-chain/handoff.md) cover start order and Session/receipt links. [Returned-feedback recovery](../../.ai/tasks/dsh-p1-review-feedback-recovery/handoff.md) matches the original human command to the next Run input. |
| P1-03 | DONE | macOS Web/SQLite and the official SDK verified expected versions, legal transitions, durable intent before launch, idempotent replay and crash reconciliation. Original and queued Runs retain one start record each. Unknown inputs are never resent. [UAT-16 file append](../../.ai/tasks/dsh-p1-recovery-side-effects/handoff.md) verified one write after restart and command replay. [Local acceptance](../../.ai/tasks/dsh-p1-start-reconciliation/evidence/local.json). |
| P1-04 | DONE | Authenticated workbench task and human acceptance commands, roles and project scopes were tested. [Browser reconnect catch-up](../../.ai/tasks/dsh-p1-board-reconnect/handoff.md) preserves the current task and displays a replayed comment once. The [task activity cursor](../../.ai/tasks/dsh-p1-activity-cursor/handoff.md) pages by commit order and resumes from the last read position after host restart or backup restore. |
| P1-05 | PARTIAL | Evidence covers SIWC loader, configuration, persistence, cancellation and production adapter replay. Real-account long responses and lifecycle acceptance remain pending. |
| P1-06 | PARTIAL | Each Taskboard Run retains requirements, constraints, return feedback and selected files. SDK, receipt recovery and [historical input view](../../.ai/tasks/dsh-p1-run-input-history/handoff.md) share one input projection. [Continuation position validation](../../.ai/tasks/dsh-p1-restored-session-position/handoff.md) rejects Session copies whose receipts or observed events differ from the original. The [previous recovery position](../../.ai/tasks/dsh-p1-run-checkpoint-reference/handoff.md) is included in the acceptance transaction, launch window, historical input and project handoff. General Chat/Task ContextBuilder and ContextEpoch integration remain pending. |
| P1-07 | PARTIAL | [Per-Run Codex/Codely selection](../../.ai/tasks/dsh-p1-native-executor-selection/handoff.md) passed browser and official SDK verification. Native adapters use leased directories. The queue resumes after stopping an active Run. Missing adapters and invalid deliveries produce failure records. [Native file changes and permissions](../../.ai/tasks/dsh-p1-native-file-evidence/handoff.md) checked actual isolated worktree writes, denial receipts and the Git diff on the human acceptance page. [Native tool activity in Run history](../../.ai/tasks/dsh-p1-native-run-activity/handoff.md) displays protocol-reported tool and permission counts and restores from backups. [Cross-process continuation probes](../../.ai/tasks/dsh-p1-native-resume-probe/handoff.md) recovered the first exchange through a persistent Codex thread and a Codely-specific ACP extension. Taskboard currently enables new sessions only. Per-Run persistent-session authorization, native history checks and dispatch of continued work remain pending. |
| P1-08 | DONE | The initial macOS Web/SDK serial queue, Session continuation, lease release and host restart reconciliation passed. Force-stop timeout retains the directory. The waiting queue resumes after both execution scopes exit. [Local acceptance](../../.ai/tasks/dsh-p1-queue-recovery/evidence/local.json). |
| P1-09 | DONE | The initial macOS workbench passed AC12/15/18/19. Nested aliases serialize with the original worktree while an independent worktree can proceed. Permission activation failure sends no input, force-stop timeout retains the directory and only confirmed target process-scope exit permits further work. [Directory lease and stop isolation](../../.ai/tasks/dsh-p1-workspace-lease-acceptance/handoff.md). |
| P1-10 | DONE | [Workbench delivery](../../.ai/tasks/dsh-tboard-06/handoff.md) includes evidence per criterion, code snapshot and read-only diff. [Project-enabled Git checks](../../.ai/tasks/dsh-p1-delivery-git-check/handoff.md) cover host results, human waivers and recovery. [ValidationResult](../../.ai/tasks/dsh-p1-validation-results/handoff.md) links the delivery fingerprint, actual exit code and reason for an unexecuted check. [npm project build and test](../../.ai/tasks/dsh-p1-project-script-validation/handoff.md) passed on the official SDK and packaged install, including failure reasons, human acceptance and child exit. [Custom npm/pnpm check scripts](../../.ai/tasks/dsh-p1-custom-project-scripts/handoff.md) verified exit codes, human acceptance and backup restore in both source-built and independently installed macOS Web/SDK. |
| P1-11 | PARTIAL | Human acceptance, return and waiver persist per delivery. [Past decisions are inspectable on the delivery page](../../.ai/tasks/dsh-p1-human-review-history/handoff.md). [Successful delivery without model review](../../.ai/tasks/dsh-p1-model-review-status/handoff.md) passed. The [downloadable per-delivery review summary](../../.ai/tasks/dsh-p1-review-package/handoff.md) contains coverage evidence with project text removed. [Requested model review](../../.ai/tasks/dsh-p1-optional-coverage-review/handoff.md) verified redacted input, explicit retry, attempt limits and recovery. [Human-authorized repair and renewed acceptance](../../.ai/tasks/dsh-p1-reviewed-repair/handoff.md) passed on a separately installed Web Host, with build exit changing from 17 to 0. The review model used an OpenAI-compatible loopback endpoint. Live model quality remains unverified. |
| P1-12 | PARTIAL | Evidence covers chat, model selection and usage confirmation. The [workbench](../../.ai/tasks/dsh-tboard-07/handoff.md) supports task and Run details, pending requests, delivery review and human acceptance. [Quick/standard workflow selection](../../.ai/tasks/dsh-p1-versioned-workflow/handoff.md) covers operator and team edits. [Milestone plans](../../.ai/tasks/dsh-p1-milestone-workflow/handoff.md) verified stage-by-stage authorization, return and final acceptance. [Per-Run native executor selection](../../.ai/tasks/dsh-p1-native-executor-selection/handoff.md) covers launch confirmation, delivery pending acceptance and authorization record recovery. |
| P1-13 | PARTIAL | macOS arm64 [packaged acceptance](../../.ai/tasks/dsh-p1-packed-workbench/handoff.md) verified fresh npm installation, Web/SQLite restart, SDK delivery and a second restore from the browser. [Upgrade/rollback across two actual builds](../../.ai/tasks/dsh-p1-upgrade-rehearsal/handoff.md) retained original revisions and activity. The [real OpenAI coding workflow](../../.ai/tasks/dsh-tboard-09/acceptance.md) has independent evidence. [Packaged OpenAI configuration](../../.ai/tasks/dsh-p1-openai-deployment/handoff.md) passed a local protocol retry check. [Packaged restore verification](../../.ai/tasks/dsh-p1-package-recovery-acceptance/handoff.md) covers the new recovery position, delivery checks and 27 workbench Web regressions. G2 reference-machine performance retest remains pending. |

### 12.3 P2 / V1 memory, context optimization and executor replacement <a id="123-p2--v1记忆上下文优化替换执行器"></a>

P2-01 TODO, P2-02 PARTIAL (Session/context foundations exist), P2-03 TODO, P2-04 TODO, P2-05 PARTIAL (adapter foundation, task handoff acceptance pending), P2-06 TODO, P2-07 TODO. Required Taskboard backup and recovery stay in G2. Later identifiers cannot postpone MVP requirements.

### 12.4 P3 / V2 multi-PC workers and remote execution <a id="124-p3--v2多-pc-worker-与远程执行"></a>

P3-01..06 are TODO. Product evidence for independent nodes, permissions, expired ownership and recovery is pending. See the QR checklist for the P3-07/08 optional tool bridge. An existing MCP client does not establish completion.

### 12.5 P4 follow-up work <a id="125-p4后续待办不阻塞"></a>

Taskboard G3 limited concurrency, dependencies and controlled claiming passed locally. G4 verified team roles, delivery records and human decisions. The draft PR is deferred. Cross-device and remote-node checks are pending. See the [workbench checklist](#1210-taskboard-增量-checklist). Dynamic workflows, complex scheduling and an editor from the main PRD remain pending.

### 12.6 Cross-stage acceptance cases <a id="126-贯穿全程的验收案例"></a>

[UAT-06](../../.ai/tasks/dsh-p1-model-review-status/handoff.md) passed on the launch macOS Web/SDK path. With project checks passing and no model review requested, the operator can see the results and decide independently whether to accept. Verify remaining UAT cases against the [main PRD](../myPlan/DSH_PRD_vNext_4_2026-10-27.md#11-关键验收用例uat). The [acceptance matrix](../../.ai/tasks/dsh-tboard-09/acceptance.md) lists measured Taskboard AC01–AC20 and NFR coverage.

### 12.7 Task evidence ledger <a id="127-任务证据台账执行时逐行补充"></a>

Section 12.8 holds provider/quota/usage evidence, section 12.10 covers Taskboard and section 13 defines P0 scope. Record a fixed source fingerprint and actual operations for each new result. A branch name cannot identify a fixed tested version. The current changes have not been committed or pushed. Recheck actual Git state at handoff.

### 12.8 ChatGPT integration checklist <a id="128-chatgpt-增量计划清单"></a>

Sections 10–11 define tasks, module ownership, dependencies and acceptance. This checklist records the status of those same tasks.

- [x] **CG-00 [DONE]** Consolidated old and new plan audits, gap matrix, decision log, implementation evidence and Memory in a documentation-only step. Three named bilingual pairs, scoped links/wrapping/file endings, repository references and 22 documentation-standard tests passed. Historical totals were 18 passed/2 failed for test:docs and 33/9 for doc-sync, with references subsequently fixed and checked separately. See the [checkpoint](../../.ai/tasks/dsh-chatgpt-plan-update/handoff.md) for limitations. P1/CG1 subsequently received authorization. The QR rows below record current status.
- [x] **QR-01 [DONE]** Evidence covers parsing and acceptance of LlmProviderInfo.policy, usageSource, three-state capabilities, unknown balances, experimental admission, SIWC shared usage source, pi-ai policy configuration and explicit intent/capability requirements. See [metadata](../../.ai/tasks/dsh-p1-provider-policy/handoff.md), [configuration](../../.ai/tasks/dsh-p1-provider-config/handoff.md) and [intent](../../.ai/tasks/dsh-p1-intent-routing/handoff.md). VN4-01/02 and CG1 acceptance remain separate.
- [x] **QR-02 [DONE]** Verified independent Auth, Provider, Executor and cost declarations. Loader regressions cover independent credential/policy updates, stored OAuth account replacement and deletion, explicit key precedence and rejection when missing. Evidence covers isolation of model, environment and permissions between Codex instances, and Codely loader execution without a model turn. Both Codex modes exist. Codely external-agent is a local example and native-model remains unknown. Old plugin names were not found as independent packages and no plugin was removed. See [initial evidence](../../.ai/tasks/dsh-p1-auth-route-separation/handoff.md) and [OAuth/execution configuration acceptance](../../.ai/tasks/dsh-p1-oauth-route-composition/handoff.md). Scope is configuration ownership and mode audit. Real accounts and lifecycle and unified Run/UI belong to P1-05/07 and VN4-02.
- [ ] **QR-03 [PARTIAL]** Opt-in chat/plan/review/execute routes capture explicit providers and models per Turn, reject unknown/unsupported required capabilities and do not silently switch routes on failure. [Vision admission](../../.ai/tasks/dsh-p1-exact-model-vision/handoff.md) checks exact-model inputModalities and includes replay of rejection for unknown and text-only models. [Tool support](../../.ai/tasks/dsh-p1-model-tool-support/handoff.md) adds a three-state toolSupport declaration and pi-ai configuration/hot-update acceptance. [Streaming](../../.ai/tasks/dsh-p1-model-streaming-support/handoff.md) checks the exact model's three-state streamingSupport. [Entry model routing](../../.ai/tasks/dsh-p1-entry-model-routing/handoff.md) connects `selection: entry` to the existing entry selector and verifies Turn pinning, next-turn switching and consistent messaging. [Keyless browser acceptance](../../.ai/tasks/dsh-p1-entry-routing-web-acceptance/handoff.md) in the real Web composition checks selector, actual request, tool step, next-turn switch and user-selected recovery after rate limit, quota or stream failure. [Native structured output](../../.ai/tasks/dsh-p1-native-structured-output/handoff.md) covers strict JSON Schema, exact-model structuredOutputSupport, completion validation and headless/both-SDK replays. [Resume semantics](../../.ai/tasks/dsh-p1-resume-semantics/handoff.md) distinguish provider-native persistence, DSH history replay/Session restoration and external executor continuation. pi-ai rejects unsupported claims. Native executor recovery implementation, real-model GUI/GIF, explicit fallback and full acceptance remain pending. QR-02 configuration responsibilities passed.
- [ ] **QR-04 [PARTIAL]** Optional paid-route-policy requires advance consent for a specific Provider/model declared api_metered. See [paid-route acceptance](../../.ai/tasks/dsh-p1-paid-route-consent/handoff.md). Optional [request-budget-policy](../../packages/guard/request-budget-policy/README.md) uses atomic SQLite receipts to protect local request slots across hosts and reserve slots for explicit execution intent. Reserve/commit/cancel/settle transitions are idempotent. Confirmed undispatched cancellation refunds the slot. A crash conservatively retains it. [Budget acceptance](../../.ai/tasks/dsh-p1-local-request-budget/handoff.md) covers real Loader/Settings, two built dsh Hosts, restart and replay. Optional `maxRequestsPerSession` uses the same atomic receipt to cap local calls per exact Session ID, including auxiliary calls and all intents, reject missing identity, refund canceled calls and retain occupancy after restart. See [Session budgets](../../.ai/tasks/dsh-p1-session-request-budget/handoff.md). Optional `onMissingGrant: ask` uses the existing approval panel for each metered native API request. Authorization precedes reservation, permission is rechecked before sending, and denial or cancellation consumes no local slot. See [per-use consent](../../.ai/tasks/dsh-p1-paid-route-interactive/handoff.md). These caps count local requests per budget. Official shared balance lookup, token/currency budgets, task caps, budget display and credit protection remain pending. Depends on QR-03.
- [ ] **QR-05 [PARTIAL]** Optional `token-meter/request-records` logs settled native dispatch route, captured usageSource, terminal state and adapter counts in the active local Session log, with a bounded source/count projection. Session ID and committed sequence identify records. Prompts, response bodies and credentials are excluded. Only the last duplicate sample counts, and retry dispatches have separate records. [Accounting acceptance](../../.ai/tasks/dsh-p1-usage-records/handoff.md) covers real headless, both SDKs and negative controls. Adapter counts may be estimates and do not establish official billing or balances. Pre-dispatch failures observed by the native preparation owner have a separate `preparationFailures` audit and do not count as settlements. See [preparation failure acceptance](../../.ai/tasks/dsh-p1-preparation-records/handoff.md) for real composition, both SDKs, retained V3 input and negative controls. Loop requests are attributed by owning Session, committed `step/start` sequence and within-step attempt number, including retries, isolated concurrent auxiliary calls and restored built hosts. Legacy ownership is never inferred. See [request attribution](../../.ai/tasks/dsh-p1-request-attempt-link/handoff.md). Optional accounting basis propagates through `TokenUsage`, settlement records, cache, SDK and Turn details with provider-reported, estimated, unknown and mixed cases. Direct DeepSeek calls claim reported counts only when both raw input and output counts were observed. pi-ai/SIWC do not infer them. See [accounting basis and negative controls](../../.ai/tasks/dsh-p1-usage-measurement/handoff.md). Official billing verification, full policy decisions, other outer-layer rejections, unsettled crashes, Task/Run association and external executor accounting remain pending. Depends on QR-01/04.
- [ ] **QR-06 [PARTIAL]** The Turn usage dialog shows provider/model and cost source using the logged explicit attempt reference. Missing, duplicate or mismatched sources show unknown. Changing the current model does not backfill history. The optional [request-accounting overlay](../../apps/cli/config/examples/request-accounting.yml) passed real Web composition with a controlled native model, V3/V4 Session replay, light/dark themes and 420px window/close behavior. See [usage source evidence](../../.ai/tasks/dsh-p1-turn-usage-source/handoff.md). The existing approval panel also verified opt-in per-use confirmation of native metered requests. See [approval and SQLite integration](../../.ai/tasks/dsh-p1-paid-route-interactive/handoff.md). This is keyless controlled-model evidence. Official balances, budget status, full fallback UI and real-account/GIF acceptance remain pending. Depends on QR-03/04/05.
- [ ] **P3-07 [TODO]** Under FR-TB-01/04 expose scoped MCP Gateway capabilities including `task.create/status/result/cancel`, `workspace.inspect` and `artifact.read`, with approval, revocation and audit.
- [ ] **P3-08 [TODO]** Under FR-TB-02/03/05 verify optional tool round trips and Tool Host capabilities. Long jobs promptly return a Task ID for later status queries. Depends on P3-07 and workspace authorization.
- [x] **WB-01 [DONE]** Real Browser-only exchange and minimum DSH adapter integration passed. Ordered reference DEV evidence covers a real unique-marker round trip, client cancellation and local cleanup. On November 2, 2026 a separately admitted restricted worker and bridge adapter completed one real DSH request. Session evidence covers exact marker echo, Responses completed, actual usage on an estimated basis, routing, no local tools, thread/Turn linkage, attribution and worker cleanup. Three actual pre-submission failures consumed no model usage. Cancellation evidence stops at the adapter because the SDK has no wire-level cancel. Default production controls stayed active, with no production admission. See [dsh-web-real-request.json](../../.ai/tasks/dsh-web-provider-poc/evidence/dsh-web-real-request.json) and the [task record](../../.ai/tasks/dsh-web-provider-poc/handoff.md).

Full routing and quota acceptance remains pending for default selection, capability mismatch, unknown balances, limits, unavailability, stream interruption, explicit fallback and blocking extra charges under FR-CP, FR-Q and FR-RL. QR-01/02 completion covers metadata and configuration only. VN4-01/02 and Taskboard are tracked separately.

### 12.9 vNext.4 incremental checklist <a id="129-vnext4-增量-checklist"></a>

| ID | Status | Scope |
|---|---|---|
| VN4-00 | DONE | Implementation mapping and evidence classifications for both current PRDs. Documentation completed, product acceptance separate. |
| VN4-01 | PARTIAL | Metadata, routing and controlled Web validation. Complete peer provider UI pending. |
| VN4-02 | TODO | Independent product-level Provider/Executor/Workflow selection and Run binding. |
| VN4-03 | PARTIAL | [Workbench TaskSpec v1](../../.ai/tasks/dsh-p1-run-task-spec/handoff.md) links revisions, workspace, materials and SDK authorization. Standard tasks can retain ordered human steps. General native executor and separate plan integration remain pending. |
| VN4-04 | PARTIAL | [Workbench template selection](../../.ai/tasks/dsh-p1-versioned-workflow/handoff.md) offers versioned quick and standard workflows. [Optional model review](../../.ai/tasks/dsh-p1-optional-coverage-review/handoff.md) passed delivery-page acceptance. [Milestone workflow](../../.ai/tasks/dsh-p1-milestone-workflow/handoff.md) integrates the official SDK. Adaptive routing remains pending. |
| VN4-05 | PARTIAL | Supported provider and native executor foundations exist. Complete product workflow pending. |
| VN4-06 | DONE | Controlled Web proof of concept only. M2 and production admission remain open. |
| VN4-07 | PARTIAL | Native attempt references, budgets and failure foundations. Unified Runs, receipts and completion barriers pending. |
| VN4-08 | PARTIAL | Session import and recovery foundations. Task/Memory/Checkpoint relationships pending. |
| VN4-09 | PARTIAL | Credential, approval and sandbox foundations. Full task isolation and storage acceptance pending. |
| VN4-10 | TODO | Optional inbound tool bridge. Active Native Tool Host capability unconfirmed. |
| VN4-11 | TODO | Cross-device workers and recovery. |

### 12.10 Taskboard incremental checklist <a id="1210-taskboard-增量-checklist"></a>

The following rows track product decisions, integration validation and feature implementation separately.

| ID | Status | Current delivery focus |
|---|---|---|
| TBOARD-00 | DONE | [Initial entry and ownership decision](../../.ai/tasks/dsh-tboard-00/decision.md) confirmed. SDK combination acceptance belongs to TBOARD-01. |
| TBOARD-01 | DONE | All eight G0 cases in Taskboard section 10 passed on this branch. Directory changes create a new Session. Old and new Runs retain references. Users select inherited material explicitly. The local macOS combination is pinned. [Matrix and tested scope](../../.ai/tasks/dsh-tboard-01/matrix.md). |
| TBOARD-02 | DONE | [Task database acceptance](../../.ai/tasks/dsh-tboard-02/handoff.md) covers existing Web authentication, projects and tasks, requirements and Run snapshots, delivery and human Review, requests and leases, version conflicts, order, archive, restart and replay. Scheduling, real code inspection and UI integrate in subsequent steps. |
| TBOARD-03 | DONE | Authenticated Web passed serial dispatch, input receipt, cancellation and recovery. The official macOS SDK path waits for the full launchd scope to exit before releasing the lease and continuing the queue. [Device evidence](../../.ai/tasks/dsh-tboard-03/evidence/macos-launchd-scope.json). |
| TBOARD-04 | DONE | Verified worktree base, reconfirmation for original directories, [targeted stopping of identifiable tool processes](../../.ai/tasks/dsh-tboard-04/evidence/controlled-stop.json), [retained leases after unconfirmed force-stop](../../.ai/tasks/dsh-tboard-04/evidence/stop.json) and [blocked input on invalid approval configuration](../../.ai/tasks/dsh-tboard-04/evidence/permission.json). [Launch uses the macOS G0 combination](../../.ai/tasks/dsh-tboard-04/platform.md). [Launch-platform retest](../../.ai/tasks/dsh-cross-device-handoff/evidence/macos-receipt.json) covers a fixed tool exiting, unknown scope and observation timeout. |
| TBOARD-05 | DONE | [Events, interactions and task tools](../../.ai/tasks/dsh-tboard-05/handoff.md). |
| TBOARD-06 | DONE | [Delivery snapshots, read-only diff and human acceptance](../../.ai/tasks/dsh-tboard-06/handoff.md). |
| TBOARD-07 | DONE | [Board, details, pending items, settings and exceptions](../../.ai/tasks/dsh-tboard-07/plan.md). |
| TBOARD-08 | DONE | [Restart reconciliation, export/backup restore and upgrade](../../.ai/tasks/dsh-tboard-08/plan.md). |
| TBOARD-09 | BLOCKED | [Real coding acceptance passed. Reference-machine performance retest pending](../../.ai/tasks/dsh-tboard-09/plan.md). |
| TBOARD-10 | DONE | Limited concurrency, parent/child tasks, prerequisite acceptance and one-time automated claiming passed macOS Web/SDK verification. [Concurrency, targeted stop and crash recovery evidence](../../.ai/tasks/dsh-tboard-10/evidence/macos-parallel.json). |
| TBOARD-11 | IN_PROGRESS | Local team accounts, project permissions, two-user edit conflicts and reauthorization after recovery passed. [Actual commit and push CI](../../.ai/tasks/dsh-tboard-11/evidence/branch-ci.json) are linked, and [human acceptance survived restart](../../.ai/tasks/dsh-tboard-11/evidence/accepted-restart.json). Draft PR deferred. Remote nodes and cross-device recovery pending. [Checkpoint](../../.ai/tasks/dsh-tboard-11/handoff.md). |

## 13. P0 executor capabilities and implementation baseline (October 30, 2026) <a id="13-p0-执行器能力与实施基线2026-10-30"></a>

### 13.1 Actual versions, protocols and capabilities <a id="131-实际版本协议与能力"></a>

The [executor probe record](../../.ai/tasks/dsh-p0-executor-probes/handoff.md) identifies the pinned Codex product, native Codely process, controlled local model and evidence for permissions, errors, cancellation and exit. Conclusions apply to the tested versions and configurations. Track native streaming separately from the final result DSH projects. Untested resume, cloud services and active tool hosts remain unknown or unsupported.

### 13.2 P0 implementation decisions <a id="132-p0-定稿的实施选择"></a>

Keep providers and executors independent, use supported launch paths, retain original permission semantics and Session facts. Current myPlan/G0 decisions govern entry, business state and task data. Do not continue historical task workflows outside current PRD scope. The P0 probe neither supplies a current version matrix nor replaces Taskboard G0.

## 14. Current P1 implementation scope <a id="14-p1-当前实现范围"></a>

With the corresponding configuration, users can verify per-Turn native model selection, exact capability rejection, local request budgets and Session caps, preset or per-use API confirmation, native settlements and preparation failures, and routes, cost sources and accounting basis in the usage dialog. See the [provider guide](../user/guide/providers.md) and section 12.8 task evidence for steps, controlled models and limits.

The local macOS Web workbench creates and revises tasks, displays each Run's input, delivery diff and checks, and lets the operator accept or return delivery. SQLite supports offline upgrades, compatible rollback and metadata backup restoration. See [workbench acceptance](#1210-taskboard-增量-checklist). Full SIWC lifecycle, Web production admission, official balances, Task budgets, complete fallback and independent Provider/Executor/Workflow product selection remain pending.

## 15. First validation priority — Web ChatGPT provider feasibility <a id="15-当前第一优先web-chatgpt-provider-可行性验证"></a>

The prerequisite under FR-WEB-02/D-09 has controlled proof-of-concept evidence. WB-01/VN4-06 completion is limited to that scope. Assess minimal reference-web round trip, DSH request/Session integration and production admission separately. Production remains gated. Reference code, manual browser use and mocks do not establish production verification.

[Proof-of-concept evidence](../../.ai/tasks/dsh-web-provider-poc/evidence/dsh-web-real-request.json) and the [checkpoint](../../.ai/tasks/dsh-web-provider-poc/handoff.md) record the restricted worker's real unique-marker round trip, terminal state, absence of local tools, request association and cleanup. Cancellation evidence does not promise server-side termination or quota refund. M2 still needs peer UI, state and diagnostics, lifecycle checks for sign-in, disconnection, limits and uncertain submission, and separate production admission. This evidence does not pass Taskboard G0.

## 16. Taskboard incremental implementation plan <a id="16-taskboard-增量实施计划"></a>

This section implements [main PRD sections 9.3–9.4](../myPlan/DSH_PRD_vNext_4_2026-10-27.md#93-任务工作台-mvp) and the [Taskboard PRD v0.1](../myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md). The Taskboard PRD owns detailed behavior. This section assigns repository work, dependencies, acceptance and open issues. See [section 12.10](#1210-taskboard-增量-checklist) for status. The two myPlan PRDs are the only requirement sources. Implementation candidates add no requirements.

### 16.1 Entry and data decisions <a id="161-入口与数据决策"></a>

TBOARD-00 addresses the following differences first. Record G0 decisions, technical validation and feature completion separately. Propose architectural changes through existing Agent Notes. Keep formal decisions and released data intact until confirmation. Use the existing ADR structure.

| Topic | Taskboard proposal and repository decision |
|---|---|
| Product entry | Workbench page in DSH Web with existing host and authentication. The task service runs with the host. Closing the browser leaves execution running. |
| Task and Session | The task service owns the business database and human acceptance records. Each Run references the Session owned by its SDK runtime. Harness Session logs own model and tool facts. |
| SDK and Executor | The TypeScript SDK Adapter controls the Harness Session. Codex and Codely remain independent executors, requiring separate external agent validation. Use supported dsh profiles without package bins or argv escape paths. |
| State and Review | Map Taskboard Task/Run states to section 3. Distinguish human Review from model ReviewDecision. Only user acceptance of the current valid Delivery completes the task. Preserve old data replay and version migration requirements. |
| Tools and costs | The MVP task-scoped tool bridge provides only scoped read, progress, comment, delivery and blocker operations. The optional inbound FR-TB MCP Gateway is separate. Later Taskboard budgeting must preserve QR charge authorization. |
| Release combination | G0 freezes launch OS, Harness/SDK/runtime versions, profile/model configuration, permission capabilities and backup directory. Claim support only for tested combinations. Estimate duration after G0 without promising a release date. |

### 16.2 Mapping stages to the roadmap <a id="162-阶段与现有路线映射"></a>

Taskboard P0 is the full G0–G2 MVP. Release requires more than a G1 demo. Scope G3/G4 extensions separately. Cross-machine work remains in the main plan's V2 and is outside MVP prerequisites.

| Taskboard stage | Main plan work reused | Exit criteria |
|---|---|---|
| G0 Integration validation | P0-06, P1-07/09, VN4-02/09, TBOARD-00/01 | Decide entry and state owner. Pass all real integration cases in Taskboard section 10 and freeze version/OS/configuration matrix. |
| G1 Task lifecycle | Taskboard portions of P1-01..04/07..12 and P2-03, TBOARD-02..07 | Pass AC01–AC10, including delivery through human acceptance/return. Implement idempotent start and directory locks before any real execution. |
| G2 Recovery and release | Taskboard portions of P1-13 and P2-04, TBOARD-08/09 | Pass AC11–AC20 and all P0 requirements. Complete real coding, retry after failure, delivery, return and renewed acceptance. |
| G3 Extensions | P2-07 and Taskboard extensions, TBOARD-10 | New permission and concurrency regressions cover parallelism, dependencies and automatic claiming. |
| G4 Team collaboration | P3-01..06, future PR/CI integration, TBOARD-11 | Independently verify identity/roles, collaborative editing, remote nodes and cross-device recovery. |

### 16.3 Claimable tasks and acceptance mapping <a id="163-可领取任务与验收映射"></a>

TBOARD identifiers identify Taskboard gaps within P1/P2 without duplicating general Session, Task API or Executor work. FR/AC/NFR are Taskboard PRD identifiers. T/UAT retain their numbering. Combine the minimum Taskboard dependencies below with general capability dependencies in section 11. The Web workbench, restart reconciliation and backup restore passed. TBOARD-09 passed real OpenAI coding. G2 awaits reference-hardware performance retesting.

| ID and stage | Related tasks and candidate owners | Dependencies | Minimum delivery and acceptance |
|---|---|---|---|
| TBOARD-00 / G0 | Main PRD 9.4/D-10, SDK, runtime, Session, storage | Requirements here and current source audit | Section 16.1 decisions, compatibility matrix plan and gaps, FR01 and NFR09. Use existing Web entry. |
| TBOARD-01 / G0 | P1-07/09, sdk/client, server, protocol, interaction, subprocess | TBOARD-00 | Real Session creation, two successive executions on one task, restore after shutdown, approval allow/deny/cancel, user questions, two-instance stop isolation, directory tracking and no duplicate execution after service interruption. Pass every Taskboard section 10 case. |
| TBOARD-02 / G1 | P1-01..03, task database, version records, Session references | TBOARD-00/01 | Project/Task/Run/Delivery/HumanReview/Interaction/Lease mapping, task versions and input snapshots, expected version/transaction/idempotency for state commands, history and archive. FR02–FR04, FR14, AC01, AC03, AC05. |
| TBOARD-03 / G1 | P1-04/07/08, jobs/workflow, SDK Adapter | TBOARD-02/04 | Manual start and default serial queue, persist launch intent first, dedicated runtime, Session/Run links, input acceptance receipts, new Run on retry/continue. FR05, FR08, AC02, AC04, AC11, AC17. |
| TBOARD-04 / G1 | P1-09, workspace, sandbox, subprocess | TBOARD-02 | Normalize directories and lock aliases/nested directories, verify base/worktree, explicitly confirm serial use of original directory, request stop, verify target tree exit and retain lock on timeout. FR01, FR07, FR09, AC12, AC15, AC18, AC19. |
| TBOARD-05 / G1 | P1-04/06/09, Session events, interaction, authorization | TBOARD-03 | Raw events with stable identity or owned cursor, deduplicate history and notifications, show real progress, route questions and approvals separately, reject withdrawn and late responses, bind task tool permissions on the server. FR04, FR06, FR13, AC09, AC10, AC14. |
| TBOARD-06 / G1 | P1-10/11, P2-03, deliverables, artifacts/verification, storage | TBOARD-03/05 | Required Delivery evidence, requirement version, code fingerprint, read-only diff and stale rejection. Human acceptance, return, waiver and historical Review. Agents cannot complete tasks. FR10–FR12, FR14, AC05–AC08. |
| TBOARD-07 / G1 | P1-12, VN4-02, existing Web Client/Host | TBOARD-02..06 | Project navigation, board/list, search/filter/drag, requirements/execution/changes/review details, pending items and settings. FR01–FR14, UI E2E for AC01–AC10, failure-state replay and demo. |
| TBOARD-08 / G2 | P1-02/08/13, P2-04, Session/storage, subprocess | TBOARD-03..06 | Restart reconciliation, no resend of uncertain inputs, restore only after old runtime exits, versioned exports/backups, conflict rejection and compatible upgrade. NFR03–NFR09, AC11, AC13, AC14, AC16, AC17, AC18, AC20. |
| TBOARD-09 / G2 | P1-13, release configuration, tests and docs | TBOARD-07/08 | AC01–AC20, NFR01–NFR09, real engineering workflow, version matrix and recovery guide. Mocks cannot satisfy G0 or release acceptance. |
| TBOARD-10 / G3 | P2-07, Client Slots, task service and scheduling | Extension scope confirmed. User approved deferring G2 NFR02 reference-machine retest. | Limited parallelism, parent/child tasks, blocking dependencies and controlled automatic claiming. Add concurrency/permission regressions and prevent competing owners of the same Session. |
| TBOARD-11 / G4 | P3-01..06, identity, authorization and remote coordination | TBOARD-09 and confirmed team/remote scope | Track team accounts/roles, collaborative editing, PR/CI and remote nodes separately. Independently verify permissions and cross-device recovery. |

Implement TBOARD-00 → 01 → 02 → 04 → 03 → 05 → 06. Accept 07 when 02–06 are ready. Harden 08 when 03–06 are ready. Use 09 to consolidate release evidence from 07/08. The two controlled instances in 01 test stop isolation without authorizing parallel business tasks in the MVP. TBOARD-08 covers required local Taskboard recovery. P2-04 retains its broader recovery scope.

TBOARD-04 passed the [macOS stop, process-scope observation and lease retest](../../.ai/tasks/dsh-cross-device-handoff/evidence/macos-receipt.json).

### 16.4 Validation, evidence and completion criteria <a id="164-验证证据与完成条件"></a>

Unit and integration tests cover business states, version conflicts, idempotency, stale Delivery, human permissions, transactions and recovery. SDK/process tests cover real request identity, cancel/exit, working directory and failed writes after launch. UI E2E covers visible pending, stopping, disconnected, failed, stale-delivery and rejected-acceptance states. Use locale dictionaries for product copy. Add keyless recorded replay for nontrivial model/user output, and update both TypeScript and Python SDK expected outputs for event or loop changes. Tests belong with their implementation. Use real profiles for acceptance.

For each AC record version, redacted configuration, Task/Run/Session/runtime identities, working directory, key events, process exit evidence, final persisted record and actual commands. Permission tests check real side effects. Acceptance tests verify Delivery/HumanReview fingerprints. Report mocks, static review and real paths separately. Never report NOT_RUN, failure or unsupported as PASS.

Taskboard PRD section 14 requires zero unintended duplicate executions, lost acceptances, expanded approvals and accidental stops of other tasks. Human Reviews must be complete for 100% of done tasks. Measure NFR02 with 2,000 tasks, local connection and an 8-core/16 GB/SSD reference machine. Targets are first screen P95 ≤ 2 seconds and UI update within 1 second of service receipt. These are targets pending measurement. Update section 12.10 and the respective task checkpoint after each TBOARD item. Release requires G2.
