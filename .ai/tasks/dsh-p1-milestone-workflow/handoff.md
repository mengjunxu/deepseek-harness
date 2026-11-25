---
schema_version: 1
task_id: dsh-p1-milestone-workflow
state: HANDOFF_READY
active_agent: null
previous_agent: Codex
branch: codely_bridge
tested_code_commit: null
updated_at: "2026-11-24T15:40:21+08:00"
---

# P1-12 里程碑工作流

工作台和团队编辑支持有序阶段目标。每次 Run 保存版本化计划、当前阶段及验收标准。接受中间阶段进入待办，下一阶段需再次启动；退回后可重做本阶段。最终交付同时覆盖最后阶段和任务整体验收条件。重新打开或修改需求版本会从第一阶段开始。

源码与 macOS 独立安装均验证 1 → 1 → 2 三次 Run 和退回、接受、接受三次人工决定。Host 重启保留记录，在新数据库中分别恢复了中间进度和最终结果。恢复拒绝跳过阶段的 Run 和提前标为完成的任务。测试使用本地模型服务。35 项 Host 测试、4 项定向 Web 测试、2 项 SDK 快照及 3 项快照语料检查通过。[命令与产物](evidence/local.json)。

本地修改覆盖工作台服务、SDK 输入与读取工具、操作者与团队页面、测试快照、发布验收和中英文说明。与上步 P1-10 的修改保存在同一工作树中，本步未提交、未推送。doc-sync 37/42；历史文档类型示例、链接、翻译配对、Markdown 换行和仓库引用五项仍失败。

P1-12 的通用执行器选择仍待接入。下一步先核对 P1-07 已验证的原生适配器与 Taskboard 当前 SDK 派发入口，再绑定按 Run 保存的执行器选择与授权。设备验收、G2 参考机和草稿 PR 按原安排。Codex 已释放本任务写入权；无需改动共享 WORKFLOW 或架构决策，操作约定已记入控制器与客户端 README。

2026-11-24T15:40:21+08:00 桌面 get_usage_limits 七天窗口剩余 18%，北京时间 17:34:52 重置，仓库停止线为 10%。
