# Generic Agent Harness — 架构设计与 Execute Plan

> **版本**：v4.0（DSH 原生 Harness + Codex/Codely 双模式接入）  
> **更新日期**：2026-10-10  
> **状态**：架构基线 / 分阶段可实施  
> **适用范围**：任意受支持的 Git 工程；Windows / macOS / Linux；单机或跨设备  
> **架构基础**：DSH 是唯一 Harness Foundation，提供 Web UI、Agent Loop、LLM seam、Tool、Session 与插件生命周期；TypeScript 插件扩展 Task/Memory/Workflow/Workspace；GitHub 是可替换的协调插件；Codex/Codely 各有 `subscription` 与 `external-agent` 两条路径。  
> **使用方法**：先做 Phase 0S（四模式可行性/授权闸门），再按 Phase 0–8 顺序实施；每阶段验收后再推进。

---

## 0. 本次版本结论：这是一个通用框架，而不是某个项目的工具

**唯一定位**：构建一个可移植、可扩展、可观测、可中断恢复、可跨设备协作的 **Generic Agent Harness**。它不以任何具体业务仓库、开发语言、IDE 或 Agent 产品为前提。

### 0.1 v3 → v4 的确定架构决策

| 维度 | v4 的最终约束 | 实施后果 |
|---|---|---|
| Harness 基础 | **DSH 是唯一、必须的 Harness Foundation** | 原生复用 Web UI、Agent Loop、Session、Tool Registry、Event、插件；**不得另造平行 Harness** |
| Native Model Provider | **Codex 和 Codely 均要求 `subscription` 路径** | 两者分别以 DSH LLM Provider 身份进入模型选择器，DSH 驱动主 Agent Loop；成功与否须过兼容/权益验证门槛 |
| External Runtime | **Codex 和 Codely 均要求 `external-agent` 路径** | 两者通过 DSH 原生 subagent/provider 或 ACP/CLI 接入，内部 Loop 由各自 Runtime 控制 |
| 两种模式不混同 | `subscription` = DSH Loop；`external-agent` = 产品自己的 Loop | 禁止把完整的 CLI/SDK Agent Loop 包装成假 LLM completion |
| 零额外 API | **默认 `allowPaidApi: false`** | 支持本地模型、可验证的订阅接入、外部已有账号；失败不得静默切换计费 API |
| 订阅配额 | Codex 的 ChatGPT 订阅登录不等于普通 ChatGPT Chat 消息配额 | 不承诺“无限免费”、不绕过 5h/周限额、不缓存或传播 OAuth 凭证 |
| Provider 状态 | `codex/subscription` 参考 pi2dsh 与 dsh-codex-subscription；`codely/subscription` 参考 dsh-codely 原型 | **社区实现可借鉴但不视为已验证的生产通道**；每个插件需审计、许可与 e2e |
| 模型/执行双路由 | `ModelProviderRegistry` 归 DSH LLM seam，`AgentRuntimeRegistry` 归 DSH 子代理 seam | Model selector 和 Workflow Role selector 使用不同接口，UI 可展示同一产品的两种 Mode |
| Session 来源 | DSH 原生 `ctx.sessions` 为会话事实来源 | SQLite 仅存业务 Task/Attempt、索引、Lease/Checkpoint 元数据，不复制或覆盖 DSH 会话事件事实 |
| 多设备协同 | GitHub Control Repo + Durable Inbox + Runner | 密钥、订阅登录和完整会话保存在执行节点；跨节点移交为明确的 Checkpoint/Artifact |
| 项目范围 | 通用 DSH 增强平台，和任何业务项目无关 | 领域 Skill 独立扩展，MVP 用两个无关 fixture 仓库测试 |

### 0.1.1 本轮合并的来源与证据边界

用户分享记录：`https://chatgpt.com/share/6ac9e034-83f8-83ec-bf70-d02396810848`（《分析 Codex 订阅接入》）。本执行计划整合该讨论的**“DSH 保持唯一 Harness、Codex/Codely 都以可切换 LLM Provider 接入、同时保留完整外部 Agent 模式”**决策；公开分享页无法稳定导出全部文本，具体实现以独立的公开工程和版本级验收为准，未验证部分明确标记为 *实验性/待验证*。

**已找到的参考项目**：
- `pi2dsh`：https://github.com/weijiafu14/pi2dsh — Pi 生态兼容层，包含 Codex OAuth/LLM route 的实现思路；此项目不等于 Codely 的现成适配器。
- `dsh-codex-subscription`：https://github.com/WSL043/dsh-codex-subscription — 非官方 DSH 原生 Codex 订阅路由；版本/权限需独立评估。
- `dsh-codely`：https://github.com/HiSeax/dsh-codely — 非官方 Codely LiteLLM LLM Adapter，支持自备账号登录状态/密钥；仓库较新、协议可能变动，**不得默认按生产可用处理**。
- DSH 官方 LLM seam：`@deepseek-ai/dsh-llm-pi-ai`；外部代理 seam：`@deepseek-ai/dsh-subagent`、`dsh-subagent-codex`、`dsh-subagent-acp`。

**合规与安全门槛**：只有在对应供应商明确授权该访问方式，且账号权益、调用协议和身份信息管理经审计确认后，才启用 `subscription` 路线；不指导提取个人 OAuth token、伪装官方客户端、绕过服务限制或将 CLI 私有凭证上传到 Hub。若未达门槛，只能标记不可用并继续支持 `external-agent`/`local`，不得偷偷代用 API Key。

### 0.2 固定的核心不变量（必须由代码测试保证）

1. **DSH 是唯一 Harness 主体**。Web UI、Native Loop、LLM、Tool、Session/Event 和插件作用域首先复用 DSH；新增 TypeScript 只做 DSH 所缺的 Task、持久工作流、工作区隔离、跨设备协调与额外 Policy。
2. **两个正交注册表**：`subscription` 注册到 DSH **LLM Provider**；`external-agent` 注册到 **Subagent/Agent Runtime Provider**。同名产品不代表相同会话/权限/额度。
3. **四个产品×模式组合必须分别实现与测试**：Codex × subscription、Codex × external-agent、Codely × subscription、Codely × external-agent；其中 subscription 未通过授权和真实 E2E 时状态为 `blocked/experimental`，不能标 `ready`。
4. **一次 Attempt 只有一个主 Loop Owner**：Native 由 DSH 控制；External 由 Codex/Codely 控制。DSH 可以组织显式委派，但不能对同一 Turn 双重驱动完整 loop。
5. **不能把 `codex exec` / `codely -p` 的最终答案误用为 `LLM.stream` 的单步模型返回**，特别是不能假装还原原生 tool_calls/模型历史。
6. **所有计费端点默认禁用** (`allowPaidApi: false`)；无法确定计费归属时 fail closed，需人工明确授权，不允许隐式降级。
7. **Task ≠ Attempt ≠ DSH Session ≠ Native External Session ≠ Checkpoint ≠ Memory**；保留原始 ID 映射，不假设跨产品无损共享上下文。
8. **DSH Session Event Log 为会话事实来源**；SQLite 仅保存 Task/Attempt/投影索引等扩展运行状态，不能覆盖或替代原生日志。
9. **Stored ≠ Retrieved ≠ Injected**，所有 Memory Injection 可审计；Context 对 Native/External 分别适配输入。
10. 人工 Approval 必须绑定 Plan/Scope/BaseCommit 的快照，Agent 不能自我授权。
11. 所有写任务必须有技术层 `ExecutionPermit` + 独立 Git worktree，且防止重复写、越权与 stale lease。
12. 用户凭证/会话 token 只能保存在授权的本地系统凭证容器或供应商官方客户端；不上传 GitHub、Control Repo、Task JSON 或日志。
13. 因额度、版本不兼容、协议受限、离线或网络故障而失败时，保存 Checkpoint 并展示根因，不假定可以无感换 Provider 继续原生 Session。
14. Harness 与业务项目解耦；默认不绑定特定语言、IDE、仓库或领域 Skill。

### 0.3 MVP 做什么 / 不做什么

**MVP 必做**：DSH 原生 Web UI/Native Loop/Session/Tool 基座；`local` 无计费模型路由；Codex/Codely 各自两种模式的 **Adapter + 检测/隔离/验收路径**（未获供应商授权不得真正激活订阅路由）；双注册表与运行时切换；Task/Workflow、Memory 扩展、SQLite Task Store、Git worktree、审批、GitHub 多端与恢复。

**暂不做**：通用多租户 SaaS、向所有运行时强制统一原生 Thread、跨厂商无损导入对话、任意远程 shell、自动推送/合并生产分支、复杂 DAG、云端 Vector DB、自动自愈无限循环、强一致分布式数据库的伪实现。

---

## 1. 完整系统架构

### 1.1 逻辑组件图（唯一 DSH Harness，双路由面）

```text
                              User
                       DSH Web UI / CLI
                               │
                   ┌───────────▼───────────┐
                   │      DSH FOUNDATION   │
                   │ Agent, Session, Event │
                   │ Tool/Skill, Plugin UI │
                   │ Approval, Native Loop │
                   └───────────┬───────────┘
                               │ RuntimePolicy / Workflow
                ┌──────────────┴──────────────┐
                ▼                             ▼
          MODE=subscription              MODE=external-agent
       DSH Native Agent Loop             DSH Subagent seam
                │                             │
            LLM Registry                Runtime Registry
       ┌────────┼─────────┐           ┌───────┼────────┐
       ▼        ▼         ▼           ▼       ▼        ▼
   Codex LLM Codely LLM Local LLM    Codex   Codely   Other
    Provider  Provider  (Ollama)    Agent    Agent    Agent
      │         │         │          │       │
      └─────────┴─────────┘          Own     Own
            One DSH Loop            Loop    Loop
                └──────────────┬─────────────┘
                               ▼
                    DSH Task/Workflow extensions
                   Context / Memory / Checkpoint
                   Security / Workspace / Audit
                               │
                     Git worktree / GitHub
                               │
                       Any Git Workspace
```

**同一个产品在 UI 里呈现两个选项**，例如 `Codex · Subscription (Native)`、`Codex · External Agent`；不会让用户误以为两条路有相同额度、Session 或 Tool 能力。`subscription` 的模型配置通过 DSH 自身模型选择器完成；`external-agent` 的工作流角色通过独立的 Agent selector 绑定。

### 1.2 部署形态

```text
                    GitHub Private Control Repo
                    (Task Inbox / Dispatch / Status)
                               │
                       GitHub Actions Jobs
                               │
                  ┌────────────┴────────────┐
                  ▼                         ▼
              Home Node                 Office Node
          Local DSH + Extension Plugins          Local DSH + Extension Plugins
          Local DSH Session + Task SQLite               Local DSH Session + Task SQLite
          Model/Agent Adapters             Model/Agent Adapters
          Isolated Worktrees         Isolated Worktrees
                  │                         │
                  └───── Git remote / approved handoff ─────┘
```

- 每台机器安装独立的 `agent-harness`，登录与凭证保留在本机。
- GitHub 仅同步控制元数据；业务工程使用各自的 Git Remote，不假设所有机器可访问同一仓库。
- Agent Provider 与 GitHub Coordinator 可替换；DSH Foundation 不可替换，业务域模型保持通用。

### 1.3 Control Plane / Execution Plane / Knowledge Plane

| 平面 | 职责 | 推荐初始实现 |
|---|---|---|
| Control Plane | Task 投递、状态、审批、节点选择、权限、事件索引 | Harness Core + GitHubCoordinator |
| Execution Plane | 创建 Worktree、运行 Agent、执行命令、测试、产出差异 | 本地 Worker + Runtime Adapter |
| Knowledge Plane | 工程规则、Decision、Memory、Skill、Checkpoint、Session 投影 | Git 工件 + 本地 SQLite / FTS5 |

**禁止**让 GitHub Actions Workflow YAML 承担应用层 FSM；Workflow 只调用受控的 `agent-worker run --task ...`，其行为由本地 DSH 插件/服务决定。

---

## 2. 组件边界与接口

### 2.1 包依赖方向：DSH 优先，而不是重做 DSH

```text
                       DSH packages / Web UI
                          │        │
                 native LLM      subagent seam
                    seam             │
                 ┌──┴────┐       ┌───┴─────┐
                 codex  codely   codex    codely
                  sub    sub      ext      ext
                      ↓              ↓
                  ┌───────────────────────┐
                  │ DSH extension plugin  │
                  │ Task, Policy, Memory  │
                  │ Workspace, Workflow   │
                  └──────────┬────────────┘
                             │
                       pure contracts
                             │
                  sqlite/git/github adapters
```

- `packages/contracts` 可保持纯 TypeScript，便于 FakeAdapter/契约测试；但运行时事实的 Session、Tool Registry、默认 Loop 和 UI 必须 **delegate to DSH**。
- `integrations/dsh` 现在是**主要产品入口**而非“可卸载也不影响完整产品功能”的可选宿主。
- 不创建第二套通用 `Agent`、`EventStream` 或 Web 前端替代 DSH；确需扩展用 DSH 官方 service seam / events / plugin 生命周期。
- 独立 `cli doctor` 或 schema 测试可以在不启动 DSH 的情况下运行；不意味着生产 Harness 可以脱离 DSH。

### 2.2 统一“选择/能力/审计”，不强行统一内部循环

**第一套：Native Model Provider（仅 `subscription`、`local`、可选 `api`）**。应实现 DSH 安装版本的 `LlmAdapter`/pi-ai route 类型与流式协议；下列为概念合同，不是 DSH 现成 API：

```ts
export type Product = 'codex' | 'codely' | 'local' | 'other';
export type AccessMode = 'subscription' | 'external-agent' | 'local' | 'api';
export type AdapterReadiness = 'ready' | 'experimental' | 'blocked' | 'unavailable';

export interface ModelRouteDescriptor {
  id: string;                 // e.g. subscription.codex
  product: Product;
  mode: 'subscription' | 'local' | 'api';
  dshProviderKey: string;     // registered in DSH LLM seam
  models: string[];           // discovery, never fabricate availability
  status: AdapterReadiness;
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsToolResults: boolean;
  supportsCancellation: boolean;
  quotaSource: 'subscription' | 'local' | 'api' | 'unknown';
  authReference?: string;     // opaque host reference, NEVER raw secret
}
```

**第二套：External Agent Provider（仅 `external-agent`）**。优先实现 DSH 当前官方 `ctx.subagents`/ACP Provider 接口；下列同样只是我们自己的扩展描述/测试合同：

```ts
export type Role = 'planner' | 'executor' | 'reviewer' | 'researcher';
export interface ExternalAgentCapabilities {
  product: 'codex' | 'codely' | 'other';
  mode: 'external-agent';
  roles: Role[];
  supportsResume: boolean;
  supportsCancel: boolean;
  supportsStreaming: boolean;
  supportsToolEvents: boolean;
  supportsInteractiveApproval: boolean;
  transport: 'dsh-subagent-codex' | 'acp' | 'sdk' | 'cli-stream-json';
}
export interface AgentRequest {
  taskId: string;
  attemptId: string;
  operationId: string;
  role: Role;
  workspacePath: string;
  instruction: string;
  contextRefs: string[];
  permit: ExecutionPermit;
  dshSessionId: string;
  nativeSessionRef?: string; // opaque, node-local
  deadline?: string;
}
```

**第三套：独立 Routing/Accounting 元数据**，不要让 `ModelRouteDescriptor` 假装是 `AgentRuntimeAdapter`：

```ts
export interface Selection {
  product: 'codex' | 'codely' | 'local' | 'other';
  mode: AccessMode;
  routeId: string;
  modelId?: string;        // mandatory for model providers; absent for external
  role?: Role;
  loopOwner: 'dsh' | 'external' | 'none';
}
```

`run()/cancel()/resume()` 的具体委托由 **DSH 原生服务**控制，不再另建“通用外部 Agent Runtime”作为第二套并行主框架。Native Agent 事件写入 DSH Session，External Agent 使用 DSH child metadata / event bridge 和外部 ID 映射。**Provider 的状态必须按四个组合逐一测得，不得一处成功就认定全产品 ready。**

### 2.3 可替换的基础设施接口

```ts
export interface TaskStore {
  create(task: Task): Promise<void>;
  get(taskId: string): Promise<Task | null>;
  transition(input: TaskTransition): Promise<Task>; // CAS + event, atomic
}
// DSH 原生 Session 的只读访问/事件映射扩展；不实现第二个会话事实存储
export interface DshSessionBridge {
  observe(dshSessionId: string, cursor?: string): Promise<ReadonlyArray<unknown>>;
  appendExtensionReference(input: {
    dshSessionId: string;
    taskId: string;
    attemptId: string;
    artifactRef: string;
  }): Promise<void>;
}
export interface CoordinatorAdapter {
  publish(intent: RemoteTaskIntent): Promise<RemoteTaskRef>;
  get(ref: RemoteTaskRef): Promise<RemoteTaskStatus>;
  dispatch(ref: RemoteTaskRef, targetNode: string): Promise<void>;
  requestCancel(ref: RemoteTaskRef): Promise<void>;
}
export interface WorkspaceProvider {
  prepare(task: Task): Promise<WorkspaceLease>;
  inspect(workspaceId: string): Promise<WorkspaceSnapshot>;
  cleanup(workspaceId: string, approved: boolean): Promise<void>;
}
export interface ContextProvider {
  build(input: ContextRequest): Promise<ContextBundle>;
}
export interface ApprovalAuthority {
  verify(approval: ApprovalRecord, snapshot: PlanSnapshot): Promise<boolean>;
}
```

其中 Coordinator 的锁/Claim 能力应由单独的 `ClaimAuthority` / `LeaseStore` 提供。**GitHub Actions 调度不能被误认为具备数据库式线性一致性租约。**

### 2.4 DSH 是唯一运行底座：两种模式的归属

| 部件 | Native `subscription` | External `external-agent` |
|---|---|---|
| 主循环 owner | DSH `dsh-agent-loop` | Codex/Codely 自己的 Agent Loop |
| 模型访问 | DSH `ctx.llm` 注册的 Provider | 外部 Agent 官方客户端/CLI/SDK 登录 |
| 工具执行 | DSH Tool Registry + DSH Approval | 外部工具集与审批；DSH 的 permit/工作区边界仍有效 |
| 会话来源 | DSH `ctx.sessions` | DSH 委派记录 + 产品私有 Thread/Session |
| 模型切换 | DSH 模型选择器 | Agent Router/Workflow Stage 选择 |
| Context | DSH system prompt / context seam | ContextPacket 显式传入任务 |
| Streaming | DSH Native token/tool stream | bridge into DSH events，粒度受能力限制 |
| 费用 | 所关联订阅的用量/限制（需核验） | 所关联订阅的外部 Agent 用量/限制 |

DSH 官方 `ctx.subagents` 支持多个具名 provider；优先采用已有的 `dsh-subagent-codex`、`dsh-subagent-acp`，避免自行绕过已存在的生命周期/取消/Session 机制。DSH `ctx.agents` 的主工厂不要同时注册两套全局完整 Loop；选择外部 Agent 时走委派/明确的 Primary Session Bridge 能力验证，**不能假装一次执行拥有两个主 Loop**。

**特别注意**：`subscription` 路线必须真正把**每一轮模型流、tool call/tool result**接回 DSH，不能只 `spawn codex exec/codely -p` 返回最终文本；后者应归 `external-agent`。

### 2.5 Workflow 角色与双模式绑定（配置格式为设计草案）

```yaml
# 这是我们自己的配置 schema，不是 DSH cordis.patch.yml 可直接使用的原始语法
version: 2
allowPaidApi: false
native:
  default:
    product: local
    mode: local
    routeId: local.ollama
    modelId: YOUR_LOCAL_MODEL
  selectable:
    - {product: codex, mode: subscription, routeId: subscription.codex, enabled: false}
    - {product: codely, mode: subscription, routeId: subscription.codely, enabled: false}
externalAgents:
  - {product: codex, mode: external-agent, routeId: external.codex, enabled: true}
  - {product: codely, mode: external-agent, routeId: external.codely, enabled: true}
workflow:
  id: plan-execute-review
  roles:
    planner:  {product: codex,  mode: external-agent}
    executor: {product: codely, mode: external-agent}
    reviewer: {product: codex,  mode: external-agent}
  gates: {planApproval: required, mergeApproval: required}
limits: {maxReviewCycles: 2, maxAgentAttemptsPerStage: 2}
```

**四条必须存在的路由**：`subscription.codex`、`external.codex`、`subscription.codely`、`external.codely`。其中订阅路径 `enabled=false` 直至满足 `Phase 0S` 的合规/协议/e2e 验收；`enabled` 只是本地策略设置，**不能绕开供应商权益**。切换模式会创建新的 Attempt/Session 映射；不得“移植”原生 Thread ID 或把外部 Agent 会话当 DSH 原生 Session。

### 2.6 Native 模型与 External Agent 的场景选择

| 需求 | 推荐选择 | 选择原因 |
|---|---|---|
| 在 DSH Web UI 日常聊天，DSH 工具可见 | `subscription.*` 或 `local.ollama` | DSH Native Loop 提供统一工具、会话和压缩（认证/授权需通过门槛） |
| 在 DSH 中调用 Codex 做架构分析 | `external.codex` | 完整 Codex 工具链/Repo 能力，独立额度与 Thread |
| 使用 Codely 实施复杂修改/测试 | `external.codely` | 使用原生 Codely Agent Loop、Skills、工具权限 |
| 用 Codely 模型做 DSH 主聊天 | `subscription.codely` | DSH Native Loop；必须验证独立真实模型流和订阅权益 |
| 没有订阅或不允许外网 | `local.ollama` / `model-free` | 本地推理或纯确定性任务 |

**不自动把高级 Agent Runtime 额度用作每一轮 DSH 普通聊天**。路由选择需对用户显示预期配额来源，尤其 Codex 的 `subscription` 和 `external-agent` 可能共享 Codex 产品使用限制。

## 3. 三层仓库与状态存放策略

### 3.1 Harness Framework Repo（框架本身，单独维护）

```text
generic-agent-harness/
├── README.md
├── ARCHITECTURE.md
├── AGENTS.md                    # 仅本框架开发规范
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── packages/
│   ├── core/                    # 纯域模型/FSM/接口
│   ├── application/             # 用例/编排
│   ├── runtime/                 # Selection/capability/policy contracts (not second harness)
│   ├── sessions/                # DSH Session indexes/checkpoint adapters (not duplicate log)
│   ├── memory/                  # proposal/retrieval/FTS
│   ├── context/                 # local context assembly
│   ├── skills/                  # skill discovery/progressive loading
│   ├── workspace/               # workspace provider ports
│   ├── coordination/            # distributed task/claim ports
│   └── security/                # permit/secret redaction/audit
├── adapters/
│   ├── codex-subscription/       # DSH LLM provider: gated experimental
│   ├── codely-subscription/      # DSH LLM provider: gated experimental
│   ├── codex-agent/             # DSH Codex subagent integration
│   ├── codely-agent/            # ACP or CLI structured stream
│   ├── sqlite/
│   ├── git-worktree/
│   └── github/
├── integrations/
│   └── dsh/                    # primary product plugin, Web UI/session bridges
├── apps/
│   ├── cli/
│   └── worker/
├── config/
│   ├── workflow.default.yaml
│   ├── runtime-policy.yaml      # two-axis runtime selection, paid API off
│   ├── policy.default.yaml
│   └── profiles/
├── examples/
│   ├── empty-git-repo/
│   ├── two-nodes/
│   └── workflows/
├── schemas/
├── migrations/
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── contract/
│   └── failure/
└── docs/
    ├── execution-plan.md
    ├── runbook.md
    └── decisions/
```

### 3.2 Consumer Workspace Repo（任意业务工程，可选初始化）

```text
AnyProject/
├── AGENTS.md                       # 项目规则；可选
├── CODELY.md                       # 若使用 Codely，可选
└── .agent/                         # Harness 初始化后创建；可配置目录
    ├── workspace.yaml              # repoAlias / workflowProfile / policies
    ├── memory/
    │   ├── PROJECT.md
    │   ├── ARCHITECTURE.md
    │   ├── DECISIONS.md
    │   ├── CONVENTIONS.md
    │   └── proposals/
    ├── tasks/                       # 仅选定、可共享工件
    ├── plans/
    ├── reports/
    ├── handoffs/
    ├── sessions/exported/
    ├── checkpoints/selected/
    └── skills/
```

**不自动生成语言特定的 `Assets/Packages/...` 或技能目录。** 领域 Skill 通过单独分发包或用户选择安装，Harness Core 不知道语言或框架名称。

### 3.3 本机用户级数据（不进入 Git）

```text
~/.agent-harness/
├── config.yaml                       # 无密钥的本机配置
├── nodes/<nodeId>.yaml
├── workspaces/<workspaceId>/runtime.db
├── workspaces/<workspaceId>/cache/
├── sessions/
├── logs/
└── locks/
```

Windows 可改用 `%LOCALAPPDATA%/AgentHarness/`，macOS/Linux 可按 XDG 目录规范；**实际位置必须由 PathResolver 决定**，不能硬编码。认证凭证由 DSH Credentials seam / OS 安全凭证服务或相应产品**受支持的授权机制**持有；不从私有 CLI 文件抽取或跨节点复制凭证。

### 3.4 GitHub Control Repo（可选远程协调后端）

```text
agent-harness-control/
├── .github/workflows/
│   ├── dispatch-task.yml
│   └── reconcile-queue.yml           # Phase 6 后加入
├── schemas/
├── docs/
└── README.md
```

任务与状态建议以 GitHub Issues（或受控任务记录）保存少量**非敏感字段**；不要让多个 Worker 不受控地并发提交 `tasks/*.json` 导致 Git 冲突。

---

## 4. 核心数据模型、存储与事件

### 4.1 Task / Attempt / Session / Checkpoint

| 实体 | 表示什么 | 生命周期 |
|---|---|---|
| Task | 稳定的用户目标、目标工作区及 Policy | 跨设备 / 多次执行 |
| Attempt | 一次规划、执行或审查尝试 | 进程或重试粒度 |
| Session | 一次 Runtime 的可审计会话轨迹 | 允许从历史事件分叉 |
| Checkpoint | 恢复指针、操作日志、剩余工作，不等于 Agent 原生状态 | 某个一致点 |
| Memory | 经过审查的复用知识 | 跨 Task |
| Approval | 对 Plan Snapshot / Scope / Risk 的签名确认或受审计批准记录 | 绑定单个版本 |

示例 Task（**独立于任何实现产品**）：

```json
{
  "schemaVersion": 1,
  "taskId": "T-20261009-0001",
  "workspaceId": "project-alpha",
  "title": "Refactor module boundaries",
  "requestRef": "local://requests/T-20261009-0001.txt",
  "state": "CREATED",
  "risk": "standard",
  "workflowProfile": "plan-execute-review",
  "roleBindings": {
    "planner": "codex",
    "executor": "codely",
    "reviewer": "codex"
  },
  "baseCommit": "0123456789abcdef0123456789abcdef01234567",
  "targetNode": null,
  "planRevision": 0,
  "createdAt": "2026-10-09T08:00:00Z"
}
```

`requestRef` 指向请求原文；是否允许将它上传 Coordinator，由 Workspace 的 Data Classification 决定。

### 4.1A 每个 Attempt 的产品、模式与原生会话映射

```ts
interface AttemptRuntimeBinding {
  attemptId: string;
  taskId: string;
  product: 'codex' | 'codely' | 'local' | 'other';
  mode: 'subscription' | 'external-agent' | 'local' | 'api';
  routeId: string;
  loopOwner: 'dsh' | 'external' | 'none';
  dshSessionId: string;
  externalNativeSessionRef?: string; // 加密/opaque，仅节点本地
  providerVersion?: string;
  credentialRef?: string;            // 仅不透明句柄，不是 Token
  quotaAccountType: 'subscription' | 'api' | 'local' | 'unknown';
  configuredModel?: string;
  adapterReadiness: 'ready' | 'experimental' | 'blocked' | 'unavailable';
}
```

- 模式切换须持久化 `attempt/runtime-selected`、`attempt/mode-switch-requested`、`attempt/started` 等审计事件；中途切换只允许在安全 Checkpoint 之后开启新 Attempt。
- DSH `ctx.sessions` 的原生日志为事实来源；本地 SQLite 仅保存外部 Task/Attempt 索引及 checkpoint 引用，不能以数据库 row 重建虚假的完整 native conversation。
- 不能把任何订阅账号 refresh token 或 Codely key 放在 Attempt/Checkpoint/GitHub Payload 中。

### 4.2 状态机：本地与远程使用同一模型

```text
CREATED → QUEUED? → CLAIMED? → PREPARING
                                      │
                          ┌───────────┴────────────┐
                          ▼                        ▼
                      PLANNING               EXECUTING
                          │                        │
                      PLAN_READY                   │
                          │                        │
                   WAITING_APPROVAL                │
                          │                        │
                       APPROVED ───────────────────┘
                                                   │
                                                EXECUTED
                                                   │
                                             REVIEWING?  ──PASS─> COMPLETED
                                                   │
                                                  FAIL
                                                   ▼
                                             REVIEW_FAILED
                                                   │
                                                FIXING
                                                   │
                                                REVIEWING
```

独立异常事件：`CANCEL_REQUESTED / CANCELLED / INTERRUPTED / FAILED / NEEDS_HUMAN / NEEDS_REPLAN`。不要让 `OFFLINE` 变成任务终态，它是 Node 状态。`?` 表示 Workflow Profile 可以跳过此阶段。

每次状态转换必须含：`expectedVersion`、`actor`、`eventId`、`time`，在 SQLite **同一事务**内 CAS 更新状态及追加事件；不合法转换直接拒绝。

### 4.3 最小事件模型

```ts
interface TaskEvent {
  eventId: string;
  taskId: string;
  attemptId?: string;
  seq: number;
  kind: string;
  actor: string;
  timestamp: string;
  payloadRef?: string;
  traceId?: string;
}
interface SessionEvent {
  eventId: string;
  sessionId: string;
  parentEventId?: string; // event tree branch
  kind: string;
  payloadRef?: string;
  timestamp: string;
}
```

Session 事件建议包含：`session.started`、`agent.message`、`tool.requested`、`tool.finished`、`checkpoint.created`、`compaction.created`、`memory.proposed`、`session.finished`、`session.failed`。对于 CLI Runtime，只保证其**公开提供的事件粒度**；不能假装拿到了内部推理链。

### 4.4 SQLite Schema 草案（用 migration 交付）

```sql
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  state TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS task_events (
  event_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(task_id,seq)
);
CREATE TABLE IF NOT EXISTS attempts (
  attempt_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  role TEXT NOT NULL,
  product TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('subscription','external-agent','local','api')),
  route_id TEXT NOT NULL,
  loop_owner TEXT NOT NULL CHECK(loop_owner IN ('dsh','external','none')),
  dsh_session_id TEXT NOT NULL,             -- 外部引用，非该 SQLite 的事实来源
  state TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  external_session_ref TEXT                 -- 仅 opaque 引用，不含凭证
);
-- 不创建 sessions/session_events 的第二份事实表。
-- DSH 自身 ctx.sessions 持久化日志；这里仅维护 Task -> DSH Session 索引。
CREATE TABLE IF NOT EXISTS dsh_session_links (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(attempt_id),
  dsh_session_id TEXT NOT NULL,
  parent_dsh_session_id TEXT,
  native_external_ref TEXT,
  last_observed_event_ref TEXT
);
CREATE TABLE IF NOT EXISTS operations (
  operation_id TEXT PRIMARY KEY, task_id TEXT NOT NULL,
  status TEXT NOT NULL, result_ref TEXT, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS checkpoints (
  checkpoint_id TEXT PRIMARY KEY, task_id TEXT NOT NULL,
  attempt_id TEXT, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  approval_id TEXT PRIMARY KEY, task_id TEXT NOT NULL,
  plan_sha256 TEXT NOT NULL, scope_sha256 TEXT NOT NULL,
  actor TEXT NOT NULL, created_at TEXT NOT NULL
);
```

实际 Schema 须追加 migration 版本、foreign key/index、WAL 与 BusyTimeout、写入事务重试策略；不可仅复制上面片段直接视为生产级数据库。

### 4.5 Git / SQLite / Coordinator 的可信边界

- **Git**：Approved Plan、ADR、已合并的 Memory、最终报告与源码变更等长期可审核事实。
- **SQLite**：Task/Attempt/TaskEvent、DSH Session ID 映射、Operations、Checkpoints、Cache、Local Lease；DSH 原生 Session Events 本体不镜像为第二份事实日志，本地事实也不能证明远端 Claim 独占。
- **Coordinator**：任务意图、节点标签、派发触发、批准意图、低敏状态摘要；GitHub API 是有限语义的远程服务，不能替代 ACID 数据库。
- 冲突优先级为：**实际源码与验证结果 > 已批准 Policy/Scope > 已接受知识 > 尚未接受的报告/摘要 > 临时模型输出**。Policy 的权限优先级始终高于 Memory。

---
## 5. 共享记忆、Context、Session 与恢复

### 5.1 Memory 分层

```text
User-level memory         ~/.agent-harness/memory/        默认本机私有
Workspace-level memory    <repo>/.agent/memory/          选择后可入 Git
Task-level memory         Task artifacts / handoff      任务级有效
Session scratch           DSH Session / projection     不自动升格成知识
```

**写入链路**：`Observation → Proposal → Schema Validation → Source Verification → Conflict Check → Human/Policy Approval → Merge → Index`。

Memory 条目至少包含：`memoryId / scope / claim / sources / confidence / acceptedBy / acceptedAt / supersedes / sensitivity`。自动提取只允许生成 Proposal，禁止模型直接把推断写入已确认的 `ARCHITECTURE.md`。

### 5.2 Stored ≠ Retrieved ≠ Injected

```text
Memory Store（全部）
   ↓ query + permission filter
Retrieved Candidates（可能相关）
   ↓ relevance, dedupe, trust, token budget
Context Projection（实际注入的片段）
   ↓
Runtime Request
```

每一次注入都写审计索引：`sourceRef / snippetHash / reason / visibility / tokenEstimate`。严格过滤跨 Workspace、敏感级别和用户明确禁止共享的记忆。

### 5.3 Context Builder：先确定性检索，再让模型推理

先用本机 `git status`、`git log`、`rg`、manifest 解析、增量索引生成候选资料；必要时才调用 Agent 帮忙解释或压缩。Context Bundle 建议字段：

```json
{
  "taskId": "T-20261009-0001",
  "workspaceId": "project-alpha",
  "baseCommit": "0123456789abcdef0123456789abcdef01234567",
  "goal": "...",
  "relevantFiles": [{"path":"src/module.ts","reason":"symbol match"}],
  "memoryRefs": [],
  "skillRefs": [],
  "sessionProjectionRef": null,
  "checkpointRef": null,
  "constraints": [],
  "remainingWork": [],
  "contextBudget": {"maxChars": 32000, "reserveForAgent": 0.35}
}
```

预算值属于**默认配置示例**，不是所有 Runtime 均通用的 Token 公式。超额先剔除低相关内容，再按需读取原始证据。

### 5.4 Progressive Skills / Deferred Tools

- 发现阶段只读取 `name/description/capabilities/path/declared-permissions`。
- 命中任务后再读取 `SKILL.md` 主体；支持 references/scripts 懒加载。
- 工具按 capability 注册，不按某个 Agent 产品命名；危险工具需单独权限。
- `MCP stdio` 与 `MCP HTTP` 属不同 Transport Adapter；通过 `probe()` 检测后选用，不假设所有客户端都相同。
- 用户安装的领域技能存独立扩展包，核心库不得内置特定业务逻辑。

### 5.5 Session Event Tree / Compaction（复用 DSH）

- 使用 **DSH `ctx.sessions` 原生日志与 Session Tree 语义**，不创建并行事件驱动引擎；业务 TaskEvent 可保存在 Task SQLite。
- DSH 支持的分叉和 `parentEventId` 由其原生 Session seam 负责；跨设备迁移使用可校验的 projection，而不是把 Session 原生事件直接搬到另一节点覆盖本地日志。
- Compaction 优先复用 DSH 自带 seam/插件，扩展仅生成 Context/Checkpoint Projection（已确认事实、未决问题、运行状态、剩余步骤、证据引用）。
- Compaction **永不删除** DSH 原始 Events；也不复刻或暴露 Runtime 不提供的内部思维链。
- 仅在上下文过大、切换 Runtime/设备、用户主动请求时压缩；不能每一步反复摘要。

### 5.6 Checkpoint / Resume / Handoff

Checkpoint 必须保存：

```yaml
checkpointId: CP-0001
taskId: T-20261009-0001
attemptId: A-0002
taskVersion: 11
workspace:
  baseCommit: 0123456789abcdef0123456789abcdef01234567
  headCommit: 0123456789abcdef0123456789abcdef01234567
  diffArtifact: null
  clean: false
plan:
  path: .agent/plans/T-20261009-0001.md
  sha256: sha256-example
operations:
  completed: [op-create-worktree, op-build-context]
remaining:
  - run-tests
  - review
nativeSessionRef: null
createdAt: 2026-10-09T08:00:00Z
```

- 恢复动作首先验证 `baseCommit / worktree status / taskVersion / planHash`，不能盲目继续。
- 只有 Runtime 宣称支持 `resume` 且 `nativeSessionRef` 有效时才尝试原生恢复；否则以 Checkpoint + ContextBundle **启动新 Attempt**。两种行为必须在报告中明确区分。
- 跨设备 Handoff 不能依赖本机私有 Session ID；最低要求是 Git 分支或受控 Patch + Checkpoint + 相关公开规则/批准凭据 + 剩余工作。
- 若原节点失联或仍执行，先进入 `INTERRUPTED/NEEDS_HUMAN`，由人决定迁移，不能同时在另一节点写同一个目标。

---

## 6. Workflow / Routing / Budget / Approval

### 6.1 Workflow 作为数据定义

推荐第一版内置三个 Profile：

| Profile | 流程 | 使用条件 |
|---|---|---|
| `direct` | Context → Execute → Local Validation | trivial、低风险 |
| `plan-execute-review` | Context → Plan → Human Approve → Execute → Review → Final Approve | 标准工程任务 |
| `research-only` | Context → Analyze → Report | 无文件写入任务 |

示例 `config/workflow.default.yaml`：

```yaml
version: 1
id: plan-execute-review
stages:
  - id: prepare
    kind: deterministic
    action: workspace.prepare
  - id: plan
    kind: agent
    role: planner
    permit: read-only
  - id: approve-plan
    kind: gate
    authority: human
  - id: implement
    kind: agent
    role: executor
    permit: workspace-write
  - id: validate
    kind: deterministic
    action: workspace.validate
  - id: review
    kind: agent
    role: reviewer
    permit: read-only
  - id: approve-merge
    kind: gate
    authority: human
onReviewFail:
  transition: fixing
  maxCycles: 2
```

配置不能直接映射到任意系统命令；`action` 必须是在编译期注册、可审计的 action ID。

### 6.2 审批边界

- `approve-plan` 绑定 `planSha256 + scopeSha256 + baseCommit + policyVersion`。
- Plan 修改后原 Approval 作废，进入 `NEEDS_REPLAN/WAITING_APPROVAL`。
- Agent Runtime 只能**请求**审批，不能凭自己的 Agent 身份生成 Human Approval。
- 高风险命令、外部网络写操作、`git push`、删除 Worktree、`merge` 需要独立权限或人工批准。
- `--yolo` / 跳过所有审批选项不允许作为远程 Runner 的默认配置。

### 6.3 执行许可证 `ExecutionPermit`

```ts
interface ExecutionPermit {
  taskId: string;
  attemptId: string;
  approvedPlanSha256?: string;
  baseCommit: string;
  workspaceId: string;
  worktreeRoot: string;
  allowedPaths: string[];        // glob, canonicalized, deny traversal/symlinks
  deniedPaths: string[];
  allowedActions: string[];      // explicit registry names
  networkMode: 'off' | 'restricted' | 'allowed';
  expiresAt: string;
  policyVersion: string;
}
```

`allowedPaths` 只有在 Workspace Provider、shell wrapper、git diff verification 等执行层**真实校验**时才构成有效边界；仅把字段放入 Prompt 不是安全隔离。高风险环境优先 OS sandbox/容器/单独用户权限，并做事后 diff 检查。

### 6.4 风险与双维度路由

路由先选**执行模式**，再选**具体 Provider/Agent**：

```text
Task / Chat
  ├─ Model-free deterministic → DSH Tool / Task service（无模型）
  ├─ DSH Native Loop
  │     ├─ local.ollama
  │     ├─ subscription.codex   [policy + capability + auth gate]
  │     ├─ subscription.codely  [policy + capability + auth gate]
  │     └─ api.*               [显式付费许可]
  └─ Delegated / External Loop
        ├─ external.codex
        └─ external.codely
```

路由依据：`requestedMode / risk / role / projectDataPolicy / capability / adapterReadiness / accountQuotaSignal / costPolicy / nodeAvailability / allowedCredentialScope`。**不得根据供应商名称自动推断请求会使用哪个账单或哪份订阅额度**。

### 6.5 配额经济性与失败路径

- `local` → 模型由用户本机承担算力、电费，不产生第三方 Token 账单（不等于零总成本）。
- `subscription.codex` → 即使在 DSH Native Loop，使用相应 Codex subscription entitlement；**不是 ChatGPT 普通免费 Chat 配额**，不能绕开 5h/周等适用限制。
- `external.codex` → Codex CLI/SDK 自己的产品限额。两条 Codex 路径可能消耗同一产品配额；不能当成两份独立免费额度。
- `subscription.codely` → 只在确认供应商允许模型服务被第三方调用、且订阅包括该流量后启用；不从“CLI 能登录”推断任意自制 HTTP 客户端可免费调用。
- `external.codely` → 通过合法 Codely CLI/ACP 登录和权益执行，额度归属按其官方说明与实际可观察数据。
- `api` → 默认禁止，必须明确手动开启并设置预算上限；已禁用时整个系统不可进行付费 API fallback。
- 额度/权限耗尽：`QUOTA_EXHAUSTED` / `AUTH_REQUIRED` / `SUBSCRIPTION_ROUTE_UNSUPPORTED` / `PROTOCOL_INCOMPATIBLE` / `PROVIDER_UNAVAILABLE` 分类；持久化 Checkpoint → `WAITING_RESOURCE` / `NEEDS_HUMAN`，不无限重试或自动换付费路由。
- `QuotaLedger` 记录 Route、供应商给出的（若有）已知窗口/剩余额度、调用次数/工具次数、失败原因；官方无信号则 `unknown`，**不得伪造配额百分比**。

### 6.6 默认 Policy（设计 Schema，不是直接可粘贴的 DSH 配置）

```yaml
schemaVersion: 2
harness: dsh
inference:
  defaultRoute: local.ollama
  allowPaidApi: false
  autoPaidFallback: false
  nativeRoutes:
    subscription.codex: {enabled: false, requiresVerifiedEntitlement: true}
    subscription.codely: {enabled: false, requiresVerifiedEntitlement: true}
    local.ollama: {enabled: true}
externalAgents:
  external.codex: {enabled: true, preferredRoles: [planner, reviewer]}
  external.codely: {enabled: true, preferredRoles: [executor]}
quota:
  onExhausted: checkpoint-and-pause
  requireUserConfirmationForEscalation: true
  maxReviewCycles: 2
security:
  credentials: node-local
  strictWorkspacePermit: true
```

### 6.7 双模式切换的边界

1. **Native → Native**：DSH 保留同一 Session，但模型/Provider 变更要记录事件，检查工具 schema/上下文格式兼容；不是保证所有模型无损复现多模态与工具历史。
2. **Native → External**：从 DSH Session 构建受控 ContextPacket/TaskEnvelope，启动外部子代理，保存 DSH Parent/Child 关系与 Native Thread opaque id。
3. **External → Native**：只将可验证 FinalResult / Report / Checkpoint 摘要注入 DSH Session，不能声称继续外部 Agent 内部推理历史。
4. **External Codex ↔ External Codely**：文件工件、计划、任务与 Git 状态可交接；原生 Session ID 通常不能互相复用。
5. 任何切换均不得绕过 Approval、数据边界、ExecutionPermit，必须在 UI 展示目标模式与配额来源。

### 6.8 LLM Adapter 兼容性验收（必须是真正 Native Loop）

每个 `subscription.*` 都必须完成以下测试并保留脱敏报告：

- [ ] 授权：协议/服务条款/账号权益允许该访问方式；只用自己的凭证；不借用他人 key/session。
- [ ] 实际模型目录和可调用 ID（不要凭示例硬编码“当前最强模型”）。
- [ ] 单轮文本、分片 Streaming、停止/取消、重试上限。
- [ ] `tool_call` 与 `tool_result` 双向协议，DSH Tool 执行后能继续同一 DSH loop。
- [ ] 多轮上下文、系统指令、Unicode、错误映射，测试 session persistence/reload。
- [ ] 限流 429、401/403、订阅不可用、Provider API 更新，均 fail closed。
- [ ] 计费/订阅额度来源可解释；禁止无授权切换到 API Key。
- [ ] 端点与凭证都不泄漏到日志、GitHub、工件、UI 非授权用户。
- [ ] 正确区分“Provider 能返回文本”和“真正兼容 DSH 原生 Tool Loop”。

**特别禁令**：CLI-to-HTTP Bridge 若内部运行整个 `codely -p` 或 `codex exec`，即便给外面包装了 `/v1/chat/completions`，也不能标记为 **Native subscription** 通过测试；它属于 `external-agent` 代理包装。

## 7. Workspace / Security / Git 隔离

### 7.1 工作空间配置示例

```yaml
# 目标项目根目录下 .agent/workspace.yaml
schemaVersion: 1
workspaceId: project-alpha
projectType: generic-git
workflowProfile: plan-execute-review
local:
  allowedBaseRefs: [origin/main]
  allowUntrackedArtifacts: false
  maxConcurrentWriteTasks: 1
security:
  dataClassification: restricted
  remoteTaskPayload: metadata-only
  requireHumanApprovalForPush: true
```

配置是每个项目自己的策略；不同项目可选择不同 Profile 和 Adapter。`workspaceId` 应对 `repo root + remote fingerprint` 等进行唯一性校验，避免在两台机器上出现名称相同但仓库不同的情况。

### 7.2 Worktree 生命周期

```text
VALIDATE_GIT_REPO
    ↓
READ_BASE_COMMIT (pinned SHA)
    ↓
LOCK_WORKSPACE
    ↓
CREATE_BRANCH + WORKTREE
    ↓
VERIFY_ISOLATION + POLICY
    ↓
EXECUTE + TEST
    ↓
GENERATE_DIFF + REPORT
    ↓
REVIEW + APPROVE
    ↓
RETAIN / COMMIT / PUSH / MERGE (separate approval)
    ↓
CLEANUP (only explicit policy)
```

失败时保留工作树，创建 `NEEDS_HUMAN` 工件和检查命令，不自动 `git reset --hard`、`git clean -fdx` 或强行删除。

### 7.3 远程执行与本机执行的权限差异

- 远程 Task 只包含结构化 Intent；禁止可执行命令、shell 脚本、任意绝对路径作为任务输入。
- Worker 自己将 `repoAlias` 解析为预先登记的本地路径；用户请求文本不能覆盖 `node.yaml` 的本机根目录。
- Runner 使用单独低权限 OS 用户；CI Job 中不暴露认证缓存、SSH 私钥、生产环境变量。
- 只有可信用户能修改 Control Repo workflow / dispatch 请求 / Runner labels；审计每次执行来源。
- Codely/Codex 权限由本机 OS 及 Runtime 配置共同限制；禁止把“Plan 只读”纯靠提示词实现。
- Secret scanner、redactor 在上传日志前执行；默认不上报完整 stdout/stderr、diff 和源码片段。

### 7.4 Data Policy 两种模式

| 模式 | 可以发往 Coordinator | 留在本机 |
|---|---|---|
| `standard`（须业务许可） | Task request、非敏感进度、少量报告、PR link | Token、账号缓存、私密日志 |
| `restricted`（默认） | 不透明 Task ID、节点别名、状态码、时间戳 | 任务正文、Plan、Diff、Memory、Session、源码、日志 |

**重要限制**：若 Request 正文在另一个节点且不得上传云端，远端 Worker 无法凭一个 Task ID 推出任务内容。必须预先在目标机投递本地任务正文，或采用经过组织批准的端到端加密受控通道；未获批准时应拒绝此类远程派发，不能假设“metadata-only 即可远程完成任意新任务”。

---

## 8. GitHub 多端控制实现（首选插件，不是强依赖）

### 8.1 为什么 GitHub 能替代第一版云服务器

第一版需要的远程操作仅为：身份管理、节点派发、任务状态、结果链接、Runner 运行记录。GitHub Private Repo + `workflow_dispatch` + self-hosted runner 可承担这些功能，但**不是一个完全一致、无限耐久的任务队列**。

GitHub 官方规则：未获得可用 Runner 的 Job 最多排队 **24 小时**，超过则失败；它不是“电脑关机几天后 Job 一定自动执行”。因此：

- Durable Inbox 必须独立于 Job 生命周期；推荐 `GitHub Issue/Task Record`。
- 每次触发 Workflow 只是一个 **delivery attempt**，不是 Task 本体。
- Reconciler 定期扫描 `queued` 且无有效 Job 的任务，在线后重新派发。
- 对过期运行，Task 保持 `QUEUED / NEEDS_HUMAN`，不可自动删除。

### 8.2 建议的 GitHub 任务存放方式

MVP：一个 Issue 对应一个 Remote Task；Issue Label 表示*显示用状态*，以 Worker 的完整本地 Event 与受控 Issue 更新为审计来源。

```text
Issue #42
labels: agent-task, state:queued, target:office-node
body: taskId, workspaceAlias, workflowId, restricted-safe metadata
comments: state transitions / run URLs / approval references
```

Issue label 不是强一致锁。对双 Worker 写安全，本版本采取：**单目标节点 + 同节点串行 Worker + Actions concurrency group(taskId) + claimToken 校验 + 禁止无确认自动再分配**。这是 MVP 风险控制，不承诺网络分区下全局 Exactly-Once。需要强一致多写者/自动迁移时，升级为具有原子 CAS/Lease 的独立 Coordinator 或事务存储。

### 8.3 示例工作流（先用于 smoke test）

文件：`.github/workflows/dispatch-task.yml`

```yaml
name: Dispatch agent task
on:
  workflow_dispatch:
    inputs:
      task_id:
        description: "Pre-created safe task identifier"
        required: true
        type: string
      target:
        description: "Registered runner label"
        required: true
        type: choice
        options: [home-node, office-node]

permissions:
  contents: read

concurrency:
  group: agent-${{ inputs.task_id }}
  cancel-in-progress: false

jobs:
  dispatch:
    runs-on: [self-hosted, "${{ inputs.target }}"]
    timeout-minutes: 60
    steps:
      - name: Dispatch to local worker
        shell: bash
        env:
          TASK_ID: ${{ inputs.task_id }}
        run: |
          agent-worker run --task "$TASK_ID"
```

此示例要求对应 Runner 有 Bash 和 `agent-worker` 在 `PATH`；Windows-only 节点应将 shell 改为已安装的 PowerShell，并通过 `runner.os` 或分别定义平台 Job。**不可直接把此示例当成跨平台零配置工作流。**

### 8.4 三种对外动作

```text
agent send   → create durable task record + dispatch attempt
agent status → read durable record + local/remote state summary
agent approve → write human approval intent (bound plan SHA) + trigger next stage
```

`cancel` 必须以协作式终止请求为主：先标记 `CANCEL_REQUESTED`，Worker 定期检查和终止子进程，保护 Worktree，写 Checkpoint；不得依赖 GitHub `cancel run` 必然终止所有孙进程。

### 8.5 断连、再派发与迁移

- 离线 24h：Dispatch Job 失败，Task Inbox 保留；Reconciler 再派发。
- Worker 进程崩溃：Node 本地数据库复核孤儿 Operation；静默自动重试**非幂等**命令是禁止的。
- 网络中断：原 Worker 本地状态可能还在运行。远端只能标“疑似中断”，不得直接在另一台节点抢跑。
- 手动迁移：先确认原执行进程停止或写权限被撤销，导出受控 Handoff（Commit/Patch + Checkpoint），新节点验证一致性后启动新 Attempt。
- 数据在 Restricted 模式下不允许出网时，不进行跨机 Handoff，除非有批准的数据通道。

### 8.6 升级到强 Coordinator 的触发条件

出现任意需求即需要评估专门服务端/数据库：自动跨节点抢占、多个并发写者、秒级实时反馈、跨组织租户、多级 RBAC、全局租约与 Fencing 的可验证强一致性、复杂 DAG 调度。

---
## 9. 从零实施：通用执行纪律（DSH Foundation + 双模式）

### 9.1 环境与命令约定

- 推荐 Node.js 当前受支持的 LTS + pnpm + Git + GitHub CLI；具体 Node 最低版本以锁定的 DSH 和 Agent 包要求为准。
- 下文代码以 **PowerShell 7** 为主要命令示例，macOS/Linux 可使用等价 bash 命令；跨平台兼容由自动化测试证明。
- `<YOUR_USER>`、`<ORG>`、`<PATH_TO_REPO>`、`<VERSION>` 等均为**待替换占位符**，不能原样用于真实项目。
- 文档中的 TypeScript/YAML/SQL 是**设计契约/示例**；未标“可直接运行”的片段都要先由 Codex 实现、单测后再使用。
- 第一轮尽量使用空的 `examples/empty-git-repo` 做测试，**不要直接在用户真实业务代码仓库中调试 Harness**。

### 9.2 阶段化验收规则

每个 Phase 必须交付：

```text
- Changed files
- Commands executed
- Automated test results
- Manual acceptance steps
- Known limitations
- Rollback instructions
- ADRs for non-trivial decisions
```

失败时保留日志与失败工件，不随意删除 Worktree；下一 Phase 只在前一 Phase 验收通过后开始。

---

## Phase 0S — 四模式技术与授权可行性闸门（先于写核心代码）

**目的**：在早期真实确认两款产品的两种接入方式，避免把未经证实的 Codely 模型服务/OAuth 路由写死为关键依赖。与 Phase 0 并行起步，但 Phase 3/7 之前必须验收。

**步骤 0S.1｜记录供应商、宿主、Node 版本**（用户本机执行，不能读取/打印私有 Token）：

```powershell
node --version
pnpm --version
npx @deepseek-ai/dsh --help
codex --version
codex login status
codely --version
codely --help
```

**步骤 0S.2｜独立 DSH 测试 Profile**：

```powershell
# 具体 Profile 选项以本机 dsh --help / 官方当前 docs 为准
npx @deepseek-ai/dsh web
# 在单独测试环境按官方 profile/bundle 机制创建/使用测试 profile
```

保留：DSH Web UI 启动截图/版本、默认模型选择器、`ctx.sessions` 事件与子代理 UI 工作状况。不要在业务 Repo 中做授权调试。

**步骤 0S.3｜Codex subscription PoC**：审查 `pi2dsh` 与 `dsh-codex-subscription` 安全范围、发布许可、支持的 DSH 版本与授权方式；仅在自身账户的合法访问方式下试装独立 Profile（禁止自动读取 Codex CLI auth cache 及将 OAuth 文件上传 Git）。测试 DSH *Native* `hello → DSH tool call → model tool result → final`，保存脱敏事件。若因供应商权益/协议不可用，则 `subscription.codex=blocked`，继续执行其他路线。

**步骤 0S.4｜Codely subscription PoC**：审查社区 `HiSeax/dsh-codely`（未审计原型）、Codely 官方授权与模型服务文档。**先由用户/供应商确认允许第三方 Harness 直接使用此服务及对应订阅额度**，不进行凭证提取、非公开认证重放或网关绕过。确认后用测试账号在隔离环境进行纯 LLM Streaming/Tool Loop 测试；否则保留 Adapter skeleton 和 `status=blocked`。

**步骤 0S.5｜External Agent PoC**：

```powershell
# 仅测试安装与登录状态；真实代理执行须在 test fixture 且经人工批准
codex --version
codely --version
# 核验 DSH 官方 dsh-subagent-codex / dsh-subagent-acp 与 CLI 能力
```

Codex 外部优先官方 DSH `dsh-subagent-codex`，Codely 优先 ACP（标记 experimental），不满足时 `codely -p --output-format stream-json` 的受控 Process Adapter。

**步骤 0S.6｜四格结果矩阵与决策**：

| 组合 | 目标 | 当前证据等级 | MVP Gate |
|---|---|---|---|
| Codex / subscription | DSH Native LLM Provider | 社区多条原型路线 | 权益+工具回路+认证安全通过方可启用 |
| Codex / external-agent | DSH external subagent | DSH 官方 provider 存在 | 流事件/权限/Session lifecycle E2E |
| Codely / subscription | DSH Native LLM Provider | `dsh-codely` 社区原型，非官方 | 官方允许/凭证安全/Native Tool Loop 成功才启用 |
| Codely / external-agent | DSH external agent | 官方 CLI/实验性 ACP 接口 | CLI/ACP 行为与取消/恢复真实测试 |

**验收**：无任何额外 API Key 时 DSH Web UI + `local` 能工作；四组合都有独立 Adapter ID/状态/可运行的 Mock Contract Test；至少一条外部 Agent 真实委派链通过；任何 blocked subscription 不被选择器呈现为 ready。

**回滚**：卸载或停用实验性订阅插件，注销其凭证引用并保留脱敏诊断；回到本地模型/模型无关模式，不触碰用户业务目录。无论何时不得默默尝试付费端点。

---

## Phase 0 — 独立仓库与可运行工具链

**目标**：建立一个与任何 Consumer Project 无关、可编译、可测试、可打包的框架仓库。

**步骤 0.1｜确认环境**（PowerShell 7）

```powershell
$PSVersionTable.PSVersion
git --version
node --version
corepack --version
pnpm --version
gh --version
```

缺少 pnpm 时，按照组织规范启用 `corepack enable` 并选用 `corepack prepare pnpm@<PINNED_VERSION> --activate`；缺少 gh 则按对应 OS 的官方安装说明安装。使用明确版本并写进 `packageManager`，不依赖浮动 `latest`。

**步骤 0.2｜建立仓库**

```powershell
mkdir generic-agent-harness
Set-Location generic-agent-harness
git init
mkdir apps,packages,adapters,integrations,config,schemas,migrations,tests,examples,docs
```

创建 `package.json`（先由 Codex 选定兼容的 pnpm/TypeScript/Vitest 版本）及 `pnpm-workspace.yaml`：

```yaml
packages:
  - 'packages/*'
  - 'adapters/*'
  - 'integrations/*'
  - 'apps/*'
```

根 `package.json` 至少有：

```json
{
  "name": "generic-agent-harness",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint"
  }
}
```

随后由 Codex 用 Workspace 包生成 `packages/core` 与 `apps/cli` 的最小 `tsconfig.json`、源文件、测试样例、`README.md`、`.gitignore`、`AGENTS.md`。

**步骤 0.3｜最小 smoke**

```powershell
pnpm install
pnpm build
pnpm typecheck
pnpm test
git status --short
```

**验收**：空仓库可独立安装/构建/测试；不会引入任何外部业务工程路径；`rg -ni 'Unity|Android|<BUSINESS_BRAND>' packages/` 不应找到框架对领域的硬编码依赖（测试 fixture 中的字符串不计）。

**回滚**：只撤销本 Phase 在新 Harness 仓库中的更改；不能影响其他仓库。

---

## Phase 1 — Core Domain / Schema / SQLite / CLI Skeleton

**目标**：纯 Task 域模型/SQLite 能在无 DSH 进程的单元测试中创建与迁移；**完整 Harness 产品仍必须由 DSH 宿主启动**，不能据此建立第二套 Agent/Session 系统。

**步骤 1.1｜创建 Domain / Contracts**

```text
packages/core/src/
├── entities/{task,attempt,session-link,checkpoint,approval}.ts
├── fsm/{states,transitions,reducer}.ts
├── ports/{task-store,dsh-session-bridge,model-route,external-agent,workspace,coordinator}.ts
├── policy/{workflow,routing,permission}.ts
└── errors.ts
```

- 实现 `TaskState` 与 `TaskTransition`，包括版本号/CAS 语义。
- 定义 `schemaVersion` 和 Zod/JSON Schema 验证；序列化对象不能把绝对机器路径写到跨机共享的 Task Record。
- 对未知字段采用显式版本迁移，而不是静默丢弃。

**步骤 1.2｜创建 SQLite Adapter**

```text
adapters/sqlite/src/{db.ts,migrate.ts,task-store.ts,session-link-index.ts}
migrations/0001_core.sql
```

- 初始化 PRAGMA、事务、WAL、BusyTimeout。
- `tasks.version` CAS 更新 + 追加 `task_events` 同事务提交。
- `operations.operation_id` 唯一索引用于防止重复完成同一副作用。
- 测试多次并发 `transition(expectedVersion=0)`，必须恰好只有一个成功。

**步骤 1.3｜CLI 基础命令**

```text
agent-harness doctor
agent-harness init --repo <PATH_TO_REPO>
agent-harness task new --workspace project-alpha --title "Example task"
agent-harness task status <TASK_ID>
agent-harness task events <TASK_ID>
```

`init` 只能在显式指定目录下创建 `.agent/workspace.yaml`，不能隐式修改其他内容。CLI 通过 `packages/application` 调用 Store，不得直接复制 FSM 逻辑。

**步骤 1.4｜验证**

```powershell
pnpm build
pnpm test
pnpm typecheck
pnpm --filter @harness/cli exec agent-harness doctor
```

最后一个命令是**目标接口示例**，Codex 在实现时必须确认实际 pnpm package/bin 名称和调用形式；若不同，在 README 更新正确的 smoke 命令。

**验收**：非法状态转换被拒绝；CAS 并发测试通过；重启 CLI 后 Task 仍可查询；`init` 幂等；迁移可以重复运行。

**回滚**：备份数据库；回到此 Phase 的提交；严禁对已有真实用户数据库强制降级，迁移回滚必须经过备份测试。

---

## Phase 2 — Memory / Context / Skills（全本地，无模型依赖）

**目标**：让两个不同 Agent Runtime 在同一个 Workspace 里看到**同一套被授权、可追溯的工程上下文**。

**步骤 2.1｜Memory 文件与 Proposal Schema**

```text
packages/memory/src/{models,proposal,validator,conflict,merge,fts-retriever}.ts
packages/context/src/{builder,budget,projection}.ts
packages/skills/src/{manifest,discovery,loader}.ts
```

定义 `MemoryProposal`：`id/scope/claim/sourceRefs/sensitivity/confidence/status`；定义状态 `proposed -> verified -> approved -> merged`，并为拒绝、冲突新增对应分支。

**步骤 2.2｜`init` 在 fixture 工程生成可选文件**

```text
.agent/workspace.yaml
.agent/memory/PROJECT.md
.agent/memory/DECISIONS.md
.agent/memory/proposals/
.agent/skills/
```

不自动覆盖用户已有 `AGENTS.md`、`CODELY.md`、历史知识文件。

**步骤 2.3｜本地索引**

- 支持 FTS5 或等效可用的全文检索，不要求联网 embedding。
- `rg --files` 排除 `.git/`、依赖目录和用户策略标注的敏感路径。
- 对每条被检索内容保存 `sourceRef`、hash、版本；变更时增量重建索引。
- `ContextBuilder` 根据角色、风险和 Context Budget 去重、裁剪后输出 Bundle。

**步骤 2.4｜CLI 验证路径**

```text
agent-harness context build <TASK_ID>
agent-harness context inspect <TASK_ID> --explain
agent-harness memory propose --workspace project-alpha --from report.md
agent-harness memory review <PROPOSAL_ID>
agent-harness memory accept <PROPOSAL_ID>     # human-only capability
agent-harness skills list --workspace project-alpha
```

**验收**：不打开任何 Agent API 就能生成 Context Bundle；已存储但不相关的内容不会被注入；高敏 Memory 不会出现在其他 Workspace 中；未审核 Proposal 不会升格为事实；Skills 懒加载可由测试计数证明。

**回滚**：仅重新生成索引，不删除原始 Memory 或 Proposal；保留 Memory merge 历史。

---

## Phase 3 — Agent Runtime Registry / ProcessRunner / Local Workflow

**目标**：先通过 FakeAgent 打通 Plan → Approve → Execute → Review，之后再接 Codex/Codely。

**步骤 3.1｜实现可测试 ProcessRunner**

```text
packages/runtime/src/{registry,process-runner,events,capability-probe}.ts
adapters/codex-cli/src/{adapter,invocation,parser}.ts
adapters/codely-cli/src/{adapter,invocation,parser}.ts
```

必须支持：`executable+args[]`（避免 shell 拼接）、独立 cwd、UTF-8、stdout/stderr 流式输出、timeout、取消信号、进程树清理、OS 退出码、错误码映射、敏感内容屏蔽。Windows `.cmd/.bat` 的启动方式必须有专门平台适配和测试，不能为了方便把原始用户字符串塞入 `shell: true`。

**步骤 3.2｜Agent capability probe**

```powershell
codex --version
codex login status
codely --version
codely --help
```

不要让自动测试读取/打印认证缓存。Adapter 可以判定 “CLI 存在，但未认证”，此时进入 `NEEDS_HUMAN`，而不是不断重试。原生 Session resume、MCP transport、结构化输出以各自当前 CLI 能力为准。

**步骤 3.3｜Codex 参考配置**

- `planner/reviewer` 默认只读，最小 Prompt，使用独立 Session。
- 只调用官方 Codex CLI/SDK 公开接口；ChatGPT 登录只是 Codex entitlement，不映射普通 Chat 聊天额度。
- 真正限制写权限需系统沙箱/隔离工作区，不能只设置 Prompt。

**步骤 3.4｜Codely 参考配置**

- 作为默认 `executor`，通过其 CLI 的非交互接口启动完整 Agent Run。
- 首次手动登录完成后再验证；不要求外部 Harness 保存 Codely 账号令牌。
- 支持 `-p/--prompt` 这类当前公开能力；stdio/HTTP MCP 按实际版本探测与配置。
- 非交互执行阶段必须具有明确超时/权限策略，不能简单全局启用 `--yolo`。

**步骤 3.4A｜DSH Native subscription Provider（Codex + Codely 两个独立实现）**

```text
adapters/codex-subscription/   # DSH LLM seam adapter or carefully audited existing plugin wrapper
adapters/codely-subscription/  # DSH LLM seam adapter, blocked until authorized
integrations/dsh/src/native-providers/
tests/contract/native-provider.spec.ts
```

实施动作：① 复用 `@deepseek-ai/dsh-llm-pi-ai` 的公开 route/capability 机制（兼容时）；② 为 Codex/Codely 注册不同的 `providerKey`、模型目录和 CredentialRef；③ 将 streaming、tool-calls、tool-results、error、cancel 映射成 DSH 原生消息/事件；④ Tool 执行只经过 DSH；⑤ 带上独立产品/订阅额度标签；⑥ 如协议/权益未经验证，编译成功但 Provider 必须 `disabled/blocked`；⑦ 每个 Provider 写 Mock Streaming 和真实手动 smoke 指南。

**不要**把 Codely CLI 的“自定义 OpenAI Provider”方向误解为“Codely 官方允许所有订阅模型从任何第三方客户端直接调用”；也**不要**把执行 Codely CLI 并截取文本伪装成 DSH LLM Provider。

**步骤 3.4B｜DSH External Agent Provider（Codex + Codely 两个独立实现）**

```text
adapters/codex-agent/          # dsh-subagent-codex wrapper, no hand-rolled second loop
adapters/codely-agent/         # ACP first; CLI stream-json fallback
integrations/dsh/src/external-agents/
tests/contract/external-agent.spec.ts
```

实施动作：① Codex 使用 DSH 现成 `ctx.subagents` provider；② Codely 探测 ACP，失败时使用受控 ProcessRunner/stream-json；③ 两者均负责 start/cancel/timeout/structured terminal result；④ 对 resume/tool events 不存在的能力明确 `false`，并用 Checkpoint 新 Attempt 恢复；⑤ 子代理事件映射到 DSH Parent Task Timeline，不虚构内部工具事件；⑥ 给 Reviewer/Executor 分别限制工作区读写权限。

**步骤 3.5｜Workflow Service**

```text
agent-harness task plan <TASK_ID>
agent-harness task approve <TASK_ID> --plan-hash <SHA256>
agent-harness task execute <TASK_ID>
agent-harness task review <TASK_ID>
agent-harness task status <TASK_ID>
```

其中 `approve` 必须验证真实用户身份/授权通道，**不得开放给 Executor 的 Agent tool set**。第一次测试使用 FakeAgent 代替真实 CLI，使输出可重复。

**步骤 3.6｜角色独立**

准备两个配置 Profile：

```yaml
# default: initial providers
roles:
  planner: {product: codex, mode: external-agent}
  executor: {product: codely, mode: external-agent}
  reviewer: {product: codex, mode: external-agent}
```

```yaml
# mocked: all same fake runtime, used for tests
roles:
  planner: {product: fake, mode: external-agent}
  executor: {product: fake, mode: external-agent}
  reviewer: {product: fake, mode: external-agent}
```

**验收**：FakeAgent 端到端通过；Codex/Codely Adapter 参数由 MockRunner 验证；Executor 不拥有 `approve` 能力；更换角色绑定不需要修改 Core；阻止未批准的写操作。

**回滚**：禁用真实 Agent Adapter，回到 `fake` Profile；已有 Task/Event 不丢失。

---

## Phase 4 — Git Workspace / ExecutionPermit / Local E2E

**目标**：在一个完全独立的测试 Git Repo 中真正修改文件，验证没有破坏用户工作区。

**步骤 4.1｜创建测试仓库**

```powershell
New-Item -ItemType Directory -Force .\examples\empty-git-repo | Out-Null
Set-Location .\examples\empty-git-repo
git init
'export const value = 1;' | Set-Content -Encoding UTF8 example.ts
git add example.ts
git commit -m "test fixture baseline"
$base = git rev-parse HEAD
$base
Set-Location ..\..
```

此步骤需要预先配置本机 Git 用户信息；不能强制更改用户全局 Git 配置。

**步骤 4.2｜实现 Workspace Provider**

```text
adapters/git-worktree/src/{provider,branch,locks,diff,cleanup}.ts
```

- 输入为 `WorkspaceDescriptor + pinned baseCommit`。
- 先检测目标路径、符号链接、分支同名、工作区脏状态；不允许覆盖已有 Worktree。
- `git worktree add` 的实际效果由受测实现负责，禁止使用 `--force` 掩盖冲突。

手工最小验证命令：

```powershell
$repo = (Resolve-Path .\examples\empty-git-repo).Path
$worktree = Join-Path (Get-Location) 'tmp\worktrees\task-smoke'
$base = git -C $repo rev-parse HEAD
git -C $repo worktree add -b agent/task-smoke $worktree $base
git -C $repo worktree list
git -C $worktree status --short
```

完成后保留 Worktree 直到人工确认；不要自动运行破坏性清理命令。若需清理，用 `git worktree remove` 前先验证其未提交文件已经受控保存。

**步骤 4.3｜执行门禁**

- `ExecutionPermit` 按批准的 Plan SHA、路径和操作能力签发；将 Worktree Root 固定为 cwd。
- 执行后对 `git diff --name-only` 和敏感路径进行再次验证；越权修改必须进入 `NEEDS_HUMAN`，不能自动入库。
- 验收用例：拒绝修改 worktree 外路径、拒绝无 Approval 写任务、拒绝过期 Permit、拒绝 Base SHA 被改变。

**步骤 4.4｜最小真实 E2E**

```text
Create Task in fixture repo
→ ContextBuilder
→ Runtime Plan (real or fake)
→ Human approval
→ Runtime Execute
→ git diff + deterministic tests
→ Independent Review
→ report + retained worktree
```

**验收**：主工作区 `git status` 没变化；只修改隔离 Worktree；失败有可见报告；同一 Task 再执行不会创建第二个并行写 Worker。

**回滚**：保留失败 Worktree，切换 Workflow Profile 为 `read-only`，检查审计和 Git 状态后由人决定清理。

---

## Phase 5 — Session Tree / Compaction / Checkpoint / Crash Recovery

**目标**：让非正常退出不会让已完成的 Plan/测试/结果丢失。

**步骤 5.1｜Session Events**

```text
integrations/dsh/src/sessions/{session-observer,projection,compaction-bridge}.ts
packages/application/src/recovery/{checkpoint,recover,mode-handoff}.ts
```

- 通过 DSH 官方 Session API 读取/观察 append-only log 与 Session 分支，不自己开新的 `session_events` 表。
- 仅扩展 Task/Event 和 DSH Session 引用，并对可见事件实现 `public`、`workspace-confidential`、`local-secret` 等脱敏投影。
- External Agent 未提供的 tool/thought 内容只记录 opaque result/status，不尝试模拟私有事件；`nativeSessionRef` 是节点本地引用。

**步骤 5.2｜在指定边界写 Checkpoint**

```text
PREPARED / PLAN_READY / APPROVED / BEFORE_SIDE_EFFECT /
AFTER_TEST / EXECUTED / REVIEWED / INTERRUPTED
```

**步骤 5.3｜恢复模式**

```text
agent-harness task checkpoint <TASK_ID>
agent-harness task resume <TASK_ID> --checkpoint <CHECKPOINT_ID>
agent-harness task handoff export <TASK_ID> --output <PATH>
agent-harness task handoff validate <PATH>
```

- Resume 先校验 Git snapshot、Approval 版本、`operations` 幂等状态。
- 无法恢复原生 Runtime Session 时创建新 Attempt，利用 Session Projection + Checkpoint 继续。
- 若异步子进程可能仍在运行，必须先检测/人工确认停止，禁止重复副作用。

**步骤 5.4｜故障注入**

```text
kill during planning
kill during file edit
kill during test
kill during checkpoint write
cancel during agent subprocess
restart with stale checkpoint
resume after plan changed
```

**验收**：Task SQLite 的 Checkpoint/Operations 可恢复，**DSH 原始 Session Events** 保持不变；重复操作不会再次应用、错误版本拒绝继续、恢复状态有可解释原因；Compaction 不删改原事件。

**回滚**：禁用自动恢复但保留原始 SQLite 和工件；恢复时可退回人工导出 Patch + 新 Task。

---

## Phase 6 — GitHub Coordinator / 多节点 / Durable Inbox

**目标**：一台机器提交任务，另一台机器在其自身权限下领取和执行；即使离线超过 24 小时，Task 记录仍然存在且可再次派发。

**前置安全条件**：企业项目先确认是否允许通过 GitHub.com 传输项目元数据或触发本机自动化。禁止绕过公司 IT/数据出境政策。

**步骤 6.1｜创建独立 Private Control Repo**

```powershell
gh auth login
gh repo create <YOUR_USER>/agent-harness-control --private --description "Generic agent task coordination" --confirm
```

如果当前 `gh` 版本不支持 `--confirm`，按 CLI 提示交互创建；完成后核对仓库确实为 Private，不接受 PUBLIC 回退。

**步骤 6.2｜注册两台 Runner（仅用户信任仓库）**

GitHub 网站：Repository → Settings → Actions → Runners → New self-hosted runner。每台机器执行 **GitHub 当时页面生成的官方注册指令**，不要把一次性注册 token 写进脚本或文档。

建议 Labels：

```text
home-node:   self-hosted, home-node
office-node: self-hosted, office-node
```

先交互启动并完成 smoke test，再按 OS 安全配置成独立、低权限服务用户。限制仓库 workflow 写权限和 Runner 的访问范围。

**步骤 6.3｜先建立纯 smoke workflow**

使用第 8.3 节模板，第一轮将 `agent-worker run` 改为 `echo "dispatch received"`；确保在 HOME 触发后只会到指定 OFFICE Runner，不会被另一个 Runner 抢走。

```powershell
gh workflow run dispatch-task.yml -R <YOUR_USER>/agent-harness-control -f task_id=T-SMOKE-001 -f target=office-node
gh run list -R <YOUR_USER>/agent-harness-control --limit 5
```

**步骤 6.4｜实现 `adapters/github`**

```text
adapters/github/src/{client,task-inbox,dispatch,reconciler,runner-registry}.ts
apps/worker/src/{main,claim,worker-loop}.ts
```

- 只使用固定 allowlist 的 repoAlias/targetNode/workflowId。
- 根据 Task ID 在目标节点本地查到允许的 Workspace Descriptor。
- remote workflow 输入不携带任意命令、文件路径或机密正文。
- 运行日志默认仅上报状态码和工件引用。
- 每个远程 Task 有 Durable Record；每个 GitHub Actions Run 有单独 Attempt Record。

**步骤 6.5｜Reconciler**

推荐用 GitHub-hosted 定时 Workflow 或信任的在线节点周期扫描 `state:queued`，检查是否已有有效 Run，缺失时再投递；对每次投递使用稳定 `deliveryId` 和同一 Task ID 的并发组。若控制 Repo 不允许使用 GitHub-hosted Actions，改为独立本地 reconciler，注明必须保证至少一个协调节点上线。

**步骤 6.6｜Approval & Continuation**

第一段 Workflow 停在 `PLAN_READY`，计划摘要通知请求方；批准操作校验 Plan Hash，再触发新 `execute` Workflow。不要让 runner 一直等待人工审批而占着一个长期 Job。

**步骤 6.7｜离线/断网演练**

1. Office 关机，Home 创建 Remote Task。
2. Dispatch 等待超过 GitHub Job 队列寿命后失败（**测试中可模拟超时，不必真的等 24h**）。
3. Durable Inbox Task 仍存在。
4. Office 上线后 Reconciler 能重新 dispatch。
5. 中途断网，系统不擅自把同一写任务分配给其他 Node。
6. 执行结束后 Home 能读到安全的状态与报告引用。

**验收**：`send/status/approve/cancel` 可用；Runner 只执行已注册 Workspace；离线任务不丢；重复 Dispatch 不导致双写；不同节点不能凭一个 Task ID 读取另一个节点私有凭证。

**回滚**：禁用控制 Repo 工作流、移除 Runner 注册、撤销对应访问令牌；本机 Worktree 与报告仍可恢复；不删除业务仓库。

---

## Phase 7 — DSH Foundation Plugins / Native Model UI / External Agent UX

**目标**：把 DSH **作为唯一真正的 Harness 本体和 Web UI**，而不是 v3 的“可替换宿主”。扩展的 Task、Workflow、Memory、双模式 Provider 通过其 service seam 和 UI 插件加载；Session/Event/Agent/Tool 均借用 DSH 官方已有实现。

**步骤 7.1｜锁定 DSH/Node/插件兼容矩阵**

```powershell
node --version
npx @deepseek-ai/dsh --help
# 依据 dsh 当前 --help 选择 Web profile 并核验 UI 能运行
npx @deepseek-ai/dsh web
```

把已验证版本、Provider 插件 commit、Windows/macOS/Linux 运行结果记录到 `docs/compatibility-matrix.md`。**不自动拉最新 unstable 插件上线**。

**步骤 7.2｜DSH Extension Services**

```text
integrations/dsh/src/plugins/task-service.ts
integrations/dsh/src/plugins/workflow-service.ts
integrations/dsh/src/plugins/context-memory.ts
integrations/dsh/src/plugins/permission-audit.ts
integrations/dsh/src/plugins/provider-registry.ts
integrations/dsh/src/ui/{task-view,session-timeline,agent-selector}.ts
```

这里是“建议文件划分”，不是宣称真实 DSH API 名称。先读取安装版 DSH Cordis Service/Injection 与 Session/Tool/UI 类型再实现，禁止编辑 DSH 内核源码。Task Service 不实现第二套通用 Agent Loop。

**步骤 7.3｜DSH Web 提供两个正交选择器**

- **Model Selector**：`local.ollama`、`subscription.codex`、`subscription.codely`；Provider 未通过门槛时可列为“实验/不可用”但不能误导为已登录、可执行。
- **Agent/Role Selector**：`external.codex`、`external.codely`；默认 Plan/Review → Codex external，Execute → Codely external，只是用户可改配置。
- UI 必须显示：Mode、Loop Owner、凭证状态（不展示 Token）、模型或 Agent 能力、配额来源、数据去向、当前 Task/Session/Attempt 绑定。

**步骤 7.4｜Native 模型通信集成**

DSH `dsh-agent-loop` → `ctx.llm` → `subscription.codex` 或 `subscription.codely`。每轮模型返回后的工具由 `ctx.tools` 执行，事件由 `ctx.sessions` 记录。分别验证 `text → tool_call → tool_result → final`、取消、401/429、模型切换后会话重载。**严禁 Native Provider 背后再运行完整 Codex/Codely CLI Agent Loop**。

**步骤 7.5｜External Agent 委派集成**

通过 DSH `ctx.subagents` → Codex provider/ACP Codely provider 执行；Codely ACP 未稳定时 fallback `stream-json` CLI adapter（保留 `external-agent` 类型）。DSH Web 展示子代理状态、引用、最后结果、取消状态；内部不可见的工具事件不补造。

**步骤 7.6｜订阅权益与付费保护实测**

- [ ] 在不设置任何额外付费模型 API Key 时，DSH local + mock four modes 可运行。
- [ ] Codex/Codely 四个 Route 的状态、认证、权限分别可检查。
- [ ] 未经供应商合法授权的 `subscription` Provider 不发请求、不可执行。
- [ ] 若获准使用订阅流：每条路实测 5 次（文本、tool、重连、拒绝、取消），不泄漏凭证。
- [ ] 关闭 `allowPaidApi` 时，任何失败都不会切换 OpenAI/其他付费 API。
- [ ] 额度不足/凭证失效时 Task 进入可恢复状态而非清空 Session。
- [ ] Native/External 切换创建审计事件和安全 ContextPacket。

**步骤 7.7｜生产级门槛与回滚**

未通过 Provider 验收只禁用该 Route；其他 DSH UI/Task/本地模型/外部 Agent 照常可用。可以停用实验插件而不破坏 DSH Session 事实。完整测试前不推荐在公司敏感代码环境启用任何社区订阅插件。

**验收**：同一个 DSH Web UI 中可检查两产品×两模式的四个可配置路由；所有 ready 组合通过各自 E2E；DSH Native Session 真实可回放；同一 Attempt 没有双 Loop；模型费用政策默认严格拒绝额外 API；任务不依赖特定业务项目。

**回滚**：禁用对应 Provider 插件，撤销其授权权限，回到 DSH local/model-free 或已验证 external-agent 路由；Checkpoint/Task/Session 保留。不得用“卸载 DSH 后用独立自造 Harness 继续”作为主要降级路径。

---

## Phase 8 — 高级能力（MVP 后逐个引入）

- Capability-aware Router：节点、角色、运行环境、预算、可信度联合匹配。
- Deferred Tool Registry：按需加载 Tool Schema / MCP 服务，不一次注入全部工具定义。
- Hybrid Retrieval：FTS + 可选向量检索；索引只存可允许持久化的数据。
- Workflow DAG：子任务可并行但共享写 Workspace 必须串行或各自 worktree，最后受控合并。
- 多 Coordinator：独立 Server / GitLab / Gitea / 企业队列插件。
- 细粒度审批：多角色、TTL、风险级别、审计、撤销。
- CLI / Web 可观测性：时间线、事件树、Context 注入证据、Memory Diff、恢复点、成本信号。
- Schema 版本迁移与跨节点协议兼容矩阵。

**升级原则**：每加入一个新 Adapter，先跑 Core Contract Tests；每加入一个新 Workflow Profile，先跑 FSM/Approval/Recovery Tests。

---
## 10. 验证体系与发布门槛

### 10.1 Test Matrix

| 类别 | 用例 | 必须结果 |
|---|---|---|
| Domain | 无效 Task 状态跃迁 | 拒绝、无副作用 |
| Storage | 双并发 CAS、Event + State 原子提交 | 只有一个成功、事件不丢 |
| Schema | v1 payload 兼容/非法字段 | 有版本迁移或明确拒绝 |
| Runtime | Codex/Codely 未安装、未登录、超时、非零退出 | 明确错误，进入可恢复状态 |
| Runtime | 同一角色切换 Adapter | Core 无代码变更 |
| Loop | DSH 与外部 Agent 双 Loop 冲突 | 配置阶段直接报错 |
| Approval | Agent 自行批准、Plan Hash 变化 | 拒绝执行 |
| Security | 路径穿越、符号链接、越权写、敏感输出 | 阻断并审计 |
| Workspace | 未提交用户更改、分支名冲突、worktree 中断 | 无数据丢失 |
| Session | append-only、树分叉、compaction | 原始 Events 不减少 |
| Memory | 未审核记忆、跨 Workspace、敏感来源 | 不升格 / 不检索 / 不注入 |
| Recovery | Agent 进程崩溃、Worker 重启、重复 Operation | 从一致点恢复，不重复有副作用步骤 |
| Remote | Target 错误、离线 >24h、重复 dispatch | 保留 Task，可重试，不自动双写 |
| Remote | stale worker/lease 不一致 | 拒绝提交或停在人工处理 |
| Data | Restricted Mode 下敏感 task / diff / logs | 无云端泄漏 |
| Native Codex | 订阅授权、真实流、工具往返、429/401、额度边界 | 未授权 blocked；通过后只用 DSH loop，失败不付费 fallback |
| Native Codely | 官方授权、模型流、tool/result、取消、刷新行为 | 未授权 blocked；CLI 包装不冒充原生 LLM |
| External Codex | DSH 官方 Codex subagent/cancel | 正确映射原生 lifecycle、外部 Loop 独立运行 |
| External Codely | ACP/CLI stream-json/cancel | Adapter 明确能力降级、外部 Loop 独立运行 |
| Runtime switch | 四模式切换/原生 Session 交接 | 产生新 Attempt/Checkpoint 映射，不假装跨 Runtime 续接 |
| Billing | `allowPaidApi=false` 且订阅路由失败 | 不发生任何付费 API fallback |
| DSH | 插件停用与升级 | DSH Session 和 Task 持久不丢，其他路由继续可用 |

### 10.2 可执行开发质量门禁

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

为 schema migration、CLI command smoke、Worktree 破坏性测试、GitHub 任务派发分别配置单独测试目标；网络 E2E 必须是**显式手动触发**，默认 `pnpm test` 不得自动访问真实 GitHub 或调用付费/限额 Agent。

### 10.3 Release / Version Policy

- `core` 采用 SemVer 与 API compatibility tests；Schema 具备 `schemaVersion`。
- Adapter 独立 version，声明兼容的 Core contract version 与外部 CLI 版本范围。
- DSH Foundation 版本在 lockfile 里固定；升级用独立分支验证，逐一重跑两款产品双模式兼容矩阵。
- 数据库迁移执行前备份；严禁不带迁移的原地覆盖用户 runtime DB。
- `--dry-run` 应能打印 Task Plan、目标节点、工作区和权限，但不能暴露 Secret。

---

## 11. 最终 Execute Checklist（逐项勾选）

### M0S · Dual-Mode Feasibility Gate

- [ ] 明确 DSH 为唯一 Harness Foundation，并锁定当前 DSH/Node/plugin 版本。
- [ ] Codex/Codely 各建立 `subscription` 和 `external-agent` 路由标识/Mock。
- [ ] 审查 pi2dsh、dsh-codex-subscription、dsh-codely 的源码/许可/版本/凭证风险。
- [ ] 分别确认供应商订阅授权；未经确认的 route 为 `blocked`，不可发真实请求。
- [ ] 四组合的 capability/loop owner/费用来源矩阵和脱敏 PoC 报告完成。
- [ ] `allowPaidApi=false` 时 DSH local 模式可运行。

### M0 · Framework Bootstrap

- [ ] 新建独立 `generic-agent-harness` Git 仓库。
- [ ] pnpm workspace + TypeScript + 测试框架能从空目录构建。
- [ ] Core 无特定项目路径或语言硬编码。
- [ ] `.gitignore` 排除本机数据库、缓存、日志和凭证。
- [ ] README/ARCHITECTURE/ADR 模板建立。
- [ ] 记录所用 Node/pnpm/DSH/CLI 实际版本。

### M1 · Task & Persistence

- [ ] Task/Attempt/DSH Session Link/Checkpoint/Approval schema 已定义。
- [ ] Task FSM、Version/CAS、非法转移校验完成。
- [ ] SQLite migrations 与 `TaskStore`/DSH Session Link Index 完成；不新建重复 `session_events`。
- [ ] CLI `doctor/init/new/status/events` 完成。
- [ ] 并发 CAS、Migration、重启恢复单测通过。

### M2 · Context & Memory

- [ ] 用户/Workspace/Task/Session Memory 分层完成。
- [ ] Proposal → Review → Merge 流程完成。
- [ ] FTS/rg/git Context Builder 运行不依赖 LLM。
- [ ] Stored/Retrieved/Injected 审计可检查。
- [ ] Skill metadata 扫描与 Progressive Loading 完成。
- [ ] 非本 Workspace 的敏感 Memory 不可见。

### M3 · Agent & Workflow

- [ ] Runtime Adapter registry + Capability Probe 完成。
- [ ] ProcessRunner Windows/macOS/Linux 合同测试完成。
- [ ] Codex/Codely 各两种模式（Native subscription + External Agent）的独立 Adapter/Mock 测试完成。
- [ ] Native LLM streaming/tool-call/tool-result/cancel 合同测试通过（订阅真实端点需先授权）。
- [ ] External Agent Codex subagent 与 Codely ACP/CLI 降级合同测试通过。
- [ ] Fake Runtime 本地 E2E 完成。
- [ ] 三种 Workflow Profiles（direct/plan-execute-review/research）完成。
- [ ] 人工 Approval 不可由 Agent 工具调用伪造。
- [ ] 角色配置替换 Agent Runtime 不修改 Core。

### M4 · Workspace & Recovery

- [ ] Git worktree Provider 完成并防止覆盖用户修改。
- [ ] ExecutionPermit 具备技术级校验。
- [ ] DSH 原始 Session Event 的观察与 Tree/Fork 集成完成（不重建 DSH Session Store）。
- [ ] Context Compaction 不删原事件。
- [ ] Checkpoint / Idempotency / Resume / Handoff 完成。
- [ ] 断进程、断电模拟、旧审批、过期 Permit 演练通过。

### M5 · Multi-device

- [ ] Private Control Repo 已确认权限合规。
- [ ] 两个 Runner 在线并隔离 OS 用户。
- [ ] `workflow_dispatch` + Target Label smoke 通过。
- [ ] Durable Task Inbox + Reconciler 完成。
- [ ] 24h 排队超时不会导致 Task 消失。
- [ ] `send/status/approve/cancel/resume` 可用。
- [ ] 限制并发 + 手动安全迁移/防双写措施测试通过。
- [ ] Restricted Mode 云端无敏感正文和完整日志。

### M6 · DSH & Release

- [ ] DSH 是唯一 Harness Foundation，已复用原生 Web UI/Agent/Session/Tool。
- [ ] `integrations/dsh` 承载 Task/Workflow/Memory 扩展，不另造并行主 Harness。
- [ ] Model Selector 和 Agent Selector 显示四条双模式 route 的真实 readiness。
- [ ] `allowPaidApi=false` 的 Native/External 限额失败均能 Checkpoint/Pause。
- [ ] 不存在同一 Attempt 的重复 Agent Loop。
- [ ] DSH Task/Session/Event 面板可用。
- [ ] Contract/Integration/Security/Recovery 完整验收通过。
- [ ] 完整安装说明与故障处理 Runbook 完成。
- [ ] v0.1.0-alpha 发布到受控制品仓库（可选）。

---

## 12. 直接交给 Codex 的分阶段实施 Prompt

**执行约定**：每次仅发送一个阶段 Prompt。推荐先执行 **Prompt S（双模式可行性与合规闸门）**，再执行 A/B/C/D；用户每次验收后继续。不要一次让 Codex 完成全部。

### Prompt S · DSH 双模式 Provider 可行性调查（Phase 0S，必须先做）

```text
你正在实施 Generic Agent Harness v4。DSH 是真正的 Harness Foundation，必须复用 DSH Web UI/Native Loop/Session/Tool/Plugin。
请阅读 docs/execution-plan.md 的 0、1、2、6、Phase 0S，并检查当前 DSH 源码/实际安装版本。

本次只做四条路线的 Capability/安全/授权验证与 Mock：
1) codex + subscription -> DSH LLM Provider（参考 pi2dsh/dsh-codex-subscription）
2) codely + subscription -> DSH LLM Provider（参考 HiSeax/dsh-codely 原型）
3) codex + external-agent -> DSH 官方 dsh-subagent-codex
4) codely + external-agent -> ACP 优先、CLI stream-json 备选

要求：
- 不将 Codex/Codely CLI 内部 Agent Loop 封装成假 LLM completion。
- 未经明确供应商授权，不调用任何非官方认证/订阅接口，不读取或上传缓存 token。
- 只读源码分析和 Mock 通信；涉及个人账号授权的真实测试列人工操作清单。
- 逐条验证流式响应、DSH tool_call/tool_result、取消、错误、session、费用来源。
- 对每条 Route 输出 ready/experimental/blocked/unavailable 和证据链。
- 禁止自动启用任何独立计费 API；保持 allowPaidApi=false。
- 不修改 DSH 核心源码、不污染目标业务仓库。

交付：docs/dual-mode-feasibility.md、compatibility-matrix.md、四 Route 的 Mock 合同/测试清单、风险与 Go/No-Go 决策。
完成后停止。
```

### Prompt A · Foundation / Domain / Store（Phase 0–1）

```text
你现在位于一个全新、独立的 Generic Agent Harness 仓库。
请阅读 docs/execution-plan.md 的第 0–4 节与 Phase 0–1。

目标：建立可编译、可测试的纯 Core，包括：
- pnpm workspace / TypeScript / tests
- Task / Attempt / Session / Checkpoint / Approval domain
- AgentRuntime/Coordinator/Workspace/TaskStore interfaces
- FSM / CAS / Versioned Schema
- SQLite migration / TaskStore
- CLI doctor/init/new/status/events

约束：
1. 此框架与任何具体业务项目无关，禁止增加语言/框架专有假设。
2. Core 不得 import DSH、Codex、Codely、GitHub。
3. 不要连接远程网络、安装 Agent 认证插件或访问凭证。
4. 不修改其他 Git 仓库。
5. 开始前检查 git status；保留用户现有未提交文件。
6. 所有核心行为均应有单测。

交付：目录、代码、迁移、示例、测试结果、下一步建议、已知问题。
完成后停止，不要擅自进入下一阶段。
```

### Prompt B · Shared Memory / Runtime / Local E2E（Phase 2–4）

```text
请在当前 Generic Agent Harness 项目中完成 Phase 2–4。
先读取已完成的接口、测试结果、ADR，并检查 git status。

实现：
- Memory Proposal/Validation/Conflict/Merge
- FTS/rg/git Context Builder + Context injection audit
- Skill registry + Progressive Disclosure
- ProcessRunner（Windows/macOS/Linux 兼容）
- AgentRuntime Registry + Capability Probe
- Codex/Codely 双模式 Adapter：Native LLM seam + External Subagent seam，各自独立 Mock/能力门槛
- Workflow Profiles、Approval Gate、ExecutionPermit
- Git Worktree Provider 与 FakeAgent E2E

约束：
1. DSH 是必须复用的基础 Harness；Codex/Codely 的四个 Route 是不同的可配置扩展。
1a. `subscription` 不启动外部产品完整 Loop；`external-agent` 不伪装成普通单步模型 API。
2. 不调用真正的 Codex/Codely 做自动单测，以免消耗配额。
3. 只在独立 fixture Git 仓库进行写测试。
4. Agent 不允许自行审批。
5. 检测越权写路径、失效 Plan Hash、重复写执行。

输出每个模块的测试证明，停止于 Phase 4。
```

### Prompt C · Session / Recovery / Multi-device（Phase 5–6）

```text
请完成 Generic Agent Harness 的 Session/Checkpoint 和 GitHub 适配阶段。

范围：
- 复用 DSH 原生 Session Events/Tree/Fork + Projection/Compaction Bridge
- Checkpoint / Native Resume capability / New Attempt fallback
- OperationId/idempotency + crash recovery
- GitHubCoordinator + durable task inbox + reconciler
- Self-hosted Runner example workflow（不含任意远程 Shell）
- Target Node allowlist + Safe Task envelope
- agent send/status/approve/cancel/resume
- GitHub job 24 小时排队过期后的重新派发策略

约束：
1. GitHub 只是 Coordinator Adapter，不是核心数据库。
2. 不假定 GitHub Issue Labels/Actions concurrency 是强事务锁。
3. 不承诺不具备的跨节点 Exactly-Once。
4. 不上传完整源码、Session、Memory 或凭证。
5. 如需真实注册 Runner/创建 GitHub 仓库，必须让用户自己审批并操作。
6. 强制保留断网、重复 Dispatch、旧 Permit 的失败注入测试。

交付详细 Runbook 与手动两机验收步骤。完成后停止。
```

### Prompt D · DSH Integration / Release（Phase 7–8）

```text
请在 Generic Agent Harness 框架中实现 DSH Foundation Integration 和 Codex/Codely 双模式路由。

先查阅当前安装版本的官方 DSH/Cordis plugin docs、类型定义和实际运行效果。
不要假设旧版本 DSH API 与本机相同。

目标：
- 将 Harness Application Service 暴露为 DSH 插件服务
- 提供 Task/Session/Checkpoint/Context/Approval/Events UI 所需接口
- 将 DSH 定为唯一 Harness Foundation：复用 Web UI、Session/Event、Native Agent Loop、Tool Registry
- 在 DSH 模型选择器接入 Codex/Codely `subscription` LLM Provider（通过授权/安全门槛后才可真实调用）
- 在 DSH 子代理/Workflow 选择器接入 Codex/Codely `external-agent`（Codex subagent、Codely ACP/CLI）
- 不在 external-agent 完整 Loop 上再套 DSH LLM Loop；subscription 则必须由 DSH 驱动 Native Loop
- 不默认执行任何独立收费 API fallback；额度耗尽要 Checkpoint
- 增加集成测试与版本兼容测试

安全：不要在普通 Agent Tool Registry 中暴露能够自我批准的 Human Approval。

最后提供 v0.1 alpha 发布清单、变更日志、升级和回滚说明。
```

---

## 13. 决策记录（ADR）建议

| ADR | 决策 | 替代方案 | 需要重新评估的条件 |
|---|---|---|---|
| ADR-001 | 通用框架独立仓库 | 直接嵌入业务仓库 | 永不应嵌入 Core，允许薄客户端 |
| ADR-002 | Adapter ports/hexagonal boundaries | 强绑定 Codex/Codely | 新 Agent 插件接入时只改 Adapter |
| ADR-003 | One Loop Owner per Attempt | 双重 Agent Loop | 允许明确的子代理任务，但不允许重复主循环 |
| ADR-004 | Git + SQLite 分层 | 全靠 prompt/JSON 文件 | 需要跨节点强一致数据时引入强 Coordinator |
| ADR-005 | GitHub 首选 Coordinator | 自建 server | 多节点多写者/实时 SLA |
| ADR-006 | Worktree 默认隔离 | 原地修改开发者目录 | 不支持 Git 的项目需先做独立 WorkspaceProvider |
| ADR-007 | Memory Proposal/Gate | 模型直接写入共享记忆 | 只有低风险可回滚自动知识整理可放宽 |
| ADR-008 | 审批基于快照 Hash | 仅审批当前 Task ID | 任何改动 Plan/Scope 都使审批失效 |
| ADR-009 | ChatGPT 普通 Chat 不作为 API Quota | 网页自动化模拟 Chat | 出现官方支持的产品配额接口时再评估 |
| ADR-010 | DSH 为必须的 Harness 基础（Web/Agent/Session/Tool） | DSH 仅作可替换 UI 外壳 | 除非明确重新立项，否则不修改 |
| ADR-011 | Codex/Codely 同时具备 subscription 与 external-agent 双模式端口 | 单一 CLI Runtime | 新增产品同样遵守正交分离 |
| ADR-012 | Subscription Provider 必须有真实 Native tool-calling 流且符合账号授权 | CLI-to-LLM 假桥 | 任何供应商更新需重新验收 |
| ADR-013 | 额外付费 API 默认为禁用、不得静默回退 | 失败自动付费兜底 | 用户显式开启并设预算后方可使用 |

---

## 14. V3 → V4 迁移指导（适用于已有原型）

1. **拆独立仓库**：将通用 `core/`, `memory/`, `context/`, `sessions/`, `workflow/` 移至 Framework Repo；消费者只保留 `.agent/` 数据和薄客户端。
2. **重命名配置**：旧项目特定的 repoAlias、Node Label、业务技能移到 `examples` 或 Workspace 配置；不要迁移为默认值。
3. **双适配分离**：核心不直接 `spawn('codely')` / `spawn('codex')`；`subscription.*` 由 DSH LLM seam 接收，`external.*` 由 DSH Subagent/Agent Runtime seam 接收，旧 CLI 包装只能归外部模式。
4. **引入 Loop Owner 校验**：运行时必须明确声明 Loop Owner，拒绝 `DSH native loop + external full loop` 意外同时启动。
5. **迁移状态存储**：备份原 `.agent/runtime/*.db`，将重复的旧 `sessions/session_events` 表改为 DSH Session ID Link/只读 Projection（保留历史归档供审计）；Task/Checkpoint 独立迁移，严禁删除 DSH 原始 Session Log。
6. **Memory 分类迁移**：既有未经来源核对的记忆进入 Proposal，不自动视为已接受事实。
7. **GitHub 改为插件**：控制仓库名字、labels、Runner groups 均由配置读取，不能留在源码常量里。
8. **调整可靠性声明**：旧文档中“Runner 离线会无限等待”和“GitHub lease 可确保 exactly-once”之类描述一律修正。
9. **补齐 Contract Tests**：保证第二个新 Adapter 和第二个全新 Workspace 无需修改 Core 即可用。
10. **迁移验收**：两个完全无关的 fixture 仓库跑完整链路；Codex/Codely 不在场时 DSH UI/Local/Task 仍运行；纯数据结构测试可脱离 DSH 构建，但正式产品只能用 DSH Foundation 启动。

---

## 15. 参考与实施时必须核验的文档

> 以下是技术参考链接。文档中所有命令均应优先以当前安装版本的 `--help`、官方文档和实际编译结果核验。

- DSH 官方仓库（Developer Preview）：https://github.com/deepseek-ai/deepseek-harness
- 用户参考讨论《分析 Codex 订阅接入》：https://chatgpt.com/share/6ac9e034-83f8-83ec-bf70-d02396810848
- DSH LLM pi-ai seam：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.zh.md
- DSH subagent seam：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.zh.md
- pi2dsh：https://github.com/weijiafu14/pi2dsh/blob/main/README.zh.md
- DSH Codex 订阅社区插件：https://github.com/WSL043/dsh-codex-subscription
- DSH Codely 订阅社区 Adapter（非官方/实验）：https://github.com/HiSeax/dsh-codely
- DSH 官方介绍与快速启动：https://deepseek.com/harness/en/
- DSH / Cordis 插件教程：https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/
- GitHub 自建 Runner 路由与 24h 队列规则：https://docs.github.com/en/actions/reference/runners/self-hosted-runners
- GitHub Self-hosted Runner 安全建议：https://docs.github.com/en/actions/reference/security/secure-use
- GitHub `workflow_dispatch` 手动运行：https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow
- Codely CLI 最新命令行参数与 MCP：https://codely-docs.tuanjie.cn/features-introduction/command-line-arguments/
- Codely CLI 工作流与审批：https://codely-docs.tuanjie.cn/using-codely/codely-cli/
- Codex ChatGPT plan 使用限制说明：https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- Git worktree 官方手册：https://git-scm.com/docs/git-worktree

---

## 16. 最终定义与下一步（v4）

**成功定义**：DSH 是唯一的交互式 Harness；Codex 与 Codely 分别以 `subscription`（DSH 原生 LLM Provider）和 `external-agent`（自身 Loop）两种形态接入；本地模型与纯确定性任务不要求额外付费 API；Workflow、Session、Memory 与 GitHub 多端协同仍然跨项目通用。

**请严格区分实现完成度**：接口和 Mock 完成不等于第三方订阅网关获得供应商许可并真实可用。**生产级 MVP 不能以未经确认的 subscription 路由为前置依赖**；该路由可以保持可见但 `blocked`，不阻塞合法的 local/external-agent 工作流。若用户要求两条 subscription 在生产环境必须可用，则这是一个需要供应商正式支持或书面授权的外部依赖/Go-No-Go 条件，不能通过工程绕过。

**立即执行的动作**：

```text
[ ] 将本文保存为 generic-agent-harness/docs/execution-plan.md
[ ] 先执行 Phase 0S（四模式技术/订阅授权可行性调查），完成兼容矩阵
[ ] 完成 Phase 0，初始化项目并明确 DSH Foundation 的包/服务边界
[ ] 完成 Phase 1–2，Task/Memory/Context 扩展，不重写 DSH Session/Agent/Tool
[ ] 完成 Phase 3，两个产品 × 两种接入方式的 Adapter 合同与工作流测试
[ ] 完成 Phase 4–6，Worktree、Checkpoint、多端控制
[ ] 完成 Phase 7，DSH Web 中双选择器与 E2E；未授权订阅 Provider 保持 blocked
[ ] Phase 8 仅在 MVP 验收通过后逐个启用
```

**交付第一回合请使用**第 12 节 `Prompt S`。Codex 应先报告 **“两条 Native subscription 路由是否可以在合法授权下成为真正 DSH LLM Provider”**，不要直接跳过验证开始编码。
