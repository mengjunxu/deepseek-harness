---
schema_version: 1
task_id: dsh-tboard-03
state: DONE
branch: codely_bridge
previous_agent: Codex
next_agent: Codex
updated_at: "2026-11-22T12:28:45Z"
---

# TBOARD-03 交接

macOS 已接收 Windows 检查点并完成 TBOARD-04 平台复验。在认证 Web Host 接入 `startRun`、`cancelQueuedRun` 及可显式启用的串行 SDK 调度。SQLite 提交 Run 和确认输入后分配租约，Host 复核路线和目录，再完成 SDK 权限握手与投递。权限失败和目录变更均无模型调用。[macOS 验证](evidence/macos-web-acceptance.json)。

输入写库失败时重存实际 SDK 回执。回执在传输中丢失时，在同一 Host 从绑定 Session 核对原消息 ID。停止确认后到达的回执写入原 Run 历史。原目录继续用新 Run 复用原 Session，换目录使用新 Session 与显式材料。恢复会校验保存的 cwd、空收件队列及目录确认，缺失 Session 的恢复失败留在原 Run 历史中。跨 Host 启动与退出对账归 TBOARD-08。

macOS 正式 SDK 启动时通过 launchd 分配一次性 job，中继核验套接字对端，Host 绑定内核资源 coalition 后才向 SDK 传递环境与输入。真实 Bash 后代脱离原进程组，SDK 根退出后下一项仍等候。活动成员归零后 Host 卸载 job、释放租约并启动队首。观察失败或超时时保留租约。本轮正式验证没有测试范围观察器。[原生与 Web 验收](evidence/macos-launchd-scope.json)。

针对性验证通过。全仓 `doc-sync` 为 37 PASS / 5 FAIL，现存失败涉及旧文档示例、链接、双语配对、换行及历史验证记录中的提交号。版本和命令见 [最终验收](evidence/macos-web-acceptance.json)与[日志](log.md)。

2026-11-22T12:28:45Z，Codex 10080 分钟窗口剩余 67%，11 月 24 日 17:34:52（上海）重置。TBOARD-03 完成并释放任务写入权，下一项为 [TBOARD-05](../dsh-tboard-05/plan.md)。改动与验收证据保留在本地工作区。Architecture 和 Memory 已补充 SDK 范围索引。WORKFLOW 无需更新。
