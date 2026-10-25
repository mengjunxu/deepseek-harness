# DSH v2 — Codex / Codely 通用开发执行计划

> 版本：v2.1-draft | 更新：2026-10-26 | 状态：**增量计划；现有基础可复用，完整产品尚未验收**
>
> 关联：[DSH_CHECKLIST.md](./DSH_CHECKLIST.md)
>
> 适用：Codex Desktop/CLI、Codely CLI、其他具备文件/命令执行能力的 Coding Agent
>
> 归属：**独立、跨项目的 DSH（通用 Agent Harness 平台）**。不与 Unity、MGSD 或任何具体业务项目绑定。

本计划已合并用户提供的《DSH ChatGPT Integration Plan vNext（2026-10-26）》。第 10 节规定当前阶段顺序、额度分类、复用矩阵和新增任务；原 `P0-*` 至 `P4-*` 编号保留，第 4 节描述原任务验收。新方案中的 P0–P5 在本仓库记为 CG0–CG5，避免与旧编号冲突。阶段不代表任务已完成，实际状态以 Checklist 和对应 Task 证据为准。本次只做 CG0 文档审计；进入 CG1 业务实现须由用户另行批准。

## 0. 给执行 Agent 的第一条指令（必须遵循）

1. 先读取**本文件和 `DSH_CHECKLIST.md` 全文**，再审查仓库、已有架构、分支和测试现状；不得凭空认定项目是空仓库。
2. `DSH_CHECKLIST.md` 是里程碑与任务状态的**共同进度入口**；代码和自动化测试是事实来源。未真实实现、未验证的项不得打勾。
3. 按第 10 节阶段和依赖实施，每次只领取一个最小可验证任务编号；保留 P0 未完成探测，不因一条真实 API 路线受阻就阻断独立的 Mock/路由契约工作。禁止跨越用户批准阶段、无关重构和覆盖其他 Agent 的工作。
4. 保留仓库既有语言、框架、目录和约定。第 2 节说明当前复用路径；重大架构差异按现有 Agent Notes 流程记录。
5. 开始前检查 `git status`、当前分支、已有变更；不得擅自清理、重置或覆盖用户/其他 Agent 的未提交修改。
6. 每个任务结束必须：实现代码、执行对应测试、更新 Checklist 的证据列/状态、记录风险和下一任务；**禁止仅靠自然语言宣称完成**。
7. Codex 与 Codely 的职责在开发期**对等可替换**；由 CHECKLIST、Git commit、ADR、测试结果交接。运行期默认 Codely 为 Executor，但 Codex Adapter 必须可以扩展。
8. 对外部服务授权、真实联网、付费调用或危险操作遵守环境权限；无法完成时使用 Mock/Fake 并明确注明，不能伪造联调通过。
9. 本文架构方案是实现基线，允许在**最终体验不变、可测试且有 ADR**的前提下优化具体技术选择；不要机械照搬建议类库。

---

## 1. 不可妥协的产品目标与范围

**一句话目标：** DSH 自有 UI 是主要交互入口；ChatGPT 类模型负责日常聊天、需求理解、必要的规划与最终语义验收；DSH 自己持有 Conversation、Task、Memory、状态和权限；Codely 默认自主执行工程任务，Codex 可替换；长任务可持续、可恢复、可验收，未来支持多台 PC 协作，并最小化跨 Agent 重复上下文。官方 ChatGPT → DSH MCP 可作为可选外部入口，不替代 DSH UI，也不提供 DSH 主动调用普通 ChatGPT 聊天额度的模型接口。

### 1.1 必须实现的体验

- 一个 DSH Chat 会话里，用户既可普通聊天，又可从某段对话创建 Task；**不是每轮聊天都生成计划**。
- 简单工程任务：`Chat → TaskSpec → Executor → 确定性验证 → ChatGPT Review → 用户看到结果`。
- 复杂工程任务：`Chat → 目标/约束/验收标准 → 可选高层 Plan → Executor 内部规划 → 执行与测试 → Verification → ChatGPT Review`。
- Task 能在 UI 关闭、聊天 Turn 结束后继续；重新打开 UI 可查询任务和完整事件状态。
- 执行器实际改动、测试证据、检查项及失败原因保存在 DSH；可授权的高风险操作必须请求明确批准。
- Codex 与 Codely **开发同一 DSH 仓库时**可通过 Git + Checklist 交接，无需复述整段历史。

### 1.2 明确不做或推迟

- 不把 chatgpt.com 原生网页、历史聊天或 OpenAI 托管 Memory 当作 DSH API 的默认可用资源。
- 不在第一版重写 Codely/Codex 的成熟 Coding Agent Loop；DSH 只管理跨 Agent 调度、权限、状态、数据。
- 不把 OpenAI Tunnel 或 ChatToHarness 作为 DSH 内部聊天→执行的必经路径；可选入站能力按 CG4 实施。
- 不以实验性 ACP 能力、单一订阅共享方式、多设备中心服务作为 V0 的强制前提。
- 不在 V0 做动态生成 Workflow DAG、并行多设备调度、完整向量记忆库、计费优化算法。

### 1.3 已知边界（实施时重新验证）

- OpenAI Sign in with ChatGPT (SIWC) 的**符合条件的开源/本地应用**可请求用户授权在订阅范围内使用合格 Responses 请求；授权**不提供原生 ChatGPT 会话/记忆**；是否获批、支持模型和额度须按实际账户能力探测。
- SIWC 使用 Codex / ChatGPT Work 共享额度，规划分类为 `work_codex_shared`，不是普通 ChatGPT 聊天额度。OAuth 登录方式不能决定费用来源，具体账户额度未知时必须记录 `unknown`。外部限制与来源见第 10 节。
- SIWC 预览的 HTTP Responses 路径须遵循 `store:false`、`stream:true`、每次自行提交所需 `input`，不依赖持久化 `previous_response_id`。相关字段/工具限制以官方最新文档为准。
- Codely 官方文档列出 `-p` 非交互调用、`--output-format stream-json`、`--experimental-acp`，但 **ACP 为实验性，具体 Resume/Cancel/Approval 必须实际探测**。
- ACP 是 Client ↔ Coding Agent 的会话协议；MCP 是工具接入协议，两者职责不同。

参考（以实施时官方文档为准）：
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://developers.openai.com/api/docs/guides/function-calling
- https://codely-docs.tuanjie.cn/features-introduction/command-line-arguments/
- https://codely-docs.tuanjie.cn/using-codely/codely-cli/
- https://agentclientprotocol.com/protocol/v1/overview

---

## 2. 推荐架构：Local-First Modular Monolith

```text
DSH Desktop/Web UI (Chat / Tasks / Plans / Memory / Workers)
          │ HTTP API + SSE/Event replay
          ▼
DSH Daemon (单机优先；后续扩展成 Control Plane)
  ├─ Conversation Runtime (Turn, Message, Stream)
  ├─ Model Provider Router (SIWC / API / Local / Third-party / Mock)
  ├─ Quota Policy / Consent / Usage Ledger (目标能力，待实施)
  ├─ Task Service (TaskSpec, WorkItem, Revision, Idempotency)
  ├─ Durable Orchestrator (State Machine, Outbox, Retry, Lease)
  ├─ Agent Router + Capability Registry + Policy
  ├─ Executor Adapters (Codely CLI [首选] / Codely ACP [探测] / Codex)
  ├─ Verification Service (真实测试证据 + Diff Summary)
  ├─ Review Service (ChatGPT 类模型做语义验收)
  ├─ Memory & Context Builder (项目/任务/用户的作用域)
  └─ Storage (SQLite + Artifact dir + Git worktree)
          │
          ▼
Workspace / Execution Process / Tests / Git
```

**核心原则**：DSH 拥有用户会话和任务状态；模型是可替换推理能力，Executor 是可替换执行能力；Plan 是可选 Artifact，不是系统主键。

### 2.1 已有技术栈与存储归属

| 层 | 当前实现 | 实施约束 |
|---|---|---|
| Runtime | Node `^22.19.0` 或 `>=24`、TypeScript strict、pnpm 11.7.0、Cordis | 以根 package.json 为准，不新建应用启动器 |
| API / UI | 现有 Host、Remote、事件推送、React Web 与 Electron | 复用服务和设置扩展，不引入平行 Daemon/UI |
| Persistence | Session JSONL；storage SQLite/JSON；实验 MGSD SQLite TaskFact | 不把 Session 迁移到第二套 Conversation 数据库；先核对 Task 存储复用 |
| Validation | Schemastery 配置、已有 JSON/类型校验 | 新领域输入使用现有边界，不复制同一状态的权威来源 |
| Tests | Vitest、记录回放、真实 API 与 Web 验收 | 定向测试不能替代 Loader、Session 快照及真实验收 |
| Executor | subagent-codex 与 Codely/MGSD 本地示例 | 原生 Agent Loop 和 DSH Model Provider 保持独立 |

### 2.2 目录复用

```text
apps/{cli,web,desktop,desktop-host}/  # 已有应用与 profile 启动
packages/{core,session,context,llm}/  # 已有 Session、请求上下文与模型服务
packages/{jobs,workflow,subagent}/    # 已有调度和执行基础
packages/experimental/              # SIWC 与 MGSD 等显式启用实现
packages/{storage,credentials,mcp}/  # 已有存储、凭据和 MCP 出站/资源
.ai/tasks/                         # 人工开发协作记录，不是产品 Task Store
.agents/notes/                     # 正式决策与提案；不另建 docs/dsh/adr
```

### 2.3 进程/边界

- UI **不得**直接启动 Shell、调用模型或写 Task 状态；所有副作用经 Daemon API。
- Daemon 独立于 UI 生命周期。关闭 UI 不关闭 Daemon，也不杀死其已启动的受控 Agent 进程。
- Adapter 是进程隔离的 Executor 边界；内部可使用 CLI/ACP，Core 仅消费标准事件。
- 任何 Agent 提交的意图均为**不可信输入**，必须经 schema validation、policy 和用户授权。
- 默认一个 worktree 同时只允许一个写入执行；并行任务必须使用不同工作区/分支和独立锁。

---

## 3. 目标语义（实施前映射现有类型，不作为第二套已发布 Schema）

以下示例是待实施语义，不是现有公共类型声明。Session、Task、Event 等有既有定义时先扩展其拥有者；持久化修改遵循根规则和已发布格式代际，不因本计划重写已有数据。

### 3.1 TaskSpec v1：最小可执行目标

```json
{
  "schemaVersion": 1,
  "taskId": "tsk_01",
  "projectId": "prj_01",
  "source": {"conversationId": "conv_01", "messageId": "msg_09"},
  "goal": "完成指定工程功能",
  "constraints": ["现有 API 保持兼容"],
  "acceptanceCriteria": [
    {"id": "AC-1", "description": "新增功能通过自动化测试", "verification": "test"},
    {"id": "AC-2", "description": "无未授权文件修改", "verification": "policy"}
  ],
  "executor": {"preferred": "codely", "fallback": ["codex"]},
  "planningMode": "executor_delegated",
  "contextRefs": {"memorySnapshotId": null, "decisionIds": []},
  "policyId": "local-safe-default",
  "revision": 1,
  "idempotencyKey": "conv_01:msg_09:create-task"
}
```

**字段规则**：`goal`、`acceptanceCriteria` 是用户意图的正式快照；任务执行时 Revision 不可原地修改；`contextRefs` 存引用/快照 ID，不存完整聊天；`idempotencyKey` 在同一作用域创建 Task 必须去重。

### 3.2 状态模型与转移

```text
Task:  DRAFT → AWAITING_APPROVAL → QUEUED → RUNNING → VERIFYING
           → REVIEWING → ACCEPTED
                         ├→ CHANGES_REQUESTED → QUEUED [新 WorkItem/Attempt]
                         └→ NEEDS_USER_DECISION
分支:  QUEUED/RUNNING → CANCEL_REQUESTED → CANCELLED
       RUNNING → INTERRUPTED / BLOCKED / FAILED
       INTERRUPTED → RECOVERING → QUEUED 或 BLOCKED
```

- **Task** = 用户目标；**WorkItem** = 可调度执行单元；**ExecutionRun** = 某次 Agent 执行；**AgentSessionRef** = 第三方会话引用；**ReviewDecision** = 最终验收决定。
- 不允许通过直接改 DB 字段跳过合法迁移，必须由 StateMachine + 事件事务统一改变状态。
- `Run completed` **不等于** `Task accepted`；`Verifier passed` **不等于** `ChatGPT review passed`。
- 用户撤销授权、Executor 断线、超时应进入可检查状态，不默认自动重试所有副作用操作。

### 3.3 ExecutorAdapter v1（语言无关语义）

```text
interface ExecutorAdapter {
  id: string;
  probe(): Promise<Capabilities>;
  start(input: ExecutionRequest): Promise<ExecutionHandle>;
  observe(handle: ExecutionHandle, cursor?: string): AsyncIterable<ExecutionEvent>;
  requestCancel(handle: ExecutionHandle): Promise<CancelResult>;
  getResult(handle: ExecutionHandle): Promise<ExecutionResult>;
  resume?(reference: AgentSessionRef): Promise<ExecutionHandle>; // 能力可选
}
```

`Capabilities` 必须声明可用与不可用项：`streaming`、`sessionResume`、`cancel`、`approvalCallback`、`headless`、`usageReporting`；若功能不支持，清晰返回 `UNSUPPORTED`。**DSH 自己的 Task 恢复能力不得依赖第三方 Session Resume。**

适配器事件统一为：`run.started` / `run.output` / `run.progress` / `run.permission_requested` / `run.artifact` / `run.completed` / `run.failed` / `run.cancelled`。要求含 `{runId, seq, timestamp, payload}`；对无事件 ID 的 CLI 输出由 Adapter 生成本地递增序号。事件可以重放，必须去重。

### 3.4 Verification & Review 契约

`VerificationRecord` 必须包含：TaskSpec Revision、Git base/head、命令、工作目录、退出码、原始结果文件引用、每条 AC 的 `pass/fail/unknown` 和证据。未经运行的测试标为 `unknown`，不得标成 `pass`。

`ReviewPackage` 最小包含：TaskSpec 摘要、AC Matrix、Diff 摘要、可用测试证据、风险/阻塞、Artifact 引用；大小受限，按需展开。`ReviewDecision` 为 `accept | request_changes | needs_user_decision`，并持久化理由和证据引用。ChatGPT 的 Review 是语义审查；最终高风险发布仍需用户批准。

### 3.5 Conversation / Event 合约

- `Conversation` 跨多个 Turn，`Turn` 跨多个 Model Invocation；支持多个 Task 关联。
- 流式响应仅在官方终止成功事件到达后标为 `COMPLETED`；网络中断或 `failed/incomplete` 不能误写为成功。
- DB 先提交事件（含单调 cursor），UI 再经 SSE 广播；重连时凭 cursor 查询并补齐。
- 所有消息按 `{conversationId, turnId, messageId}` 持久化，运行期生成 `clientRequestId` 以避免双击重复发送。
- 模型调用适配器不泄漏 SIWC/API 专有对象到 Domain。

### 3.6 最小 Memory 语义

分层：`UserPreference / ProjectKnowledge / Decision(ADR) / TaskEvidence`。工程决策优先 Git 版本化文档，原始 Conversation 不等于 Memory。每条 Memory 记录 `scope/source/version/confidence/updatedAt`；长期 Memory 更新需先去重、不覆盖已确认 ADR；Task 可引用冻结的 MemorySnapshot。

---

## 4. 里程碑、依赖与具体开发任务

### P0 — Repository Baseline & Integration Spikes（实施第一关）

**目标**：锁定仓库实际技术约束，验证供应商能力和替代路径；不可跳过。

| ID | 任务与实施动作 | 交付物 | 完成证据 |
|---|---|---|---|
| P0-01 | 审查目录/语言/包管理、现有服务、测试基线、Git 变更；建立 ADR 草案 | `docs/dsh/spikes/repository-baseline.md` | 真实可复现的 build/test 命令与结果 |
| P0-02 | 跑通 `MockModel`：流式文本、工具调用、失败、断流 | ModelGateway mock + fixtures | 自动测试涵盖 complete/fail/interrupted |
| P0-03 | 验证 OpenAI API Key 路线；另单独验证 SIWC 可用性、授权及权限限制；不可互为隐式前提 | `model-provider-matrix.md` | 成功/拒绝/额度不足/未配置路径；真实测试注明日期 |
| P0-04 | 检测 Codely 版本、`-p`、`stream-json` 的真实事件格式，进程退出/取消/权限问题；ACP 仅能力探测 | `codely-capabilities.md` + sanitized fixtures | 本机 smoke 记录；若不可用有 Mock 退路 |
| P0-05 | 调研可用 Codex 本地集成接口，生成能力矩阵；选定优先适配方式但不假设与 Codely 命令行相同 | `codex-capabilities.md` | 版本号、最小执行样例/明确 Blocker |
| P0-06 | 确定复用模块、存储与风险门禁；对待实现差异按现有 Agent Notes 流程提案 | 现有决策索引与第 10 节 Decision Log | 不另建 ADR 体系；实现前核对适用决策 |

**P0 Gate**：Mock 端到端可行；至少一种真实 Chat Provider 路径可用或由配置降级；至少一种真实 Executor 路径可用或明确 Mock-only；接口不能建立在未经验证的私有 API 上。

### P1 — V0：单机最小闭环（最优先完成）

**目标用户演示**：在 DSH UI 输入任务 → ChatGPT/Mock 提议 TaskSpec → 用户确认 → Codely/Mock 在隔离工作区执行 → DSH 跑真实验证 → ChatGPT/Mock 评审 → UI 显示最终结论；关掉 UI 后任务继续。

| ID | 任务与实施动作 | 依赖 | 交付物 / 验收 |
|---|---|---|---|
| P1-01 | 映射 MGSD/Session 现有类型，补缺失领域语义、JSON 校验、错误码与迁移兼容测试 | P0-06 | TaskSpec、Event、Review 映射与非法输入测试 |
| P1-02 | 复用 Session JSONL 和现有 SQLite/TaskFact，补 Task/WorkItem/Run/Artifact/Review 的关联与迁移 | P1-01 | restart 后可读取；不建立第二套 Session 权威；迁移重跑幂等 |
| P1-03 | 实现 Task StateMachine + Idempotency + 事务 Outbox | P1-02 | 双提交去重；非法迁移拒绝；崩溃事件不丢 |
| P1-04 | 在现有 Host/Remote/事件服务补 task create/approve/status；验证 UI 与执行生命周期分离 | P1-02 | API 契约测；断线重连 cursor 补发 |
| P1-05 | 复用 Mock、llm-pi-ai API 与实验 chatgpt-plan；补 SIWC Loader、Session 快照和真实长回复验收 | P0-02/03 的各路线证据 | 与 QR 额度策略合成；真实 API Key 验收独立 |
| P1-06 | Conversation Runtime：Message/Turn、Context Builder 最小模式、流式接入 | P1-04/05 | 同一 Conversation 跨重启继续；不会复发副作用 |
| P1-07 | 映射 subagent-codex、Codely/MGSD 本地示例到统一 ExecutionRun；补 MockExecutor | P0-04/05, P1-01 | 保留 subscription/native-model 与 external-agent 两种模式，分别验证进程、事件、权限和取消 |
| P1-08 | Durable Orchestrator：Queue、原子 claim、单机租约、attempt、启动/退出/恢复 | P1-03/07 | UI 退出不中止任务；daemon restart 后状态不丢或标记可恢复 |
| P1-09 | Workspace 安全：路径白名单、独立 worktree、写入锁、限制 Shell 与 Secret | P1-07/08 | 防路径逃逸、防同工作区双写、危险操作需要批准 |
| P1-10 | Verification Engine：运行可配置测试命令、保存退出码与产物、AC Matrix | P1-08/09 | 真实测试失败不会标为通过；未知项标记 unknown |
| P1-11 | Review Service：结构化 ReviewPackage → ChatGPT/Mock → Decision；修复闭环 | P1-05/10 | accept / request_changes / user_decision 三分支有集成测 |
| P1-12 | UI：聊天、生成 TaskSpec、确认、任务状态/进度、验收结果、取消与错误反馈 | P1-04/06/08/11 | Playwright 完整 E2E、UI 重开恢复 |
| P1-13 | 单机可复现 Demo、README、升级/备份/回滚指南 | P1-01..12 | 干净环境按文档从零跑通 Mock 及 1 个真实路径 |

**V0 Gate（全部必须过）**：真实或清楚标注的 Mock 聊天→TaskSpec→Executor→Verification→Review 闭环；同一个 Task 重复请求不产生两个 Run；UI 断开继续执行；Daemon 重启状态可重建；未授权副作用被阻断；测试证据可追溯；Log 与 Token 不泄漏。

### P2 — V1：共享记忆、恢复与 Agent 无缝替换

| ID | 任务 | 依赖 | 验收 |
|---|---|---|---|
| P2-01 | Scoped Memory Store + Project ADR Index + 检索/去重/快照 | V0 | 跨会话检索；不能跨项目越权读取 |
| P2-02 | Context Builder 支持 Chat/Planning/Review 三种 Envelope 与预算 | P2-01 | 限制历史与日志；对比输入 token/大小 |
| P2-03 | Artifact Store：内容哈希、索引、Retention、Diff/Test Report 按需读取 | V0 | Review 默认不发送完整日志/全量 Diff |
| P2-04 | 强化 Task/Run 恢复：重启、孤儿进程、重复执行防护，restart reconciliation | V0 | 注入崩溃后不重复副作用；明确需人工处理的模糊状态 |
| P2-05 | Codex Adapter 真实接入，统一 Capabilities；Codely↔Codex 切换新的 Run | P0-05, P2-03 | 同 TaskSpec 分别可被两个 Adapter 执行/复核 |
| P2-06 | Review 循环预算：修复次数上限、升级到用户、模型调用计量 | V0 | 不无限重试；能统计每个阶段调用耗费 |
| P2-07 | 项目工作流模板、步骤验收、PlanRevision 可选持久化 | P2-01..06 | 简单 Task 无需完整 Plan，复杂 Task 支持可选 Plan |

**V1 Gate**：Codex 和 Codely 能按相同 TaskSpec 在独立 Run 中接力；跨 Session 共享决策；失败可恢复且可审计；减少上下文靠测量证明，不做空泛“节约 X%”承诺。

### P3 — V2：多 PC / Remote Worker（V0/V1 不依赖本阶段）

| ID | 任务 | 验收 |
|---|---|---|
| P3-01 | Worker 注册、身份、能力声明、心跳 | Worker 可查询在线/忙碌/最后心跳 |
| P3-02 | Coordinator + Authenticated Outbound Worker Channel | 不暴露未授权远程执行接口 |
| P3-03 | 分布式 Task Claim/Lease/Fencing Token | 断网/过期/重试不发生双写 |
| P3-04 | Git worktree/commit/Artifact 的跨设备同步及冲突处理 | 从 PC-A 完成到 PC-B 继续并验证版本 |
| P3-05 | Remote Cancel/Recovery、离线重连、可见进度 | 恢复后准确报告可能正在运行的任务，不盲目二次启动 |
| P3-06 | 端到端跨设备场景、凭据安全、故障注入 | 至少两台真实或独立隔离 Worker 完成验收 |

**V2 Gate**：多 PC 路由、任务接续和统一 Memory 生效；任何 Lease 丢失都不会默默产生第二个写者；有回退到单机模式能力。

### P4 — 后续扩展（不阻塞 V2）

- Dynamic Workflow DAG、自动重规划、并行/合并策略；细分 Planner/Reviewer 模型预算与路由。
- 完整 ACP 适配与更细粒度权限请求交互（以实际版本 capabilities 为准）。
- Prompt/Memory 质量评测、上下文压缩、成本基准、长期保留策略。
- 更多 Provider/Agent；非工程任务执行器；移动端 UI；多租户控制与审计。

---

## 5. 开发协作：Codex 与 Codely 一致执行规范

### 5.1 统一任务领取协议

每次启动时：

1. `git status --short --branch`；确认当前 Worktree/Branch 和已有修改。
2. 读 `DSH_IMPLEMENTATION_PLAN.md` + `DSH_CHECKLIST.md`；检查相关 ADR、上一个任务的 Handoff。
3. 按依赖领取 Checklist 中第一个 `TODO` 或可复现的 `BLOCKED` 项；在单一 worktree 中一次只让一个 Agent 写入。
4. 写代码和测试；每个小任务提交独立 commit（需遵守用户/仓库提交权限策略）。
5. 更新 Checklist 对应 ID 的状态、证据（路径/命令/测试结果/commit）、未完成项及交接说明。
6. 切换 Agent 时，接手者先复验上个任务的证据，再继续下一 ID。**不需要共享专有 Agent 内部 Session。**

禁止把 `AGENTS.md` 与 `CODELY.md` 写成两个分歧的执行计划；两者可作为短入口，仅指向上述两份权威文档、项目规则和工具权限边界。

### 5.2 交接记录格式（追加于 CHECKLIST 的交接日志）

```yaml
handoff:
  taskId: P1-03
  from: Codex # or Codely
  to: Codely
  branch: feature/task-orchestrator
  versionEvidence: <stable-tag-or-external-evidence-or-unverified>
  status: IN_REVIEW
  changes: ["src/...", "tests/..."]
  validation:
    - command: "node node_modules/vitest/vitest.mjs run scripts/doc-standard.spec.ts --reporter=dot"
      result: "PASS"
  openIssues: []
  nextTask: P1-04
```

如有未提交代码，不得以“已交接完成”掩盖；列出未提交路径、原因和当前所有者。并行写入需创建**不同** worktree 与任务负责人，Checklist 合并时按 Git 冲突决议，不使用 Markdown 文件作为跨设备互斥锁。

### 5.3 供应商工具调用指导（样例，非强制）

**Codely：** 在实际环境核对 `codely --help` 后，可采用：

```bash
codely --version
codely -p "先阅读 DSH_IMPLEMENTATION_PLAN.md 与 DSH_CHECKLIST.md，只执行 P0-01；完成后写入证据，不要跨任务修改" --output-format stream-json
```

自动化实现中使用 subprocess argv、受控 cwd、受限环境变量和实际批准策略；**不要无条件追加 `--yolo`**。ACP 的 `--experimental-acp` 只用于 P0 spike，不作核心路径依赖。

**Codex：** 在 Codex Desktop/CLI 中打开同一个 Git worktree，直接输入相同的任务编号及文件路径。运行时具体 CLI flags 以本机 `codex --help` / 实际可用接口为准，避免编造自动化参数。

### 5.4 推荐提供给任意 Agent 的启动 Prompt

> 你正在实现独立项目 DSH。读取 `docs/workflows/DSH_IMPLEMENTATION_PLAN.md` 和同目录 Checklist、第 10 节阶段顺序、当前 Task 与 Git 状态。只执行用户批准阶段中的一个可验证 ID；复用既有模块，不把 OAuth 当作额度分类，不自动转付费路线。阶段授权、真实账户和能力验证分别核对。结束时记录实际修改、检查结果、未验证项和下一项任务。

---

## 6. 测试计划 / 故障注入矩阵

| Case | 测试类型 | 必须断言 |
|---|---|---|
| T01 | Domain schema | 缺失 goal、非法状态转移、旧 schema 兼容策略 |
| T02 | Idempotency | 同一个 clientRequestId / idempotencyKey 重复 2 次只生成 1 个 Task/Run |
| T03 | State recovery | 任务运行时杀 UI，重开后任务与事件持续可见 |
| T04 | Daemon crash | Queue/RUNNING 中断后重启可协调状态，不重复危险写操作 |
| T05 | Adapter output | stream-json 正常/损坏行/超大日志/异常退出/信号取消 |
| T06 | Authorization | 目录逃逸、修改保护目录、执行危险命令均被拒绝或请求明确授权 |
| T07 | Model errors | token 过期、额度不足、网络断流、完成终止事件缺失均不报告成功 |
| T08 | Verification | 测试失败、未执行、退出码未知分别记录 fail/unknown，不伪造 pass |
| T09 | Review | accept / request_changes / needs_user_decision 路径各完成一次 |
| T10 | Context scope | Project-A 的私有 Memory 不进入 Project-B；Review 默认不包含全日志 |
| T11 | Switch executor | 同 TaskSpec 在 Codely 与 Codex 两个新 Run 间切换不丢状态 |
| T12 | Lease / Worker | V2 故障注入验证单写者；过期锁有 fencing 防重复提交 |

**覆盖策略**：Domain 高密度单测 + Daemon/DB 集成测 + Adapter fixture 测试 + 1 个真实工程工作区 smoke + UI E2E。所有外部服务测试注明真实/Mock 和版本；真实接口不可用时不能把 P0 能力验证标为通过。

---

## 7. 安全、可靠性和回滚要求

- 默认 least-privilege：显式工作区、路径约束、命令授权策略、进程执行超时、日志脱敏；不得把 OAuth Token / API Key 写入 Git、TaskSpec、Event Payload、ReviewPackage。
- 对模型生成的工具参数执行 schema validation 和 allowlist。模型可以**提出**任务，不能自行扩展已授权 Workspace。
- P1 原则上只在独立 worktree 改动。拒绝没有用户批准的强制推送、重置远程分支、删除大量文件、发布、付款等操作。
- 每个 DB schema migration 提供回滚或备份恢复策略；崩溃恢复通过持久化状态协调，绝不直接声称第三方 Agent 的“思维链”能无损恢复。
- Outbox/Event 的 at-least-once 投递需要消费者幂等；跨设备后用 fencing token 保障单写入者。
- Review 的最终 `ACCEPTED` 仅代表经目前验证/评审通过；如果真实测试未跑通，必须标出限制而不是“完成”。

---

## 8. 各阶段提交与验收模板

对每个 ID，交付给下一位 Agent/用户：

```text
[Task ID] P1-xx
[Status] DONE / BLOCKED / IN_PROGRESS / IN_REVIEW
[Summary] 本次实现内容
[Files] 实际修改的文件
[Validation] 实际执行的命令、退出码、测试摘要
[Evidence] 测试报告路径/截图/稳定 tag 或外部证据/真实接口版本
[Constraints] 仍未覆盖的限制和风险
[Next] 下一个依赖已满足的 ID
```

### 全项目 Definition of Done

1. 根本用户目标在 **DSH 自有 UI** 中达成；不需要在多个 AI 应用之间手工复制任务。
2. ChatGPT 作为优先 Chat/Planner/Reviewer，但提供 Provider fallback；不冒充获取原生 ChatGPT 网页 Memory/历史。
3. Codely 默认执行、Codex 可扩展；任务由 DSH 持久化控制；Executor 内部自主性不受不必要的外部轮询破坏。
4. Task/Run/事件、Plan（可选）、Memory 引用、Artifact、Review 可重启恢复；副作用有授权与幂等保证。
5. 有完整自动化测试、真正执行过的验证证据、已知限制与恢复/回滚指南。
6. 每次 Codex ↔ Codely 切换后，仅凭 Git + 本 PLAN + CHECKLIST + Artifact 就可继续工作。

---

## 9. 变更规则

- 变更系统目标、数据模型语义、Agent 权限边界、持久化一致性策略：先写 ADR，再修改计划。
- 仅变更技术实现细节且不破坏接口/验收：记录在对应任务证据中即可。
- 每个 Milestone 结束复审后续任务优先级，避免锁死设计；未改变的最终目标不需要重新讨论。
- Checklist 上所有任务初始都是未完成，严禁把本文中的建议或示例当作已落地结果。

## 10. ChatGPT 接入增量阶段与现状审计

本节是 2026-10-26 增量规划的实施入口。CG0 是本轮文档任务，CG1–CG5 是目标能力，不是已发布架构。主产品保持跨项目定位；原 V0/V1/V2 的完整验收保留，不因已有示例或定向测试而打勾。

### 10.1 当前实现、目标与缺口

`Partial` 表示已有可复用源码，不等于该计划任务完成；`New` 表示缺少对应产品闭环；`Defer` 不阻塞正式开发。源码路径均相对仓库根目录，验证范围见 Checklist 和 Task 记录。

| 能力 / CURRENT_STATE | TARGET_STATE / GAP | 处理与旧任务 |
|---|---|---|
| Chat UI、Session、Turn、上下文已有：`apps/web`、`packages/client/ui-chat`、`packages/core/session`、`packages/context`、`packages/compaction` | 按意图选 Provider、跨 Provider 能力解释、Context Rehydration 与任务关联尚未统一验收 | KEEP / MODIFY；P1-04/06/12、P2-02，Partial |
| SIWC：`packages/experimental/chatgpt-plan`，授权/目录/流转换已实现；本地 Session 有真实 completed 轮次 | 显式 opt-in；19 项定向测试覆盖当前修复；Loader、Session 快照、长回复修复后的真实重试/GIF 尚缺 | KEEP / MODIFY；P1-05，Partial；不是生产验收完成 |
| API 与订阅 Provider：`packages/llm/llm-pi-ai` 的配置、登录、凭据和 provider catalog | API Key 真实账户验收独立；native-model 不等于启动第三方 Agent Loop；费用来源不能由 OAuth 推断 | KEEP / MODIFY；P0-03、P1-05、QR-01/02 |
| Codex external-agent：`packages/subagent/subagent-codex` 的 app-server 进程与测试已存在 | 映射 TaskSpec/ExecutionRun/Checkpoint，验证与 Codely 同任务接力；当前审计没有重新运行真实 Codex | KEEP / MODIFY；P0-05、P1-07、P2-05，Partial |
| Codely external-agent：`apps/cli/config/examples/codely-local` 及测试、`mgsd-local` 示例 | 已有本地命令、后台 Job 与独立验证；尚非通用双执行器 Task API；Codely native-model 路径未发现 | KEEP / MODIFY；P0-04、P1-07，Partial；native-model 为待验证目标 |
| Task/Review 基础：`packages/experimental/mgsd-workflow/src/core.ts` / `types.ts`，SQLite facts、批准、执行检查事实、预算、review 状态已存在 | 通用 TaskSpec、WorkItem/Run、outbox/幂等、紧凑 ReviewPackage 与模型 Reviewer 尚需映射/补齐 | KEEP / MODIFY；P1-01/02/03/08/10/11、P2-04/06/07，Partial；不复制另一套 Task Store |
| Memory：`.ai/MEMORY.md` 是开发协作索引；`apps/cli/config/examples/mcp-memory` 是外部资源示例 | 产品 User/Project/Decision/Task Memory、隔离检索与 MemorySnapshot 尚未验收；与 ChatGPT Memory 无同步关系 | NEW / MODIFY；P2-01，不能用 Markdown 记录冒充产品实现 |
| Quota-aware Router 与 Usage Ledger：已有 LLM 路由、usage、retry/凭据服务；未发现 UsageSource / 按意图费用策略 | 补分类、能力 tri-state、共享额度保护、预算同意与回退审计 | NEW；QR-01..06，旧 P2-06 复用其计量而不再另造 Ledger |
| MCP：`packages/mcp/mcp-client`、`mcp-resources` 是出站/资源；现有 subagent/SSH 不等于多 PC Worker 协调器 | Worker Registry/lease/fencing、入站任务 Gateway 与 Tunnel 未发现对应完整闭环 | NEW；P3-01..08；不能把 MCP Client 写成入站服务已完成 |
| `pi2dsh`、`dsh-codex-oauth`、`dsh-codely` 这三个名称未在已跟踪源码/配置/manifest 中定位为独立插件 | 可能是旧称、外部插件或历史设计；已定位功能对应者见上表，不能据旧名称安装、删除或宣称兼容 | DEFER 名称核对到 QR-02 / P0-04/05；本轮未扫描用户凭据或全局私有配置 |

### 10.2 Provider、执行模式与额度

依据 [OpenAI 的 SIWC 用量说明](https://learn.chatgpt.com/docs/sign-in-with-chatgpt)，连接应用使用已有 Codex / ChatGPT Work 额度，不增加独立份额，也不授予 ChatGPT 对话或 Memory。额度类型与余额状态是两个字段：前者可确认为 `work_codex_shared`，后者若不可读仍是 `unknown`。

| UsageSource（目标枚举） | 方向与用途 | 限制 |
|---|---|---|
| `chatgpt_regular` | 官方 ChatGPT 对话发起，可调用 DSH MCP 工具 | 仅记录外部对话入口的来源；不得注册为 DSH 主动推理 Provider；额度仍由发起产品决定 |
| `work_codex_shared` | DSH → SIWC Responses，及经验证确属此类的订阅入口 | 日常聊天需明确政策/同意；为工程执行保留额度；不得显示成普通聊天额度 |
| `api_metered` | DSH → OpenAI API Key | 独立计费；不得在订阅失败后无预算授权自动切换或追加 credits |
| `third_party` / `local` | DSH → 配置的供应商或本地模型 | 单独记录能力、费用与数据去向；不能推断免费或完全离线 |
| `experimental_unverified` | Web Bridge 隔离研究 | 默认禁用，排除生产自动路由；不接私有端点、不提取 Cookie、不自动抓取未获授权的网页输出 |

`subscription` / `native-model` 表示模型由 DSH LLM 服务调用、由 DSH Agent Loop 执行；`external-agent` 表示 Codex/Codely 原生 Loop 执行，DSH 管理任务和验收。两种模式独立保留。Codex 模型路线可复用 pi-ai 的 `openai-codex` 及独立 SIWC；其本机账户、协议合规和能力仍须分别验证。Codely 模型路线是目标，现有 CLI 示例不能证明其存在。

Provider capabilities 对 streaming/tools/structuredOutput/vision/resume 使用 `supported/unsupported/unknown`；resume 必须说明是模型上下文续聊、DSH Task 恢复还是原生 Agent Session 恢复。不得按模型同名继承其他产品的能力。SIWC 自管请求历史，遵守 `store:false` / `stream:true` 与不持久使用 `previous_response_id`。

### 10.3 阶段依赖与任务归属

```text
CG0 文档审计 / CG-00
  └─ 用户批准 → CG1 额度感知路由 / QR-01..06 + P1-05 剩余验收
       ├─ CG2 会话/上下文 / P1-06、P2-02（基础），P2-01（跨会话 Memory）
       └─ CG3 单机执行闭环 / P1-01..04、07..13 → V0 Gate
            └─ P2-01..07 剩余跨会话、恢复、双执行器能力 → V1 Gate
                 └─ CG4 / P3-01..06 多 Worker → V2 Gate
                    └─ 可选 P3-07/08 ChatGPT MCP 入站
CG5 / WB-01 独立研究：可完全跳过，不是 CG1–CG4 前置
```

CG2 的 Session/Context 基础与 CG3 按显式任务依赖交错实施；产品 Memory 等仍保留原 V1 验收，不把所有 CG2 作为 V0 前置。P0-04/05 的真实能力探测可在 CG1 的 Mock 契约工作旁独立完成，进入对应真实执行器验收前必须通过。Task、Provider 与协议字段先映射现有接口，不能因本计划里的 `IModelProvider` 等示意名称另建平行服务。

| 新计划阶段 | 唯一执行编号 / 拟修改拥有者 | 交付与依赖 |
|---|---|---|
| CG0（新 P0） | CG-00；本计划、Checklist、Memory、Task | 只读审计和文档合并；记录冲突；本轮止于此 |
| CG1（新 P1） | QR-01..06；LLM、credentials/authorization、settings、Session 事件、Client 既有扩展 | 下表六项；接续 P1-05，不重写 Provider |
| CG2（新 P2） | P1-06、P2-01/02；core/session、context、compaction、拟补作用域 Memory 拥有者 | 导入/Fork 仅为 DSH 上下文续聊，不恢复官方 Memory；简单聊天不强制 TaskSpec |
| CG3（新 P3） | P1-01..04/07..13、P2-03..07；jobs、workflow、mgsd-workflow、subagent 与本地示例 | 先 TaskSpec/Run/Artifact/Review，再恢复与双 Agent 接力；保持 V0/V1 验收 |
| CG4（新 P4） | P3-01..06；拟补 Worker 协调插件；P3-07/08 拟补任务 MCP Gateway/Tunnel | Gateway 依赖 Task API/权限/幂等，不绕过 Task Store；多 Worker 保持 V2；入站可选 |
| CG5（新 P5） | WB-01；研究文档/风险记录 | 仅评估授权、失败语义和替代方案；不实现未授权提取，不作为生产前置 |

Secure MCP Tunnel 是 ChatGPT → DSH 的入站路径，不是反向普通 ChatGPT 推理接口。[官方 Tunnel 文档](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)的单次请求总期限为 120 秒，含排队与最终交付，进度通知不重置期限。P3-07/08 的 submit 立即返回 taskId，再查 status/result/cancel；不得同步等长任务完成。普通官方 ChatGPT 对话是否能使用该入口仍取决于产品、账户和工作区权限。

### 10.4 CG1 的明确任务与验收

六项均是待实现要求。`chat/plan/review/execute` 各有政策；不得因共享订阅余额未知就推断为无限、耗尽或准许付费回退。

| ID | 拟修改/复用模块 | 依赖 | 完成条件 |
|---|---|---|---|
| QR-01 | llm 的 Provider 元数据/配置；需独立演进时才新建定义包 | CG-00、阶段批准 | UsageSource、意图、能力 tri-state、余额 unknown 的类型与解析测试；拒绝 `chatgpt_regular` 作为主动 Provider 和研究路线作为生产默认 |
| QR-02 | llm-pi-ai、chatgpt-plan、credentials/authorization、原生执行配置 | QR-01；逐路线核对 P0-03/04/05 | Auth、Provider、Executor 和费用来源分开配置；列出 Codex/Codely 两模式的 supported/unknown；不删除旧插件；SIWC 剩余真实/Loader/快照属于 P1-05 |
| QR-03 | LLM 路由扩展、settings；必要时补 policy 插件 | QR-01/02 | 每种意图的默认 Provider 显式；能力不匹配拒绝；失败/限额/断流不隐式切模型；配对 fixture 覆盖每条路由 |
| QR-04 | authorization/interaction、QR-03 政策、持久化预算拥有者 | QR-03 | 为 execute 保留共享额度；会话/任务预算；余额 unknown 可解释；无预设或当次授权时阻断 API/credits 付费回退；reserve/cancel/settle 防重复扣预算 |
| QR-05 | 现有 request/usage Session 事件及 storage；不要建立第二套 transcript | QR-01/04 | UsageRecord 关联 request/session/task、provider、usageSource、政策决定；官方报告与估算分列，原始余额未知仍 unknown；重放、重试去重和凭据脱敏有验证 |
| QR-06 | Client 模型/聊天/用量设置扩展、QR-03/05 记录 | QR-03/04/05 | 展示本次 Provider、费用来源、付费确认与回退结果；字典文案、Session 快照、真实 profile E2E/GIF；未经额度同意不得自动将日常聊天导向共享执行额度 |

CG1 Gate：默认路由、能力拒绝、余额未知、额度不足、服务不可用、请求中断、显式回退、付费阻断均有独立证据；`chatgpt_regular` 不可被 DSH 主动推理；重放可解释每次来源和政策选择。旧 P1-05 未验收部分仍保持 Partial；Mock Gate 不能替代真实 Provider 或执行器权限验证。

### 10.5 数据归属与 Decision Log

Session/Message/Turn 继续以 Session log 为权威；TaskSpec、PlanRevision、ExecutionRun、Checkpoint 和 ReviewPackage 先映射 MGSD 的 TaskRequest/TaskPlan/TaskFact、Job 与 worktree/Artifact，缺失语义才补。UsageRecord 复用 request/usage 并新增政策事件，Model-visible 的变化必须可由日志重建。Git/GitHub 负责代码与约定同步，不是实时 Task 队列；`.ai/` 是开发协作记录，不是产品运行状态。

| 目标数据 | 复用归属与待补最小语义 |
|---|---|
| Session | 现有 Session log；关联 project、providerRoute、contextRevision 与时间；不另建 Conversation 权威 |
| TaskSpec | MGSD TaskRequest/plan 与原第 3 节；关联 session、intent、constraints、AC、project、executionPolicy |
| PlanRevision | 复用 TaskPlan/revision/approval；补依赖、作者与计划审批状态的通用映射 |
| ExecutionRun | Job 与 execution/process_exit facts；补独立 runId、taskId、agentType、worker/lease、状态和幂等键 |
| Checkpoint | 关联 task/run、stateDigest、artifactRefs 与 recoverability；不能冒充原生 Agent 思维缓存 |
| ReviewPackage | 复用检查/review 事实；包含 TaskSpec 摘要、changedFiles、版本引用、testSummary、错误、风险和 Artifact 引用 |
| UsageRecord | 复用 request/usage；关联 task/session/provider/usageSource，分列 reported/estimated usage、可用 price 与 policyDecision |

| 差异 | 本次处理 / 待定事项 |
|---|---|
| 新旧 P0–P5 与 V0–V2 含义不同 | 使用 CG0–CG5 编排、保留旧 ID；QR 与 P3-07/08、WB-01 只承接新增缺口，无重复新建老任务 |
| 原计划把 SIWC 当订阅路线但未明确共享池 | 依据官方说明确定 `work_codex_shared`；普通 ChatGPT 额度没有已确认的 DSH 主动接口，不以 OAuth 或模型名推断 |
| 旧记录称 SIWC 未接入、任务状态机不存在 | 更新为实验插件已实现/局部验证；MGSD SQLite 状态基础存在但通用闭环不全；历史记录不充当当前状态 |
| 新文档建议新增接口/ADR/根规则 | 复用已发布服务与现有 Agent Notes 流程；本节保留规划差异，未实施方案不放 implemented notes；不改产品架构页宣称 Router/Quota 已上线 |
| 新文档要求 Codex/Codely 双模式 | 保留为目标；Codex 有两类源码候选，Codely 仅定位 external-agent 示例；native-model 继续标 unknown，不能伪造支持 |
| API 默认回退与额度保护 | 费用来源变化、账号切换、额外付费及能力降级须政策授权；当前业务尚无完整政策执行器，CG1 再实现 |
| Review 状态名 `accepted/needs_changes` 与旧 `accept/request_changes` | 前者视为语义说明，后者保留为本计划目标枚举；实施时映射现有 MGSD review 事实，持久化名称未在本轮改动 |

参考项目 ChatToHarness、codex-chatgpt-web、chatgpt-use 仅作为后续研究线索，本轮未审计其源码或确认其授权和计费主张。CG5 产出若形成长期设计理由，再按现有提案流程登记；不能据参考项目宣传开启生产接入。
