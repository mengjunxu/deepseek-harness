# 执行记录

2026-11-22T13:41:36Z，接续 TBOARD-07。核对 AC13、AC17、AC18，先完成可重启的 macOS 进程范围证明和同 Run Host 所有权。

2026-11-22T13:46:17Z，正式 Web Host 崩溃验收通过。Host 和 SDK 根进程退出时，脱离进程组的已知工具子进程仍存活。重启后保留租约且第二条没有输入尝试，子进程退出后队列自动继续，原输入未重发。[验收证据](evidence/macos-host-crash.json)。周剩余 65%。接下来对账尚未保存的原 Session 输入回执。

2026-11-22T13:53:27Z，15 项认证 Web 测试通过。真实 SDK 接纳回执丢失时从原 Session 恢复，旧会话内完全相同的历史提示不会匹配新输入。未确认尝试保留并在界面提示。验证后未留 SDK launchd 任务。[验收证据](evidence/macos-session-restart.json)。周额度剩余 65%，继续版本化备份与恢复。

2026-11-22T14:01:20Z，正式 Web 备份下载与恢复通过。损坏、不兼容版本、重复 ID 和非空目的库均拒绝。保留任务、交付与验收；标出缺失 Session，旧排队请求仅恢复为已取消记录。28 项 Host/存储测试通过。[验收证据](evidence/macos-backup.json)。周额度剩余 65%，继续兼容 Session 与升级验证。

2026-11-22T14:06:00Z，TBOARD-08 完成。16 项真实 Web、109 项 SDK/Host/SQLite 测试和 Taskboard SDK 快照回放通过。未来 Session 版本拒绝接入且文件原样保留；补回兼容 Session 后，正式 SDK 只接纳一次显式的新输入。[最终证据](evidence/macos-g2-recovery.json)。桌面 Codex 10080 分钟窗口剩余 64%，11 月 24 日 17:34:52（上海）重置。架构和 Memory 已同步，WORKFLOW 无需变更。本地未提交或推送，接续 [TBOARD-09](../dsh-tboard-09/plan.md)。
