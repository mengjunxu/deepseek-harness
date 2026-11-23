---
schema_version: 1
task_id: dsh-tboard-09
state: BLOCKED
active_agent: null
branch: codely_bridge
updated_at: "2026-11-22T16:00:51Z"
---

# TBOARD-09 检查点

已核对 [TBOARD-08](../dsh-tboard-08/handoff.md) 和本地 Git。Codex 持有单写权，保留原有未提交修改。桌面 Codex 周剩余 64%。先测量 NFR02 的正式 Web 路径。当前环境无 DeepSeek API 密钥，真实模型链及 GIF 留在发布门槛。

2026-11-22T14:10:09Z，2,000 任务正式 Web 功能测量完成。正常连接走持久化提交后的 Remote 通知，断线后重新读取并订阅。首屏 P95 392 → 414 毫秒，最慢状态更新 1,381 → 116 毫秒。[测量和原始结果](performance.md)。桌面 Codex 周额度剩余 64%。接下来验证强制退出超时、目录保全和队列继续。

2026-11-22T14:19:07Z，强制停止超时、目录保留及队列继续已验证。已用正式 Web/SDK 复现并保存模型端点拒绝，显式重试创建关联新 Run。文档补丁的实际加载、回环绑定、未认证导出拒绝及凭据排除通过。Web 19 项、SDK/Host/SQLite 110 项及 keyless 快照通过。[验收矩阵](acceptance.md)与[发布检查](evidence/macos-release-checks.json)。全仓 doc-sync 初次 36/42 通过，已重生成配置目录并通过单项；其余失败来自既有历史文档、规划双语维护和跨设备证据。

桌面 Codex 10080 分钟窗口剩余 64%，11 月 24 日 17:34:52（上海）重置。未触发用户的 20% 停止线；当前 G2 的真实模型任务和 GIF 依赖已配置的 DeepSeek API 密钥，参考机性能待复测。TBOARD-10/11 依赖 G2 通过及各自范围确认。工作保存在本地 codely_bridge，无提交或推送，无活动写入者。接续时以已配置凭据的本机环境运行真实编码、失败重试、交付、退回和再验收，并存证。WORKFLOW 无需更新。

2026-11-22T15:50:10Z，用户授权使用已配置的 OpenAI gpt-5.4-mini 接续真实编码验收。已核对 codely_bridge、本地未提交状态与旧写入者，Codex 持有本轮单写权。桌面 Codex 周剩余 64%。在独立 Git 目录、SQLite 与浏览器中运行，首轮注入凭据引用缺失后恢复原路由，覆盖代码、交付、退回和再次验收。

2026-11-22T16:00:51Z，真实 OpenAI gpt-5.4-mini 编码链通过。首轮记录缺失凭据故障和输入回执，显式重试与退回后修改各建立新的关联 Run。持续保留首版交付，第二版仅新增示例文件。验收前核对解析器和测试文件哈希未变、三项 Node 测试和十二个独立用例通过。两条操作者决定在 Web Host 重启后仍可读取。实际浏览器演示与构建指纹见[验收证据](evidence/macos-openai-coding.json)。

桌面 Codex 周剩余 64%，2026-11-24 17:34:52（上海）重置。真实模型步骤已完成，G2 参考机性能仍待复测。未提交、未推送，当前无活动写入者。WORKFLOW、长期架构和 Memory 无需变更。

2026-11-23，用户确认将 8 核、16 GB Mac 的 NFR02 复测留待参考机到位后执行，允许 [TBOARD-10](../dsh-tboard-10/handoff.md) 先行。G2 保持待验。
