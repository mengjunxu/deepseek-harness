---
schema_version: 1
task_id: dsh-tboard-03
status: DONE
---

# 手动启动与串行队列

落实专题 FR05、FR08 和 AC02、AC04、AC11、AC17。操作者提交已确认的启动请求后，Web Host 保存 Run 与输入快照。等待中的 Run 可以取消。取得唯一执行槽后才准备工作目录、启动独占 SDK 和投递输入。重试与继续均新建 Run，并保留前序记录。

依赖 [TBOARD-02 数据层](../dsh-tboard-02/handoff.md)和 [TBOARD-04 停止隔离](../dsh-tboard-04/handoff.md)。Windows 与 macOS 已验证 SQLite 队列、目录复核和 SDK 输入回执。macOS 的认证 Web Host 已通过可选调度、同目录恢复和换目录新建会话验收。macOS 正式路径使用独立 launchd resource coalition。真实 Web 验收验证脱离原进程组的工具后代退出后才释放租约和继续队列。[证据](evidence/macos-launchd-scope.json)。
