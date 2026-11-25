---
schema_version: 1
task_id: dsh-p1-custom-project-scripts
state: HANDOFF_READY
active_agent: null
previous_agent: Codex
branch: codely_bridge
tested_code_commit: null
updated_at: "2026-11-24T15:26:55+08:00"
---

# P1-10 自定义项目脚本

源码构建与独立安装的 macOS Web Host 均验证两种脚本。SDK 执行 `npm run verify:notes` 退出 17，操作者须填写理由才能接受；`pnpm run verify:notes` 退出 0 后可人工接受。备份恢复保留检查和人工决定。替换包管理器会被拒绝，外发审查摘要保留结果并隐藏自定义脚本名。模型端点使用本地夹具。

34 项 Host 测试、4 项 Web 浏览器回归、定向 lint、配置目录和四组双语文档配对检查通过。全仓文档仍有五项既有失败，详见[验证记录](log.md)。正式构建、产物哈希和两个独立安装探针的输出见[本机证据](evidence/local.json)。

本任务修改涵盖控制器、SDK、工作台、Web 验收夹具、发布验收入口、配置目录与文档。本地分支与上次推送点一致，修改在工作树中，未提交或推送。Codex 已释放本任务写入权。下一项不依赖设备的计划候选为 P1-12 里程碑工作流。TBOARD-11 设备、G2 参考机和草稿 PR 仍待验。无需修改共享 Memory、WORKFLOW 或架构决策。

用户已取消临时 20% 停止线。2026-11-24T15:26:55+08:00 桌面 get_usage_limits 七天窗口剩余 20%，17:34:52 重置，后续按共享 WORKFLOW 核对。
