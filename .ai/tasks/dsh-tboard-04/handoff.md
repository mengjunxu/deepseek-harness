---
schema_version: 1
task_id: dsh-tboard-04
state: HANDOFF_READY
previous_agent: Codex
next_agent: receiver_pending_macos
branch: codely_bridge
updated_at: "2026-11-18T16:29:07Z"
---

# TBOARD-04 交接

首发沿用 [macOS G0 组合及可核实工具范围](platform.md)。同一 Host 可以通过 `recheckRunStop` 重新核对目标 Run 的 SDK 与工具进程退出证据，无需重复发信号。退出已确认时将 Run 标记为中断并释放对应租约。范围仍未知或 Host 已丢失进程句柄时保留租约。Taskboard 页面归 TBOARD-07，跨 Host 重启的进程对账归 TBOARD-08。

## 验证与工作区

Windows 上的 Taskboard Host 测试 12 项、认证 Web 冒烟 1 项、实际双 SDK 的未知范围场景、控制器类型检查与 Host 构建、定向 lint、双语配对均通过。Windows 双 SDK 场景验证目标退出、另一实例存活、强停和再次核对后仍持有原租约。退出确认后释放租约与重复核对只结算一次由 Host 测试验证。命令和失败重试见[日志](log.md)，被测源码、构建产物和双 SDK 结果见 [Windows 验证记录](evidence/recheck-windows.json)。全仓文档检查仍有失败。

本轮文件归属为 `packages/api/taskboard-controller`、Web 冒烟夹具、主实施计划 TBOARD-04 条目及本任务记录。提交前已核对 `codely_bridge` 的本地基线与实际远端分支一致。接收方须在 macOS 上核对包含本记录的提交。工作区另有 `docs/.obsidian/workspace.json` 及 `docs/tutorial/` 的修改。上个源码检查点记录见[跨设备交接](../dsh-cross-device-handoff/handoff.md)。

## 接续

在首发 macOS 检出相同源码并构建后，运行 `node .ai/tasks/dsh-tboard-04/evidence/stop.mjs --controlled-tool` 和 `node .ai/tasks/dsh-tboard-04/evidence/stop.mjs`。第一项验证真实固定工具退出后通过复核释放租约，第二项验证范围未知时保留租约。保存 macOS 平台、被测版本、观察结果后完成 TBOARD-04，再进入 TBOARD-03。

2026-11-19 00:29（上海），`get_usage_limits` 的 Codex 10080 分钟窗口剩余 41%，重置于 2026-11-20 14:51（上海）。Codex 已释放本任务写入权。Memory、Architecture 和 WORKFLOW 无需更新。
