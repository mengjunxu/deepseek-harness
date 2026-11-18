---
schema_version: 1
task_id: dsh-cross-device-handoff
state: IN_PROGRESS
branch: codely_bridge
writer: Codex
---

# 跨设备接续

需求依据为 [主 PRD](../../../docs/myPlan/DSH_PRD_vNext_4_2026-10-27.md)和 [Taskboard PRD](../../../docs/myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md)。实施状态以 [Plan 第 12.10 节](../../../docs/workflows/DSH_IMPLEMENTATION_PLAN.md#1210-taskboard-增量-checklist)为准。

TBOARD-00、01、02 完成。TBOARD-04 已有目录检查、worktree、定向停止、未确认保留租约和权限配置失败时阻止输入的验证。任意工具的完整强停平台与适用范围仍待确认，见 [TBOARD-04 交接](../dsh-tboard-04/handoff.md)及[平台选项](../dsh-tboard-04/platform.md)。TBOARD-03 调度、05 交互、06 验收、07 UI、08 恢复、09 发布验收仍待推进。完整计划尚未完成。

已确认使用现有 DSH Web 页面，复用 Host 与认证；每个 Run 持有独占 SDK runtime。更换目录新建 Run 和 Session，保留旧记录，仅显式选择的材料进入新会话。defaultDshHome 的精确 Host 导出例外已获用户批准，理由归 [原决策记录](../../../.agents/notes/implemented/process/2026-08-26-published-dependency-faces.md)。

## 当前验证

当前源码完整构建通过。受影响的 39 个 Vitest 文件有 1242 项通过；Python SDK client 与 intent routing 有 38 项通过。本次修正 Taskboard 浏览器类型入口、发布权限补丁清单、Web 测试 SQLite 配置与原子存储回放结果。后续结果见 [执行日志](log.md)。本检查点提交后还要验证独立检出的安装和构建，以及远端同步。

全仓 doc-sync 有四类既有失败，涉及示例类型、Markdown 链接、双语配对和段落换行。凭证和本机运行数据不随代码移交。旧阶段证据中的文件哈希记录当时版本，不能直接用于断言最新源码相等。184 个尾随空白文件已规范化，原始字节保存在 [归档](evidence/original-whitespace-files.tar.gz)，对应原始及规范化哈希见 [映射](evidence/whitespace-normalization.json)。

## 接收机器

在目标仓库先读取 AGENTS.md 和 .ai/WORKFLOW.md，核对现有工作区。已有 codely_bridge 分支时执行以下命令。

```sh
git fetch origin codely_bridge
git switch codely_bridge
git pull --ff-only origin codely_bridge
git rev-parse HEAD
```

第一次克隆可用以下命令。

```sh
git clone --branch codely_bridge --single-branch git@github.com:mengjunxu/deepseek-harness.git
cd deepseek-harness
```

使用满足 package.json engines 的 Node 和声明的 pnpm 版本，安装与构建。

```sh
pnpm install --frozen-lockfile
pnpm run build
```

核对 HEAD 与发送方最终报告的提交一致后，重新检查周剩余额度，记录新的单写入者。从 TBOARD-04 未完成项接续。现有停止证据来自 macOS arm64，Linux/Windows 须实测相应平台。完整工具强停的环境选择仍待用户决定。
