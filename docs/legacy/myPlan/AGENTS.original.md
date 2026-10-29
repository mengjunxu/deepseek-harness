# DSH 实施计划（Implementation Plan）vNext.4

> **版本**：vNext.4 / 2026-10-27
> **目标 PRD**：`DSH_PRD_vNext_4_2026-10-27.md`
> **交付用途**：供 Codex 审计现有 DSH 仓库，增量合并需求、制定迭代并按阶段实施
> **项目定位**：独立、通用、跨项目/设备的 Agent Harness。DSH 自有 UI 为唯一主要交互入口。
> **本版重大纠偏**：**ChatGPT Web 和 SIWC 同级 Provider；Planner 可选；模型 Review 可选；Codex/Codely 是独立可切换执行器。**
> **默认执行授权**：本文件交给 Codex 后仅允许执行 **P0 现状审计与计划合并**。没有用户额外指示，不应直接在真实账户上运行非官方 Web 自动化、不应改写全局 Codex 配置或进入 P1 以后代码修改。
> **说明**：本文所示建议模块名和接口均为目标契约；尚未检查当前用户本地仓库，不能视为已实现文件/能力。

---

## 0. Executive Decisions / 技术决策摘要

| ID | 新版必须坚持的结论 | 对旧方案的影响 |
|---|---|---|
| AD-01 | Chat Provider 和 Executor 是两个独立路由维度 | 删除 Web 必须经过 Codex、SIWC 必须配 Codex 的假设 |
| AD-02 | Web、SIWC 在 UI 和 Provider Registry 中平级 | 替换 vNext.3 Web 作为唯一核心链路的拓扑 |
| AD-03 | ChatGPT 做聊天/理解、**按需**计划与 Review | 删除固定 `Planner → Executor → Reviewer` 流水线 |
| AD-04 | 工程任务进入执行链路必须有最小 TaskSpec；**PlanRevision 可选** | 简单任务直接委派 Agent 的原生规划 |
| AD-05 | Codex/Codely `external-agent` 是工程执行的优先模式，保留内部 Agent Loop | 不以 Tool Bridge 取代完整工程 Executor |
| AD-06 | Reverse MCP Tool Bridge 是可选模型辅助工具链，Codex Native Host 是须 PoC 证明的特殊 Tool Host | 不是每轮都强制启动 Tunnel/绑定 Codex Turn |
| AD-07 | DSH Store 是 Session/Memory/Task/Run/Checkpoint 的权威 | 切换 Provider 或 Executor 不丢任务语义 |
| AD-08 | SIWC 官方授权计入 Work/Codex 共享额度；Web 自动桥接是非官方实验能力 | 不把普通聊天额度当作官方第三方推理接口 |
| AD-09 | 分阶段上线；Web 真实自动化有独立使用授权/条款门禁 | 技术 PoC 不意味着发布许可 |
| AD-10 | 首期 Workflow 模板可由规则/同一 Chat Turn 结果选择，用户可 Override；动态生成 Workflow 属 TODO | 保留既有 ADR 决策，不建强制独立 Planner |

### 0.1 与旧文档的关系

- **继承**：V0–V2 的 DSH 通用 Harness、Task/Session/Checkpoint、共享记忆、多端 Worker、Codex/Codely 双模式；vNext.1 的 TurnAttempt、Capability Broker、ContextEpoch；vNext.3 的 codex-chatgpt-web 参考源码索引与可靠性措施。
- **修正**：vNext.2/vNext.3 中 Web Full Harness 升为“默认 Agent Loop”、Reverse Codex 是首要执行路径的设计。新 Plan 将其拆成 `ChatGPTWebProvider`（模型接入）与 `OptionalReverseToolBridge`（可选工具通道）；工程执行仍主要走 `ExecutorRouter → Codex/Codely`。
- **不覆盖**：任何已确认的仓库 ADR、AGENTS.md/CODELY.md、ARCHITECTURE.md、WORKFLOW.md、MEMORY.md，应先审计后增量改动。原有 ADR 编号/优先级以仓库内容为准，出现冲突需登记并提交决策。

---

## 1. 正确的系统拓扑

```text
┌──────────────────────────────────────────────────────┐
│ DSH Chat UI                                          │
│ Workspace / Session / Provider / Executor / Workflow │
│ Chat stream / Task timeline / Approvals / Artifacts  │
└────────────────────────┬─────────────────────────────┘
                         │ ChatTurn / UI Action
                         ▼
┌──────────────────────────────────────────────────────┐
│ DSH Chat Runtime (authoritative)                     │
│ MessageStore · ContextBuilder · Memory · TurnJournal │
│ Intent/Task Decision · Workflow Policy · QuotaPolicy │
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│ Chat Provider Router [independent from Executor]     │
│  ├─ ChatGPT Web Provider (experimental / gated)      │
│  ├─ SIWC Responses Provider (official / plan usage)  │
│  ├─ OpenAI API Provider (separately billed)           │
│  └─ Local/Other Authorized Provider                   │
└────────────────────────┬─────────────────────────────┘
                         │ normalized events
                         ▼
┌──────────────────────────────────────────────────────┐
│ Adaptive Workflow Decision                           │
│  ├─ chat.direct             → Reply only              │
│  ├─ task.quick              → Minimum TaskSpec        │
│  ├─ task.standard           → Optional Plan           │
│  └─ task.milestone          → Explicit PlanRevision   │
└─────────────────┬────────────────────────────────────┘
                  │ when TaskSpec is created
                  ▼
┌──────────────────────────────────────────────────────┐
│ DSH Orchestrator / Store                             │
│ TaskSpec · PlanRevision? · Run · Artifact · Checkpoint│
│ WorkerLease · AuditEvent · Validation / ReviewPackage│
└────────────────────────┬─────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────┐
│ Executor Router [independent from Chat Provider]     │
│    ├── Codex External Agent (own native Agent Loop)  │
│    └── Codely External Agent (own native Agent Loop) │
│    [Legacy native-model mode remains separate]       │
└────────────────────────┬─────────────────────────────┘
                         │
                    Run + Evidence
                         │
                         ▼
             Deterministic Verification
                         │
               [Optional LLM Review]
                         │
                    DSH Chat UI

OPTIONAL, ORTHOGONAL TOOL ENTRY:
ChatGPT (official client or permitted Web Provider)
  → supported MCP Connector / Secure Tunnel
  → DSH MCP Gateway → Scoped Tool Broker → DSH Tool Host
                                             └─ Proven active Codex Tool Host (if truly available)
  → results returned to same model turn when connector supports it
```

### 1.1 两个独立配置键（不可合并）

- `chatProviderSelection`: `providerId + modelId + effort + account/workspace + quota policy`。
- `executorSelection`: `executorId + mode + workerId + sandbox/approval + runtime settings`。

`workflowSelection` 是第三个正交维度，默认 `auto`；不能写死在某个 Provider 或 Executor 中。

### 1.2 模式边界

| 模式 | 谁决策 | 谁执行 | 消耗什么 | 是否默认 |
|---|---|---|---|---|
| Chat-only | 所选 Chat Provider | 无工程执行 | Provider 对应额度 | 日常默认 |
| Task via External Agent | ChatGPT 对话/任务理解；执行器可自主规划 | Codex/Codely 原生 Agent Loop | 聊天 Provider + Executor 各自额度 | 工程默认 |
| Optional reverse tool call | ChatGPT 当前 Turn | Scoped DSH Tool Host / 真实 Codex Tool Host | 由 Chat Provider 决定模型用量；工具另计资源 | 非默认、明确授权 |
| Existing native-model mode | DSH Native Agent Loop | DSH 工具系统 | 已验证的 Model Provider 额度 | 保留兼容，不与 external-agent 混合 |

---

## 2. 开始编码前：仓库审计、版本锁定、证据产物

### 2.1 P0 必查项目（不能跳过）

1. 根目录文档：`AGENTS.md`、`CODELY.md`、`ARCHITECTURE.md`、`WORKFLOW.md`、`MEMORY.md`、现有 `DSH_IMPLEMENTATION_PLAN.md`、`DSH_CHECKLIST.md`、ADR 目录。
2. 真实技术栈与包管理器，主进程 / UI / Agent Runtime / Service 层；别根据建议接口假定项目用 TypeScript 或 .NET。
3. 已有 Model Provider 注册表、SIWC/OAuth、Responses、Codex/Codely 插件、执行器和 Task/Memory 存储。
4. 现有 Session/Task/Workflow 的键、版本、状态机、迁移和已发布兼容接口。
5. 代码里的 Codex/Codely 工作模式：`native-model/subscription` 与 `external-agent` 已有哪些；是否使用 ACP/App Server/CLI，是否支持流式、取消、恢复与审批。
6. MCP 和 OpenAI Tunnel 的现有实现、权限、用户确认、持久任务，是否已具备工具网关。
7. 多设备 Worker、仓库 GitHub 同步、会话 Import/Fork、诊断监控、Secret Store 的现状。
8. UI 的 Provider/Executor 选择能力及其实际数据来源。
9. 当前测试基线、CI、用户已有的有效 Workflow / ADR 决议及冲突。

### 2.2 必须产出（P0）

- `docs/analysis/DSH_VNEXT4_GAP_ANALYSIS.md`（或适配现有文档目录）：`Feature / Current Evidence / Gap / Reuse / Proposed Change / Tests / Risk`，每个结论附路径和关键代码入口。
- `docs/analysis/CGW_REFERENCE_LOCK.md`：参考仓库的 commit SHA、选取的模块/文件、行为与 DSH 对应关系，注明只可借鉴不代表可直接复制。
- 新版 ADR 变更建议：明确 Provider 平级、Planner 可选、Tool Bridge 仅可选。仓库已有 ADR 若冲突，不得私自抹除。
- 更新开发 Checklist：标记 `done / partial / todo / blocked / obsolete`，拆出最小实现工单和验收。
- **只做 P0，不改业务实现**；除非用户随后明确要求进入开发。

### 2.3 仓库变更原则

- 优先复用现有接口，**不平行造第二套** TaskStore/ProviderRegistry/WorkflowEngine/MemoryStore。
- 不凭旧 Plan 认定文件存在，不按旧 Plan 大范围重命名模块。
- 文档变更需保持中文，术语中英一致；保留历史决策和变更缘由。
- 默认不修改 Codex 全局 `config.toml`、不安装不受信任服务、不导入 ChatGPT Cookie、不访问用户真实账号的实验路径。

---

## 3. 关键领域模型与接口契约（建议，映射现有接口）

> 以下使用 TypeScript 风格伪类型仅为描述契约；实现使用 DSH 当前工程语言/框架。所有 ID 需要全局唯一或在租户/工作空间作用域唯一，并且支持持久化与事件追踪。

### 3.1 统一 Provider 描述符

```ts
type ProviderClass = 'siwc' | 'chatgpt-web' | 'openai-api' | 'local' | 'other';
type UsageSource =
  | 'work_codex_shared' | 'chatgpt_web_unofficial'
  | 'openai_api_billed' | 'local' | 'other_authorized';
type Support = 'supported' | 'unsupported' | 'unknown';
type ProviderAvailability =
  | 'unconfigured' | 'auth_required' | 'ready'
  | 'limited' | 'gated' | 'unavailable';

interface ChatProviderDescriptor {
  id: string;
  kind: ProviderClass;
  displayName: string;
  usageSource: UsageSource;
  officialInferenceInterface: boolean;
  availability: ProviderAvailability;
  gateReason?: string;
  models: Array<{ id: string; displayName: string; effortChoices: string[] }>;
  capabilities: {
    streaming: Support;
    text: Support;
    vision: Support;
    functionTools: Support;
    structuredOutput: Support;
    resume: Support;
  };
}
```

**不变式**：
- `providerId` 和 `executorId` **不得共用一个枚举/对象作为选择状态**。
- 同名模型在 SIWC、Web、API 的能力与额度不同，不得仅凭 model name 合并。
- 无法核实的 Web 用量显示估计或未知；本地 Submission Count ≠ 官方余额。
- Web Provider 处于 `gated` 时注册可见，但**不得执行真实自动访问**；系统可运行 Mock/Manual 测试。

### 3.2 Chat Turn、事件与会话

```ts
interface ChatTurnInput {
  sessionId: string;
  turnId: string;
  providerId: string;
  modelId: string;
  effort?: string;
  contextEpochId: string;
  input: MessagePart[];           // messages/files/image refs
  workflowPreference: 'auto' | 'chat' | 'quick' | 'standard' | 'milestone';
  allowedToolGrantIds: string[];  // may be empty for ordinary chat
  clientRequestId: string;       // stable idempotency key per user action
}

type TurnEvent =
  | { type: 'turn.accepted'; turnId: string; sequence: number }
  | { type: 'text.delta'; turnId: string; sequence: number; delta: string }
  | { type: 'tool.requested'; turnId: string; sequence: number; toolCallId: string }
  | { type: 'tool.finished'; turnId: string; sequence: number; toolCallId: string }
  | { type: 'turn.completed'; turnId: string; sequence: number }
  | { type: 'turn.failed'; turnId: string; sequence: number; reason: string }
  | { type: 'turn.cancelled'; turnId: string; sequence: number };
```

归一化事件日志支持断线重放和 UI 事件恢复；`turn.completed` 只在 Provider 明确报告完成且相关工具栅栏通过后触发。

**TurnAttempt 状态机**：

```
created → prepared → submitting ─→ accepted → streaming/tool_wait → completed
                            │                       ├→ failed
                            └→ submission_unknown   └→ cancelled
```

- `submission_unknown`：请求可能已抵达模型/工具，但客户端未拿到确认；不默认重发会产生副作用的请求。
- 纯模型无副作用调用可按 Provider 独立重试策略处理；已接受的模型消息/工具请求不能盲目重复发送。
- 原生 SIWC 完成语义以其官方 `response.completed` / `failed` / `incomplete` 区分，不能从 SSE 断开推断完成。

### 3.3 TaskSpec 与可选 Plan

```ts
interface TaskSpec {
  taskId: string;
  sessionId: string;
  originatingTurnId: string;
  workspaceId: string;
  objective: string;
  constraints: string[];
  acceptanceCriteria: string[];
  inputArtifactRefs: string[];
  workflowTemplateId: string;    // e.g. task.quick.v1
  workflowVersion: string;
  riskLevel: 'low' | 'medium' | 'high';
  executorSelection: { executorId: string; mode: 'external-agent' | 'native-model' };
  planRevisionId?: string;       // intentionally optional
  reviewerPolicy: 'none' | 'on-risk' | 'required-by-user';
}

interface PlanRevision {
  id: string;
  taskId: string;
  version: number;
  milestones: Array<{ id: string; objective: string; dependsOn: string[] }>;
  authoredBy: 'user' | 'model' | 'import';
  approvedAt?: string;
}
```

**禁止**：数据库把 `planRevisionId` 设为不可为空，并要求创建任何 Task 都必须插入空 Plan；强制的 Planner 节点会破坏 `task.quick.v1`。

### 3.4 执行 Agent、结果和 Checkpoint

```ts
interface ExecutionRequest {
  taskId: string;
  runId: string;
  executorId: string;           // codex | codely | future
  mode: 'external-agent' | 'native-model';
  workerId: string;
  workspaceId: string;
  taskSpecRef: string;
  optionalPlanRef?: string;
  checkpointRef?: string;
  approvalPolicyRef: string;
}

interface ExecutionResult {
  runId: string;
  status: 'succeeded' | 'failed' | 'cancelled' | 'unknown';
  diffArtifactRefs: string[];
  testArtifactRefs: string[];
  diagnostics: string[];
  checkpointRef?: string;
  supportsResume: boolean;
}

interface ReviewPackage {
  taskId: string;
  taskSpecRef: string;
  planRevisionRef?: string;
  changedFileSummary: string[];
  validationResults: string[];
  riskSummary: string[];
  artifactRefs: string[];
}
```

**Run 必须绑定实际启动的 Executor**；后续切换选择器只影响新 Run，不得回写旧 Run 的 Executor。恢复/续跑能力只可按驱动能力声明，不假设 Codex/Codely 支持等价 resume。

### 3.5 Capability Broker（可选 Tool Bridge 的基础）

```ts
interface ToolGrant {
  grantId: string;
  callerIdentity: string;
  sessionId: string;
  turnId: string;
  taskId?: string;
  workspaceId: string;
  allowedTools: string[];
  allowedRoots: string[];
  expiry: string;
  approvalMode: 'read-only' | 'prompt' | 'preapproved-limited';
  toolHostKind: 'dsh-native' | 'codex-active-native';
}
```

- 调用者身份不能只依据模型自行陈述的 Turn ID；要以 DSH 承认的会话/工具调用证明核验。
- 危险工具操作必须显式审批；默认拒绝跨 Workspace、过期令牌、未知 Tool Host。
- 只有当能验证真实 Codex 当前 Turn 的工具注册表/能力时才允许 `codex-active-native`；否则 `unsupported` 并使用 DSH 自己的工具或 External Agent，不隐藏降级。

---

## 4. 自适应 Workflow Engine 的落地设计

### 4.1 不增加额外 Planner 作为强制前置节点

Router 可以利用同一 Chat Turn 的结构化输出、用户选定模板、确定性风险/工作空间规则选择流程；**不要求为分类再额外消耗一次模型调用**。初期选择逻辑：

1. 明确 `Chat only` → 直接对话，禁止创建 Task。
2. 用户明确 `Quick/Standard/Milestone` → 保留用户 Override；校验工作空间/权限。
3. 默认 `Auto`：普通问答直接回复；有执行意图才创建最小 TaskSpec；涉及多仓库/高风险/跨阶段则选择显式 Plan 模板。
4. Codex/Codely 可以在其原生执行循环中编排操作；这不构成 DSH 层额外 PlanRevision。
5. 结束时先跑确定性验证；依据风险、用户选项、跨模块影响决定是否创建 ReviewPackage 并调用 ChatGPT。

### 4.2 推荐规则矩阵

| 条件 | Template | 是否调用显式 Planner | 是否外部执行 | 是否模型 Review |
|---|---|---|---|---|
| 问答/咨询/解释 | chat.direct.v1 | 否 | 否 | 否 |
| 修改文档或小问题（低风险） | task.quick.v1 | 否 | 是 | 默认否 |
| 常规工程开发 | task.standard.v1 | 仅必要时 | 是 | 按风险/用户指定 |
| 架构调整、多模块/多仓库 | task.milestone.v1 | 是 | 是（可多次） | 一般是 |
| 工程现状分析、定位问题 | task.inspect.v1 | 默认否 | 可选 | 可选 |

### 4.3 结构化事件最小契约

- `workflow.selected`：包含模板 ID、版本、选择依据（非隐藏推理）、Override 来源。
- `task.created`：只有进入执行链路才发。
- `plan.created/updated`：可选，支持无 Plan 任务。
- `execution.started/progress/finished`：按 Run ID 追踪。
- `validation.finished`：明确具体通过/失败/未运行项。
- `review.started/finished/skipped`：未执行审查时使用 `skipped`，不能写成 `passed`。

### 4.4 错误恢复

- Chat 与 Task 两条路径之间不可让一次意图分类失败造成重复创建 Task。
- 每个 Task 创建动作带幂等键，且原始用户 Turn 与 Task ID 可回溯。
- Workflow 模板版本随 TaskSpec 持久化，更新模板不能悄悄改变旧任务。
- Agent 动态生成 Workflow：写入 TODO，不作为 P1/P2 的阻塞项。

---

## 5. SIWC Provider：官方稳定基线

### 5.1 实现边界

1. OAuth/PKCE 授权与持久 Host Identifier；按官方用户/工作区模型管理凭据。
2. 使用同一账号 Access Token 查询可用 Model Catalog，不硬编码“所有用户都有同样模型”。
3. `/v1/responses` 官方请求必须 `store:false`、`stream:true`，显式编译 `input` 中必要的历史。
4. 处理 `response.completed`、`response.failed`、`response.incomplete`、网络断流和 Token 过期；需正确刷新并重新验证权限。
5. 支持官方当前许可的 function/custom tools；不要将 Hosted MCP、ImageGen、Computer Use 等未支持功能当作已支持。
6. 关联 `UsageSource=work_codex_shared`，在 UI 与 QuotaPolicy 中保护执行器可用额度。
7. 稳定保存 Provider 选择、模型、Effort 和历史版本，不以 `previous_response_id` HTTP 续接代替 DSH ContextStore。

### 5.2 Provider 层测试

- Account A/Workspace A 与 Account B/Workspace B 的模型目录和权限隔离。
- Token 失效有刷新和失败恢复，不泄漏 token 值。
- 默认 `store:false` + `stream:true`，且用户自定义历史能正确装入后续 Turn。
- 未收到 `response.completed` 时不得写成功。
- 模型能力不可用时 UI 明确禁止而不是自动使用其他 Provider。

**官方参考**：
- https://developers.openai.com/siwc/token-sharing-open-source
- https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
- https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
- https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites

---

## 6. ChatGPT Web Provider：平级接入，独立授权门禁

### 6.1 产品要求与工程准入的区别

**产品层已决定**：`ChatGPT Web` 与 `SIWC` 是同一级入口。两者可配置/显示能力/独立健康检查/可切换，并都遵守 ChatTurnInput 归一化事件契约。

**工程层未被授权直接上线**：ChatGPT Web 目前没有官方开放给 DSH 任意推理调用的普通聊天额度 API。`codex-chatgpt-web` 是非官方浏览器自动化，并不产生官方许可。OpenAI 条款限制自动或程序化提取服务输出。因此真实自动 Web Bridge 仅在确认适用使用权和条款允许后进入真实账号测试。若无法证明，不得提供自动读取页面、抓包伪 API、Cookie 导出、规避风控等运行能力。

### 6.2 分层拆解（借鉴，但不复制以 Codex 为中心的主链）

| DSH 子模块 | 完整功能描述 | 参考模块 |
|---|---|---|
| `ChatGPTWebProviderAdapter` | 统一 ChatTurnInput、结果事件、取消/健康；不让 UI 知道 Browser 内部细节 | [index.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/index.ts) |
| `BrowserSessionHost` | 本地独立登录会话、设备私有 Profile、隔离会话状态与登录凭据 | [launcher-browser-host.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/launcher-browser-host.ts) |
| `BrowserSessionLease` | `SessionId/TurnId/Model/Effort/ContextEpoch` 绑定，防止不同任务混用 Tab | [browser-worker.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/browser-worker.ts)、[conversation-key.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/conversation-key.ts) |
| `ContextEnvelopeCompiler` | 将 DSH 权威上下文编译成 Provider 可接收的内容，图片附件单独管理 | [prompt.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/prompt.ts) |
| `ModelIdentityGate` | 对模型身份、Effort、权限进行显式确认；拒绝无提示的错误模型 | [model.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/model.ts)、[chatgpt-session.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/chatgpt-session.ts) |
| `SubmissionReceipt` | 每次真正提交一次性记录，不因浏览器抖动反复发送 | [turn-execution.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/turn-execution.ts)、[retry-policy.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/retry-policy.ts) |
| `ReplyProjection` | 将源适配器内容转换为 DSH Text/Status/Done；避免重复拼接 | [browser-worker.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/browser-worker.ts) |
| `CompletionFence` | 当使用工具时必须等工具状态与最终回复均完成 | [turn-progress.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/turn-progress.ts) |
| `ContextEpoch` | 会话压缩、Checkpoint 和重建，保留 DSH 权威历史 | [compaction-handoff.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/compaction-handoff.ts) |
| `ContextBudgeter` | 检查模型上下文边界、附件与预算，超限显式处理 | [usage.ts](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/usage.ts) |
| `WebBridgeDiagnostics` | 显示 Provider 就绪状态、最近错误、网页变更/断线信息，敏感字段脱敏 | [Architecture](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/architecture.md) |
| `WebUsageEstimate` | 本地确认提交次数估计、未知的实际官方额度显示为未知 | [Architecture: Local ChatGPT Limits](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/architecture.md) |

### 6.3 实施门禁 G-WEB

- **G-WEB-0**：只实现插件注册、接口、Mock、UI、配置和隔离测试；不触达真实 ChatGPT Web 自动收发。
- **G-WEB-1**：技术验证采用本地 Mock Browser/记录的合成 UI，测试回复投影和 TurnAttempt 状态。
- **G-WEB-2**：获得明确允许并完成安全审查，才能对真实账号进行自动路径验证；审查人记录依据、账号/工作区许可、数据处理边界与回退策略。
- **G-WEB-3**：未经确认不得生产发布；继续维持 Web 的平级 UI 入口，但清晰标识 `gated` 并提供用户主动的 Manual ChatGPT/MCP 或 SIWC 选择。
- **G-WEB-4**：所有模式禁止绕过速率限制、规避检测、共享 Cookie、多账号聚合、内部 backend-api 逆向调用。

### 6.4 为什么不照搬 Codex config 注入

参考项目在 Codex 外层利用 Responses Base URL 代理完成模型接入；但 DSH 已经是独立 UI + Chat Runtime，**不应默认改写 Codex 全局 `config.toml` 只为获得 Web Chat Provider**。配置注入如确实适用于可选 Codex 调试模式，应作为独立的显式安装/恢复功能。

---

## 7. Executor Router：Codex/Codely 保留自己的 Agent Loop

### 7.1 要求

- 模型负责理解目标，DSH 决定是否创建 Task，而 Executor **自行规划**执行细节；不在每次文件/命令操作前回调 ChatGPT 重新规划。
- `IExternalAgentExecutor` 最小能力：`submit/run`、`streamEvents`、`cancel`、`getResult`；`resume` 与跨 Worker 迁移单独能力探测。
- Codex 和 Codely 采用不同 Adapter，但输出统一 `ExecutionResult/Artifact/ValidationResult`。
- 审批与 Sandbox 不能因 DSH Router 的存在而被绕过；DSH 需要绑定外部 Agent 已授予的实际权限。
- `native-model/subscription` 模式如已存在要保留并与外部执行模式显示区分；不能假定 OAuth 额度和官方 SIWC 相同。

### 7.2 执行器选择

`auto`（如后续支持）应基于真实能力、工作空间、可用性与用户成本偏好，而不是隐式跨服务切换。首期用户明确选择 `Codex` / `Codely`，DSH 固化选择到 Run。

### 7.3 TaskExecution 生命周期

```
queued → acquiring_worker → running → verifying → succeeded
                     │           ├→ failed
                     │           ├→ cancelled
                     │           └→ interrupted → recoverable / needs_user
                     └→ unavailable
```

`needs_user` 不能被表现为 succeeded。取消已派发 Agent 应尝试中止并记录取消确认；不能保证撤销已完成的文件写入，需要 Checkpoint/Diff/恢复路径。

### 7.4 Executor 适配测试

- 同一简单 TaskSpec 分别由 Codex/Codely 执行，结果结构一致，但保留原生 Agent Loop 行为。
- 未开始 Task 更换默认执行器后被正确选择；运行中切换需要新 Run/Checkpoint。
- 项目目录隔离、审批、取消、输出收集、测试工件和失败状态可核验。
- 默认 Chat Provider 改变不导致 Executor 未经授权地改变。

---

## 8. Optional Reverse Tool Bridge：保留但不强制

### 8.1 完整功能描述

当 ChatGPT 在**当前模型 Turn 内**为了回答或规划需要读取工程上下文，可使用经用户与工作区允许的 MCP 工具：

```
ChatGPT (选中的接入方式且支持工具)
  → OpenAI MCP Connector / Secure Tunnel（若适用）
  → DSH MCP Gateway
  → Scope/Permission/Turn Broker
  → DSH Native Tool Host (初期首选)
     或经证明存在的 Codex Active Native Tool Host（可选）
  → ToolResult 同回合返回 ChatGPT
```

**两项关键区别**：
1. Tool Bridge 执行工具操作 ≠ Codex/Codely 独立 Agent Loop 自动开发。
2. Tunnel 是工具调用通道，**不是 ChatGPT 普通聊天额度的推理 API**；是否可用依赖 ChatGPT 账号、工作区和 Connector 权限。

### 8.2 借鉴的参考实现

- [codex-chatgpt-web `turn-broker.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/turn-broker.ts)：轮次授权、原生工具代理与执行绑定。
- [codex-chatgpt-web `docs/security-model.md`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/security-model.md)：Turn Token、Broker 和安全边界。
- [ChatToHarness](https://github.com/DJ-Huang/ChatToHarness)：MCP Gateway、工具管理与长任务提交/查询模型。

### 8.3 Native Tool Host 的严格可行性门禁

1. 检查 Codex 接口是否实际允许外部 DSH 获取**活动 Codex Turn 的工具上下文与受权动作集合**。
2. 如果只能够通过 CLI 再启动一个 Codex Agent，判定为 **ExternalAgentExecutor**，不能标为 `codex-active-native` 或宣称“无需第二次模型推理”。
3. 如果无法安全复用原生 Host，先提供 DSH 自有只读工具/任务 API，保留未来 Adapter 插槽。
4. 原生工具 Token 不跨 Turn 重用、不复制到 ChatGPT 文本、日志和任务共享记忆。

### 8.4 长任务与 Tunnel 截止时间

任何可能超过单次 MCP 调用时限的工作，先 `task.create/start` 返回 Task ID，随后通过 `task.status/result` 查看；实际任务保存在 DSH Store，由 DSH Worker 自主推进。不可保持工具调用长连接作为任务生命周期的权威。

### 8.5 工具完成屏障

Tool Call 被接受后登记 `toolCallId`；只有 `tool.finished/failed/cancelled` 之一到达且模型输出最终完成，Turn 才能被标为 `completed`。迟到的写操作不能污染其他 Turn/Workspace。

---

## 9. Session / Memory / ContextEpoch / 多端

### 9.1 权威边界

- DSH 的 `MessageStore` 记录每条消息的 Provider、Model、Turn ID、正文与工件引用；只存必要证据，敏感字段脱敏。
- `ContextBuilder` 统一抽取用户历史、项目 Memory、TaskSpec、可选 PlanRevision、Checkpoint；切换 Web ↔ SIWC 时重新编译。
- `ContextEpoch` 标示某个 Provider 适配的上下文阶段、摘要来源、压缩版本和引用的 DSH Checkpoint。
- ChatGPT 账号 Memory 与 Web 对话记录并非 DSH 权威数据源，也不保证可自动完整导入。

### 9.2 Conversation Fork/Import

从 ChatGPT 导入的文本或外部记录是 DSH 新 Session 的资料输入，不能作为“已恢复官方 ChatGPT 会话”的承诺；fork 记录父会话与分叉点，支持后续不同 Provider 继续。

### 9.3 Worker 与 Session 隔离

- 运行中 Task 的状态在 DSH 持久存储，Worker 用 lease + heartbeat 保活；失联后 Run 进入可恢复或待人工处理状态。
- Browser Profile/Token 属设备级 Secret，不随 GitHub/普通 Memory 同步；其他设备的 Provider 登录状态按其自身授权配置。
- 多端 Worker 不得使用同一 Task ID 同时执行同一写操作；采用 lease fencing token 与幂等收据。

---

## 10. QuotaPolicy 与来源证明

| 来源 | 计费/限额 | 实现规则 |
|---|---|---|
| SIWC | Work/Codex 共享额度 | 设置与显示每应用使用限制；DSH 可本地保护执行任务额度 |
| ChatGPT Web 实验路径 | 项目作者声称 ChatGPT Web 独立限额，官方未认可第三方接入权 | 仅本地发送次数估计；未授权不执行 |
| OpenAI API | API 独立计费 | 预算上限/二次确认/不静默切换 |
| Local/Other | 依据后端实现 | 能力与可观察额度分开标注 |

### 10.1 路由规则

- Provider 原样执行用户明确选择的请求；不因额度耗尽切换到另一个收费来源。
- “保留 Work/Codex 额度”不是绕过限制，仅在合法 Provider 和用户明确授权的范围内调整日常聊天路由。
- Web Estimate 的计数以物理提交且已确认接受的事件为准；不能包括账户在其他客户端的所有消息。
- `QuotaPolicy` 的预算/用量必须与 `usageSource` 绑定，而非从账号登录方式猜测。

---

## 11. 分阶段开发计划（依赖、任务、DoD）

> `P` 阶段表示本次增量工作拆分，不替换旧版 V0–V2 的功能完成历史。每个阶段在开始前，先根据 P0 的 Gap Report 删除重复项、重排已有能力；标注完成证据。

### P0 — 仓库审计与 vNext.4 合并【默认仅执行此阶段】

**任务**：读现有工程/ADR/Plan/PRD，扫描 Provider、Task、Workflow、Executor、MCP、UI，更新设计基线并建立 Gap 和测试清单。锁定 codex-chatgpt-web 参考 commit。

**DoD**：
- 文档一致体现 AD-01～AD-10；明确“无强制 Planner / 模型 Reviewer”。
- 标注实际已完成/部分完成/未实现，不制造重复模块。
- 产出修改文档清单、明确的待决问题与 P1 最小实现候选。
- 未实现业务代码、未访问实验账号、不更改全局配置。

### P1 — Provider 与 Executor 解耦 + UI 平级选项

**任务**：基于已有注册表实现/补齐 `ProviderDescriptor`、`ExecutorDescriptor`、双选择器、会话当前/下轮配置、额度来源与状态显示；Web Provider 插件即使 gated 也注册为平级条目；Mock Provider 支持端到端测试。

**DoD**：
- UI Web/SIWC 平级，Codex/Codely 另一选择器；所选组合能正确进入后续 Turn/Run。
- 运行中的 Turn 不因切换选择器改变身份；无静默模型/额度降级。
- Web gated 不影响 SIWC 或执行器健康。

### P2 — 自适应 Workflow + 最小 TaskSpec 闭环

**任务**：实现 `chat.direct / task.quick / task.standard / task.milestone` 模板、用户 Override、TaskSpec 可选 PlanRevision、无需独立 Planner 的任务化过程；Verification 与 ReviewPolicy 分离。

**DoD**：
- 纯聊天从头到尾无 Task/Plan/Executor/Reviewer。
- 简单任务直接由最小 TaskSpec 派发，PlanRevision 可以为空，仍能成功结束。
- 复杂任务按需生成显式 Plan；Review `skipped/required/completed` 语义准确。
- 与现有 ADR 和 Workflow 文件规则一致。

### P3 — 官方 Chat 基线 + Codex/Codely 独立执行

**任务**：验证 SIWC 登录、模型目录、Responses 流式、ContextBuilder、错误恢复；完善 Codex/Codely External Agent Adapter，Run、Artifact、验证。

**DoD**：
- SIWC Chat、SIWC+Codex、SIWC+Codely 三条路径实测（可用测试账户/模拟 Provider）。
- Executor 自主 Agent Loop，不被强制第二个 ChatGPT Planner 回合控制每次操作。
- `response.completed` 与工具执行验证互不混淆；Run 可取消，结果完整。

### P4 — ChatGPT Web Provider 契约与受控研究（不阻塞 P3）

**任务**：Web 同级 Adapter 模型、Browser Lease/Session 绑定的设计；使用 Mock 做上下文、状态、重试、SSE 投影；建立 G-WEB 门禁记录和用户清晰的可用性提示。

**DoD**：
- Web Mock × Codex/Codely 两个组合通过契约测试。
- Web 未授权时真实自动调用始终阻断；UI 显示 gated 状态。
- 与 SIWC 使用相同 DSH ChatTurn/Workflow/Task 接口。
- 若授权未通过，阶段可算**架构与 Mock 集成完成**，真实 Web 访问留为 Blocked，而非偷偷发布。

### P5 — 上下文恢复、可靠性、额度保护

**任务**：TurnAttempt + SubmissionReceipt、CompletionFence、ContextEpoch/Checkpoint、ReviewPackage、QuotaPolicy、数据保护与错误诊断；切换和断线场景。

**DoD**：
- 有副作用操作未知提交状态不会被盲目重试；Tool 未完成不会虚报成功。
- Provider 切换后从 DSH Context/Checkpoint 继续，额度来源透明。
- 限额达到时停止或询问用户，而不是自动额外扣费。

### P6 — 可选 MCP Gateway / Reverse Tool Bridge

**任务**：优先 DSH Native Tool Host 的官方 MCP/Tunnel 连接、Scope Broker、审批和长任务返回 ID；独立验证 Codex Active Native Host 可用性。

**DoD**：
- ChatGPT → DSH 已授权只读工具成功返回结果；越权失败并审计。
- 无法使用 Codex 原生工具时，真实状态显示 `unsupported`，外部 Agent 执行仍正常。
- 长任务采用 start/status/result，不被单次 Tunnel 连接截止时间绑定。

### P7 — 多 Worker、运维与后续优化

**任务**：Worker Registry/Lease、Run 迁移/取消与 Checkpoint、诊断 Doctor、Daemon Drain、Secrets 和安装/升级完整性；可选子 Agent 兼容与跨设备。

**DoD**：
- 跨设备 Worker 的同一 Run 不会并发双写；无凭据泄漏；能查看任务进度和审计记录。
- 升级/关闭不会悄悄丢失活跃任务；不支持恢复时可读地告知。

### 11.1 依赖关系

```
P0 ──→ P1 ──→ P2 ──→ P3 ──→ P5 ──→ P7
                 │             ↑
                 └─→ P4 Mock ──┘  (Web real access separately gated)
P1/P3 ──→ P6 Optional MCP Tool Bridge
```

P4 真正访问 ChatGPT Web 的实验工作可由 G-WEB 门禁独立阻断，不应阻断 P1～P3 的正式流程，也不阻断 P6 的官方 MCP 方式。

---

## 12. 可执行测试矩阵（供 Codex 转为自动测试）

| Test ID | 测试 | 期望结果 | 阶段 |
|---|---|---|---|
| T01 | Provider 菜单 | Web/SIWC 平级，Web gated 正确显示 | P1 |
| T02 | Executor 菜单 | Codex/Codely 独立选择，与 Provider 不耦合 | P1 |
| T03 | 普通 SIWC 聊天 | 不产生 Task/Plan/Executor/Review | P2/P3 |
| T04 | Quick→Codex | 有最小 TaskSpec，无独立 Plan，原生 Agent Loop 执行 | P2/P3 |
| T05 | Quick→Codely | 与 T04 同型，执行器可替换 | P2/P3 |
| T06 | Standard | Plan 可有可无，Workflow 模板保存版本 | P2 |
| T07 | Milestone | 高级 Plan/里程碑/Checkpoint + 可选 Model Review | P2/P5 |
| T08 | LLM Reviewer skipped | 有验证结果，但不显示“LLM 验收通过” | P2 |
| T09 | Provider 运行中切换 | 只影响下一 Turn，旧 Turn 身份不变 | P1 |
| T10 | Executor 运行中切换 | 旧 Run 不变，新 Run 与 Checkpoint 关联 | P3/P5 |
| T11 | 四种组合 | Web Mock/SIWC × Codex/Codely 在接口层正常 | P3/P4 |
| T12 | Web 无许可 | 自动调用被阻断，不影响 SIWC | P4 |
| T13 | SIWC store/stream | 使用 `store:false`, `stream:true`，上下文完整 | P3 |
| T14 | SIWC 状态终结 | `failed/incomplete` 不被转为 `completed` | P3 |
| T15 | Model identity | 模型或 Effort 不匹配时显式失败，禁止悄悄替换 | P3/P4 |
| T16 | Web Mock Session 绑定 | 并发不同 Task/Turn 不混合回复 | P4 |
| T17 | 断线提交不确定 | 不盲目重复发送已接受请求/危险操作 | P5 |
| T18 | Tool Completion Fence | 工具未完成时 Turn 不结束 | P5/P6 |
| T19 | Context Compaction | Checkpoint 保留权限/Task/目标，切换 Provider 不丢失 | P5 |
| T20 | Quota Policy | Work/Codex 额度保护，不静默改用付费 API | P5 |
| T21 | 工具权限 | 跨工作空间/过期授权均失败 | P6 |
| T22 | 反向工具成功 | 受权 ChatGPT MCP 调用返回 DSH Tool Host 收据 | P6 |
| T23 | Native Codex 不可用 | 明确 `unsupported`，不伪称可在原 Turn 调工具 | P6 |
| T24 | 长任务 via MCP | 提交即返回 ID，后续按 ID 查询 | P6 |
| T25 | Worker 掉线 | Lease fencing 阻止两个 Worker 同时写 | P7 |
| T26 | Secrets | Token、Cookie 不出现于日志、Git、Memory、导出 | P1/P7 |
| T27 | Manual ChatGPT + MCP | 仅用户手动提交，系统不冒充自动 Web Provider | P4/P6 |
| T28 | DSH Session Fork | Fork 后继续不同 Provider，注明非官方 ChatGPT 原生续接 | P5 |
| T29 | 真实 Web 门禁审计 | 无授权时零真实 Web 自动访问 | P4 |
| T30 | 任务异常/审批 | 取消、失败、审批待处理均展示准确 | P3/P5 |

---

## 13. 风险台账与 Release Gates

| 风险 | 触发条件 | 缓解措施 | 发布门禁 |
|---|---|---|---|
| Web 非官方自动化与条款冲突 | 自动化提交/提取 ChatGPT 网页回复 | 禁止无授权实测；Mock、Manual 或 SIWC 替代 | G-WEB 明确准入 |
| SIWC 用量耗尽 | 日常聊天持续消耗 Work/Codex 共享池 | QuotaPolicy、提示、App limits、可选其他授权 Provider | 不隐性付费切换 |
| Codex Active Native Host 不可得 | 无法取得实际 Turn 工具能力 | 切换到 DSH Native Tools 或 External Agent，清楚标识差异 | 不承诺无第二次模型 |
| Planner 强制化 | DB/Workflow 要求每 Task 有 Plan | Plan 可空、Quick 测试、工作流分流 | T03/T04/T06 |
| Provider 误绑定 Executor | Web 接入绕过 Router 绑定 Codex | 双选择器/双 Registry/四组合契约测试 | T01/T02/T11 |
| 工具命令越权 | 漏掉 Scope Grant/Approval | Broker 验证、只读默认、审计、沙箱 | T21/T26 |
| 重放造成重复写入 | 请求提交状态不明确 | 收据和不确定态、幂等键、人工恢复 | T17 |
| 供应商能力变更 | SIWC/网页模型/接口版本变化 | Model Catalog、Capability Probe、锁定参考 commit | 能力不明=受限 |
| 多设备重复执行 | Worker 同时消费一个任务 | Lease fencing、持久 TaskStore、审计 | T25 |
| 文档与当前工程冲突 | 旧 ADR/Plan 已落实不同设计 | P0 证据审计、冲突记录、增量迁移 | 必须 P0 |

---

## 14. 参考项目功能借鉴矩阵（完整版）

> 此表用作代码阅读和分工索引，不承诺 GitHub `main` 永远保持相同路径；P0 需要记录 commit SHA 并逐项复核。参考仓库实现围绕 Codex 外层 Harness，DSH 应提取协议与设计，不复制其产品耦合。

| 编号 | 借鉴点 | DSH 对应模块 | 具体采用方式 | 优先级/门禁 |
|---|---|---|---|---|
| CGW-01 | Web 模型 / Responses 桥接 | `ChatGPTWebProviderAdapter` | 统一输入输出契约；Web 自动访问须许可 | P4 G-WEB |
| CGW-02 | Full Harness 反向 Codex 工具 | `OptionalReverseToolBridge` | 模型内工具回环；只作为可选 Tool Host | P6 |
| CGW-03 | Native passthrough 和模型路由 | `ChatProviderRouter` | DSH 原生路由替代对 Codex 的全局代理注入 | P1 |
| CGW-04 | Browser Worker/Tab Lease | `BrowserSessionHost` | 任务/模型/ContextEpoch 隔离，禁止共享敏感会话 | P4 G-WEB |
| CGW-05 | Context Prompt/附件 | `ContextBuilder` | 权威 DSH ContextEnvelope + 附件预算 | P3/P5 |
| CGW-06 | 模型身份与 Effort | `ModelIdentityGate` | 精确模型支持与无隐式回退 | P1/P4 |
| CGW-07 | Submission Receipt/Retry | `TurnAttempt` | 不确定提交不盲目重试 | P5 |
| CGW-08 | 回复投影/完成屏障 | `TurnStream` + `CompletionFence` | UI 事件统一与工具等待 | P4/P5 |
| CGW-09 | Turn-scoped Capability | `ScopedToolBroker` | Task/Turn/Workspace 权限绑定 | P6 |
| CGW-10 | Conversation Key | `ConversationBinding` | Chat Provider 的 Epoch 映射，不复用错误会话 | P4/P5 |
| CGW-11 | Compaction/Handoff | `CheckpointCoordinator` | 数据权威在 DSH，而非 Web 会话 | P5 |
| CGW-12 | Context Budget | `ContextBudgeter` | 超限明确失败/压缩；多模态分开计量 | P5 |
| CGW-13 | Browser-only/Full/Manual modes | `ProviderCapabilities` | 模型与工具能力分离；Manual 为独立交互方式 | P1/P4/P6 |
| CGW-14 | MultiAgent/Subagent | `DelegationProtocol` | 后期适配，避免混淆 Executor 原生子任务 | Later |
| CGW-15 | Daemon Drain/Service lifecycle | `RuntimeSupervisor` | 可控升级、活跃任务优雅停止 | P7 |
| CGW-16 | 隔离 DEV Profile | `BridgeLab` | Mock/独立测试状态，不碰生产配置/账号 | P4 |
| CGW-17 | Doctor/Diagnostics | `DiagnosticService` | Provider/Tool/Executor 分别诊断 | P4/P7 |
| CGW-18 | 本地用量估计 | `UsageLedger` | 本地确认计数，不能冒充官方余额 | P5 |
| CGW-19 | Secret/Sandbox/Approval | `SecurityPolicy` | 最小权限、审计、跨 Workspaces 隔离 | 全阶段 |
| CGW-20 | 打包完整性 | `RuntimePackageManager` | 后续完整性校验、版本回滚 | P7 |
| CGW-21 | 搜索/图片等能力透传 | `CapabilityRegistry` | 按 Provider 实际能力启用，不能假设 SIWC 支持 | Later |
| CGW-22 | Codex 配置注入 | `OptionalCodexIntegration` | 禁止为接入 DSH Web Provider 默认修改全局 Codex 配置 | Later/独立 |

### 14.1 参考源码阅读顺序（Codex 可执行）

1. [README](https://github.com/miuuyy/codex-chatgpt-web) → 三种模式、官方/非官方边界。
2. [Architecture](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/architecture.md) → 模型适配 + 反向工具 + Session/Compaction。
3. [Security Model](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/security-model.md) → 授权与任务隔离。
4. [`src/adapters/chatgpt-web/index.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/index.ts) → Provider/Responses 集成。
5. [`browser-worker.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/browser-worker.ts) → Browser Session 与回复投影。
6. [`turn-broker.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/turn-broker.ts) → Scoped Native Tool 回环。
7. [`turn-execution.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/turn-execution.ts) → 提交、状态、完成事件。
8. [`conversation-key.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/conversation-key.ts) → Session/Task/Model/Epoch 绑定。
9. [`compaction-handoff.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/compaction-handoff.ts) → ContextEpoch/Checkpoint。
10. [`retry-policy.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/retry-policy.ts)、[`turn-progress.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/turn-progress.ts) → 失败/完成栅栏。
11. [`prompt.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/prompt.ts)、[`usage.ts`](https://github.com/miuuyy/codex-chatgpt-web/blob/main/src/adapters/chatgpt-web/usage.ts) → Context/预算。
12. [ChatToHarness](https://github.com/DJ-Huang/ChatToHarness) → MCP 工具 Gateway、长任务/权限设计。

### 14.2 参考版本的真实性与锁定

P0 由 Codex 查看可用源码后写下真实 `commit SHA`、license、核心文件路径与导出函数；如果仓库移动了某个路径，则以已锁定 commit 为准并更新索引，**不要假设本文件对应当前 HEAD 的所有细节都稳定**。

---

## 15. 文档合并、迁移和 ADR 更新策略

1. 从现有架构中保留 `DSH only entry / memory / task / checkpoint / worker / dual executor`，不得用新的 Web 研究代替已有运行链路。
2. 新建/更新“Provider 与 Executor 独立”ADR，以及“Task-Centric Adaptive Workflow：Planner optional”ADR；编号按仓库规则命名。
3. 将旧 Plan 中 “Web Full Harness 必须先完成”“每个任务固定 Planner → Reviewer”标为已废弃描述，并在变更日志记录为什么。
4. 在 `WORKFLOW.md` 写明模板版本、Auto 选择策略、Override、TaskSpec、PlanRevision 可空、ReviewPolicy 与未来动态 Workflow TODO。
5. 在 `AGENTS.md` / `CODELY.md` 或仓库实际规范中明确：先读 `ARCHITECTURE.md`、`WORKFLOW.md`、`MEMORY.md` 与当前 TaskSpec；执行 Agent 可以自主规划细节，但必须尊重 DSH Task 边界，产出可验收结果。
6. 不在聊天文档里存账号凭据、Cookie、完整机密代码。同步机制与运行时 Secret Store 严格分开。
7. 所有里程碑 DoD 都关联自动测试、文档及状态证据，避免“完成接口定义”误当作“集成通过”。

---

## 16. 给 Codex 的初次执行 Prompt（仅 P0）

```text
请在当前 DSH 仓库中读取：
- DSH_PRD_vNext_4_2026-10-27.md
- DSH_Implementation_Plan_vNext_4_2026-10-27.md
- AGENTS.md、CODELY.md、ARCHITECTURE.md、WORKFLOW.md、MEMORY.md、已有实现计划和 Checklist、所有相关 ADR（存在则读取）。

本轮只执行 P0：仓库现状审计、方案差异分析和文档更新，不能直接改写业务实现。

请遵守以下新版权威决策：
1. DSH 自有 Chat UI 是主要入口。
2. ChatGPT Web 与 SIWC 在 Chat Provider Router/UI 中平级，可独立选择；Web 自动桥接属于须授权和合规门禁的实验功能。
3. ChatGPT 用于日常聊天、需求理解、按需规划和按需验收；独立 Planner 不是强制阶段，独立 LLM Reviewer 也不是强制阶段。
4. 普通聊天直接回复；简单任务生成最小 TaskSpec 后交给 Codex/Codely 自主执行；复杂任务才按需生成 PlanRevision。
5. Codex/Codely 是独立 Executor，并保留各自原生 Agent Loop；Model Provider、Executor、Workflow 三个维度不得混合。
6. 反向 MCP/Tunnel/Codex Native Tool 机制作为可选的辅助 Tool Bridge，不应替代 External Agent 执行主链。
7. DSH 管理权威 Session、Memory、Task、Plan、ExecutionRun、Checkpoint、Artifact、Quota 与审批；保留旧 V0–V2 的有效设计和双模式能力。

请先实查代码（提供实际文件路径/关键符号），再列出 done/partial/todo/blocked/obsolete。
逐项把新版 PRD 与旧的 vNext、vNext.1、vNext.2、vNext.3 方案对照，标记需要废弃的固定 Planner 与 Web 中心化设计。
审阅 codex-chatgpt-web 与 ChatToHarness 的参考模块，记录固定 commit SHA 及具体可复用/不可复用之处；禁止仅凭 README 断言功能已在 DSH 实现。

交付：
A. GAP_ANALYSIS（现状证据+影响+复用建议）；
B. ADR/ARCHITECTURE/WORKFLOW/Checklist 的增量变更提案或修订；
C. P1～P7 按真实代码现状的任务拆分和测试映射；
D. 风险、外部授权依赖、未解决问题和推荐下一阶段；
E. 本轮修改文件列表、验证方式及结论。

禁止：未授权 ChatGPT Web 自动化/逆向、改写 Codex 全局配置、导出 Cookie、安装远程脚本、重写已有 Harness、直接启动 P1～P7。
完成 P0 后停止，汇报可审阅的结果。
```

---

## 17. 外部资料与验证状态

- [OpenAI SIWC — Overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [SIWC — Models and Inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [SIWC — Preview Limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [SIWC — 订阅共享额度说明](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)
- [codex-chatgpt-web](https://github.com/miuuyy/codex-chatgpt-web)
- [codex-chatgpt-web Architecture](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/architecture.md)
- [codex-chatgpt-web Security Model](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/security-model.md)
- [ChatToHarness](https://github.com/DJ-Huang/ChatToHarness)
- [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)

**外部公开资料已于 2026-10-27 查阅；“适配思路可行”不等于“用户仓库已实现”，社区 Browser Bridge 能运行也不等于 OpenAI 给予普通聊天额度第三方 API 授权。**

---

## 18. 本版签收检查表（给维护者）

- [ ] PRD 和 Plan 都明确 Web/SIWC **平级**、Executor 另选。
- [ ] 纯聊天不强制 Task/Plan/执行/Review。
- [ ] 简单任务 TaskSpec 必需而 Plan 可选。
- [ ] Codex/Codely 保留自己的执行 Agent Loop。
- [ ] Web Provider 与 Optional Reverse Tool Bridge 分成两个模块。
- [ ] SIWC 与 Web 额度/合规状态分别准确标注。
- [ ] 失败状态/断线重试/工具审批可审计。
- [ ] 多设备、旧 V0–V2、旧双模式被兼容保留。
- [ ] Codex 首轮只执行 P0 并依据真实源码生成 Gap Report。
- [ ] Agent 动态生成 Workflow 仍在未来 TODO，不占用当前阻塞路径。
