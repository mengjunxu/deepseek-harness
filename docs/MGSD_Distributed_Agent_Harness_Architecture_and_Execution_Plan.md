# MGSD Distributed Agent Harness
## 完整架构设计与从 0 开始执行清单

> 版本：v1.1；日期：2026-10-04；实施顺序：本地 DSH → GitHub remote task。

> 目标环境：Windows + Unity/Tuanjie + Git + Codely CLI + Codex CLI + DeepSeek Harness (DSH) + GitHub Actions

> 设计原则：**Codely 负责主要 Agent Loop；DSH 负责确定性 Harness；Codex 只做高价值架构/高风险规划/独立 Review；GitHub 负责多端控制平面；所有远程工程任务在独立 Git worktree 中执行。**

---

## 实施阶段与当前入口

本计划分为两个交付阶段：第一阶段先完成单机 DSH 的实际使用闭环，第二阶段再扩展 GitHub remote task。GitHub Control Repo、Runner、远程派发和跨机器审批不是第一阶段的前置条件。下文保留 Phase 0–21 的编号用于引用，实际开发顺序以第 26 节为准，不再按编号递增实施。

第一阶段由 DSH 提供本地任务入口、状态和日志，Codely 执行任务，独立验证命令判断结果；随后补齐本地 Core/FSM、worktree、上下文、风险策略、人工审批和必要的 Codex 规划/Review。DSH 适配及本地界面属于第一阶段，不能推迟到 GitHub 远程接入之后。Core 仍不得依赖 DSH/Cordis，DSH 不运行第二个模型驱动 Loop。

第二阶段在第一阶段验收通过后启动，只增加 GitHub 控制平面、Self-hosted Runner、多端派发、远程状态/审批/取消以及数据上传策略，并复用已验证的本地执行流程。

当前已有本地 Codely 执行原型，尚不等于第一阶段完成。已完成项、代码位置、历史验证结果和下一项待办以[实施 checklist 与 Codely 交接](MGSD_Implementation_Checklist.zh.md)为准；本地使用方式见[本地 Codely 使用说明](user/guide/codely-local.zh.md)。

---

# 1. 文档目标

本文给出一套可以实际落地的工程 Agent 平台，而不是单纯的 Prompt 或多 Agent Demo。

第一阶段要实现的用户体验：用户在本机 DSH 发起工程任务，查看任务、Plan、执行输出和 Review，按风险策略进行本地审批，取消正在执行的任务，并通过独立验证获得成功或失败结果。不需要 GitHub 账号、Control Repo 或 Runner 即可完成这个闭环。

第二阶段扩展的远程用户体验：

```text
家里电脑

> agent send office-pc hmi8295 "分析并修复 A-B-A 场景快速切换蓝底问题"

TASK-0127 created
Target: office-pc
State: QUEUED
```

公司电脑即使当前关机，任务仍保存在 GitHub；公司电脑开机并连接 GitHub Self-hosted Runner 后自动领取任务。

对于标准工程任务：

```text
GitHub Dispatch
      ↓
Office Runner
      ↓
Local Harness
      ↓
ContextBuilder
      ↓
Codex Plan（必要时）
      ↓
PLAN_READY
      ↓
人工 Approve
      ↓
Codely Execute
      ↓
Local Tests
      ↓
Codex Review（必要时）
      ↓
DONE
```

对于简单任务：

```text
GitHub Dispatch
      ↓
Office Runner
      ↓
Codely Execute
      ↓
Tests
      ↓
DONE
```

重点目标：

1. 家里/公司多端协同。
2. 公司电脑不开放公网端口。
3. 不把 Codex 当成所有任务的默认执行器，最大限度节约 Plus/Codex allowance。
4. 不让 DSH 再创建一个模型驱动 Agent Loop，避免嵌套 Loop。
5. 所有工程修改在隔离 worktree 内执行，避免破坏日常开发目录。
6. Agent 凭证只留在执行节点本地。
7. GitHub 只承担控制平面；是否上传 Plan、Diff、日志由安全模式决定。
8. DSH 当前仍处于 Developer Preview，因此 DSH-specific 代码必须隔离。

---

# 2. 最终架构结论

## 2.1 一句话架构

> **GitHub 是分布式 Control Plane，Codely 是主 Agent Loop，DSH 是本地确定性 Harness，Codex 是稀缺的高级专家，Git worktree 是执行沙盒边界。**

---

## 2.2 总体架构

```text
                            ┌──────────────────────────────┐
                            │        GitHub Private        │
                            │        Control Repo          │
                            │                              │
                            │  Actions / Task Dispatch     │
                            │  Runner Routing              │
                            │  Workflow Logs               │
                            │  Task Metadata               │
                            │  Artifacts (optional)        │
                            └──────────────┬───────────────┘
                                           │ HTTPS 443
                         ┌─────────────────┴──────────────────┐
                         │                                    │
                         ▼                                    ▼
                ┌─────────────────┐                  ┌─────────────────┐
                │     HOME-PC     │                  │    OFFICE-PC    │
                │ Self-hosted     │                  │ Self-hosted     │
                │ Runner          │                  │ Runner          │
                └────────┬────────┘                  └────────┬────────┘
                         │                                    │
                         ▼                                    ▼
                ┌─────────────────┐                  ┌─────────────────┐
                │ Local Harness   │                  │ Local Harness   │
                │                 │                  │                 │
                │ Core FSM        │                  │ Core FSM        │
                │ ContextBuilder  │                  │ ContextBuilder  │
                │ Policy          │                  │ Policy          │
                │ Audit           │                  │ Audit           │
                │ DSH adapter     │                  │ DSH adapter     │
                └───────┬─────────┘                  └───────┬─────────┘
                        │                                    │
             ┌──────────┼──────────┐              ┌──────────┼──────────┐
             │                     │              │                     │
             ▼                     ▼              ▼                     ▼
        Codely CLI             Codex CLI     Codely CLI             Codex CLI
      Primary Agent Loop      Expert only   Primary Agent Loop      Expert only
             │                     │              │                     │
             └──────────┬──────────┘              └──────────┬──────────┘
                        ▼                                    ▼
                Git Worktree                         Git Worktree
             TASK-xxx isolated                    TASK-xxx isolated
```

---

# 3. 组件职责边界

## 3.1 GitHub：Distributed Control Plane

GitHub 负责：

- 多端任务入口。
- Task Dispatch。
- Self-hosted Runner 节点发现与路由。
- 节点标签（`office-pc` / `home-pc` / `unity` / `android`）。
- Workflow 状态和日志。
- Task 元数据。
- 可选的 Plan/Report Artifact。
- 审计历史。

GitHub **不负责**：

- 直接远程 Shell 控制公司电脑。
- 保存 Codex/Codely 登录凭证。
- 保存 Android signing key。
- 保存 Unity license。
- 保存公司源码，除非公司政策明确允许。

---

## 3.2 Codely：Primary Agent Loop

Codely 是主要执行 Agent。

负责：

- 阅读任务 Execution Envelope。
- 阅读/搜索工程源码。
- 修改文件。
- 调用本地 Shell。
- 调用 Unity/Tuanjie 测试。
- 调用项目级 Skills。
- 必要时调用 Codely Subagent。
- 修复 Codex Review 指出的明确问题。

不负责：

- 给自己的高风险方案自动批准。
- 修改 Harness FSM 状态绕过 Gate。
- 修改 `Allowed Files` 扩大范围。
- 在普通任务中无条件调用 Codex。

---

## 3.3 Codex：Scarce Expert

Codex 的额度视为稀缺资源。

Codex 只负责：

- Architecture Plan。
- HIGH_RISK Task Plan。
- 跨子系统复杂分析。
- Codely 明确无法解决时的 Escalation。
- 高风险/架构任务的独立 Review。

Codex 默认不负责：

- Repo 全量扫描。
- 普通文件搜索。
- 日志机械过滤。
- 普通 CRUD 修改。
- 简单 UI 修改。
- 普通测试执行。
- 报告格式化。

核心原则：

```text
LOCAL > CODELY > CODEX
```

---

## 3.4 DSH：Local Deterministic Harness

DSH 在本方案中**不是主 Agent Loop**。

DSH 负责承载/组合本地 Harness 服务：

- Task FSM。
- Task Store。
- Context Builder。
- Budget / Risk Policy。
- Git Workspace Service。
- Audit/Event Service。
- Codex Adapter。
- 后续 Web UI。

DSH-specific 代码必须放在独立 adapter/plugin 层。

原因：DeepSeek Harness 当前仍标记为 Developer Preview，并明确可能出现 breaking changes。

核心 Workflow 不允许 import DSH/Cordis 类型。

---

## 3.5 Git Worktree：工程执行边界

任何远程任务禁止直接在日常工作目录运行。

例如：

```text
D:\Projects\HMI8295
```

只作为主 checkout。

远程 TASK-0127 创建：

```text
D:\AgentWorkspaces\HMI8295\TASK-0127
```

以及独立 branch：

```text
agent/TASK-0127-office-pc
```

这样即使 Agent 出错，也不会覆盖用户当前未提交修改。

---

# 4. 为什么不使用 DSH → Codely → Codex 的双 Loop

禁止架构：

```text
DSH Agent Loop
     ↓
Codely Agent Loop
     ↓
Codely Subagent
```

问题：

- 下一步决策责任不清晰。
- Retry 重叠。
- Context 重复。
- Approval 重复。
- Tool ownership 不清晰。
- 容易出现无限 Fix/Review Loop。
- 不必要消耗模型额度。

正确架构：

```text
Codely = 唯一主要模型驱动 Loop
DSH   = 确定性工作流/状态/工具层
Codex = 外部专家调用
```

---

# 5. Repository 划分

建议分成两个仓库。

## 5.1 Control Repo

建立 GitHub Private Repository：

```text
mgsd-agent-control
```

目录：

```text
mgsd-agent-control/
├── .github/
│   └── workflows/
│       ├── dispatch-task.yml
│       ├── plan-task.yml
│       ├── execute-task.yml
│       └── cancel-task.yml
│
├── tasks/
│   ├── TASK-0001.json
│   └── TASK-0002.json
│
├── schemas/
│   ├── task.schema.json
│   └── node.schema.json
│
├── nodes/
│   ├── home-pc.example.json
│   └── office-pc.example.json
│
├── scripts/
│   ├── new-task.ps1
│   ├── send-task.ps1
│   ├── status-task.ps1
│   └── approve-task.ps1
│
└── README.md
```

原则：

- Control Repo 必须 Private。
- 第一版只允许你自己的 GitHub 账号写入。
- 不配置 `pull_request` 自动执行 Agent。
- 只使用手工 `workflow_dispatch` / 受控 API 调度。

---

## 5.2 Project Repo

例如：

```text
HMI8295/
├── AGENTS.md
├── CODELY.md
│
├── .agent/
│   ├── tasks/
│   ├── plans/
│   ├── context/
│   ├── reports/
│   ├── schemas/
│   └── index/
│
├── .codely-cli/
│   ├── settings.json
│   ├── skills/
│   │   └── harness-workflow/
│   │       └── SKILL.md
│   └── agents/
│       ├── repo-scout.toml
│       └── test-runner.toml
│
├── docs/
│   └── agent/
│       ├── PROJECT.md
│       ├── WORKFLOW.md
│       ├── UNITY.md
│       ├── ANDROID.md
│       ├── RENDERING.md
│       └── TESTING.md
│
├── tools/
│   └── agent-harness/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── core/
│       │   ├── context/
│       │   ├── workspace/
│       │   ├── policy/
│       │   ├── adapters/
│       │   ├── cli/
│       │   └── dsh/
│       └── tests/
│
├── Assets/
├── Packages/
└── ProjectSettings/
```

---

# 6. Task Schema

第一版 Task：

```json
{
  "id": "TASK-0127",
  "title": "Fix A-B-A scene transition",
  "request": "分析并修复 A-B-A 快速切换时蓝底问题",

  "sourceNode": "home-pc",
  "targetNode": "office-pc",

  "repoAlias": "hmi8295",
  "baseRef": "origin/main",

  "risk": "standard",
  "mode": "engineering",

  "workspaceMode": "git-worktree",

  "planningPolicy": "auto",
  "approvalPolicy": "plan-required",
  "reviewPolicy": "risk-based",

  "createdAt": "2026-09-28T00:00:00+08:00"
}
```

注意：Control Repo 中的 Task 尽量保持**不可变请求**。

第一阶段运行状态由本地 TaskStore 和 `.agent/tasks/TASK-xxxx.json` 管理，DSH 展示该状态。第二阶段关联 GitHub Workflow Run；不要多个 Runner 频繁回写同一个 JSON，避免 Git 冲突。

---

# 7. Local Task Runtime Schema

Project Repo/worktree 内：

```json
{
  "id": "TASK-0127",
  "state": "planning",
  "risk": "standard",

  "planPath": ".agent/plans/TASK-0127.md",
  "contextPath": ".agent/context/TASK-0127.md",
  "executionReportPath": ".agent/reports/TASK-0127-execution.md",
  "reviewReportPath": ".agent/reports/TASK-0127-review.md",

  "reviewCycle": 0,
  "maxReviewCycles": 2
}
```

---

# 8. FSM

## 8.1 正常状态

```text
CREATED
   ↓
QUEUED
   ↓
CLAIMED
   ↓
PREPARING
   ↓
PLANNING          ← 可被策略跳过
   ↓
PLAN_READY
   ↓
APPROVED
   ↓
EXECUTING
   ↓
EXECUTED
   ↓
REVIEWING         ← 可被策略跳过
   ↓
COMPLETED
```

## 8.2 异常状态

```text
FAILED
INTERRUPTED
CANCEL_REQUESTED
CANCELLED
NEEDS_HUMAN
REVIEW_FAILED
```

## 8.3 Review Fix Loop

```text
REVIEWING
    ├── PASS → COMPLETED
    │
    └── FAIL → REVIEW_FAILED
                   ↓
                 FIXING
                   ↓
               REVIEWING
```

强制：

```text
maxReviewCycles = 2
```

第二次仍 FAIL：

```text
NEEDS_HUMAN
```

禁止无限循环。

---

# 9. Risk / Budget Policy

## 9.1 三档任务

### TRIVIAL

示例：

- 注释。
- 拼写。
- 明确的一行配置。
- 很小的 UI 文案修改。

流程：

```text
Context → Codely → Test → Done
```

Codex：0 次。

### STANDARD

示例：

- 普通业务逻辑 Bug。
- 单模块功能。
- 1~5 个文件的小型重构。

流程：

```text
Local Context
    ↓
规则判断是否需要 Codex Plan
    ↓
Codely Execute
    ↓
Tests
    ↓
风险决定是否 Codex Review
```

### HIGH_RISK

示例：

- Addressables 生命周期。
- 场景状态机重构。
- JNI/Native。
- Android Surface/Binder。
- Vulkan synchronization。
- 跨进程共享内存。
- Render Pipeline 核心路径。

流程：

```text
ContextBuilder
    ↓
Codex Plan
    ↓
Human Approval
    ↓
Codely
    ↓
Tests
    ↓
Codex Review
```

---

## 9.2 Codex 调用原则

Codex 禁止用于：

- `rg` 能完成的搜索。
- `git log` 能完成的历史查询。
- `git diff --stat` 能完成的变更摘要。
- 大日志初筛。
- Repo 全量探索。
- 简单格式化。

Codex 输入必须尽量是 Context Packet，而不是“自己去仓库看一下”。

---

# 10. Context Builder

目标：最大限度减少 Codely/Codex 重复扫描。

ContextBuilder 使用本地免费工具：

```text
rg
fd/git ls-files
git diff
git log
git status
项目静态索引
历史 task
项目知识文档
```

输出：

```text
.agent/context/TASK-0127.md
```

推荐格式：

```markdown
# TASK-0127 Context

## Request

## Relevant Files

## Relevant Symbols

## Current Git State

## Recent Related Commits

## Relevant Logs

## Project Constraints

## Related Knowledge

## Questions Requiring Reasoning
```

原则：

- 不把 50 MB 日志原样给模型。
- 日志先 grep/filter。
- 不默认把整个 Repo 加到 Codely `--all-files`。
- Codex 默认只读 Context + 指定文件。

---

# 11. Plan Contract

Codex Plan 固定输出：

```markdown
# TASK-0127

## Goal

## Current Behavior

## Root Cause

## Proposed Design

## Scope

## Allowed Files

## Forbidden Changes

## Implementation Steps

## Risks

## Validation

## Acceptance Criteria

## Open Questions
```

Codely 必须将它视为执行合同。

任何需要扩大 `Allowed Files` 的修改：

```text
停止执行
→ NEEDS_REPLAN
→ 新 Plan
→ 人工再次 Approve
```

---

# 12. Execution Envelope

Codely 执行前，Harness 生成：

```json
{
  "taskId": "TASK-0127",
  "state": "approved",

  "planPath": ".agent/plans/TASK-0127.md",

  "allowedFiles": [
    "Assets/.../EnvironmentManager.cs",
    "Assets/.../SceneTransition.cs"
  ],

  "forbiddenChanges": [
    "Addressables settings",
    "Prefab contents",
    "Shader assets"
  ],

  "acceptanceCriteria": [
    "A-B works",
    "A-B-A works",
    "A-B-C works",
    "No Addressables ref-count error"
  ],

  "maxReviewCycles": 2
}
```

---

# 13. Security Model

## 13.1 禁止 Remote Shell Command Task

错误：

```json
{
  "command": "powershell ..."
}
```

正确：

```json
{
  "type": "engineering_task",
  "repoAlias": "hmi8295",
  "request": "分析 A-B-A 转场问题"
}
```

Hub 只传“意图”。

实际 Shell 权限由本机 Harness/Codely policy 决定。

---

## 13.2 凭证不上传

每台 Node 本地自行保存：

- `codex login` 状态。
- Codely 登录状态。
- Git credential。
- Android key。
- Unity/Tuanjie license。

禁止上传到 GitHub：

```text
~/.codex/*
~/.codely-cli/* credential
keystore
API key
access token
runner registration token
```

---

## 13.3 GitHub Runner 安全

必须：

- Control Repo 使用 Private Repo。
- 最好只允许个人账号访问。
- 不允许 public PR 触发 self-hosted runner。
- 第一版不要配置 `pull_request:` Agent workflow。
- 远程工作使用独立 Windows 用户（建议 `AgentWorker`）。
- Agent worktree 放单独目录。

---

# 14. 数据上云模式

## 14.1 Standard Mode

适用于个人项目或允许 GitHub 存储工程信息的项目。

GitHub 可保存：

- Task description。
- Plan。
- Execution Report。
- Review Report。
- Diff summary。
- Build logs。
- Artifact。

## 14.2 Restricted Mode

适用于公司项目。

GitHub 只保存：

```text
Task ID
repo alias
target node
state
timestamps
result code
```

不上传：

- 源码。
- Diff。
- 文件内容。
- Perfetto 原文件。
- 敏感日志。
- 完整 Plan（如果 Plan 包含源码信息）。

Plan/Report 保留在：

```text
OFFICE-PC local .agent/
```

是否允许家庭端看到具体内容必须服从公司数据政策。

---

# 15. 从 0 开始执行步骤

下列 Phase 编号是能力索引，不是开发顺序。按第 26 节先完成第一阶段本地 DSH，再进入第二阶段 GitHub remote task；同一阶段内部按依赖验收。

---

# Phase 0：确认机器与账号

## 目标

第一阶段只确认当前本机的 Git、Node、Codely、DSH 和按需使用的 Codex 环境。GitHub CLI、GitHub 登录及第二台机器的检查推迟到第二阶段。

## 本机先执行；第二阶段再检查 Home-PC / Office-PC

PowerShell：

```powershell
git --version
node --version
npm --version
```

以下 GitHub CLI 安装与登录检查仅在第二阶段执行：

```powershell
gh --version
```

如果未安装，使用官方 GitHub CLI Windows 安装方式安装后：

```powershell
gh auth login
```

验证：

```powershell
gh auth status
```

安装/验证 Codely：

```powershell
codely --version
```

没有则按当前 Codely 官方文档安装，再启动：

```powershell
codely
```

完成登录。

安装/验证 Codex：

```powershell
codex --version
```

没有：

```powershell
npm install -g @openai/codex
```

启动：

```powershell
codex
```

按界面选择 ChatGPT 登录。

验证登录后的 Codex 可以正常工作。

## 验收条件

```text
[ ] 第一阶段：本机 Git、Node、Codely 和 DSH 可用
[ ] 第一阶段：需要 Codex 的本机 Codex 可用
[ ] 第二阶段：Home-PC / Office-PC 上 Git、Node、Codely 可用
[ ] 第二阶段：两台机器 gh auth status 正常，按需使用的 Codex 可用
```

## 失败回滚

Phase 0 不修改任何工程，无需回滚。

---

# Phase 1：创建 GitHub Control Repo

所属阶段：第二阶段。第一阶段不创建 Control Repo。

## 目标

创建独立控制仓库。

GitHub 网站创建：

```text
mgsd-agent-control
Visibility: Private
```

不要勾选公共模板。

本地：

```powershell
mkdir D:\AgentPlatform
cd D:\AgentPlatform
gh repo clone <YOUR_GITHUB_ACCOUNT>/mgsd-agent-control
cd mgsd-agent-control
```

创建目录：

```powershell
mkdir tasks
mkdir schemas
mkdir nodes
mkdir scripts
mkdir .github\workflows
```

创建 `.gitignore`：

```gitignore
.env
*.token
*.secret
secrets/
.local/
```

提交：

```powershell
git add .
git commit -m "Initialize agent control plane"
git push
```

## 验收条件

```text
[ ] Repo 是 Private
[ ] 只有受信任账号有写权限
[ ] 基础目录已提交
```

---

# Phase 2：注册 Self-hosted Runner

所属阶段：第二阶段。第一阶段不注册 Runner。

## 目标

让 GitHub 可以给 HOME/OFFICE 派发 Job。

## Office-PC

GitHub：

```text
mgsd-agent-control
→ Settings
→ Actions
→ Runners
→ New self-hosted runner
→ Windows x64
```

**直接复制 GitHub 页面实时生成的下载/config 命令。**

不要把页面中的注册 token 写进文档或提交 Git。

建议 Runner 目录：

```text
C:\AgentRunner\office
```

配置 Runner name：

```text
office-pc
```

添加自定义 label：

```text
office-pc
unity
android
hmi8295
```

如果配置脚本支持 `--labels`，按 GitHub 页面当前语法配置；否则在 GitHub Runner 设置页面增加 label。

安装为 Windows Service（如果 GitHub 当前 Runner 安装脚本提供 service 安装选项，则使用官方提供的 `svc` 脚本）。

启动后在 GitHub 确认：

```text
office-pc → Idle
```

## Home-PC

同样注册：

```text
runner name: home-pc
labels:
home-pc
unity
blender
mgsd
```

## 验收条件

GitHub：

```text
[ ] office-pc = Idle
[ ] home-pc = Idle
```

## 失败回滚

删除 Runner：

```text
GitHub → Settings → Actions → Runners → Remove
```

本地停止 service 并删除对应 runner 目录。

---

# Phase 3：建立最小 Dispatch Workflow

所属阶段：第二阶段。在本地 DSH 验收通过后执行。

创建：

```text
.github/workflows/dispatch-task.yml
```

第一版：

```yaml
name: Dispatch Agent Task

on:
  workflow_dispatch:
    inputs:
      task_id:
        description: Task ID
        required: true
        type: string
      target:
        description: Runner label
        required: true
        type: choice
        options:
          - office-pc
          - home-pc

jobs:
  execute:
    runs-on: [self-hosted, "${{ inputs.target }}"]
    timeout-minutes: 240

    steps:
      - name: Checkout control repo
        uses: actions/checkout@v4

      - name: Print task
        shell: powershell
        run: |
          Write-Host "Task: ${{ inputs.task_id }}"
          Get-Content "tasks/${{ inputs.task_id }}.json"
```

提交：

```powershell
git add .github/workflows/dispatch-task.yml
git commit -m "Add task dispatch workflow"
git push
```

创建测试 Task：

```json
{
  "id": "TASK-0001",
  "title": "Runner smoke test",
  "request": "Print this task only",
  "sourceNode": "home-pc",
  "targetNode": "office-pc",
  "repoAlias": "none",
  "risk": "trivial"
}
```

保存：

```text
tasks/TASK-0001.json
```

提交后：

```powershell
gh workflow run dispatch-task.yml -f task_id=TASK-0001 -f target=office-pc
```

查看：

```powershell
gh run list --workflow dispatch-task.yml
```

或：

```powershell
gh run watch
```

## 验收条件

```text
[ ] Home 触发 workflow
[ ] Job 被 office-pc 领取
[ ] Actions Log 能看到 TASK-0001 内容
```

这一步通过以后，多端网络链路已经打通。

---

# Phase 4：节点本地配置

## 目标

Hub 不知道真实工程路径；每个节点自己维护 alias → path。

Office 创建：

```text
C:\AgentHarness\config\node.json
```

例如：

```json
{
  "nodeId": "office-pc",
  "workspaceRoot": "D:/AgentWorkspaces",
  "repos": {
    "hmi8295": {
      "path": "D:/Projects/HMI8295",
      "defaultBaseRef": "origin/main"
    }
  },
  "capabilities": [
    "unity",
    "android",
    "codex",
    "codely"
  ]
}
```

Home：

```json
{
  "nodeId": "home-pc",
  "workspaceRoot": "D:/AgentWorkspaces",
  "repos": {
    "mgsd": {
      "path": "D:/Projects/MGSD",
      "defaultBaseRef": "origin/main"
    }
  },
  "capabilities": [
    "unity",
    "blender",
    "codex",
    "codely"
  ]
}
```

`node.json` 不提交 Control Repo。

## 验收条件

```text
[ ] repo alias 不暴露完整公司路径
[ ] 两台机器 workspaceRoot 存在
[ ] runner 账号对这些目录有权限
```

---

# Phase 5：实现 Agent Harness Core

## 目标

先做与 DSH 无关的纯 TypeScript Core。

在 Project Repo：

```text
tools/agent-harness/
```

初始化：

```powershell
cd <PROJECT_ROOT>
mkdir tools\agent-harness
cd tools\agent-harness
npm init -y
npm install -D typescript tsx vitest @types/node
npx tsc --init
```

推荐 `package.json` scripts：

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "agent": "tsx src/cli/main.ts"
  }
}
```

创建：

```text
src/core/types.ts
src/core/task.ts
src/core/workflow.ts
src/core/task-store.ts
src/workspace/git-worktree.ts
src/context/context-builder.ts
src/policy/risk-policy.ts
src/adapters/process-runner.ts
src/adapters/codex.ts
src/cli/main.ts
```

核心接口：

```ts
export interface Planner {
  plan(task: Task, context: TaskContext): Promise<PlanResult>;
}

export interface Reviewer {
  review(input: ReviewInput): Promise<ReviewResult>;
}
```

注意：第一版**不需要 CodelyAdapter**。

Codely 是当前正在执行的 Agent Loop。

Harness Core 只为 Codely 提供任务状态/Plan/Policy/上下文。

## 验收条件

```powershell
npm test
npm run build
```

全部通过。

---

# Phase 6：实现 FSM

`workflow.ts` 定义：

```ts
export enum TaskState {
  Created = "created",
  Queued = "queued",
  Claimed = "claimed",
  Preparing = "preparing",
  Planning = "planning",
  PlanReady = "plan_ready",
  Approved = "approved",
  Executing = "executing",
  Executed = "executed",
  Reviewing = "reviewing",
  ReviewFailed = "review_failed",
  Fixing = "fixing",
  Completed = "completed",
  Failed = "failed",
  Interrupted = "interrupted",
  CancelRequested = "cancel_requested",
  Cancelled = "cancelled",
  NeedsHuman = "needs_human"
}
```

使用显式 Transition Map。

禁止任意 `state = xxx`。

例如：

```ts
transition(task, TaskState.Approved)
```

必须检查来源 state。

单测至少覆盖：

```text
Created → Queued PASS
Queued → Executing FAIL
PlanReady → Approved PASS
ReviewFailed → Fixing PASS
Review 第 3 次 → NeedsHuman
```

---

# Phase 7：Git Worktree Service

接收到任务：

```text
TASK-0127
repoAlias = hmi8295
```

执行前：

```powershell
cd D:\Projects\HMI8295
git fetch --all --prune
```

检查主 repo：

```powershell
git status --porcelain
```

主 repo 可以 dirty，因为不会在此执行。

创建任务 branch/worktree：

```powershell
git worktree add `
  D:\AgentWorkspaces\HMI8295\TASK-0127 `
  -b agent/TASK-0127-office-pc `
  origin/main
```

Harness 必须检查：

- 目录不存在。
- Branch 不冲突。
- Worktree 成功。

失败时 Task → `FAILED`，不要 fallback 到主工作目录。

## 验收条件

```text
[ ] 主工作目录无变化
[ ] Agent 修改只出现在 TASK worktree
[ ] git worktree list 能看到 TASK workspace
```

---

# Phase 8：Context Builder

第一版实现：

```powershell
rg -n "<keywords>" Assets Packages

git log -n 20 --oneline -- <relevant file>

git status --short

git diff --stat <baseRef>...HEAD
```

关键词来源：

- Task request。
- 显式 symbol。
- 文件名。

不要做复杂 embedding RAG。

输出：

```text
.agent/context/TASK-0127.md
```

限制：

```text
相关文件数量建议 <= 15
单个日志截取 <= 300 行
Context 文档尽量 <= 30~50 KB
```

未来再增加 AST/RAG。

---

# Phase 9：Codex Adapter

## 原则

第一版使用 Codex CLI，而不是 API。

这样沿用用户本机的 ChatGPT/Codex 登录状态。

Planner：只读意图。

Reviewer：只读意图。

Codex 当前支持配置 sandbox/approval；具体参数以执行机器安装版本的 `codex --help` / 官方文档为准，不要在代码中假设长期不变的 CLI flag。

推荐做法：创建独立 Codex config/profile，Planner/Reviewer 使用 `read-only` 权限配置。

Harness `ProcessRunner` 必须用 executable + args 数组调用，不要拼接 shell string。

伪代码：

```ts
await processRunner.run({
  executable: "codex",
  args: ["exec", prompt],
  cwd: workspacePath,
  timeoutMs: 30 * 60 * 1000
});
```

Prompt 强制：

```text
You are the Planner.
Do not modify repository files.
Use the supplied context first.
Do not perform broad repository exploration unless required.
Write only the final plan contract.
```

Codex Plan 输出：

```text
.agent/plans/TASK-0127.md
```

Review 输入仅：

```text
Plan
Execution Report
git diff
Test results
必要的代码上下文
```

不要再次让 Reviewer 全仓扫描。

## Codex 使用预算规则

- TRIVIAL：禁止调用。
- STANDARD：默认不调用 Plan；遇到复杂度阈值才调用。
- HIGH_RISK：Plan + Review。
- Review 最多 2 轮。

---

# Phase 10：Codely 项目协议

在 Project Repo 创建：

```text
CODELY.md
```

核心规则：

```markdown
# Codely Engineering Protocol

For non-trivial engineering work:

1. Never modify source before reading the current task state.
2. Use Harness context before broad repository exploration.
3. If a task has an approved Plan, treat it as the execution contract.
4. Do not expand Allowed Files without requesting replanning.
5. Do not approve your own high-risk Plan.
6. Run validation before marking execution complete.
7. After review failure, only address listed findings.
8. Stop after max review cycles and request human intervention.
9. Never modify the user's primary working tree for remote tasks.
10. Never expose credentials in logs or task reports.
```

项目公共知识不要塞在 CODELY.md。

放：

```text
docs/agent/*.md
```

---

# Phase 11：Codely Harness Skill

创建：

```text
.codely-cli/skills/harness-workflow/SKILL.md
```

Skill 告诉 Codely：

```text
1. 如何读取 task runtime。
2. 如何读取 context。
3. 如何读取 execution envelope。
4. 什么时候可以修改代码。
5. 如何运行测试。
6. 完成后如何调用 harness CLI 写 execution report。
```

建议 Codely 调用本地 Harness CLI：

```powershell
npm --prefix tools/agent-harness run agent -- status TASK-0127
npm --prefix tools/agent-harness run agent -- execution-envelope TASK-0127
npm --prefix tools/agent-harness run agent -- finish-execution TASK-0127
```

这样第一版不需要依赖 MCP。

原因：

- CLI 最容易测试。
- 不需要多开 HTTP 服务。
- 减少 DSH/Codely 接口耦合。
- 后续需要 UI/远程实时工具时再加 MCP。

---

# Phase 12：本地端到端测试

不要先测 GitHub。

在 Office 本机测试：

```powershell
cd D:\Projects\HMI8295\tools\agent-harness
npm run agent -- new "Add a harmless test comment"
```

然后：

```powershell
npm run agent -- prepare TASK-XXXX
npm run agent -- build-context TASK-XXXX
npm run agent -- plan TASK-XXXX
```

检查：

```powershell
git status
```

Plan 阶段不应修改业务代码。

Approve：

```powershell
npm run agent -- approve TASK-XXXX
```

启动 Codely，在对应 worktree：

```powershell
cd D:\AgentWorkspaces\HMI8295\TASK-XXXX
codely -i "Execute the approved TASK-XXXX using the harness-workflow skill"
```

执行结束：

```powershell
npm --prefix tools/agent-harness run agent -- review TASK-XXXX
```

## 验收条件

```text
[ ] Plan 不修改代码
[ ] Codely 只修改 worktree
[ ] 测试运行
[ ] Review 生成报告
[ ] 主 checkout 未改变
```

---

# Phase 13：接入 GitHub Workflow 执行

将 `dispatch-task.yml` 的 Print 替换为本地 Harness 调用。

示例逻辑：

```yaml
- name: Execute agent task
  shell: powershell
  run: |
    $task = "${{ inputs.task_id }}"
    $taskFile = "${{ github.workspace }}\tasks\$task.json"

    & "C:\AgentHarness\bin\agent-node.ps1" `
      -TaskFile $taskFile
```

不要把 Project Repo checkout 到 GitHub Actions 默认 workspace。

`agent-node.ps1` 根据：

```text
repoAlias
```

从本地 `node.json` 找真实工程路径，然后自己创建 worktree。

## 验收条件

从 Home：

```powershell
gh workflow run dispatch-task.yml -f task_id=TASK-0002 -f target=office-pc
```

Office：

- Runner 收到。
- 创建 worktree。
- Harness 正常运行。

---

# Phase 14：实现 `agent send`

最终不要每次手写 JSON。

创建本地 CLI：

```text
agent
```

第一版命令：

```text
agent nodes
agent send
agent status
agent approve
agent cancel
```

示例：

```powershell
agent send `
  --target office-pc `
  --repo hmi8295 `
  --risk high `
  "分析并修复 A-B-A 场景快速切换蓝底问题"
```

内部：

```text
1. 生成 TASK ID
2. 创建 task JSON
3. commit task JSON 到 control repo
4. push
5. gh workflow run dispatch-task.yml
6. 输出 task ID
```

Task ID 建议：

```text
TASK-YYYYMMDD-NNN
```

避免两台机器递增编号冲突。

例如：

```text
TASK-20260928-001
```

---

# Phase 15：Plan Approval 多端协同

第一版不要开发复杂网页。

方案：两阶段 Workflow。

### 第一阶段：Plan

```text
plan-task.yml
```

Office 生成 Plan，然后退出。

状态：

```text
PLAN_READY
```

Standard Mode：Plan 上传 GitHub Artifact。

Restricted Mode：GitHub 只记录 `PLAN_READY`，Plan 留本地。

### 第二阶段：Execute

Home：

```powershell
agent approve TASK-20260928-001
```

CLI 触发：

```powershell
gh workflow run execute-task.yml `
  -f task_id=TASK-20260928-001 `
  -f target=office-pc
```

Office Harness 在执行前再次验证本地 runtime state：

```text
PlanReady / Approved
```

不能仅相信 GitHub 参数。

---

# Phase 16：Cancel

`agent cancel TASK-xxx`：

1. Control plane 记录 Cancel intent。
2. 如果 Job 尚未执行，使用 `gh run cancel`。
3. 如果 Codely 已在本地执行，Harness 创建 `CANCEL_REQUESTED` 标记。
4. Codely/Harness 在安全检查点停止。

禁止：

- 粗暴 kill Unity 写文件过程。
- 自动 reset 用户 repo。

取消后：

```text
CANCELLED
```

并保留 worktree 供检查。

---

# Phase 17：DSH 集成

所属阶段：第一阶段。先复用已有本地 Codely 命令原型验证 DSH 入口，再在 Core Harness 稳定后接入 Core 服务；必须在 GitHub remote task 开发前完成本地 DSH 验收。

原因：DSH 是 Developer Preview。

## 安装验证

```powershell
npx @deepseek-ai/dsh web
```

确认可以启动。

当前 DSH 官方支持 bundle/profile 组合。

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

确认能看到：

```text
dsh-mgsd-agent-harness
```

DSH plugin 只调用 Core Harness Service，不复制 FSM。

---

# Phase 18：DSH 第一版功能

所属阶段：第一阶段。本地任务入口、取消和以下状态视图应随本地流程一起验收，不依赖 GitHub：

```text
Task status view
Recent tasks
Plan status
Execution status
Review result
Node local state
```

暂时不做：

- DSH 自己调用模型。
- DSH 第二套 Agent Loop。
- 自动多 Agent 编排。

---

# Phase 19：Codely 子代理

Core 稳定后增加：

```text
.codely-cli/agents/repo-scout.toml
.codely-cli/agents/test-runner.toml
```

repo-scout：

- read/search only。
- max_turns 较小。
- 不修改文件。

测试 Agent：

- 只允许 test/build 相关工具。

不要创建一个“Codex Subagent”。

Codex 保持 Harness 外部专家角色。

---

# Phase 20：高级 Context Index

后续增加：

```text
.agent/index/files.json
.agent/index/classes.json
.agent/index/methods.json
.agent/index/asmdefs.json
.agent/index/scenes.json
.agent/index/packages.json
```

Unity/Tuanjie 可以额外索引：

- asmdef dependency。
- Scene 列表。
- Addressables group/catalog 基本信息。
- Shader/Material 引用摘要。

ContextBuilder 先索引查询，再给模型。

---

# Phase 21：多节点 Capability Scheduling

MVP 不做自动调度。

第一版：

```text
--target office-pc
```

稳定后加入：

```json
{
  "targetSelector": {
    "requiredTags": [
      "android",
      "hmi8295"
    ]
  }
}
```

控制层选择满足标签的 Runner。

再以后支持：

```text
TASK-200
├── TASK-200-A → office-pc
├── TASK-200-B → home-pc
└── TASK-200-C → gpu-node
```

但不要在 MVP 实现 DAG scheduler。

---

# 16. GitHub Workflow 建议

MVP 建议 3 个 workflow。

## 16.1 `plan-task.yml`

输入：

```text
task_id
target
```

执行：

```text
checkout control repo
→ local harness prepare
→ build context
→ risk policy
→ Codex Plan if required
→ PLAN_READY
→ upload non-sensitive artifact (optional)
```

## 16.2 `execute-task.yml`

输入：

```text
task_id
target
```

执行：

```text
verify plan approval
→ create/resume worktree
→ Codely execution
→ tests
→ finish execution
→ Codex Review if required
→ result
```

## 16.3 `cancel-task.yml`

输入：

```text
task_id
target
```

执行：

```text
mark cancel request
```

---

# 17. Office Node Windows 目录建议

```text
C:\AgentRunner\office\

C:\AgentHarness\
├── bin\
├── config\
│   └── node.json
└── logs\

D:\AgentWorkspaces\
├── HMI8295\
│   ├── TASK-...
│   └── TASK-...
└── MGSD\

D:\Projects\
├── HMI8295\
└── ...
```

Runner service user：

```text
AgentWorker
```

权限：

- 可以读目标 repo。
- 可以写 `D:\AgentWorkspaces`。
- 只授予任务真正需要的工具权限。

---

# 18. `.gitignore` 建议

Project Repo：

```gitignore
# Agent local runtime
.agent/runtime/
.agent/tmp/
.agent/locks/

# Local machine node config
.agent/node.local.json

# Credentials
.env
*.token
*.secret

# Do not ever commit auth stores
.codex-auth/
.codely-auth/
```

注意：真实 Codex/Codely 用户目录通常根本不在 Repo 中，不要尝试复制它们。

---

# 19. AGENTS.md 与 CODELY.md 分工

## AGENTS.md

只描述 Codex：

```text
Role: architecture planner / high-risk analyst / independent reviewer.

Default: read-only.

Use supplied context before broad exploration.
Do not implement during planning or review.
Do not modify files unless explicitly executing an approved Codex-only task.
```

## CODELY.md

只描述 Codely：

```text
Role: primary engineering executor.

For harness tasks, obey execution envelope.
Do not self-approve high-risk plans.
Do not expand scope.
Run validation.
```

共享内容：

```text
docs/agent/
```

不要两边复制同一份 Unity 规范。

---

# 20. 额度经济性策略

## 20.1 目标

最大程度减少 Codex allowance 消耗，避免在关键任务中途触发 5h/weekly 限额。

## 20.2 原则

### 本地工具优先

```text
rg > model search
git > model history analysis
script > model formatting
```

### Codely 执行优先

普通任务不调用 Codex。

### Codex 只解决“判断”

真正需要高级推理时调用。

### 一次 Codex Turn 尽量完整

不要：

```text
看看 repo
继续
再深入
继续
输出方案
```

而是预先构建 Context，然后一次要求完整 Plan。

### Review 输入精简

只传：

```text
Plan + diff + tests + execution report + necessary context
```

### 不做无限 Review

最多 2 轮。

---

# 21. 模型选型与经济性设置

本节区分开发 MGSD 时使用的 Codex 模型与 MGSD 运行时使用的 Codely 执行模型。选型建议不是自动路由规则，不改变人工审批、独立验证或各组件职责。

## 21.1 Codely 运行时设置

Codely 当前支持 Main/Flash/Multimodal/DefaultAgent 等模型槽位。

建议：

- 主 Agent 使用稳定的主模型。
- Flash 用于 JSON、压缩、内部辅助判断。
- repo-scout/test-runner 使用较轻量 Subagent model。

不要把所有子任务都交给最贵模型。

具体模型名根据你当前 Codely 账户可用模型决定，不在仓库硬编码商业模型版本。

<a id="mgsd-development-model-selection"></a>
## 21.2 开发 MGSD 时的 Codex 模型建议

针对 L2–L4 和后续远程拓展，建议默认使用 **GPT-6.1 Sol，推理强度 high** 完成实现与测试；不需要全程使用 GPT-6 Astra。明确的小改动或文档整理可使用 medium。以下是结合本项目风险与工作范围的工程建议，不是两种模型在 MGSD 上的实测性能结论。

| 工作 | 建议模型 | 使用方式 |
|---|---|---|
| L2：Core/FSM、SQLite 记录、审批、预算与恢复的维护 | GPT-6.1 Sol / high | 按已定义语义实现，补齐聚焦测试和回归验证。 |
| L3：worktree、Git 操作、上下文构建与执行报告 | GPT-6.1 Sol / high | 分小块实施，验证主工作区不变、失败不回退及资源限制。 |
| L4：规划/Review 接线、风险策略与执行限制 | GPT-6.1 Sol / high | 在明确权限、输入输出及验收条件后实现。 |
| 文档、配置整理及明确的小范围修复 | GPT-6.1 Sol / medium | 保留原有行为，执行对应检查。 |
| 跨进程归属、取消/恢复竞态、审批绕过、凭据与远程权限设计 | GPT-6 Astra | 用于有界的架构分析或独立审查；不默认承担所有实现。 |

出现以下情况时考虑升级到 Astra：设计存在多个相互冲突的约束；涉及难以恢复的数据或文件操作；跨进程竞态难以复现；补齐上下文与复现证据后仍无法确定根因。不要仅因第一次测试失败就切换模型；先排查环境、输入和失败证据。

建议工作顺序：Sol 完成小范围实现与验证 → 按风险决定是否由 Astra 集中审查 → 将具体问题交回 Sol 修复 → 重跑受影响检查。审查输入应包含批准的 Plan、diff、实际测试结果及必要上下文；模型结论不能替代人工审批或独立检查。

该分工仅指导开发者在 Codex 中选型，不会自动调用专家或切换模型。MGSD 运行时仍由 Codely 承担主要 Agent Loop，DSH 保持确定性 Harness；未来 Codex 专家调用须服从风险策略与预算，并使用部署配置，而非在 Core 中硬编码模型名。

建议依据：截至 2026-10-09，[OpenAI 模型选择指南](https://developers.openai.com/api/docs/guides/model-selection)将 Sol 定位为兼顾复杂任务、时间与成本的选择，将 Astra 用于要求更高的分析；[GPT-6.1 Sol 官方说明](https://developers.openai.com/api/docs/models/gpt-6.1-sol)建议通过自身任务比较两者。可用模型、推理设置及额度以当前账户为准；本计划不承诺账户可用性、固定速度或固定成本。

---

# 22. 日志与审计

每个 TASK 建议记录：

```text
.task events
context generation
plan request
approval
override attempt
execution begin
files changed
tests
review
review findings
completion
```

本地：

```text
.agent/reports/TASK-xxxx-execution.md
.agent/reports/TASK-xxxx-review.md
```

GitHub：

- Workflow log。
- Workflow run id。
- Result code。
- 可选 artifacts。

---

# 23. 清理 Worktree

任务完成后不要立即删除。

默认保留，例如 7 天。

确认合并/放弃后：

```powershell
cd D:\Projects\HMI8295

git worktree remove D:\AgentWorkspaces\HMI8295\TASK-0127

git branch -D agent/TASK-0127-office-pc
```

只有在明确确认不需要结果后删除 branch。

---

# 24. 两阶段完成定义

## 24.1 第一阶段：本地 DSH MVP

第一阶段必须满足以下全部条件；它们是第二阶段启动的前置条件：

```text
[ ] 本机通过受支持的 DSH profile 启动
[ ] 在 DSH 发起 Codely 任务并查看状态、输出和取消结果
[ ] DSH 不增加第二个模型驱动 Loop
[ ] 独立验证命令决定成功/失败，不只依赖 Codely 退出码或成功文本
[ ] Core FSM、TaskStore、Risk Policy 和 ContextBuilder 有验证
[ ] 工程任务创建独立 worktree；失败不回退到日常工作目录
[ ] Plan 与执行范围明确，人工审批不可由执行器绕过
[ ] HIGH_RISK 可按预算调用 Codex Plan/Review；Review 最多两轮
[ ] 执行、失败、超时、取消和卸载清理有回归覆盖
[ ] 本地任务状态和审计可持久保存，重启后的行为明确
[ ] DSH 本地 Task/Plan/Execution/Review 视图可用
[ ] 本地端到端验收、录制会话场景及使用文档完成
[ ] 凭证留在本机；不依赖 GitHub 完成任务
```

当前命令原型和真实冒烟测试只覆盖其中一部分，不能代替本节完整验收。

## 24.2 第二阶段：GitHub 远程任务 MVP

第二阶段复用第一阶段结果，并满足以下条件：

```text
[ ] GitHub Private Control Repo 建立
[ ] home-pc runner 在线
[ ] office-pc runner 在线
[ ] Home 可以 dispatch 到 Office
[ ] Office 可以根据 repoAlias 找本地工程
[ ] 每个任务创建独立 Git worktree
[ ] Core FSM 有单元测试
[ ] ContextBuilder 工作
[ ] Risk Policy 工作
[ ] HIGH_RISK 能调用 Codex Plan
[ ] Plan 阶段不修改业务代码
[ ] Human Approval Gate 存在
[ ] Codely 能读取 Execution Envelope
[ ] Codely 只在 worktree 修改
[ ] Tests 可执行
[ ] HIGH_RISK 能执行 Codex Review
[ ] Review 最多两轮
[ ] 凭证不上传 GitHub
[ ] 主工作目录不会被远程任务修改
```

---

# 25. MVP 明确不做

两个阶段的 MVP 均不包含以下能力。第一阶段额外排除 GitHub Control Repo、Runner、远程派发、跨节点审批/取消及数据上传；这些属于第二阶段，不是永久取消：

```text
复杂 Web Dashboard
DAG Scheduler
自动选择 10 个 Agent
Vector DB
全量 RAG
自动 PR Merge
自动发布
自动修改 production branch
远程任意 Shell
浏览器远控
DSH 第二个模型 Agent Loop
```

先让单任务闭环稳定。

---

# 26. 推荐实施顺序总清单

保留原 Phase 编号，按下面的交付顺序实施。Phase 4 的本地路径配置和 Phase 16 的本地取消属于第一阶段；其远程节点路由和跨节点取消属于第二阶段。

```text
第一阶段 A：先完成本机 DSH 使用
Phase 0   仅本机环境检查；不要求 GitHub CLI/账号或第二台机器
Phase 17  先完成已有 DSH → Codely 原型的入口、失败/取消/超时验收
Phase 4   本机项目路径及执行配置
Phase 5   Harness Core
Phase 6   FSM
Phase 7   Worktree Service
Phase 8   Context Builder
Phase 9   Codex Adapter
Phase 10  CODELY.md
Phase 11  Codely Harness Skill
Phase 16  本地取消与进程清理
Phase 17  Core-backed DSH Bundle Integration
Phase 18  DSH Local Task/Plan/Execution/Review UI
Phase 12  包含 DSH 入口的 Local E2E；通过第 24.1 节验收

第二阶段 B：GitHub remote task 扩展
Phase 0   GitHub CLI/账号及第二台机器环境检查
Phase 1   GitHub Control Repo
Phase 2   Self-hosted Runners
Phase 3   Dispatch Smoke Test
Phase 4   节点标签、repoAlias 路由配置
Phase 13  GitHub → Harness
Phase 14  agent send/status CLI
Phase 15  Approval Workflow
Phase 16  跨节点 Cancel
          远程状态接入现有 DSH 视图；通过第 24.2 节验收

MVP 后按需扩展
Phase 19  Codely Subagents
Phase 20  Advanced Context Index
Phase 21  Capability Scheduling
```

当前交付项未通过验收，不进入依赖它的交付项；第一阶段未通过第 24.1 节验收，不开始第二阶段。原 Phase 编号大小不再决定先后。

---

# 27. 交给 Codex 的实施方式

不要一次要求 Codely 或 Codex 实现全部 22 个 Phase（0–21）。按交接 checklist 选择一个可验收的交付项。

建议：

```text
Milestone A
第一阶段：本地 DSH → Codely 原型验收，补齐失败/超时/取消/清理及输出证据

Milestone B
第一阶段：Phase 4~8
Harness Core + FSM + Worktree + Context

Milestone C
第一阶段：Phase 9~12 + 本地 Phase 16 + Phase 17~18
Codex + Codely Protocol + Core-backed DSH + Local E2E

Milestone D
第二阶段：Phase 1~3 + 远程 Phase 4 + Phase 13~16
GitHub Remote Task；复用本地 Core 和 DSH
```

每个 milestone：

```text
Plan
→ 人工看 Plan
→ Implement
→ Test
→ Commit checkpoint
```

---

# 28. 可直接复制给 Codex 的第一阶段 Prompt

本节用于第一阶段的本地 Core 子里程碑，不代表第一阶段全部完成。先按交接 checklist 完成本地执行原型验收，随后实施本节，再使用第 30 节完成本地 DSH 集成，最后验收第 24.1 节。

```text
You are working in an existing Unity/Tuanjie Git repository.

We are building the local core of a distributed engineering agent harness.

Architecture decisions are already made. Do not redesign the top-level architecture.

FINAL ROLES

- Codely is the primary model-driven agent loop and code executor.
- Codex is a scarce expert used for high-risk planning, architecture analysis, escalation, and independent review.
- DeepSeek Harness (DSH) is a deterministic local harness/plugin runtime, not a second model-driven agent loop.
- GitHub Private Repo + GitHub Actions + self-hosted runners will later provide the distributed control plane.
- Every remote engineering task must execute in a dedicated Git worktree, never in the user's primary working tree.

CURRENT MILESTONE

Implement only the local Harness Core:

1. Core TypeScript project under tools/agent-harness.
2. Task schema and local runtime state.
3. Explicit finite state machine.
4. TaskStore.
5. ProcessRunner.
6. GitWorktreeService.
7. ContextBuilder using local deterministic tools.
8. Risk/Budget policy.
9. Planner/Reviewer interfaces.
10. CodexAdapter interface + testable CLI process wrapper, but do not perform real nested Codex calls during tests.
11. CLI commands required to exercise the local workflow.
12. Unit tests.

DO NOT IMPLEMENT YET

- GitHub Actions integration.
- Self-hosted runner logic.
- DSH bundle/plugin.
- Web UI.
- MCP.
- Vector DB / RAG.
- Multi-agent scheduler.
- Automatic PR merge.
- Remote arbitrary shell.

CORE ARCHITECTURE RULE

The Core Harness must have zero imports from DSH/Cordis.

DSH integration remains in Stage 1, after this Core sub-milestone and before any GitHub remote-task work. Keep it in a dedicated adapter because DSH is still in developer preview and may have breaking changes.

REPOSITORY SAFETY

Before any modification:

1. Run git status.
2. Report existing uncommitted user changes.
3. Do not reset, checkout, overwrite, clean, or delete user changes.
4. Do not auto-commit or auto-push.

TASK STATE MACHINE

Implement these states:

Created
Queued
Claimed
Preparing
Planning
PlanReady
Approved
Executing
Executed
Reviewing
ReviewFailed
Fixing
Completed
Failed
Interrupted
CancelRequested
Cancelled
NeedsHuman

All transitions must go through a central transition validator.

No code should directly assign arbitrary state values.

REVIEW POLICY

maxReviewCycles = 2.

After the second failed review, transition to NeedsHuman.

WORKTREE RULE

Remote task execution must use:

<workspaceRoot>/<repoAlias>/<taskId>

and a branch similar to:

agent/<taskId>-<nodeId>

If worktree creation fails, fail the task.
Never fall back to the user's primary checkout.

CONTEXT BUILDER

Build task context with local tools first:

- git status
- git log
- git diff
- git ls-files
- rg/search
- selected project knowledge

Do not introduce vector DB or embeddings in this milestone.

Context output:

.agent/context/<TASK-ID>.md

PLAN CONTRACT

The planner contract must contain:

Goal
Current Behavior
Root Cause
Proposed Design
Scope
Allowed Files
Forbidden Changes
Implementation Steps
Risks
Validation
Acceptance Criteria
Open Questions

CODEX POLICY

Codex is not the default executor.

Codex must not be used for:

- broad repository exploration
- simple file search
- basic log filtering
- formatting
- ordinary implementation

Design the CodexAdapter so that Planner/Reviewer calls can be mocked.

Do not invoke another live Codex process from inside this Codex session as part of tests.

PROCESS RUNNER

Must handle:

- executable + args array (avoid unsafe command string concatenation)
- cwd
- stdout
- stderr
- exit code
- timeout
- UTF-8
- Windows paths with spaces
- cancellation/error reporting

TESTS

At minimum test:

- valid/invalid FSM transitions
- max review cycles
- TaskStore serialization
- worktree command generation
- ContextBuilder boundaries
- ProcessRunner mocks
- CodexAdapter command/prompt generation

COMPLETION REPORT

When complete, report:

1. Files created/modified.
2. Architecture implemented.
3. Exact commands to build/test.
4. Exact CLI commands to smoke-test locally.
5. Anything intentionally deferred.
6. Any assumption that still needs user confirmation.

First inspect the repository and produce a short implementation plan. Then implement this milestone.
```

---

# 29. 第二阶段 Codex Prompt（GitHub 多端）

仅在第一阶段本地 DSH 完整通过第 24.1 节验收后使用；不能仅凭 Core CLI 或 Codely 冒烟测试通过就启动本节：

```text
Implement the distributed control-plane milestone for the existing agent harness.

The local Harness Core and DSH user workflow have passed Stage 1 acceptance. Reuse them; do not redesign or duplicate them.

GOAL

Allow a Home PC to dispatch an engineering task through a private GitHub control repository to an Office PC running a GitHub Actions self-hosted runner.

CONSTRAINTS

- GitHub is the control plane only.
- No inbound port is opened on Office PC.
- No arbitrary remote shell command task type.
- Task payload expresses engineering intent, repoAlias, target node, and policies.
- Repo alias is resolved to a real local path using node-local config that is never committed.
- Every task uses a Git worktree.
- Credentials remain on the node.
- Control repository must support restricted mode where source/diff/log content is not uploaded.

IMPLEMENT

1. Control repo task JSON schema.
2. Node config schema.
3. workflow_dispatch based plan/execute/cancel workflows.
4. Self-hosted runner label routing.
5. agent send command.
6. agent status command.
7. agent approve command.
8. agent cancel command.
9. Runner-side entry script calling the existing local Harness Core.
10. Standard vs Restricted data upload policy.
11. Tests/mocks for GitHub CLI invocation.
12. Setup documentation for home-pc and office-pc.

SECURITY

- Do not add pull_request execution workflows.
- Do not store runner registration tokens.
- Do not store Codex/Codely credentials.
- Do not upload company source by default.
- Do not modify the user's normal working tree.

DSH local integration already belongs to Stage 1. Add only the remote task/status projection needed for this milestone; do not defer local DSH usability until after GitHub integration.
```

---

# 30. 第一阶段 DSH 集成子里程碑 Prompt（DSH Adapter）

在本地 Core 稳定后、第二阶段 GitHub remote task 开发前使用。它与第 28 节共同组成第一阶段，不是第三阶段。

```text
Integrate the existing stable local Agent Harness Core into DeepSeek Harness (DSH).

This is part of Stage 1: local DSH usability. GitHub remote tasks are Stage 2 and must not be implemented here.

DSH is not the primary model-driven agent loop.
Codely remains the primary executor.
Codex remains an external scarce expert.

DSH responsibilities:

- expose task status
- expose plan/execution/review state
- expose local node status
- provide audit/event visualization
- wrap existing Core Harness services
- let the user start and cancel local tasks through DSH
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
```

---

# 31. 后续升级路线

MVP 稳定后：

```text
V1.1  Repo index / AST index
V1.2  Codely specialist subagents
V1.3  Unity MCP / Editor bridge
V1.4  Android/ADB capability node
V1.5  Perfetto processing agent
V1.6  Multi-node child tasks
V1.7  RAG knowledge retrieval
V1.8  GitHub → custom Task Hub migration if scale requires
```

迁移到自建 Hub 的触发条件：

- 节点数量明显增加。
- 需要实时 streaming。
- 需要复杂 DAG。
- 需要任务 lease/reassignment。
- GitHub Actions 延迟成为瓶颈。
- 公司政策不允许 GitHub.com。

在此之前不要过早自建服务器。

---

# 32. 最终设计原则速查

```text
1. Codely 是 Main Loop。
2. DSH 不是第二个 Main Loop。
3. Codex 是稀缺专家，不是默认执行器。
4. GitHub 是控制平面，不是远程 Shell。
5. Node 主动 outbound 连接，不开放入站端口。
6. Remote task 必须 worktree 隔离。
7. Human Approval 不能由执行 Agent 自己绕过。
8. Core Workflow 不依赖 DSH。
9. Context 先本地构建，再交模型。
10. Review 最多两轮。
11. 凭证留本机。
12. 公司数据是否上 GitHub 由安全模式控制。
13. MVP 不做复杂多 Agent 编排。
14. 每个 Phase 都必须有验收点。
15. 第一阶段先完成本地 DSH；验收通过后，第二阶段才开发 GitHub remote task。
```

---

# 33. 参考资料（实施时以当前官方文档为准）

- [DeepSeek Harness GitHub / Architecture / Bundle & Profile docs](https://github.com/deepseek-ai/deepseek-harness)

- [Codely CLI 文档](https://codely-docs.tuanjie.cn/)

- [OpenAI Codex 文档](https://developers.openai.com/)

- [Using Codex with your ChatGPT plan](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)

- [GitHub Actions Self-hosted Runner](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners)

- [GitHub Actions Self-hosted Runner Security](https://docs.github.com/en/actions/reference/security/secure-use)

---

# 34. 当前建议的下一步

当前先完成本地 DSH 使用，不创建 GitHub Control Repo，也不注册 Runner。具体已完成项和待办以[实施 checklist](MGSD_Implementation_Checklist.zh.md)为准。

实际下一步应当是：

```text
1. 阅读交接 checklist，检查当前分支和未提交改动，保留已有本地执行原型。
2. 从 checklist 的 L1 开始：本机 DSH 命令/浏览器验收及失败、超时、取消、清理回归。
3. 按 L2–L4 补齐本地 Core、worktree、上下文、审批和必要的 Codex 规划/Review。
4. 按 L5 完成 Core-backed DSH 集成和本地端到端验收。
5. 第一阶段通过第 24.1 节后，再创建 Control Repo、注册 Runner 并实施 GitHub remote task。
```

这是当前成本最低、风险最低、最容易调试的落地路径。
