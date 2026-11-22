---
schema_version: 1
task_id: dsh-tboard-03
state: HANDOFF_READY
branch: codely_bridge
previous_agent: Codex
next_agent: Codex
updated_at: "2026-11-21T17:39:20Z"
---

# TBOARD-03 交接

[Taskboard 执行记录](../../../packages/api/taskboard-controller/src/execution.ts)已在同一 SQLite 数据域支持 `enqueue`、`cancelQueued` 和 `claimNext`。排队时保存确认过的输入、任务版本和 Session 引用。只有认领队首的 Host 取得租约代次。取消排队保留历史，原 Session 可继续恢复。已有数据库在缺少队列记录时以空队列打开。

入队同时保存原目录确认或固定基线的工作树方案。只有保存方案的队首才能取得租约。认领后，`prepareWorkspace` 读取已存方案并校验实际目录、分支与基线。早期缺少方案的排队 Run 保留原历史及取消入口，操作者可取消后重新确认并提交。

[目录准备验证](evidence/windows-workspace-plan.json)确认 Host 重启后按保存的基线创建隔离工作树，原目录被换成 junction 时拒绝启动准备。原有队列和取消记录的回放结果见 [SQLite 队列证据](evidence/windows-queue.json)。

`submitInput` 在发送前为 Run 写入投递意图。回执未入库时，重放仍显示待对账并保留原租约。回执确认后，后续调用返回原消息 ID。[Windows 真实 SDK 验证](evidence/windows-sdk-input.json)用本机确定性模型触发实际 `session/prompt`，在 SDK 接受后关闭 Taskboard 数据库。重开数据库后重放产生零次附加投递，夹具从绑定 Session 观察原回执并补写。控制器测试 16 项与认证 Web 冒烟 1 项通过。

按 [计划](plan.md)继续将队首认领、准备目录及 SDK 生命周期接入 Windows 正式调度，并从绑定 Session 自动对账结果未知的输入。macOS 首发组合的启用仍需 [TBOARD-04 的平台复验](../dsh-tboard-04/plan.md)，Windows 开发和联调继续进行。

Mac 接收本轮控制器、Web 测试、生成目录、实施清单及验证记录的步骤见 [跨设备检查点](../dsh-cross-device-handoff/handoff.md)。已有 Obsidian 布局属于本机工作区。Memory、Architecture 和 WORKFLOW 维持现有规则。

2026-11-22 01:39（上海），`get_usage_limits` 的 Codex 10080 分钟窗口剩余 86%，重置于 11 月 27 日 15:04（上海）。Codex 已释放写入权。定向检查及此前全仓文档检查结果见 [日志](log.md)。
