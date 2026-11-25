---
schema_version: 1
task_id: dsh-p1-native-executor-selection
state: HANDOFF_READY
active_agent: null
previous_agent: Codex
branch: codely_bridge
tested_code_commit: null
updated_at: "2026-11-24T16:21:06+08:00"
---

# P1-07/12 按 Run 选择原生执行器

工作台在启动窗口列出部署启用的 Codex 和 Codely，并把所选执行器、SDK 路线、工作区、材料和一次性授权保存到 Run。默认 SDK、原生 Codex App Server、Codely ACP 共用 Taskboard 的单次输入、租约和人工验收。原生执行器使用全新会话；ACP 配置覆盖工作目录时拒绝启动。本步使用本地回环模型，首次交付停在待验收。

在 macOS 源码构建和独立安装中，两种执行器都完成浏览器选择、有效交付、停止运行中的原生调用、释放租约、继续队列、拒绝格式错误的报告及缺失适配器。测试从新的 SQLite 数据库恢复原授权，拒绝改写执行器的备份；默认 SDK 模型请求数为零。Codex 为打包适配器固定的 0.153.4，Codely 为本机已登录的 1.0.0-nightly.53。此次工作没有向真实用户任务提交人工决定。

修改位置包括 Taskboard 控制器与 SDK 插件、Run 启动和历史页面、Subagent Provider 工作目录声明、ACP/Codex 适配器、SDK 快照、Web 验收和发布验证器。命令、结果和制品摘要见[本机证据](evidence/local.json)。35 项 Host、73 项 ACP、2 项定向 Web、2 项 SDK 快照和 3 项快照语料检查通过。并行构建期间一个已有 Git diff 测试曾超过 5 秒，隔离重跑整个 Host 测试文件按原限时通过。doc-sync 37/42，既有文档类型示例、链接、翻译配对、换行和仓库引用仍有失败。

本机分支与本地远端跟踪引用的提交差为零。本步和前两步 P1-10/P1-12 的修改留在工作树中，尚未提交或推送。操作约定已记入对应 README、主实施计划和工程进度。继续沿用 SDK 所有权和人工验收决策，本步无新增 Architecture 或 Memory 条目。

下一项可在当前机器核验原生文件修改、工具权限拒绝和交付差异在 Run 历史中的对应关系。原生工具活动明细、原生会话续接能力尚待验证。TBOARD-11 跨设备恢复、G2 参考机和草稿 PR 继续按用户安排保留。

2026-11-24T16:21:06+08:00 桌面七天窗口剩余 13%，北京时间 17:34:53 重置。Codex 已释放本任务写入权。
