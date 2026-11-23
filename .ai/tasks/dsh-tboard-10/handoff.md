---
schema_version: 1
task_id: dsh-tboard-10
state: DONE
active_agent: null
branch: codely_bridge
updated_at: "2026-11-23T03:37:02+00:00"
---

新建 Task，已核对工作树与 TBOARD-09 释放记录。当前 G3 由 Codex 单独写入。分支上保留 G2 的未提交实现；本轮从执行租约开始。参考机 NFR02 仍待补验，未发布 G2。

2026-11-23 11:23 上海，原有 Host 回归 24 项、共享 SQLite 双 Host 抢占与路径互斥回归 1 项通过。并行 SDK 的正式 Web 路径留到第三步验证。桌面 Codex 周剩余 61%，11 月 24 日 17:34:52 上海重置。

2026-11-23 11:28 上海。Host 回归 26 项通过。正式 Web、Chromium 和两个并行 SDK 的单场景通过，用隔离本地模型端点控制交错，三个不同 Session，授权领取一次，依赖等待人工接受，重启保留历史。桌面 Codex 周剩余 60%，11 月 24 日 17:34:52 上海重置。下一步完成权限与完整 Taskboard 回归。

2026-11-23T03:37:02+00:00 TBOARD-10 完成；单写权已释放。验收覆盖两套真实 SDK 同时运行、同 ID 的审批分流、只停止选定 Run、人工接受后仅领取一次，以及双 Run 的 Host 崩溃恢复。[实测及构建指纹](evidence/macos-parallel.json)和[验证命令](log.md)。

本地 codely_bridge，修改未提交、未推送。任务涉及 taskboard-controller、ui-taskboard、Web 测试、配置及服务目录和实施计划。分支原有 G2 及其他工作的修改均保留。长期机制已索引到 .ai/ARCHITECTURE.md；无需新增通用 WORKFLOW、Memory 或正式决策记录。参考机到位后按 [TBOARD-09 性能口径](../dsh-tboard-09/performance.md) 复跑 NFR02。桌面 get_usage_limits 的 Codex 10080 分钟窗口剩余 59%，2026-11-24 17:34:52 上海重置；本轮停止线为 20%。
