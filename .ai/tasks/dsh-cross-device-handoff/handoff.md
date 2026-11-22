---
schema_version: 1
task_id: dsh-cross-device-handoff
state: HANDOFF_READY
branch: codely_bridge
previous_agent: Codex
next_agent: macos_receiver_pending
updated_at: "2026-11-22T01:33:02Z"
---

# 跨设备接续

需求依据为 [主 PRD](../../../docs/myPlan/DSH_PRD_vNext_4_2026-10-27.md)和 [Taskboard PRD](../../../docs/myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md)。实施状态以 [Plan 第 12.10 节](../../../docs/workflows/DSH_IMPLEMENTATION_PLAN.md#1210-taskboard-增量-checklist)为准。

TBOARD-00、01、02 已完成。TBOARD-03 已在 Windows 验证 SQLite 串行队列、重启后的目录复核和真实 SDK 输入防重。SDK 接受输入后回执写入失败，重开数据库并重放时只产生一次本地模型请求。夹具从绑定 Session 核对原回执并补写。下一步接入正式调度、自动对账及重试或继续。见 [TBOARD-03 交接](../dsh-tboard-03/handoff.md)。

TBOARD-04 已在 Windows 实测固定 PowerShell 进程退出后释放租约、范围未知或观察超时时保留租约、无效审批阻止输入。首发沿用 macOS 的 [G0 平台范围](../dsh-tboard-04/platform.md)，Mac 实机需要复跑固定工具和范围未知用例。见 [TBOARD-04 交接](../dsh-tboard-04/handoff.md)。

已确认使用现有 DSH Web 页面，复用 Host 与认证；每个 Run 持有独占 SDK runtime。更换目录新建 Run 和 Session，保留旧记录，仅显式选择的材料进入新会话。defaultDshHome 的精确 Host 导出例外已获用户批准，理由归 [原决策记录](../../../.agents/notes/implemented/process/2026-08-26-published-dependency-faces.md)。

## 当前验证

当前源码在 Windows 通过 16 项 Host 测试、认证 Web 冒烟、真实 SDK 回执探针、控制器类型与构建、定向 lint、双语配对和 Cordis 目录检查。[Windows 验证记录](../dsh-tboard-03/evidence/windows-sdk-input.json)记录被测文件与产物摘要。全仓 `doc-sync` 最近一次运行仍有失败，见 [TBOARD-03 日志](../dsh-tboard-03/log.md)。

旧检查点曾在 macOS arm64 的独立检出中通过冻结依赖安装、完整构建和 Web 冒烟。[历史验证记录](evidence/verification.json)只对应当时版本。新检查点的 macOS 接收、构建与平台复验均待执行。

本次提交范围为 TBOARD-03 与 TBOARD-04 的代码、测试、证据和交接。Obsidian 布局、凭证、本机运行数据及构建产物均留在本机。包含本记录的 Git 提交由发送方最终报告，远端同步及接收待确认。架构、Memory 与共享工作流维持现有规则。

## Mac 接手步骤

在目标仓库读取 `AGENTS.md` 和 `.ai/WORKFLOW.md`，核对现有工作区。如果远端已经同步本次检查点，在 `codely_bridge` 上用以下命令快进并核对提交。

```sh
git fetch origin codely_bridge
git switch codely_bridge
git merge --ff-only origin/codely_bridge
git rev-parse HEAD
```

首次检出可用以下命令，先取得远端分支基线。

```sh
git clone --branch codely_bridge --single-branch git@github.com:mengjunxu/deepseek-harness.git
cd deepseek-harness
```

如果检查点由本地 `dsh-taskboard-mac.bundle` 传输，将 bundle 复制到 Mac 后，用以下命令核对基线并快进。本地已有改动或分支分叉时，先保留现场并核对差异。

```sh
git bundle verify /path/to/dsh-taskboard-mac.bundle
git switch codely_bridge
git fetch /path/to/dsh-taskboard-mac.bundle refs/heads/codely_bridge
git merge --ff-only FETCH_HEAD
git rev-parse HEAD
```

核对提交与发送方报告一致后，使用 `package.json` 声明的 Node 版本范围和 pnpm 版本安装及构建。以下探针使用本机模型夹具。

```sh
pnpm install --frozen-lockfile
pnpm run build
node .ai/tasks/dsh-tboard-04/evidence/stop.mjs --controlled-tool
node .ai/tasks/dsh-tboard-04/evidence/stop.mjs
node .ai/tasks/dsh-tboard-03/evidence/submit-input.mjs
```

核对写入权并查询实时周额度后登记接手。将 Mac 实测版本、进程退出结果和租约状态写入 TBOARD-04。之后从 [TBOARD-03 计划中的正式调度步骤](../dsh-tboard-03/plan.md)继续。两项 Mac 停止探针分别要求确认目标工具退出后释放租约，以及范围未知时保留原租约。
