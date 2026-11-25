# DSH product requirements (PRD) vNext.4 <a id="dsh-产品需求文档prdvnext4"></a>

English | [中文](DSH_PRD_vNext_4_2026-10-27.zh.md)

> **Version** vNext.4, October 27, 2026. Taskboard addendum dated November 11, 2026.
>
> **Status** Product objectives and acceptance baseline. Implementation status is tracked separately.
>
> **Scope** DSH, a standalone general-purpose agent harness for use across projects and devices.
>
> **Related documents** [Current implementation plan](../workflows/DSH_IMPLEMENTATION_PLAN.md) and [Taskboard PRD v0.1, awaiting review](DeepSeek_Harness_Taskboard_PRD_v0.1.md).
>
> **Identifier index** [Task, stage and acceptance identifiers](#任务阶段与验收编号) and [functional requirement prefixes](#功能需求模块前缀).
>
> **Implementation and progress** [Implementation plan](../workflows/DSH_IMPLEMENTATION_PLAN.md), [overall progress and evidence](../workflows/DSH_IMPLEMENTATION_PLAN.md#12-有效-checklist-与任务证据), [Taskboard task mapping](../workflows/DSH_IMPLEMENTATION_PLAN.md#16-taskboard-增量实施计划) and [Taskboard progress](../workflows/DSH_IMPLEMENTATION_PLAN.md#1210-taskboard-增量-checklist). This PRD defines requirements. The plan checklist records implementation and acceptance separately from document consolidation.
>
> **Earlier versions** vNext.4 revises the vNext.2/vNext.3 assumption that ChatGPT Web with Reverse Codex was the sole primary route. It retains V0–V2 and the applicable reliability and security proposals.
>
> **Design constraints** **ChatGPT Web and SIWC are peer chat providers the user can select in the DSH UI. A planner and a separate LLM reviewer are optional. Codex and Codely are independently selectable agents for engineering work.**


## Identifier and abbreviation index <a id="编号与缩写速查"></a>

### Task, stage and acceptance identifiers <a id="任务阶段与验收编号"></a>

These identifiers appear in this PRD, the [implementation plan](../workflows/DSH_IMPLEMENTATION_PLAN.md) and the [Taskboard PRD](DeepSeek_Harness_Taskboard_PRD_v0.1.md). Requirements identify objectives, task IDs track implementation, and acceptance IDs point to evidence. An ID alone does not establish completion. QR refers to the plan's quota-aware router. CG and WB have no prescribed English expansions and are described by function below.

| Prefix | Meaning | Use and examples |
|---|---|---|
| QR | Quota-aware routing task | Providers, routing, budgets and usage, including QR-03 routing and QR-04 budget protection |
| CG | Incremental ChatGPT integration plan | CG0–CG5 are stages. CG-00 consolidates the plan audit. |
| VN4 | Incremental vNext.4 implementation task | VN4-02 covers independent provider, executor and workflow selection. |
| WB | Web provider validation | WB-01 tests the feasibility of integrating browser-based ChatGPT with DSH. |
| TBOARD | Taskboard | TBOARD-07 covers the board, task details and interactions awaiting attention. |
| FR | Functional requirement | A required capability such as FR-CP-01 |
| NFR | Nonfunctional requirement | Performance, reliability, security and compatibility, including Taskboard interaction performance in NFR02 |
| UAT | User acceptance test | User actions that verify behavior, such as delegating a simple task to Codex in UAT-03 |
| AC | Acceptance criterion or case | Taskboard AC01–AC20. The Taskboard PRD defines the scenarios. |
| T | Test case | T01 covers data validation. Each test table defines its scope. |
| M | Product milestone | M0 product baseline, M1 end-to-end task workflow, M2 production Web integration |
| V | Historical development stage or version | V0 single-machine workflow, V1 memory and handoff, V2 multi-PC collaboration |
| P | Priority or phase, depending on document and location | P0 after a PRD requirement denotes priority. P1-05 in the plan identifies a task within a phase. |
| G | Goal in the main PRD, stage gate in Taskboard | G1–G7 are product goals here. Taskboard G0–G4 cover integration, the task lifecycle, recovery, extensions and collaboration. |
| NG | Non-goal | NG4 excludes any promise to read official ChatGPT Memory. |
| S | Usage scenario | S1 covers ordinary chat and S2 simple development. |
| D | Design decision | D-01–D-10 form this product design baseline. |
| ADR | Architecture decision record | Records architectural choices, reasons and constraints. Agent Notes serve this role in this repository. |

Qualify reused identifiers with their document. P0 in this PRD is a priority, P0 in the plan a phase, and Taskboard P0 a scope. G1 here is a goal and Taskboard G1 is the task lifecycle. M0–M4, historical V0–V2, CG0–CG5 and Taskboard G0–G4 divide work differently. The implementation plan maps them to one another.

### Functional requirement prefixes <a id="功能需求模块前缀"></a>

The second segment of an FR identifier names its module. FR-CP-01 is the first requirement in the Chat Provider module.

| Prefix | Module |
|---|---|
| FR-CP | Chat Provider — model access routes, menus, account and model selection |
| FR-SIWC | Sign in with ChatGPT — official ChatGPT authorization |
| FR-WEB | Web Provider — browser-based ChatGPT access |
| FR-EX | Executor — Codex and Codely engineering executors |
| FR-TB | Tool Bridge — MCP, tunnels and tool integration |
| FR-MEM | Memory — memory, sessions and context management |
| FR-Q | Quota — quotas, budgets and cost transparency |
| FR-RL | Reliability — terminal states, recovery and duplicate execution prevention |
| FR-SEC | Security — credentials, authorization, isolation and security |
| FR-TASK | Taskboard task management — requirement versions, runs, deliveries and human acceptance |

FR-TB denotes the tool bridge. TBOARD and FR-TASK refer to Taskboard. The separate Taskboard PRD assigns FR01–FR14 in its own numbering system.

---

**Validation priority (user decision, October 31, 2026). Validate the Web ChatGPT provider first, using [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web) as the primary technical reference. Verify a minimal real browser-only round trip and DSH adapter feasibility before the remaining account, quota and executor product work. Record reference research, mock or manual checks, real proofs of concept and production admission separately. See [section 15 of the implementation plan](../workflows/DSH_IMPLEMENTATION_PLAN.md#15-当前第一优先web-chatgpt-provider-可行性验证) for ordering and acceptance.**

## 0. Product definition <a id="0-一页产品定义"></a>

**Overview** DSH is the primary interface and shared control plane for working with AI. The user selects an access route such as ChatGPT Web, SIWC or another provider for conversation, requirements analysis and optional planning or review. When engineering work is needed, DSH persists a TaskSpec and dispatches Codex or Codely to execute it using its own agent loop.

**Limits of this definition**
- A message need not create a Task, generate a Plan, execute code and trigger model review.
- ChatGPT Web can run independently of Codex.
- DSH has its own interface and can use tools beyond native Codex tools.
- Signing in with a ChatGPT account does not automatically grant access to ordinary ChatGPT chat usage.
- Long-term availability, permission to automate and risk-free operation of an unofficial Web Bridge are not guaranteed.

### 0.1 Responsibilities <a id="01-权责划分"></a>

| Role | Primary responsibility | Outside its responsibility |
|---|---|---|
| DSH UI | Conversations, workspaces, provider and executor selection, task status, approvals and results | Replacing the official ChatGPT website |
| Chat Provider | Conversation and task interpretation using DSH context, with **optional** planning and **optional** semantic assessment | Authoritative cross-machine task, authorization or source-code state |
| DSH Orchestrator | Deciding when to create a task, choosing workflows, persisting tasks, plans, runs and checkpoints, scheduling and permissions | Requiring a separate planner turn |
| Codex/Codely Executor | Editing code, building, testing, diagnosing faults and planning implementation locally with its own agent loop | Authoritative DSH-wide Session, Memory and Task records |
| DSH Verification | Deterministic builds, tests, checks, artifacts and execution receipts | Calling ChatGPT to review every result |
| Optional Tool Bridge | Controlled MCP access from ChatGPT to DSH tools and verified native capabilities | Replacing the full Codex or Codely executor |

### 0.2 Success criteria <a id="02-成功标志"></a>

1. From the main DSH UI alone, a user can chat and take an engineering task from requirements through implementation and acceptance.
2. The user can switch the **Chat Provider** and **Executor** independently while preserving history and task continuity.
3. Ordinary chat incurs no extra Task, Plan, Executor or Reviewer model calls.
4. A simple engineering task can use a **minimal TaskSpec, a native Codex/Codely agent loop and deterministic verification**. A separate Plan is optional.
5. Complex engineering tasks can produce PlanRevisions, stage dependencies, Checkpoints and separate ReviewPackages as needed.
6. Users can see each provider's **quota source, access permissions, availability and tool capabilities**. The system never silently switches quota sources.

---

## 1. Background and problem <a id="1-背景与核心问题"></a>

DSH previously established its own UI as the main entry point and assigned Session, Memory, Task, Workflow and Checkpoint ownership to DSH. Codex and Codely can execute in parallel and share engineering collaboration memory. DSH should minimize duplicate reasoning. Subsequent investigation identified two complementary capabilities.

- **SIWC and the Responses API** provide official subscription-authorized model access. The cited OpenAI documentation assigns eligible model requests to **shared ChatGPT Work/Codex usage**, distinct from ordinary ChatGPT chat usage.
- **codex-chatgpt-web** is a community project with an unofficial browser model bridge, Responses/SSE mapping, Session/Turn bindings and a ChatGPT → MCP Tunnel → Codex tool round trip. DSH can study the mechanism. Unofficial automation requires its own terms and reliability assessment.

Versions vNext.2 and vNext.3 made Web → Reverse Codex the only primary route. This version uses **peer model providers, independent executors and adaptive workflows**.

### 1.1 Product goals <a id="11-产品目标goals"></a>

- G1. Provide a native DSH chat UI with selectable providers `ChatGPT Web` and `SIWC`, extensible to `OpenAI API/Local/Other`.
- G2. Use ChatGPT for conversation and task interpretation, with planning and review on demand.
- G3. Allow selection of `Codex` or `Codely` for engineering work. Each retains its own agent loop. Allow additional executors later.
- G4. DSH owns Session, Messages, Memory, TaskSpec, PlanRevision, ExecutionRun, Checkpoint, Artifacts, Approval and audit logs.
- G5. Preserve authoritative DSH task state when the provider or executor changes. Identify when the change takes effect and who owns active tasks.
- G6. Explain quota and authorization risks. Keep Web Bridge visible behind experimental admission controls while supported routes remain available.
- G7. Allow a ChatToHarness-style official ChatGPT MCP entry point and the reverse tool mechanism from `codex-chatgpt-web` as **optional extensions**.

### 1.2 Non-goals <a id="12-非目标non-goals"></a>

- NG1. Production feasibility and permission to automate ChatGPT Web are open questions. Bypassing sign-in, risk controls and rate limits is outside scope.
- NG2. Shell access on every chat and automatic PR generation or submission are outside scope.
- NG3. Rebuilding the internal Codex or Codely planner and reimplementing every native tool are optional.
- NG4. DSH claims no synchronized read access to official ChatGPT Memory, conversation history or native threads.
- NG5. GitHub is used for code and knowledge synchronization and optional artifacts. It is outside the runtime task queue.
- NG6. This PRD requires neither replacement of the existing V0–V2 implementation nor immediate rollout of an automated Web Bridge.

---

## 2. Users and scenarios <a id="2-目标用户和关键场景"></a>

### 2.1 User roles <a id="21-用户角色"></a>

- **Developer or engineering lead** — Moves from conversation to engineering execution in one DSH UI and chooses Codex or Codely.
- **Multi-device user** — Schedules workers on home, office or remote machines and continues inspecting existing results.
- **Advanced user or maintainer** — Configures accounts, providers, quota protection, tool approvals, workflow templates and diagnostics.

### 2.2 Core scenarios <a id="22-核心使用场景"></a>

**S1 — Ordinary chat.** The user asks, “Explain how the Responses API maintains conversation state.” DSH sends the message to the selected Chat Provider and streams its reply. It creates no formal TaskSpec and makes no Codex, Codely, separate Planner or Reviewer call.

**S2 — Simple development.** The user asks, “Fix the broken configuration example in the README.” DSH recognizes an engineering task. ChatGPT can produce a **minimal TaskSpec** with objective, repository, constraints and acceptance criteria. The user selects Codex or Codely, and DSH runs deterministic checks and reports results. No separate Plan is required.

**S3 — Complex requirements.** The user asks, “Add multiple providers with isolated quotas.” DSH selects a multi-stage workflow the user can override. If necessary, ChatGPT prepares a high-level plan and acceptance criteria. DSH dispatches one or more Codex/Codely ExecutionRuns by milestone. ChatGPT can assess a ReviewPackage when needed.

**S4 — Switch between ChatGPT Web and SIWC during chat.** The UI can change provider without changing task or workflow semantics. For the next message, DSH ContextBuilder rebuilds context. A turn in progress retains its binding.

**S5 — Switch between Codex and Codely.** The user can freely select the executor before a task starts. During execution, the user must explicitly cancel or end the current Run, or start a new Run from a Checkpoint. DSH must not repeat an operation with side effects when its submission status is unknown.

**S6 — ChatGPT needs engineering information (optional).** Through a permission-controlled Tool Bridge, ChatGPT can read necessary files or workspace summaries. DSH continues to dispatch full engineering work to external Codex/Codely executors.

**S7 — Web is unavailable or unauthorized.** Keep Web visible, explain its experimental, unauthorized or unavailable status and disable automatic sending. Let the user choose SIWC, another permitted provider, or the official manual ChatGPT and MCP entry. Preserve the quota source until the user changes it.

---

## 3. Main workflow — conversation, tasks and autonomous executors <a id="3-产品主流程conversation-driventask-centricexecutor-autonomous"></a>

```
用户消息 → DSH Chat Runtime → 用户当前所选 Chat Provider
                                    │
                                    ▼
                            ChatGPT/模型输出
                                    │
                         Adaptive Task Decision
               ┌────────────────────┼─────────────────────┐
               ▼                    ▼                     ▼
          直接聊天回复         简单工程任务            复杂/高风险任务
          无 Task/Plan         最小 TaskSpec          TaskSpec + 可选 Plan
               │                    │                     │
               ▼                    └──────────┬──────────┘
            UI 输出                          ▼
                                   DSH Executor Router
                                    Codex / Codely
                                          │
                                    原生 Agent Loop
                                          │
                                    确定性验证/产物
                                          │
                              按需 ChatGPT Review → UI
```

### 3.1 Workflow rules <a id="31-必须遵守的-workflow-规则"></a>

- **Ordinary chat** creates no formal ExecutionTask and requires no Plan.
- **Engineering execution** requires a durable TaskSpec, however small, to preserve task identity, scope, acceptance criteria and recovery.
- **Explicit planning** is conditional on complexity, risk, user request or workflow policy. Codex and Codely can plan implementation inside their own agent loops.
- **Model review** is optional. Deterministic verification always runs applicable checks. Invoke model review for high risk, cross-module work or an explicit user request.
- **Workflows** initially use versioned templates chosen by the DSH Router, with user override. Agent-generated workflows are deferred.
- **Models and executors** use the same workflow stages for a given template regardless of the Web or SIWC provider.

### 3.2 Initial workflow templates <a id="32-workflow-模板首期"></a>

| Template ID | Scenario | TaskSpec | Separate Plan | Executor | Model review |
|---|---|---|---|---|---|
| `chat.direct.v1` | Chat or explanation | No | No | No | No |
| `task.quick.v1` | Small fix or simple change | Yes, minimal | No | Yes | Off by default |
| `task.standard.v1` | Routine development | Yes | Optional | Yes | Risk-based |
| `task.milestone.v1` | Multiple stages or repositories | Yes | Yes | Yes, possibly several runs | Usually by stage or at completion |
| `task.inspect.v1` | Engineering investigation and diagnosis | If work is dispatched | Off by default | Optional | As needed |

**Routing** Templates are extensible. DSH can route using structured results from an existing conversation turn and deterministic rules without a background classification call for every request.

---

## 4. Chat provider experience and requirements <a id="4-chat-provider-体验与功能需求"></a>

### 4.1 Provider menu and settings <a id="41-provider-菜单与设置"></a>

**FR-CP-01 (P0)** The DSH UI must show at least `ChatGPT Web` and `SIWC` as **peer provider entries**. Web must appear outside the Codex submenu, and users must have a choice beyond SIWC.

**FR-CP-02 (P0)** Each provider reports its own actual availability using the states `unconfigured / sign-in required / available / limited capabilities / experimental and unauthorized / temporarily unavailable`.

**FR-CP-03 (P0)** Store `providerId`, `account/workspace`, `modelId`, `effort`, `usageSource`, `toolCapabilities`, observability and authorization status independently.

**FR-CP-04 (P0)** Users can select the provider for the next Turn within a conversation. Indicate that the change takes effect on the next message. Preserve existing messages and keep submitted Turns on their original provider.

**FR-CP-05 (P1)** Offer only models and capabilities verified for the account and access route. Never silently substitute a model with the same name from another provider or a different effort level.

**FR-CP-06 (P1)** Settings show the quota category, usage restrictions and whether the interface is official. Label unverifiable quota as `unknown / locally estimated`.

### 4.2 SIWC (official) <a id="42-siwc官方"></a>

**FR-SIWC-01 (P0)** Support authorized account and workspace sign-in through the official flow, a model catalog, token refresh and disconnect. Encrypt credentials.

**FR-SIWC-02 (P0)** Implement the applicable official SIWC request rules, including `store:false`, `stream:true` and sending required input history explicitly. Only `response.completed` indicates success. A closed stream is insufficient.

**FR-SIWC-03 (P0)** Identify SIWC usage as **shared ChatGPT Work/Codex quota**. Support user-defined DSH budget policies and direct users to the official App limits.

**FR-SIWC-04 (P1)** Enable hosted tools and similar features only within the scope of current official SIWC documentation. Local tools require DSH execution support or a supported function-tool interface.

### 4.3 ChatGPT Web (peer provider with admission controls) <a id="43-chatgpt-web平级但受准入门禁"></a>

**FR-WEB-01 (P0)** Provide an independent provider plugin with settings, model information, diagnostics, declared capabilities and independent enable/disable controls. Its unavailability **must leave SIWC, task storage and the executor operational**.

**FR-WEB-02 (first validation priority)** Use the Browser-only route in `codex-chatgpt-web` as the primary reference. Verify a real single-turn exchange, model selection, completion detection and DSH adapter integration. Check browser session leases, the context envelope, response projection, submission receipts, failure and cancellation. The minimum check does not require Full Harness, MCP or reverse Codex tools. Real automated exchanges require prior authorization, terms review and security review. Until permission exists, use only mock, manual or architectural experiments.

**FR-WEB-03 (P1/research)** Map the web conversation to a DSH Session and Turn. DSH owns the authoritative history. Do not assume it can read all web history or Memory.

**FR-WEB-04 (P1/research)** For unofficial web usage, show only locally confirmed submissions or estimates. Do not claim to know OpenAI’s official remaining message count or reset time.

**FR-WEB-05 (P2/optional)** Allow a manual ChatGPT entry with official MCP/tunnel tool calls. The user submits on the official page. **Identify this separately from automated Web Provider access in the DSH UI.**

---

## 5. Executor, task and review requirements <a id="5-executortask-与-review-产品需求"></a>

**FR-EX-01 (P0)** Let users select Codex or Codely as the default engineering executor independently of the provider. Both the interface and UI support `Web×Codex / Web×Codely / SIWC×Codex / SIWC×Codely`. Actual Web calls require admission.

**FR-EX-02 (P0)** Default to `external-agent` for engineering execution and retain the native Codex/Codely agent loop. Calling a Codex model does not start the native Codex executor.

**FR-EX-03 (P1)** Retain historical `native-model/subscription` as a separate optional integration, with compatibility for existing implementations. Keep it distinct from `external-agent`. OAuth does not guarantee ordinary chat quota.

**FR-EX-04 (P0)** Generate a TaskSpec for a formal task. Record workspace, objective, constraints, input artifacts, executor, acceptance criteria, risk, workflow version and user authorization.

**FR-EX-05 (P0)** Expose ExecutionRun status and progress, a stdout summary, diff and test results, cancellation and structured failures. Offer recovery only when the executor supports it.

**FR-EX-06 (P1)** To switch executor during execution, create a new Run, preserve the previous Run and explicitly link its Checkpoint and Artifacts for audit.

**FR-EX-07 (P0)** Run applicable deterministic checks from project configuration and produce a ValidationResult before task completion.

**FR-EX-08 (P1)** Optional ChatGPT review reads only a compact, redacted ReviewPackage and starts according to workflow policy or user choice. Show verification results and uncovered risks even when there is no separate review.

**FR-EX-09 (P1)** A ChatGPT reviewer can request a correction. DSH must enforce an explicit limit or human stop condition on repair dispatch to prevent unbounded recursion.

**FR-EX-10 (Taskboard MVP)** Taskboard completes a task when a user accepts the specified Delivery. Run success, successful checks and model acceptance do not substitute for human acceptance. Model review remains optional. Record permission approvals and delivery acceptance separately.

---

## 6. Optional reverse tools and the official MCP entry point <a id="6-可选的反向工具与官方-mcp-入口"></a>

**FR-TB-01 (P2)** The DSH MCP Gateway exposes a limited set of explicitly authorized capabilities such as `task.create/status/result/cancel`, `workspace.inspect` and `artifact.read`, subject to the account or workspace's current MCP permissions.

**FR-TB-02 (P2)** The `codex-chatgpt-web` Full Harness is a reference for returning tool results within the same ChatGPT response through Connector/Tunnel → Gateway → Scope Broker → Tool Host. **This optional tool route supplements engineering execution.**

**FR-TB-03 (P2)** DSH can provide a limited Tool Host of its own. Reusing native tools from an active Codex Turn requires verifying a bindable Codex Native Tool Host. A shell command alone does not establish a native Codex Turn.

**FR-TB-04 (P2)** Bind tool permissions to at least `caller/session/turn/task/workspace/allowedTools/expiry`. Require approval, revocation, read-only mode and auditing.

**FR-TB-05 (P2)** Return a Task ID promptly for long-running work and allow subsequent tool calls to query status. Avoid holding a single tunnel request open. The ChatToHarness persistent task model is a reference.

---

## 7. Conversations, memory, context and switching <a id="7-会话记忆上下文和切换"></a>

**FR-MEM-01 (P0)** The DSH Conversation Store holds authoritative conversations. Each message records its Provider, Model, Workflow and Turn ID. Memory is independent of ChatGPT web history.

**FR-MEM-02 (P1)** A shared ContextBuilder selects chat history, task state, memory snapshots, file summaries and checkpoints within the context budget. Recompile context when switching provider.

**FR-MEM-03 (P1)** ContextEpoch and Checkpoint record the compaction version, data sources and recovery point. Preserve TaskSpec, decisions and outstanding approvals during compaction.

**FR-MEM-04 (P1)** Conversation import and fork operate at the DSH layer. They do not restore official ChatGPT sessions.

**FR-MEM-05 (P2)** Workers on other devices can continue persisted tasks. Keep sensitive credentials and web cookies on the originating machine and authorize provider sessions per device.

---

## 8. Quotas, failures, privacy and security <a id="8-额度失败隐私与安全"></a>

### 8.1 Quota sources and transparency <a id="81-额度来源与透明度"></a>

| UsageSource | Meaning | UI requirement |
|---|---|---|
| `work_codex_shared` | Subscription-authorized requests such as SIWC | Shared Work/Codex usage that may reduce quota available for Codex |
| `chatgpt_web_unofficial` | Experimental ChatGPT Web route | Unofficial. Quota follows actual product metering. Local counts do not establish an official balance. |
| `openai_api_billed` | Official API | Metered, subject to budget and authorization |
| `other_authorized` / `local` | Other permitted models or local inference | Display the applicable usage rules |

**FR-Q-01 (P0)** For every Turn, retain `requestedProvider`, `actualProvider`, `usageSource` and any usage estimate or indication that it is unknown. Users can inspect the record later.

**FR-Q-02 (P0)** At the budget limit, block further calls and show available options. Changing quota source, changing model and incurring additional charges all require explicit user action. Never silently fall back.

**FR-Q-03 (P1)** Offer a policy to reserve quota for Codex engineering execution. Do not promise exact third-party balances. Label unverified metrics `unknown`.

### 8.2 Reliability and security <a id="82-可靠性和安全"></a>

**FR-RL-01 (P0)** Each TurnAttempt has its own ID, request status, event sequence and idempotency policy. Never automatically replay a request with side effects if its submission outcome is unknown.

**FR-RL-02 (P1)** Distinguish stream interruption, model `failed/incomplete`, outstanding tools, user cancellation and actual `completed`. A stationary UI is insufficient evidence of completion.

**FR-RL-03 (P1)** Before marking a Turn or Run successful, confirm all tool calls accepted in the current turn have terminated.

**FR-SEC-01 (P0)** Keep credentials in the OS keychain or protected storage. Exclude them from Memory, Git, command-line arguments, ordinary logs and exported artifacts.

**FR-SEC-02 (P0)** Isolate tool authorizations by project and workspace. Apply policy approvals for hazardous file writes, pushes, deletion, shell use and writes to external services.

**FR-SEC-03 (P0)** Require explicit admission for Web automation to address authorization and terms risks. Prohibit concealed automation, evasion of risk controls, multi-account quota pooling and access to unauthorized internal APIs.

---

## 9. UI information architecture and interactions <a id="9-ui-信息架构与关键交互"></a>

The [Taskboard PRD v0.1](DeepSeek_Harness_Taskboard_PRD_v0.1.md), awaiting review, details the board, task details, execution, recovery, delivery and human acceptance.

### 9.1 Minimum DSH chat UI <a id="91-dsh-chat-ui-最小信息架构"></a>

1. Header with Workspace and Session selectors.
2. Chat Provider selector for `ChatGPT Web`, `SIWC` and future providers, with connection status, model and quota labels.
3. Execution settings with default Executor (Codex/Codely) and execution mode (external agent or existing native-model integration).
4. Workflow selector with `Auto` (create tasks as needed), `Quick`, `Standard`, `Milestone` and `Chat only`. Users can override the selection.
5. Conversation area for messages, tool events, optional plans, task cards, execution stages and status.
6. Task area with project navigation, board/list and details linked to Task, ExecutionRun, Checkpoint, Delivery, Artifacts, human acceptance and audit. See section 9.3.
7. Settings for accounts, quotas, tool permissions, workers, diagnostics and experimental feature admission.

### 9.2 Interaction requirements <a id="92-交互要求"></a>

- Selecting Web Provider does not authorize browser control. Explain the reason and alternatives when authorization is absent.
- A provider change **takes effect on the next Turn**. Keep the recorded model of an ongoing Run accurate.
- Distinguish task execution from ordinary chat in the UI. Default `Auto` routing avoids asking users to choose a stage for every message.
- Present a generated Plan as an editable, confirmable version. Omit empty Plan pages for simple tasks.
- When model review was never requested, display that status. Never claim ChatGPT accepted the work.
- Require explicit authorization for automatic switches that incur charges, dangerous tool operations and cross-workspace writes.


### 9.3 Taskboard MVP <a id="93-任务工作台-mvp"></a>

This section adopts the [Taskboard PRD v0.1](DeepSeek_Harness_Taskboard_PRD_v0.1.md), based on the [original Word document](DeepSeek_Harness_Taskboard_PRD_v0.1.docx). The Taskboard PRD defines FR01–FR14, AC01–AC20, NFR01–NFR09 and G0–G4 in detail. The table summarizes main product requirements. Taskboard P0/P1/P2 denote its own MVP and extension priorities, independently of the main PRD or plan stages.

The first version serves one local operator, with manual start, stop, retry and recovery and one active task by default. Users navigate from a project to the board or list and open requirement, execution, change and acceptance details. Cards show actual status, latest event and pending count. Users can create a task manually or from confirmed chat requirements. Ordinary chat can remain a conversation.

| Main requirement | MVP requirement | Detailed requirements and acceptance |
|---|---|---|
| FR-TASK-01 | Project directory and integration checks, task fields, sorting, search, filters and state-constrained dragging. Require an objective and at least one acceptance criterion before launch. | FR01–FR02, AC01, AC15, AC19 |
| FR-TASK-02 | Version requirement changes and pin each Run's input. Preserve comments, prior executions and corrections. Retry keeps earlier records. | FR03–FR04, AC03–AC04 |
| FR-TASK-03 | Start idempotently. Each task, Session and working directory has one active owner. Give each Run its own runtime and confirm exit on stop. Retry and continuation create new Runs. A directory change creates a new Session, keeps the old records and lets the user explicitly select material to carry over. | FR05, FR07–FR09, AC02, AC11–AC13, AC15, AC17–AC18 |
| FR-TASK-04 | Drive progress from real events. Distinguish questions, approvals and connection status. Deduplication, out-of-order events and restart reconciliation must preserve terminal states. Never blindly resend inputs with unknown acceptance. | FR06, FR08, FR13, AC09–AC10, AC13–AC14 |
| FR-TASK-05 | Bind each Delivery to a requirement version, Run, code snapshot and verification evidence per criterion. Provide a read-only diff. Before acceptance recheck requirements, HEAD, uncommitted changes and included untracked files. Reject stale deliveries after requirement or code changes. | FR10–FR12, AC05–AC08 |
| FR-TASK-06 | Only users may accept, return or waive verification. Acceptance requires a valid delivery with no active Run or unresolved question or approval. After completion, explicitly reopen or create a linked task and preserve past Reviews. | FR12–FR14, AC05–AC10 |
| FR-TASK-07 | Version exports, backups and restores. Preserve Task/Run/Delivery/Review relationships. Import starts no execution and replays no approvals. Stopping does not delete work. | NFR03–NFR09, AC16, AC20 |

Task states are `backlog / todo / in_progress / in_review / blocked / done / canceled`. Run execution state is independent. Sections 7–8 of the Taskboard PRD define transitions. An `idle` state, final text or zero exit code cannot establish delivery completion. Stopping a Run blocks the task by default, canceling a Task abandons its objective and returning a Delivery moves it to the to-do queue. Only human acceptance of the current valid Delivery sets `done`.

### 9.4 Integration and implementation decisions <a id="94-接入方案与实施前决策"></a>

On November 16, 2026, the user confirmed that the initial Taskboard belongs in the existing DSH Web app with its Web Host and authentication. The task service owns the business database. Each Run starts a dedicated runtime through the official TypeScript SDK. Harness Session logs own model and tool facts, which the business database references.

G0 verifies and freezes the Harness/SDK/runtime/OS combination, Session creation and recovery, question and approval semantics, targeted runtime stop isolation and directory ownership. Driving Harness through the SDK does not establish native Codex/Codely integration. Independent provider and executor selection and existing cost and permission rules still apply. Start through a supported dsh profile. Task tools are limited to server-scoped reads, progress, comments, blocking and delivery. Agents have no human acceptance or waiver authority.

Limited parallelism, dependencies and controlled automatic claiming belong to G3. Team accounts, PR/CI and cross-device capabilities map to G4 and existing main plan tasks. Taskboard cost controls must preserve product-wide quota transparency and authorization for charges. UI performance and reliability figures remain targets pending verification. The Taskboard PRD sections 12–14 specify all metrics.

---

## 10. Priorities and milestones <a id="10-优先级与版本分配"></a>

| Milestone | Required product capability | Constraints |
|---|---|---|
| **Before M0 — Web provider feasibility (first priority)** | Real minimal Browser-only round trip, DSH request and Session adaptation, and failure evidence | Independent of complete UI, Task, Executor or budgeting. Mock/manual runs do not establish real success. Production admission remains separate. |
| **M0 — Product baseline and contracts** | Independent UI, Provider, Executor and Workflow selection, TaskSpec with optional Plan and clear quota information | Audit before modifying existing code. |
| **M1 — Basic end-to-end workflow** | Chat through SIWC or an existing permitted provider, execute with Codex/Codely and verify deterministically | Planner and LLM review remain optional. |
| **M2 — Web as a production peer provider** | Build on feasibility evidence for an independent plugin, peer UI entry, status, diagnostics and reliability. Admit real production access separately. | Run priority validation before M2. A proof of concept does not satisfy product acceptance. |
| **M3 — Reliability and multiple devices** | ContextEpoch, Checkpoint, QuotaPolicy, executor switching and workers | Recover state without unintended execution. |
| **M4 — Optional Tool Bridge** | MCP Gateway, Scoped Broker, reverse tools for ChatGPT and long-running tasks | Keep Tool Bridge and Executor distinct. |
| **Taskboard MVP (G0–G2)** | Integration checks, board and details, versioned execution and delivery, human acceptance, recovery and backup | Section 16 of the main plan. Release requires G2 reliability acceptance beyond the G1 demo. Reuse DSH Web for the initial UI. |
| **Later work** | Agent-generated workflows, additional agents and providers and complex cross-device scheduling policies | Outside first-release requirements. |

> Web feasibility comes before remaining milestone work. Evidence determines completion or a finding of infeasibility. M0–M4 are product milestones. The development plan maps them incrementally to repository progress and preserves historical V0–V2 development stage IDs.

---

## 11. Key user acceptance tests (UAT) <a id="11-关键验收用例uat"></a>

| ID | Scenario | Pass criteria |
|---|---|---|
| UAT-01 | Ordinary chat with SIWC | The answer streams successfully without a Task, Executor, separate Plan or Review request. |
| UAT-02 | Chat Provider menu | Web and SIWC are peers. Web can show admission status and remains visible independently of Codex. |
| UAT-03 | Delegate a simple task to Codex | A minimal TaskSpec, **no mandatory Plan**, a native Codex loop and visible verification results. |
| UAT-04 | Delegate a simple task to Codely | Same criteria as UAT-03. The Chat Provider can stay the same. |
| UAT-05 | Complex task | Supports versioned plans, multiple Runs and Checkpoints and risk-based review. |
| UAT-06 | Successful task requiring no review | Verification passes and the UI states that model review was never requested. It records no fictitious acceptance. |
| UAT-07 | Web lacks admission | Web is visible with automatic submission disabled. SIWC and Executor remain operational. |
| UAT-08 | Switch from SIWC to Web/Mock and back | Only later Turns change provider. DSH history and tasks persist. |
| UAT-09 | Switch to Codely during a Codex run | Preserve the old Run, use an explicit Checkpoint and new Run, and prevent duplicate writes. |
| UAT-10 | Work quota reaches its limit | No automatic switch to a paid API or another quota source. |
| UAT-11 | Streaming request is interrupted | Neither `response.failed` nor disconnection indicates success. Offer an identifiable recovery action. |
| UAT-12 | Insufficient reverse-tool permissions | Deny unauthorized paths, audit failure and stop further writes. |
| UAT-13 | Tool Bridge absent | External agent execution still works independently. |
| UAT-14 | Restart and continue | Resume from DSH Checkpoint and state even with incomplete Web history. |
| UAT-15 | Combination contract test | Web/Mock and SIWC each work with Codex and Codely independently at the provider and executor layers. |
| UAT-16 | Timeout or reconnection after an operation with side effects | Do not repeat the write automatically when submission status is uncertain. |

Taskboard uses AC01–AC20 from [sections 13–14 of the Taskboard PRD](DeepSeek_Harness_Taskboard_PRD_v0.1.md#13-功能验收用例). These keep their own numbering. [Implementation plan section 16](../workflows/DSH_IMPLEMENTATION_PLAN.md#16-taskboard-增量实施计划) assigns implementation and verification. Release requires G0 integration validation, all 20 cases and a real coding task that starts, fails, retries, delivers, is returned and passes acceptance again. Human acceptance remains mandatory even when model assessment is optional.

---

## 12. Open questions for repository and account verification <a id="12-开放问题与须由仓库账户确认的事实"></a>

1. Which providers, executors, workflows, TaskStore and MCP/tunnel capabilities exist in DSH? **Audit the repository in P0. Historical documents alone are insufficient.**
2. Is SIWC authorized for the account and app? Which models and tools are available? Check the live official model catalog.
3. Can the required explicit permission for Web automation be obtained? **Keep real automatic sending and receiving disabled until confirmed.**
4. Does the existing DSH Codex integration expose an active native Turn tool registry? If absent, use DSH tools or an external execution agent. Do not fabricate a native host.
5. Which CLI, ACP and API interfaces and recovery, authorization and sandbox capabilities does Codely offer? Verify against the installed version.
6. Obtain exact workflow template and ADR identifiers, paths and implementation status from the repository in P0.

---

## 13. References and terminology <a id="13-参考资料与术语"></a>

- [SIWC — Official OpenAI overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [SIWC — Models and Inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [SIWC — Preview Limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [SIWC — Official usage limits help](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)
- [codex-chatgpt-web — GitHub](https://github.com/miuuyy/codex-chatgpt-web)
- [codex-chatgpt-web — Architecture](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/architecture.md)
- [codex-chatgpt-web — Security Model](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/security-model.md)
- [ChatToHarness — GitHub](https://github.com/DJ-Huang/ChatToHarness)
- [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)

**Terminology** `Chat Provider` is a model access route. An `Executor` is an agent providing or integrating execution capability. A `TaskSpec` is a durable task contract. A `PlanRevision` is an optional explicit plan. A `ReviewPackage` is compact assessment input. A `Tool Bridge` is an auxiliary tool-call route with scoped permissions. A `Native Tool Host` and an `External Agent` serve different roles.

---

## 14. Product decisions that supersede earlier descriptions <a id="14-产品决策记录本版必须覆盖旧版的描述"></a>

| Decision | Resolution |
|---|---|
| D-01 | The native DSH UI is the primary entry point. |
| D-02 | ChatGPT Web and SIWC are selectable peers in the UI and Provider Router. Automated Web access has independent admission controls. |
| D-03 | ChatGPT handles chat, planning on demand and review on demand. **There is no mandatory Planner stage.** |
| D-04 | Create a TaskSpec only for engineering execution. Explicit plans and model review are optional. |
| D-05 | Codex and Codely are independently selectable executors. Prefer their native agent loops for engineering work. |
| D-06 | Reverse MCP and native tools are optional auxiliary capabilities, independent of the default workflow and of any single executor. |
| D-07 | DSH manages Session, Memory, Task, Run and Checkpoint. Quota sources, switching and permissions are transparent. |
| D-08 | Use adaptive workflow templates with user override. Defer agent-generated workflows. |
| D-09 | Real Web ChatGPT provider feasibility is the first validation priority. Use codex-chatgpt-web as the reference. Browser-only is independent of Full Harness and Executor. Record mock and real conclusions separately. |
| D-10 | The Taskboard MVP separates tasks, execution and delivery, with human acceptance. Embed the first version in DSH Web and reuse its host and authentication. |

**This PRD is the product design baseline. D-01 through D-10 take precedence over conflicting flow diagrams and priorities in vNext.2/vNext.3.**
