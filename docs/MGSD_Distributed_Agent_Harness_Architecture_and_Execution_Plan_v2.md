# MGSD Distributed Agent Harness
## V2 架构与从 0 开始 Execute Plan

> 版本：v2.1；日期：2026-10-09；实施顺序：本地 DSH → GitHub remote task（两阶段交付，见第 0.2/0.3 节）。

> 适用环境：Windows / macOS + Unity/Tuanjie + Git + Codely CLI + Codex CLI + DeepSeek Harness (DSH) + GitHub

> 核心目标：在不重复构建 Agent Loop 的前提下，建立一套**可恢复、可审计、可多端协同、节约 Codex 配额、长期可演进**的工程 Agent Harness。

---

# 0. 本次 V2 更新说明

V2 在 v1 的基础上吸收 Pi 的几个关键设计思想，并对执行顺序做了重要调整。

## 0.1 V2 新增的核心原则

1. **Task 与 Session 分离**：Task 表示“要完成什么”，Session 表示“一次 Agent 执行轨迹”。一个 Task 可以有多个 Session。
2. **Git 与 SQLite 分工**：
   - Git：长期、可审计、可共享的事实与成果。
   - SQLite：运行时状态、Session Event、Checkpoint、Lease、临时索引。
3. **Session 使用 append-only event log / tree**，而不是把聊天摘要当唯一状态。
4. **Compaction 只生成 Context Projection，不删除原始 Session History**。
5. **Stored ≠ Retrieved ≠ Injected**：存进 Memory 的内容，不代表每次都检索；检索到的内容，也不代表一定注入 Prompt。
6. **Progressive Disclosure**：规则、Skills、Tools、Memory 都按需加载，禁止默认把所有知识塞进上下文。
7. **Durable Task**：Task FSM + Checkpoint + Lease + Fencing Token + Idempotency，支持崩溃/断网/换机恢复。
8. **Memory 不能由 Agent 直接“写成事实”**：必须走 Proposal → Validation → Conflict Check → Merge。
9. **Codely 仍是主 Agent Loop，Codex 是按需高级专家，DSH 不直接调用 LLM，也不再实现第二套 Agent Loop。**
10. **GitHub 是多端 Control Plane，但不是实时数据库，也不是 Memory Database。**

## 0.2 V2 对 v1 最大的执行顺序调整

v1 是：

```text
GitHub Runner
→ Harness Core
→ Codely/Codex
→ DSH
```

V2 改为（v2.1 起按两阶段交付，见 0.3）：

```text
第一阶段：本地 DSH 使用闭环
Phase 0  基础工程/SQLite/Schema
Phase 1  Shared Memory + Context Retrieval
Phase 2  Agent Adapter + Durable Task FSM + Worktree
Phase 3  Session/Event Tree + Checkpoint + Recovery
DSH      DSH 本地集成 + 本地端到端验收

第二阶段：GitHub 多端（第一阶段验收通过后才开始）
Phase 4  GitHub 多端 Worker/Lease/Handoff

MVP 后按需扩展
Phase 5  Tool Search / Deferred Tools / DAG / Dashboard
```

原因：多端协同只有建立在“Task、Session、Memory、Checkpoint 均可恢复”的基础上才可靠。否则只是把一个不稳定的单机 Agent 远程化。DSH 本地可用性同理属于第一阶段，不能推迟到 GitHub 远程接入之后。

## 0.3 v2.1 更新：吸收 v1.1 的两阶段交付结论

v2.0 把 DSH 集成放在 Phase 5 / Milestone D（多端之后）。v1.1 的实施结论是：先完成本地 DSH 使用闭环，验收通过后才开发 GitHub remote task。v2.1 采纳该结论：

1. 交付分两个阶段。第一阶段完成单机 DSH 使用闭环：在本机 DSH 发起任务，查看任务、Plan、执行输出和 Review，按风险策略本地审批，取消正在执行的任务，并通过独立验证获得成功或失败结果；不需要 GitHub 账号、Control Repo 或 Runner。第二阶段只增加 GitHub 控制平面、Self-hosted Runner、多端派发、远程状态/审批/取消与数据上传策略，并复用已验证的本地执行流程。
2. DSH 本地集成从 Phase 5 移入第一阶段：Phase 3 完成后、Phase 4 开始前实施；DSH 本地 Task/Plan/Execution/Review 视图随第一阶段一起验收（第 30 节）。
3. 当前已有本地 Codely 执行原型，尚不等于第一阶段完成。已完成项、代码位置、历史验证结果和下一项待办以[实施 checklist 与 Codely 交接](MGSD_Implementation_Checklist.zh.md)为准；本地使用方式见[本地 Codely 使用说明](user/guide/codely-local.zh.md)。
4. 新增开发期 Codex 模型选型建议（第 18.4 节），并把 MVP 完成定义拆成两阶段验收清单（第 36 节）。
5. 当前交付项未通过验收，不进入依赖它的交付项；第一阶段未通过第 36.1 节验收，不开始第二阶段。Phase 编号是能力索引，实际开发顺序以第 38/45 节为准，不再按编号递增实施。

V2 的架构本身不变：Task/Session 分离、SQLite 运行态、Memory Proposal、Lease/Fencing、Stored ≠ Retrieved ≠ Injected 等原则全部保留；本次变更的只是交付顺序、DSH 的归属阶段和验收口径。

---

# 1. 最终架构结论

## 1.1 一句话架构

> **Codely 是主 Agent Loop；Codex 是按需专家；DSH 是确定性 Orchestrator/Harness；Git 保存长期工程事实；SQLite 保存本地运行态；GitHub 负责多端任务分发；Git worktree 提供任务级代码隔离。**

---

# 2. 总体架构

```text
                              USER
                               │
                               ▼
                     ┌──────────────────┐
                     │      Codely      │
                     │ Primary Agent    │
                     │ Loop / Executor  │
                     └────────┬─────────┘
                              │
                      local harness CLI
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     DSH / Harness Core                      │
│                                                             │
│  Orchestrator                                               │
│  Durable Task FSM                                           │
│  Session / Event Store                                      │
│  Checkpoint / Recovery                                      │
│  Context / Memory Retrieval                                 │
│  Skills / Tool Registry                                     │
│  Worktree / Git                                             │
│  Worker / Lease                                             │
│  Audit / Security                                           │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
          Codex Adapter                    SQLite
        Expert Plan/Review          runtime/session/lease
               │
               ▼
          Codex CLI

               Durable / Shared State
                        │
        ┌───────────────┴────────────────┐
        ▼                                ▼
   Project Git Repo                GitHub Control Repo
 memory/tasks/plans/               dispatch/runner/audit
 decisions/handoffs
```

多端：

```text
                        Private GitHub
                       Control Plane
                            │
                  HTTPS / Actions / Git
                 ┌──────────┴──────────┐
                 ▼                     ▼
              HOME-PC               OFFICE-PC
                │                     │
          Local Harness         Local Harness
          local SQLite          local SQLite
                │                     │
             Codely                Codely
             Codex                 Codex
                │                     │
            Worktree              Worktree
```

---

# 3. 六大子系统

V2 将 Harness 明确拆成六个子系统。

## 3.1 Orchestrator

负责：

- Task 生命周期驱动。
- Policy/Gate。
- 调用 AgentAdapter。
- Checkpoint 时机。
- Retry/Resume。
- Event 产生。
- 审计。

不负责：

- 自己做 LLM 推理。
- 自己实现 Codely/Codex Agent Loop。

---

## 3.2 Durable Task

负责：

- Task Store。
- FSM。
- Operation Idempotency。
- Checkpoint。
- Lease / Fencing Token。
- Resume。
- Cancellation。

目标：

```text
进程退出
电脑重启
网络断开
GitHub Runner 中断
Codely 崩溃
```

都不应导致 Task 状态不可恢复。

---

## 3.3 Context / Memory

负责：

```text
Persistent Memory
      ↓
Memory Search
      ↓
Relevance Filter
      ↓
Working Memory
      ↓
Context Bundle
      ↓
Agent Prompt
```

严格遵守：

> **Stored ≠ Retrieved ≠ Injected**

Memory 只提供事实和参考，不能提升权限。

---

## 3.4 Skills / Tools

负责：

- Skill Discovery。
- Skill Metadata。
- Progressive Skill Loading。
- Tool Registry。
- Tool Search。
- Deferred Tool Loading。
- Capability Detection。

第一版只实现 Skills Manifest + 基础 Tool Registry；Tool Search/Deferred MCP 放 Phase 5。

---

## 3.5 Agent Adapters

统一封装：

- Codely。
- Codex。
- 后续可能的 Claude Code / OpenCode / Gemini CLI。

Harness 只依赖 `AgentAdapter`，不依赖具体 CLI。

---

## 3.6 Worker Coordination

负责：

- Node Registry。
- Worker heartbeat。
- Task Lease。
- Fencing Token。
- GitHub task dispatch。
- Handoff。
- Offline recovery。

GitHub 只负责分发和持久化控制元数据；真正运行态仍在节点 SQLite。

---

# 4. 核心不可变规则（Invariants）

以下规则必须通过代码和测试保证，而不是只写在 Prompt 中。

## 4.1 Agent Loop 规则

```text
Codely = Primary Agent Loop
Codex  = Expert / Planner / Reviewer / Escalation
DSH    = Deterministic Harness
```

禁止：

```text
DSH LLM Loop
   ↓
Codely Loop
   ↓
Subagent Loop
```

---

## 4.2 状态事实优先级

冲突时优先级：

```text
Code / Tests / Git state
        >
Approved Architecture / Policy
        >
Accepted Memory / ADR
        >
Task Plan / Checkpoint
        >
Session Summary
        >
Agent 临时推断
```

Agent 输出不是事实来源。

---

## 4.3 Memory 权限规则

Memory：

- 可以告诉 Agent “项目过去如何设计”。
- 不可以告诉 Agent “现在允许修改哪些文件”。
- 不可以覆盖 Approval / Security Policy。

即：

```text
Project Policy / Execution Envelope
        >
Retrieved Memory
```

---

## 4.4 Worktree 规则

远程或自动执行任务必须：

```text
Dedicated Branch
+
Dedicated Worktree
```

创建失败：

```text
Task → FAILED
```

禁止 fallback 到用户主工作目录。

---

## 4.5 Session 压缩规则

Compaction：

```text
原始 Events 不删除
        ↓
生成 Summary / Projection
        ↓
下一轮只注入必要 Projection
```

永远不能把 Summary 当作唯一审计记录。

---

# 5. Git / SQLite / GitHub 的职责边界

## 5.1 Git：长期共享知识与工程结果

建议 Git 保存：

```text
.agent/memory/
.agent/tasks/selected/
.agent/plans/
.agent/reports/
.agent/handoffs/
.agent/checkpoints/selected/
AGENTS.md
CODELY.md
.agents/skills/
```

适合 Git 的内容：

- 已确认架构。
- ADR。
- Project Memory。
- Confirmed Findings。
- Approved Plan。
- Final Result。
- Handoff。
- 人工选定的恢复 Checkpoint。

---

## 5.2 SQLite：本地实时状态

默认数据库：

```text
.agent/runtime/agent.db
```

加入 `.gitignore`。

保存：

- Task runtime state。
- Session metadata。
- Session events。
- Tool calls。
- Agent events。
- Runtime checkpoints。
- Worker lease。
- Fencing token。
- Operation idempotency keys。
- 本地 Memory index / FTS5。

---

## 5.3 GitHub：多端 Control Plane

GitHub 保存：

- Remote task request。
- target node。
- workflow run。
- runner routing。
- approval intent。
- state summary。
- 非敏感 artifacts（可选）。

GitHub **不作为**：

- Session DB。
- Memory DB。
- 实时 lease DB 的唯一来源。
- 公司源码同步替代品。

---

# 6. Repository V2 目录

Project Repo：

```text
ProjectRoot/
├── AGENTS.md
├── CODELY.md
│
├── .agent/
│   ├── memory/
│   │   ├── PROJECT.md
│   │   ├── ARCHITECTURE.md
│   │   ├── CONVENTIONS.md
│   │   ├── CURRENT.md
│   │   ├── DECISIONS.md
│   │   ├── FINDINGS.md
│   │   └── proposals/
│   │
│   ├── tasks/
│   │   ├── active/
│   │   └── archive/
│   │
│   ├── plans/
│   ├── reports/
│   ├── handoffs/
│   ├── sessions/
│   │   └── exported/
│   ├── checkpoints/
│   │   └── selected/
│   ├── policies/
│   │   ├── security.json
│   │   ├── routing.json
│   │   └── memory.json
│   ├── tools/
│   │   └── registry.json
│   └── runtime/              # ignored
│       ├── agent.db
│       └── tmp/
│
├── .agents/
│   └── skills/
│       ├── unity/
│       │   └── SKILL.md
│       ├── android/
│       │   └── SKILL.md
│       └── perfetto/
│           └── SKILL.md
│
├── tools/
│   └── agent-harness/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── orchestrator/
│       │   ├── agents/
│       │   ├── memory/
│       │   ├── context/
│       │   ├── sessions/
│       │   ├── tasks/
│       │   ├── skills/
│       │   ├── tools/
│       │   ├── workers/
│       │   ├── git/
│       │   ├── github/
│       │   ├── security/
│       │   ├── storage/
│       │   ├── cli/
│       │   └── dsh/
│       └── tests/
│
├── Assets/
├── Packages/
└── ProjectSettings/
```

Control Repo：

```text
mgsd-agent-control/
├── .github/workflows/
├── tasks/
├── nodes/
├── schemas/
├── scripts/
└── README.md
```

---

# 7. AGENTS.md / CODELY.md / Memory / Skill 的边界

## 7.1 AGENTS.md

只放稳定入口规则，例如：

```text
Codex role = planner / reviewer / escalation.
Read .agent/memory/ARCHITECTURE.md when architecture context is required.
Read only task-relevant memory; do not preload all memory.
Planning/review is read-only unless an execution task explicitly says otherwise.
```

不要把整个项目知识复制进去。

---

## 7.2 CODELY.md

只放 Codely 的稳定执行协议：

```text
Read task state first.
Use ContextBundle before broad exploration.
Honor ExecutionEnvelope.
Do not self-approve.
Do not expand scope.
Checkpoint before destructive/high-cost steps.
Finish with validation and handoff.
```

---

## 7.3 `.agent/memory`

放长期共享事实。

禁止直接写入未经验证的 Agent 推断。

---

## 7.4 `.agents/skills`

Skill 使用可移植目录形式：

```text
skill-name/
├── SKILL.md
├── scripts/
├── references/
└── assets/
```

Harness 启动时只扫描 metadata（name/description/path）。

完整 SKILL.md 仅在实际命中后加载。

这就是 Progressive Disclosure。

---

# 8. Core TypeScript Contracts

## 8.1 AgentAdapter

```ts
export interface AgentAdapter {
  readonly id: string;

  getCapabilities(): Promise<AgentCapabilities>;

  execute(
    request: AgentRequest,
    onEvent: (event: AgentEvent) => void
  ): Promise<AgentResult>;

  cancel(operationId: string): Promise<void>;
}
```

## 8.2 AgentRequest

```ts
export interface AgentRequest {
  operationId: string;
  taskId: string;
  workingDirectory: string;
  instructions: string;
  contextFiles: string[];
  allowedPaths: string[];
  timeoutMs: number;
  sessionId?: string; // Harness logical session id
}
```

注意：`sessionId` 是 Harness 逻辑 ID，不绑定 Codely/Codex 原生 session id。

---

## 8.3 Task / Session / Checkpoint

```ts
export interface Task {
  id: string;
  goal: string;
  state: TaskState;
  risk: TaskRisk;
  baseCommit: string;
  worktreePath?: string;
  activeSessionId?: string;
  activeCheckpointId?: string;
}

export interface Session {
  id: string;
  taskId: string;
  agentId: string;
  parentSessionId?: string;
  branchFromEventId?: string;
  status: "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
}

export interface Checkpoint {
  id: string;
  taskId: string;
  sessionId?: string;
  state: TaskState;
  baseCommit: string;
  headCommit?: string;
  workingTreeHash?: string;
  planPath?: string;
  remainingWork: string[];
  completedOperations: string[];
  createdAt: string;
}
```

Task、Session、Checkpoint 不允许合并成一个对象。

---

## 8.4 ContextBundle

```ts
export interface ContextBundle {
  taskId: string;
  goal: string;
  planPath?: string;
  checkpointPath?: string;
  memoryRefs: MemoryRef[];
  skillRefs: SkillRef[];
  sessionSummary?: string;
  baseCommit: string;
  remainingWork: string[];
}
```

ContextBundle 是“这次 Agent 真正需要看到什么”，而不是完整数据库 dump。

---

# 9. Task FSM V2

```text
CREATED
  ↓
QUEUED
  ↓
CLAIMED
  ↓
PREPARING
  ↓
PLANNING       [可跳过]
  ↓
PLAN_READY
  ↓
APPROVED
  ↓
EXECUTING
  ↓
EXECUTED
  ↓
REVIEWING      [可跳过]
  ↓
COMPLETED
```

异常：

```text
FAILED
INTERRUPTED
CANCEL_REQUESTED
CANCELLED
NEEDS_HUMAN
NEEDS_REPLAN
REVIEW_FAILED
```

Review：

```text
REVIEWING
 ├─ PASS → COMPLETED
 └─ FAIL → REVIEW_FAILED
              ↓
            FIXING
              ↓
           REVIEWING
```

默认：

```text
maxReviewCycles = 2
```

---

# 10. Session Event Log / Tree

## 10.1 目的

Session 不保存成一段不断膨胀的 Prompt，而是 append-only events。

典型 event：

```text
session.started
agent.message
agent.reasoning.summary
tool.requested
tool.completed
file.read
file.modified
command.started
command.completed
checkpoint.created
compaction.created
memory.proposed
session.completed
session.failed
```

SQLite 表建议：

```sql
CREATE TABLE sessions (...);
CREATE TABLE session_events (...);
CREATE TABLE checkpoints (...);
```

`session_events` 至少：

```text
id
session_id
parent_event_id
type
payload_json
created_at
```

`parent_event_id` 允许以后形成 Session Tree / branch。

---

## 10.2 Branch

如果从某个历史事件重新执行：

```text
Session A
  ├─ branch 1 → failed approach
  └─ branch 2 → current approach
```

旧 branch 不删除。

Context 只使用 active branch。

---

# 11. Compaction / Context Projection

## 11.1 触发条件

MVP 支持：

- 手工 compact。
- Session event 数达到阈值。
- ContextBuilder 估算超过预算。

## 11.2 产物

创建：

```text
CompactionRecord
```

至少包含：

```text
sessionId
fromEventId
toEventId
summary
filesRead
filesModified
decisions
openQuestions
remainingWork
createdAt
```

## 11.3 原则

```text
Session History = immutable evidence
Compaction      = derived projection
```

删除 Compaction 不应损坏原始 Session。

---

# 12. Memory Architecture

## 12.1 Memory 分类

```text
Project     项目基本事实
Architecture 架构与边界
Decision    已批准 ADR/决策
Convention  编码/命名/工程惯例
Finding     已验证的技术发现
Current     当前工作状态（短期）
```

---

## 12.2 Memory Proposal 流程

Agent 不允许直接把推断写入正式 Memory。

流程：

```text
Agent / Session
     ↓
MemoryProposal
     ↓
Schema Validation
     ↓
Evidence Validation
     ↓
Dedup / Conflict Check
     ↓
Policy / Optional Human Approval
     ↓
Merge Accepted Memory
     ↓
Update Index
```

Proposal 示例：

```json
{
  "id": "MP-20261008-001",
  "type": "finding",
  "statement": "EnvironmentManager 的旧 async callback 可能在 generation 已变化后回写 state",
  "evidence": [
    "Assets/.../EnvironmentManager.cs:210-247",
    "TASK-0127 session event evt-039"
  ],
  "confidence": 0.92,
  "taskId": "TASK-0127"
}
```

只有验证后才进入：

```text
.agent/memory/FINDINGS.md
```

---

# 13. Memory Retrieval：Stored ≠ Retrieved ≠ Injected

Memory Pipeline：

```text
.agent/memory
    ↓ stored
SQLite FTS5 / metadata index
    ↓ search
candidate memories
    ↓ relevance filter
working memory refs
    ↓ context budget / policy
Injected Context
```

第一版检索：

- SQLite FTS5。
- tags/domain。
- task keywords。
- path relevance。

暂不引入 Vector DB。

---

# 14. Context Builder V2

输入：

```text
Task
Checkpoint
Active Session Projection
Memory Retriever
Skill Registry
Git State
Repo Search
```

输出：

```text
ContextBundle
```

推荐生成：

```text
.agent/runtime/context/<task>/<operation>.json
```

以及用于人读：

```text
.agent/runtime/context/<task>/<operation>.md
```

Context 组成顺序：

```text
1. Current Task Goal
2. Security / Execution Policy
3. Approved Plan / Checkpoint
4. Relevant Project Memory
5. Relevant Code/Symbol Snippets
6. Relevant Session Projection
7. Loaded Skill Instructions
8. Remaining Work
```

禁止默认加入：

- 所有 AGENTS 内容的重复副本。
- 全部 Memory。
- 全部 Skills。
- 全部 Tools Schema。
- 完整历史 Session。

---

# 15. Skills Progressive Disclosure

Skill Registry 只索引：

```ts
interface SkillDescriptor {
  id: string;
  name: string;
  description: string;
  path: string;
  tags: string[];
  allowedTools?: string[];
}
```

Agent 初始只看到：

```text
name + description
```

命中后才加载：

```text
SKILL.md + references/scripts
```

例如：

```text
Task: Vulkan main-thread query

Initial:
- unity-rendering: Unity/URP rendering tasks
- android-gpu: Android GPU/Vulkan debugging
- perfetto: Perfetto trace analysis

Selected:
android-gpu + perfetto

Only then load full instructions.
```

---

# 16. Tool Registry / Deferred Tools

## 16.1 Phase 1/2

只做静态 Registry：

```json
{
  "tools": [
    {
      "id": "git.search",
      "provider": "local",
      "capability": ["search"],
      "risk": "read-only"
    }
  ]
}
```

## 16.2 Phase 5

增加：

```text
Tool Search
→ select relevant tool descriptors
→ Deferred Tool Schema Loading
→ invoke
```

避免把几十/几百个工具 schema 全注入 Agent 上下文。

---

# 17. Extension Lifecycle

Harness 应预留 deterministic lifecycle hooks：

```text
onTaskCreated
beforeContextBuild
afterContextBuild
beforeAgentRun
afterAgentRun
beforeCheckpoint
afterCheckpoint
beforeCompaction
afterCompaction
beforeMemoryMerge
afterMemoryMerge
beforeReview
afterReview
onTaskCompleted
onTaskFailed
```

第一版实现 EventBus + hook registration，不需要做复杂插件市场。

DSH Adapter 后续直接消费这些生命周期事件。

---

# 18. Agent Routing / Economy Policy

总原则：

```text
LOCAL > CODELY > CODEX
```

## 18.1 Local

优先用于：

```text
rg
git
AST/index
log filter
schema validation
state transition
memory search
context assembly
```

## 18.2 Codely

用于：

- Main agent loop。
- 一般分析。
- 编码。
- 测试。
- 修复。
- 小任务 plan。

## 18.3 Codex

仅用于：

- Architecture change。
- HIGH_RISK Plan。
- 跨 Unity/Android/Native/Rendering 的复杂分析。
- Codely escalation。
- 独立 Review。

TRIVIAL：Codex 0 次。

STANDARD：默认 0 次，必要时 Plan 或 Review 1 次。

HIGH_RISK：通常 Plan 1 次 + Review 1 次。

## 18.4 开发期模型选型（实现 MGSD 时）

本节区分开发 MGSD 时使用的 Codex 模型与 MGSD 运行时使用的 Codely 执行模型。选型建议不是自动路由规则，不改变人工审批、独立验证或各组件职责。

Codely 运行时设置：主 Agent 使用稳定的主模型；Flash 用于 JSON、压缩和内部辅助判断；后续 repo-scout/test-runner 等 subagent 使用较轻量模型，不要把所有子任务都交给最贵模型。具体模型名根据当前 Codely 账户可用模型决定，不在仓库硬编码商业模型版本。

针对 V2 各实施 Milestone（第 38 节），建议默认使用 **GPT-6.1 Sol，推理强度 high** 完成实现与测试；不需要全程使用 GPT-6 Astra。明确的小改动或文档整理可使用 medium。以下是结合本项目风险与工作范围的工程建议，不是两种模型在 MGSD 上的实测性能结论。

| 工作 | 建议模型 | 使用方式 |
|---|---|---|
| Phase 0/1：SQLite、schema、Memory Proposal/FTS5 检索、Skill registry、ContextBundle 的实现与测试 | GPT-6.1 Sol / high | 按已定义语义实现，补齐聚焦测试和回归验证。 |
| Phase 2/3：FSM、worktree、Session/Event、Checkpoint、Idempotency、恢复的实现 | GPT-6.1 Sol / high | 分小块实施，验证主工作区不变、失败不回退及资源限制。 |
| DSH 集成与本地 E2E：Bundle、本地视图、入口、取消与清理 | GPT-6.1 Sol / high | 在明确权限、输入输出及验收条件后实现。 |
| 文档、配置整理及明确的小范围修复 | GPT-6.1 Sol / medium | 保留原有行为，执行对应检查。 |
| 跨进程归属、取消/恢复竞态、审批绕过、凭据与远程权限设计 | GPT-6 Astra | 用于有界的架构分析或独立审查；不默认承担所有实现。 |

出现以下情况时考虑升级到 Astra：设计存在多个相互冲突的约束；涉及难以恢复的数据或文件操作；跨进程竞态难以复现；补齐上下文与复现证据后仍无法确定根因。不要仅因第一次测试失败就切换模型；先排查环境、输入和失败证据。

建议工作顺序：Sol 完成小范围实现与验证 → 按风险决定是否由 Astra 集中审查 → 将具体问题交回 Sol 修复 → 重跑受影响检查。审查输入应包含批准的 Plan、diff、实际测试结果及必要上下文；模型结论不能替代人工审批或独立检查。

该分工仅指导开发者在 Codex 中选型，不会自动调用专家或切换模型。MGSD 运行时仍由 Codely 承担主要 Agent Loop，DSH 保持确定性 Harness；未来 Codex 专家调用须服从风险策略与预算，并使用部署配置，而非在 Core 中硬编码模型名。

建议依据：截至 2026-10-09，[OpenAI 模型选择指南](https://developers.openai.com/api/docs/guides/model-selection)将 Sol 定位为兼顾复杂任务、时间与成本的选择，将 Astra 用于要求更高的分析；[GPT-6.1 Sol 官方说明](https://developers.openai.com/api/docs/models/gpt-6.1-sol)建议通过自身任务比较两者。可用模型、推理设置及额度以当前账户为准；本计划不承诺账户可用性、固定速度或固定成本。

---

# 19. Worktree / Execution Envelope

ExecutionEnvelope：

```json
{
  "taskId": "TASK-20261008-001",
  "operationId": "op-execute-001",
  "state": "approved",
  "baseCommit": "...",
  "worktreePath": "D:/AgentWorkspaces/HMI8295/TASK-20261008-001",
  "planPath": ".agent/plans/TASK-20261008-001.md",
  "allowedFiles": [],
  "forbiddenChanges": [],
  "acceptanceCriteria": [],
  "checkpointId": "CP-...",
  "maxReviewCycles": 2
}
```

Codely 必须以 Envelope 为权限边界。

---

# 20. Durable Execution：Checkpoint / Idempotency

## 20.1 Checkpoint 时机

至少：

```text
after PREPARING
after PLAN_READY
after APPROVED
before EXECUTING destructive step
after test/build
after EXECUTED
after REVIEW
```

## 20.2 Operation ID

每个外部副作用操作必须有：

```text
operationId
```

例如：

```text
op-worktree-create-001
op-plan-codex-001
op-execute-codely-001
op-review-codex-001
```

SQLite 保存 completed operation IDs。

Resume 时：

```text
if operation already completed:
    reuse stored result
    do not execute again
```

---

# 21. Lease / Fencing Token

多端不能只靠“谁先看到 Task”。

Lease：

```ts
interface TaskLease {
  taskId: string;
  ownerNodeId: string;
  leaseId: string;
  fencingToken: number;
  expiresAt: string;
}
```

规则：

1. Claim Task 时创建 lease。
2. 每次续租 fencingToken 不倒退。
3. 所有写状态操作必须携带当前 fencingToken。
4. stale worker 的旧 token 被拒绝。
5. Lease 到期 Task → INTERRUPTED，不自动双机并行执行。
6. 用户/Controller 选择 Resume / Reassign。

---

# 22. 多端 GitHub 架构 V2

GitHub 仍采用：

```text
Private Control Repo
GitHub Actions
Self-hosted Runner
```

但 V2 增加：

- Worker local SQLite。
- Lease。
- Checkpoint。
- Handoff。
- Idempotent resume。

多端流程：

```text
HOME creates Task
      ↓
GitHub dispatch
      ↓
OFFICE runner claims
      ↓
Local Lease
      ↓
create worktree
      ↓
restore ContextBundle/Checkpoint if exists
      ↓
execute
      ↓
checkpoint
      ↓
result summary to GitHub
```

---

# 23. Security V2

## 23.1 GitHub 不传 arbitrary command

Task 只传：

```text
taskId
repoAlias
goal
targetNode
policy
baseRef
```

## 23.2 凭证留本机

不得上传：

```text
Codex auth
Codely credential
Git private key
Unity license
Android key
Runner registration token
```

## 23.3 Restricted Mode

公司任务默认建议：

GitHub 只保存：

```text
Task ID
Target Node
State
Timestamp
Result Code
```

Plan、Memory、Diff、Session Event 均留公司电脑和公司 Git Repo。

---

# 24. Phase 0 — Harness Foundation

> 目标：建立可测试、可迁移的底座。不要接 Agent，不要接 GitHub。

## 24.1 检查环境

```powershell
git --version
node --version
npm --version
codely --version
codex --version
```

建议 Node 20+；具体版本以当前工具要求为准。

---

## 24.2 创建 Harness 工程

```powershell
cd <PROJECT_ROOT>
mkdir tools\agent-harness
cd tools\agent-harness
npm init -y
npm install better-sqlite3 zod
npm install -D typescript tsx vitest @types/node @types/better-sqlite3
npx tsc --init
```

`package.json`：

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "agent": "tsx src/cli/main.ts"
  }
}
```

---

## 24.3 创建模块

```text
src/storage/
src/tasks/
src/sessions/
src/orchestrator/
src/security/
src/cli/
tests/
```

先实现：

```text
ConfigLoader
Logger
Database
MigrationRunner
TaskSchema
EventSchema
```

---

## 24.4 SQLite migrations

创建：

```text
src/storage/migrations/001_init.sql
```

表：

```text
tasks
sessions
session_events
checkpoints
operations
leases
memory_index
```

运行：

```powershell
npm run agent -- db migrate
npm run agent -- db status
```

---

## 24.5 `.gitignore`

```gitignore
.agent/runtime/
.agent/tmp/
*.db-shm
*.db-wal
```

---

## 24.6 Phase 0 验收

```powershell
npm run build
npm test
npm run agent -- db status
```

必须满足：

```text
[ ] DB 可创建
[ ] migration 可重复运行
[ ] schema validation 有测试
[ ] runtime DB 不会被 git add
```

失败：删除 `.agent/runtime/agent.db` 后重新 migrate；不得影响工程源码。

---

# 25. Phase 1 — Shared Memory + Progressive Context

> 这是 V2 的第一核心能力，优先级高于 GitHub 多端。

## 25.1 创建目录

```powershell
mkdir .agent\memory
mkdir .agent\memory\proposals
mkdir .agent\policies
mkdir .agents\skills
```

创建：

```text
.agent/memory/PROJECT.md
.agent/memory/ARCHITECTURE.md
.agent/memory/CONVENTIONS.md
.agent/memory/CURRENT.md
.agent/memory/DECISIONS.md
.agent/memory/FINDINGS.md
```

---

## 25.2 初始化 AGENTS.md / CODELY.md

只写稳定入口和指针，不复制知识正文。

验收：两个文件均少于约 200 行，并引用 `.agent/memory` / `.agents/skills`。

---

## 25.3 Memory Schema

实现：

```text
src/memory/types.ts
src/memory/proposal.ts
src/memory/validator.ts
src/memory/store.ts
src/memory/index.ts
src/memory/retriever.ts
```

Memory Entry 至少：

```text
id
type
title
content
tags
source/evidence
status
createdAt
updatedAt
```

---

## 25.4 FTS5 Index

从 accepted memory 构建本地 index。

CLI：

```powershell
npm run agent -- memory index
npm run agent -- memory search "Addressables lifecycle"
```

---

## 25.5 Proposal 流程

CLI：

```powershell
npm run agent -- memory propose proposal.json
npm run agent -- memory validate MP-xxx
npm run agent -- memory accept MP-xxx
```

MVP 的 `accept` 可以由人工执行。

---

## 25.6 Skill Registry

扫描：

```text
.agents/skills/**/SKILL.md
```

只加载 frontmatter / name / description。

CLI：

```powershell
npm run agent -- skill list
npm run agent -- skill show perfetto
```

---

## 25.7 ContextBuilder V2

实现：

```text
src/context/context-builder.ts
src/context/budget.ts
src/context/relevance.ts
```

CLI：

```powershell
npm run agent -- context build --task TASK-TEST
```

输出必须展示：

```text
selected memory refs
selected skills
selected files
estimated size
excluded candidates
```

---

## 25.8 Phase 1 验收

```text
[ ] Memory 可 propose/validate/accept
[ ] FTS5 可检索
[ ] 未命中的 Memory 不注入
[ ] Skill 完整正文不在启动时加载
[ ] ContextBuilder 不读取整个 memory 目录
[ ] Policy 优先于 Memory
```

---

# 26. Phase 2 — Agent Adapter + Task FSM + Worktree

## 26.1 AgentAdapter

创建：

```text
src/agents/agent-adapter.ts
src/agents/codely-adapter.ts
src/agents/codex-adapter.ts
src/agents/capabilities.ts
```

CodelyAdapter 是主执行后端。

CodexAdapter 只允许：

```text
plan
review
escalation
```

---

## 26.2 ProcessRunner

要求：

- executable + args array。
- cwd。
- UTF-8。
- stdout/stderr streaming。
- timeout。
- cancellation。
- operationId。
- Windows paths with spaces。

测试时全部 mock，不嵌套启动真实 Codex/Codely。

---

## 26.3 Task FSM

创建：

```text
src/tasks/types.ts
src/tasks/task-store.ts
src/tasks/state-machine.ts
src/tasks/policy.ts
```

CLI：

```powershell
npm run agent -- task create "smoke test"
npm run agent -- task status TASK-...
```

所有 transition 只能通过 StateMachine。

---

## 26.4 Worktree Service

创建：

```text
src/git/worktree-service.ts
```

```powershell
git fetch --all --prune
git worktree add <workspace> -b agent/<task>-<node> <baseRef>
```

失败不得 fallback。

---

## 26.5 Risk Router

规则优先，不使用模型分类 MVP。

示例：

```text
Native/JNI/Vulkan/Addressables core → HIGH_RISK
单文件普通逻辑 → STANDARD
注释/文案 → TRIVIAL
```

允许 Codely 明确请求 escalation。

---

## 26.6 本地 Plan/Execute/Review

流程：

```text
Task
→ ContextBundle
→ [HIGH_RISK] Codex Plan
→ Human Approve
→ Codely Execute
→ Local Validation
→ [risk policy] Codex Review
```

---

## 26.7 Phase 2 验收

```text
[ ] TRIVIAL 不调用 Codex
[ ] HIGH_RISK 会进入 PLAN_READY
[ ] Planner 不修改源码
[ ] Codely 只在 worktree 执行
[ ] Review 最多两轮
[ ] AllowedPaths 被 Harness 验证
```

---

# 27. Phase 3 — Session / Checkpoint / Recovery

> 完成后，单机系统才算“Durable”。

## 27.1 Session Event Store

实现：

```text
src/sessions/session-store.ts
src/sessions/event-store.ts
src/sessions/projection.ts
```

每个 AgentAdapter event 都落 SQLite。

CLI：

```powershell
npm run agent -- session list TASK-xxx
npm run agent -- session show SESSION-xxx
```

---

## 27.2 Session Tree

支持：

```text
new branch from event
active branch selection
```

MVP 不需要 TUI，CLI 即可。

---

## 27.3 Compaction

创建：

```text
src/sessions/compaction.ts
```

第一版允许 deterministic summary template + Codely 辅助总结。

Codex 不用于常规 compaction。

CLI：

```powershell
npm run agent -- session compact SESSION-xxx
```

验证 compaction 后原事件数量不减少。

---

## 27.4 Checkpoint

创建：

```text
src/tasks/checkpoint-store.ts
src/tasks/recovery.ts
```

CLI：

```powershell
npm run agent -- checkpoint create TASK-xxx
npm run agent -- checkpoint list TASK-xxx
npm run agent -- task resume TASK-xxx
```

---

## 27.5 Idempotency

在 `operations` 表记录：

```text
operation_id
task_id
type
status
result_ref
```

重复调用同 operation id 必须返回已有结果或明确拒绝。

---

## 27.6 Handoff

执行完成或切换 Agent/机器前生成：

```text
.agent/handoffs/TASK-xxx.md
```

固定包含：

```text
Goal
Completed Work
Changed Files
Tests
Decisions
Findings
Remaining Work
Current Checkpoint
Resume Instructions
```

---

## 27.7 Memory Extraction

Session 完成后只生成 Proposal：

```text
Session
→ candidate finding/decision
→ MemoryProposal
```

禁止直接 merge。

---

## 27.8 Phase 3 故障演练

必须测试：

1. Codely 执行中 kill process。
2. 重启 CLI。
3. `task resume`。
4. 已完成 operation 不重复。
5. worktree 保留。
6. Session events 可审计。

验收：任务能从最近 checkpoint 恢复。

---

# 28. Phase 4 — Multi-device / GitHub Control Plane

> 属于第二阶段。只有第一阶段（Phase 0~3 + DSH 本地集成）通过第 36.1 节验收后才开始。

## 28.1 创建 Private Control Repo

```text
mgsd-agent-control
Visibility: Private
```

本地：

```powershell
gh repo clone <account>/mgsd-agent-control
```

目录：

```text
.github/workflows/
tasks/
nodes/
schemas/
scripts/
```

---

## 28.2 注册 Self-hosted Runners

Office：

```text
name: office-pc
labels: office-pc,unity,android,hmi8295
```

Home：

```text
name: home-pc
labels: home-pc,unity,mgsd
```

只使用 GitHub 页面当前生成的安装命令；Registration Token 不提交。

---

## 28.3 Worker Local Config

```text
C:\AgentHarness\config\node.json
```

例：

```json
{
  "nodeId": "office-pc",
  "workspaceRoot": "D:/AgentWorkspaces",
  "repos": {
    "hmi8295": {
      "path": "D:/Projects/HMI8295",
      "defaultBaseRef": "origin/main"
    }
  }
}
```

---

## 28.4 Worker Runtime

实现：

```text
src/workers/node-registry.ts
src/workers/worker.ts
src/workers/lease.ts
src/workers/handoff.ts
src/github/control-client.ts
```

---

## 28.5 Lease

Job 收到后：

```text
claim task
→ acquire lease
→ create fencing token
→ PREPARING
```

续租失败：

```text
safe checkpoint
→ INTERRUPTED
```

旧 fencing token 禁止继续写 Task 状态。

---

## 28.6 GitHub Workflows

最少：

```text
dispatch-task.yml
approve-task.yml
cancel-task.yml
```

可按需要拆 plan/execute。

Workflow 只调用：

```text
agent-node.ps1 --task TASK-xxx
```

不要把工作流 YAML 变成业务状态机。

---

## 28.7 agent CLI

```powershell
agent nodes
agent send --target office-pc --repo hmi8295 "..."
agent status TASK-xxx
agent approve TASK-xxx
agent cancel TASK-xxx
agent resume TASK-xxx
agent reassign TASK-xxx --target home-pc
```

---

## 28.8 Offline Recovery

测试：

1. Home 派任务。
2. Office 执行中断网。
3. lease 过期。
4. Task 进入 INTERRUPTED。
5. Office 恢复网络。
6. 用户执行 resume。
7. 从 checkpoint 恢复。

禁止自动在 Home 同时启动同一个写任务。

---

## 28.9 Git Sync / Handoff

跨机器继续任务必须通过：

```text
Git branch / commit (or approved patch)
+
Checkpoint/Handoff
+
Task metadata
```

不能依赖“另一个机器上的聊天 Session”。

---

## 28.10 Phase 4 验收

```text
[ ] Home 能 dispatch Office
[ ] Office 离线时任务不会丢
[ ] Worktree 独立
[ ] Lease 防止双执行
[ ] 断网可恢复
[ ] Handoff 足以在另一节点继续
[ ] Restricted Mode 不上传公司源码/Session
```

---

# 29. Phase 5 — Advanced Harness Capabilities

这些都不是 MVP 前置。

## 29.1 Tool Search / Deferred MCP

实现：

```text
Tool catalog metadata
→ keyword/capability search
→ select tools
→ load full schemas
```

---

## 29.2 Hybrid Retrieval

FTS5 稳定后再加：

```text
keyword + metadata + optional embedding
```

不要先上 Vector DB。

---

## 29.3 Capability Routing

根据：

```text
Task Risk
Required Repo
Device capability
Installed tools
Online status
```

选择 node / adapter。

---

## 29.4 Task DAG / Parallel Work

未来：

```text
TASK-200
├── A → office-pc
├── B → home-pc
└── C → gpu-node
```

父 Task 聚合结果。

先确保单任务 Durable 再实现。

---

## 29.5 Budget Manager

记录：

```text
Codex calls/task
Codely sessions/task
context bytes
tool calls
review cycles
```

Codex budget 超阈值：

```text
NEEDS_HUMAN
```

而不是自动无限升级。

---

## 29.6 Dashboard / DSH UI

基础本地视图（Task/Plan/Execution/Review/Node state）属于第一阶段 DSH 集成（第 30 节）；本节是 MVP 后的扩展 Dashboard。展示：

- Tasks。
- Sessions。
- Checkpoints。
- Memory Proposals。
- Workers/Lease。
- Context selection。
- Codex usage counters。

DSH UI 不复制 Core FSM。

---

# 30. DSH Integration

DSH 本地集成属于第一阶段：Phase 3（Session/Checkpoint/Recovery）完成后、Phase 4（GitHub 多端）开始前实施；DSH 适配和本地界面不能推迟到 GitHub 远程接入之后。第二阶段的远程状态视图复用同一 DSH 层，不另做一套。

职责：

```text
UI
Service composition
Event visualization
Local plugin lifecycle
```

不负责：

```text
LLM provider
Second agent loop
Task truth
Session truth
```

所有 DSH-specific code：

```text
tools/agent-harness/src/dsh/
```

Core 不 import DSH/Cordis。

## 30.1 DSH Bundle 形态

创建：

```text
tools/agent-harness/dsh-bundle/
├── package.json
├── cordis.patch.yml
└── dist/index.js
```

`package.json` 形式：

```json
{
  "name": "dsh-mgsd-agent-harness",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "files": [
    "dist",
    "cordis.patch.yml"
  ],
  "dsh": {
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

安装到 profile：

```powershell
dsh plugin --profile mgsd add ./tools/agent-harness/dsh-bundle
```

验证：

```powershell
dsh --profile mgsd --dump-config
```

使用当前安装的 DSH 版本及其官方 profile/bundle/plugin API，不要假设旧版 API。DSH plugin 只调用 Core Harness Service，不复制 FSM。

## 30.2 DSH 第一版功能

随第一阶段一起验收：

```text
Task status view
Recent tasks
Plan status
Execution status
Review result
Node local state
```

并支持在本机 DSH 发起任务、查看执行输出、本地审批和取消正在执行的任务。

暂时不做：

- DSH 自己调用模型。
- DSH 第二套 Agent Loop。
- 自动多 Agent 编排。

---

# 31. DSH 生命周期映射

Harness Event：

```text
task.created
context.built
agent.started
agent.event
checkpoint.created
memory.proposed
review.completed
task.completed
```

DSH 订阅后用于：

- UI。
- audit。
- notification。
- plugin hook。

而不是反向重写 Core 状态。

---

# 32. 本地开发完整流程

```text
User
 ↓
Task Create
 ↓
Risk Policy
 ↓
Context Builder
 ↓
TRIVIAL/STANDARD → Codely
HIGH_RISK → Codex Plan → Approval → Codely
 ↓
Session Events continuously stored
 ↓
Checkpoint
 ↓
Tests
 ↓
Execution Report
 ↓
Risk Policy
 ↓
Codex Review if required
 ↓
Memory Proposals
 ↓
Human/Policy Validation
 ↓
Merge Memory
 ↓
Task Completed + Handoff
```

---

# 33. 多端开发完整流程

```text
HOME
agent send office-pc
 ↓
GitHub Control Repo
 ↓
Office Runner
 ↓
Acquire Lease
 ↓
Restore/Create Worktree
 ↓
Restore Task + Checkpoint + ContextBundle
 ↓
Codely/Codex local execution
 ↓
Local SQLite Session Events
 ↓
Checkpoint
 ↓
Git branch / report / handoff
 ↓
GitHub status summary
 ↓
HOME sees DONE / PLAN_READY / NEEDS_HUMAN
```

---

# 34. 测试矩阵

## 34.1 Unit

```text
FSM transitions
Schema validation
Memory proposal validation
Memory conflict detection
FTS retrieval
Context budget
Skill discovery
Operation idempotency
Lease fencing
Checkpoint serialization
AgentAdapter command generation
```

## 34.2 Integration

```text
Task → ContextBundle
Task → Worktree
Plan → Approval
Execution → Checkpoint
Review → Fix
Session → Compaction
Session → Memory Proposal
```

## 34.3 Failure Injection

```text
kill Codely
kill Harness
network disconnect
runner restart
SQLite reopen
Codex timeout
Git conflict
stale lease
repeated operationId
```

## 34.4 Security

```text
attempt scope expansion
attempt primary-worktree write
attempt stale fencing write
attempt unapproved execution
attempt credential path collection
```

---

# 35. V1 → V2 Migration Checklist

旧计划已经开始实现时，按以下顺序迁移。

```text
[ ] 保留现有 Task/FSM 代码，不重写
[ ] 将 runtime state 从 Git JSON 迁到 SQLite
[ ] 将长期知识整理到 .agent/memory
[ ] AGENTS.md / CODELY.md 缩成稳定入口
[ ] 新增 .agents/skills registry
[ ] Task 与 Session 拆开
[ ] 新增 append-only session_events
[ ] 新增 ContextBundle
[ ] 新增 MemoryProposal workflow
[ ] 新增 Checkpoint + operations/idempotency
[ ] 多端前新增 Lease/Fencing
[ ] GitHub workflow 改为调用 Worker，而不是承载业务 FSM
```

---

# 36. 两阶段验收定义（V2）

当前已有本地 Codely 执行原型和 L1/L2 验收，尚不等于第一阶段完成；原型冒烟测试只覆盖部分条件，不能代替本节完整验收。已通过项与证据以[实施 checklist](MGSD_Implementation_Checklist.zh.md)为准。

## 36.1 第一阶段：本地 DSH MVP

Phase 0~3 + DSH 本地集成完成后必须全部满足；它们是第二阶段启动的前置条件：

```text
[ ] Codely 是唯一 Primary Agent Loop；DSH 不直接调用 LLM
[ ] Codex 仅按风险/升级调用；Review 最多两轮
[ ] 本机通过受支持的 DSH profile 启动
[ ] 在 DSH 发起 Codely 任务并查看状态、输出和取消结果
[ ] 独立验证命令决定成功/失败，不只依赖 Codely 退出码或成功文本
[ ] Task 与 Session 独立
[ ] SQLite 保存 runtime/session/event；Git 保存 approved durable knowledge
[ ] Memory Proposal 不能直接变正式事实
[ ] Stored != Retrieved != Injected 已通过测试体现
[ ] Skills 按需加载
[ ] ContextBundle 可重建
[ ] Session 原始 event 不因 compaction 删除
[ ] Task 有 checkpoint；外部副作用有 operationId
[ ] Resume 不重复已完成 operation；kill/restart 后可恢复
[ ] 工程任务创建独立 worktree；失败不回退主工作目录
[ ] Plan 与执行范围明确，人工审批不可由执行器绕过
[ ] HIGH_RISK 可按预算调用 Codex Plan/Review
[ ] 执行、失败、超时、取消和清理有回归覆盖
[ ] 本地任务状态和审计持久保存，重启后行为明确
[ ] DSH 本地 Task/Plan/Execution/Review 视图可用
[ ] 本地端到端验收、录制会话场景及使用文档完成
[ ] 凭证留在本机；不依赖 GitHub 完成任务
```

## 36.2 第二阶段：GitHub 远程 MVP

复用第一阶段结果，Phase 4 完成后必须全部满足：

```text
[ ] GitHub Private Control Repo 建立
[ ] home-pc runner 在线
[ ] office-pc runner 在线
[ ] Home 可以 dispatch 到 Office
[ ] Office 根据 repoAlias 找到本地工程
[ ] Remote Task 使用 worktree；主工作目录不被远程任务修改
[ ] Multi-device 使用 lease + fencing token，无双写
[ ] 断网/进程崩溃可从 checkpoint 恢复
[ ] Handoff 足以在另一节点继续任务
[ ] Plan 阶段不修改业务代码；Human Approval Gate 存在
[ ] Codely 能读取 Execution Envelope，只在 worktree 修改
[ ] Tests 可执行；HIGH_RISK 能执行 Codex Review
[ ] 凭证不上传 GitHub
[ ] Restricted Mode 不上传敏感工程数据
[ ] 远程状态接入第一阶段已有的 DSH 视图
```

---

# 37. 明确不做（MVP）

两个阶段的 MVP 均不包含以下能力。第一阶段额外排除 GitHub Control Repo、Runner、远程派发、跨节点审批/取消及数据上传；这些属于第二阶段，不是永久取消：

```text
DSH LLM Agent Loop
ChatGPT Web 私有接口逆向
自动 PR Merge
自动 Production Deploy
默认 Vector DB
复杂 DAG Scheduler
几十个 Subagent
全量 Tool Schema 注入
全量 Memory 注入
无限 Review/Fix
远程 arbitrary shell
```

---

# 38. 建议实施 Milestones

实施状态与下一项待办以[实施 checklist](MGSD_Implementation_Checklist.zh.md)为准；本节只给交付分组。Phase 编号是能力索引，不再按编号决定先后。

## Milestone A — 第一阶段：本地原型收尾 + V2 delta review

完成 checklist L3/L4 剩余项（上下文构建、自动保存审计、计划/envelope/协议），并把现有 mgsd-workflow Core 对照 V2 目录做 delta review，确定 SQLite/Session/Memory 的迁移面。

## Milestone B — 第一阶段：Foundation + Memory

```text
Phase 0
Phase 1
```

验收后 commit：

```text
agent-harness-v2-memory-foundation
```

## Milestone C — 第一阶段：Local Durable Task

```text
Phase 2
Phase 3
```

验收后 commit：

```text
agent-harness-v2-local-durable
```

## Milestone D — 第一阶段：DSH 本地集成 + Local E2E

对应 checklist L5：DSH Bundle、本地 Task/Plan/Execution/Review 视图、完整本地流程与验收矩阵；通过第 36.1 节后第一阶段完成。

## Milestone E — 第二阶段：Multi-device

```text
Phase 4
```

对应 checklist R0–R4。验收后 commit：

```text
agent-harness-v2-multinode
```

## Milestone F — MVP 后：Advanced

```text
Phase 5
```

每个 milestone：

```text
Plan
→ 人工看 Plan
→ Implement
→ Test
→ Commit checkpoint
```

当前交付项未通过验收，不进入依赖它的交付项；第一阶段未通过第 36.1 节验收，不开始第二阶段。

---

# 39. Codex Prompt：Phase 0 + Phase 1（Milestone B）

每次只交给 Codex 一个 milestone；先完成第 38 节 Milestone A 的 delta review，再执行本节：

```text
We are upgrading an existing Unity/Tuanjie engineering-agent harness to V2.

Do not redesign the agreed architecture.

ARCHITECTURE INVARIANTS

- Codely is the primary model-driven agent loop and executor.
- Codex is a scarce expert for architecture planning, high-risk escalation and independent review.
- DSH is deterministic harness/orchestration/UI only and must not introduce a second LLM agent loop.
- Git stores durable approved project knowledge and engineering artifacts.
- SQLite stores runtime Task state, Session events, Checkpoints, Leases and idempotency records.
- GitHub will be added later as multi-node control plane, not as runtime/session database.
- Task, Session and Checkpoint are separate concepts.
- Compaction creates a Context projection and never deletes the original Session event history.
- Stored memory is not automatically retrieved; retrieved memory is not automatically injected.
- Memory must not grant permissions or override project/security policy.
- Remote execution will use dedicated Git worktrees.

CURRENT MILESTONE

Implement Phase 0 and Phase 1 only:

1. TypeScript harness foundation.
2. SQLite database and migrations.
3. Core schemas/types.
4. .agent V2 directory layout.
5. Shared project memory files.
6. Memory schema.
7. Memory Proposal -> Validation -> Accept flow.
8. SQLite FTS5 memory index and retrieval.
9. ContextBuilder with relevance filtering and context budget.
10. .agents/skills discovery using metadata-first progressive loading.
11. Minimal AGENTS.md and CODELY.md pointing to shared memory/skills instead of duplicating them.
12. Unit tests.

DO NOT IMPLEMENT YET

- GitHub Actions.
- Self-hosted runner.
- Multi-node scheduling.
- DSH plugin.
- MCP.
- Vector DB.
- Task DAG.
- Live nested Codex/Codely calls in tests.

STORAGE RULES

Git-tracked durable content:
.agent/memory
.agent/plans
.agent/reports
.agent/handoffs
.agents/skills

Ignored runtime state:
.agent/runtime/agent.db
.agent/runtime/tmp

MEMORY RULE

Implement the pipeline:
Persistent Memory
-> Search
-> Relevance Filter
-> Working Memory
-> ContextBundle

Never inject all memory by default.

A model-generated claim must first become a MemoryProposal with evidence.
It cannot become accepted project memory until validation succeeds.

SKILLS RULE

At discovery time load only skill metadata such as name/description/path.
Load the full SKILL.md only when selected for a task.

TESTS MUST COVER

- DB migration idempotency.
- Memory schema validation.
- Proposal accept/reject.
- duplicate/conflict checks.
- FTS retrieval.
- relevance filtering.
- policy precedence over memory.
- metadata-only skill discovery.
- ContextBundle budget/exclusion behavior.

REPOSITORY SAFETY

Before changes:
- inspect git status
- do not reset/clean/checkout user changes
- do not auto commit/push

First inspect the current repository and existing harness implementation.
Produce a concise delta plan from current state to this milestone.
Then implement it.
```

---

# 40. Codex Prompt：Phase 2 + Phase 3（Milestone C）

```text
Continue the V2 agent harness implementation.
Phase 0/1 are complete and tested.

Implement Phase 2 and Phase 3 only.

REQUIRED

- AgentAdapter abstraction.
- CodelyAdapter as primary executor.
- CodexAdapter restricted to plan/review/escalation roles.
- ProcessRunner with operationId and cancellation.
- Explicit Task FSM.
- Git worktree service.
- deterministic risk policy.
- Session + append-only session event store.
- Session branch metadata.
- Context projection/compaction without deleting events.
- Checkpoint store.
- idempotent operations.
- task resume.
- handoff generation.
- Session -> MemoryProposal extraction only; do not auto-merge memory.

FAILURE TESTS

Demonstrate recovery after:
- executor process termination
- harness restart
- repeated operation id
- failed Codex call

No GitHub integration in this milestone.
No DSH integration.
```

---

# 41. Codex Prompt：DSH 本地集成（Milestone D，第一阶段收尾）

在 Phase 2/3 验收后、Phase 4 开始前使用；它与第 39/40 节共同组成第一阶段，不是第三阶段：

```text
Integrate the existing stable local Agent Harness Core into DeepSeek Harness (DSH).

This completes Stage 1: local DSH usability. GitHub remote tasks are Stage 2 and must not be implemented here.

DSH is not the primary model-driven agent loop.
Codely remains the primary executor.
Codex remains an external scarce expert.

DSH responsibilities:

- expose task status
- expose plan/execution/review state
- expose local node status
- provide audit/event visualization by subscribing to Core events (task.created, context.built, agent.started, agent.event, checkpoint.created, memory.proposed, review.completed, task.completed)
- wrap existing Core Harness services (FSM, TaskStore, Session/Event store, ContextBuilder, Memory, Checkpoint); do not copy FSM logic
- let the user start, approve and cancel local tasks through DSH
- verify the full local workflow without GitHub, runners, or remote dispatch

CRITICAL CONSTRAINT

Do not duplicate FSM logic inside the DSH plugin.
Do not import DSH/Cordis types into Core Harness.
All DSH-specific code must stay under a dedicated adapter/bundle directory.
Use the currently installed DSH version and its official profile/bundle/plugin APIs. Do not assume older APIs.

Package the adapter as a local DSH bundle and document commands to:

- install it into profile mgsd
- dump effective config
- launch and verify it

Do not create a second AI agent loop in DSH.

ACCEPTANCE

- Start a local task from DSH, observe plan/execution/review status, and cancel a running task.
- Independent verification commands decide success or failure, not exit codes or success text.
- Existing kill/restart recovery tests still pass after the DSH layer is added.
```

---

# 42. Codex Prompt：Phase 4 Multi-device（Milestone E，第二阶段）

仅在第一阶段通过第 36.1 节验收后使用；不能仅凭 Core CLI 或 Codely 冒烟测试通过就启动本节：

```text
Implement V2 Phase 4 multi-device coordination.

Stage 1 local DSH usability has passed acceptance; reuse it and do not redesign or duplicate it.
Existing local durable Task/Session/Checkpoint system is already working.
Do not move runtime state into GitHub.

GOAL

Home PC can dispatch a Task through a private GitHub control repo to Office PC.
Office PC executes locally using its own SQLite runtime, worktree, Codely and Codex credentials.

IMPLEMENT

- Private control repo schema.
- self-hosted runner setup docs.
- node-local repo alias config.
- worker runtime.
- TaskLease with leaseId, ownerNodeId, fencingToken, expiresAt.
- lease renew/expiry.
- stale fencing token rejection.
- GitHub dispatch/approve/cancel workflows.
- agent nodes/send/status/approve/cancel/resume/reassign CLI.
- checkpoint based offline recovery.
- handoff based cross-node resume.
- Restricted Mode where source/session/diff remains local.

SECURITY

- no arbitrary remote shell task
- no pull_request workflow executing self-hosted agents
- no credentials in control repo
- no fallback to primary working tree
- lease expiry must never automatically cause two writers

TEST

Simulate network interruption and worker restart, then resume from checkpoint without duplicating completed operations.
```

---

# 43. Codex Prompt：Phase 5 Advanced（Milestone F，MVP 后）

```text
Add advanced harness capabilities after the V2 durable multi-node MVP is stable.

Implement incrementally:

1. Tool registry search.
2. Deferred tool/MCP schema loading.
3. Optional hybrid memory retrieval.
4. capability-based worker routing.
5. task DAG only after single-task durability tests pass.
6. budget/usage telemetry.
7. extended dashboard views: memory proposals, workers/lease, context selection, Codex usage counters.

DSH CONSTRAINT

DSH has consumed Core Harness services/events since Stage 1.
DSH must not duplicate Task FSM, Session Store or Agent Loop.
No DSH direct LLM API is required.
```

---

# 44. Pi 借鉴点与本方案映射

| Pi 思想 | 本 Harness V2 |
|---|---|
| Minimal core | Harness Core 保持与 Codely/Codex/DSH 解耦 |
| Session tree | SQLite Session Event Tree |
| Compaction | Session → Context Projection，不删历史 |
| Skill progressive loading | `.agents/skills` metadata-first |
| Extension lifecycle | Harness lifecycle hooks/EventBus |
| Session state persistence | SQLite Session/Event/Checkpoint |
| Tools 可动态选择 | Tool Registry + Phase 5 Deferred Tools |
| 可编程扩展 | AgentAdapter / Hook / Skill / DSH adapter |

本方案不是复制 Pi；Pi 提供的是 Harness Engineering 的设计参考。我们的 Durable Task、多端 Lease、GitHub Worker、Worktree、安全 Gate 是针对实际 Unity/Android 工程场景增加的约束。

---

# 45. 最终执行顺序速查

```text
0. Backup / Git checkpoint
1. Phase 0: TS + SQLite + schemas
2. Phase 1: Shared Memory + Skills + ContextBundle
3. 验证 Stored != Retrieved != Injected
4. Phase 2: AgentAdapter + FSM + Worktree
5. 本地 Plan/Execute/Review smoke test
6. Phase 3: Session events + Compaction + Checkpoint + Resume
7. 做 kill/restart failure injection
8. DSH 本地集成：Bundle + 本地 Task/Plan/Execution/Review 视图
9. 本地端到端验收，通过第 36.1 节第一阶段验收
10. 只有第一阶段验收通过后进入 Phase 4
11. GitHub Private Control Repo
12. Self-hosted runners
13. Worker Lease/Fencing
14. Home → Office task test
15. Offline/reconnect/resume test
16. Restricted Mode security test
17. 再做 Phase 5 Tool Search / DAG / Advanced Dashboard
```

**不要为了“看起来像多 Agent 平台”跳过 Memory、Checkpoint、Recovery。V2 的重点不是 Agent 数量，而是让每个任务能被可靠地理解、执行、暂停、恢复、交接和审计。同样不要为了“多端”把本地 DSH 可用性推后；第一阶段先让单机闭环可用、可审批、可取消、可审计。**

---

# 46. 当前建议立即执行

实施状态以[实施 checklist](MGSD_Implementation_Checklist.zh.md)为准：L1、L2 已于 2026-10-07 通过，L3 进行中。当前最合理的下一步：

```text
1. 不先改 GitHub Runner；不创建 Control Repo，不注册 Runner。
2. 完成 checklist L3/L4 剩余项：上下文构建、自动保存审计、计划/envelope/协议。
3. 把现有 Harness Core 对照 V2 目录做 delta review，确定 SQLite/Session/Memory 迁移面。
4. 把本文件交给 Codex，只执行第 39 节 Phase 0 + Phase 1 Prompt。
5. 完成后检查：Memory / ContextBundle / Skill progressive loading 是否真的工作。
6. 按第 40 节进入 Durable Task / Session / Checkpoint，并做 kill/restart failure injection。
7. 按第 41 节完成 DSH 本地集成与本地端到端验收，通过第 36.1 节。
8. 第一阶段验收通过后，才执行第 42 节 Phase 4 GitHub remote task。
```

---

# 47. 参考

实施状态与交接（本仓库）：

- [MGSD 实施 checklist 与 Codely 交接](MGSD_Implementation_Checklist.zh.md)
- [本地 Codely 使用说明](user/guide/codely-local.zh.md)

架构与工具（实施时以当前官方文档为准）：

- [Pi Coding Agent repository](https://github.com/earendil-works/pi)
- [Pi Sessions / Context](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sessions.md)
- [Pi Compaction](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md)
- [Pi Skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [Codely CLI docs](https://codely-docs.tuanjie.cn/)
- [OpenAI Codex docs](https://developers.openai.com/)
- [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
- [GitHub Self-hosted runners](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners)
- [GitHub Actions Self-hosted Runner Security](https://docs.github.com/en/actions/reference/security/secure-use)
