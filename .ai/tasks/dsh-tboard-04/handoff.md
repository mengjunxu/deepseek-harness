---
schema_version: 1
task_id: dsh-tboard-04
state: DONE
previous_agent: Codex
branch: codely_bridge
updated_at: "2026-11-22T01:49:32Z"
---

# TBOARD-04 交接

首发沿用 [macOS G0 组合及可核实工具范围](platform.md)。同一 Host 可以通过 `recheckRunStop` 重新核对目标 Run 的 SDK 与工具进程退出证据，无需重复发信号。退出已确认时将 Run 标记为中断并释放对应租约。范围仍未知或 Host 已丢失进程句柄时保留租约。Taskboard 页面归 TBOARD-07，跨 Host 重启的进程对账归 TBOARD-08。

## 验证与工作区

2026-11-21 的 [Windows PC 实测](evidence/windows-pc-acceptance.json)已通过。固定 PowerShell 进程与目标 SDK 均退出，复核后释放对应租约，重复复核仅记录一次中断，另一 SDK 继续运行。范围未知时保留原租约。无效审批配置使 SDK 退出，模型请求与工作目录写入均为零。当天复跑的 12 项 Host 测试和 1 项认证 Web 冒烟通过。命令与首次运行诊断见[日志](log.md)。

补测显式强停场景。夹具模拟正常停止无法送达，Host 对仍存活的目标 SDK 调用关闭。目标退出、另一 SDK 存活。进程范围观察超时后，任务详情显示停止未确认，目录和原租约仍然保留，迟到的空范围结果被忽略。该场景真实启动两个 SDK，停止请求故障及观察超时由夹具控制。

测试夹具、证据和任务记录随 [跨设备检查点](../dsh-cross-device-handoff/handoff.md)移交。控制器源码和构建产物的前一轮证据见 [Windows 验证记录](evidence/recheck-windows.json)。

## macOS 验收

固定 Bash 工具和目标 SDK 退出后，复核释放对应租约，另一 SDK 存活。范围未知及强停观察超时仍保留原租约与目录。证据覆盖固定进程和显式未知范围。[macOS 验证记录](../dsh-cross-device-handoff/evidence/macos-receipt.json)。

2026-11-22T01:49:32Z，`get_usage_limits` 的 Codex 10080 分钟窗口剩余 68%，11 月 24 日 17:34:52（上海）重置。 TBOARD-04 完成。后续正式调度见 [TBOARD-03](../dsh-tboard-03/handoff.md)。 本步无需更新 Architecture、Memory 或 WORKFLOW。
