---
schema_version: 1
task_id: dsh-tboard-05
state: DONE
active_agent: Codex
branch: codely_bridge
updated_at: "2026-11-22T12:52:10Z"
---

# TBOARD-05 检查点

Codex 取得本工作区单写权。TBOARD-03 实机验收已完成，原改动留在本地。先从 `session.event` 的绑定根 Session 加载稳定事件位置，将摘要保存到同一 Run。首次周余量 67%，11 月 24 日 17:34:52（上海）重置。

2026-11-22T12:33:55Z，首个步骤通过 19 项 Host 测试及 6 项认证 Web 集成。Task detail 保存绑定根 Session 的最大已提交事件位置，重复、乱序、异源和终止后通知不回退状态。运行时断流仅标记连接异常。周额度查询剩余 67%，11 月 24 日 17:34:53（上海）重置。下一步接入真实 SDK 审批与用户问题。无需更新 Architecture、Memory 或 WORKFLOW。

2026-11-22T12:42:40Z，已通过真实 Web 和独占 SDK 的交互集成。完成问题答复、错误选项与错误作用域拒绝、一次授权、独立拒绝及停止后拒绝迟到答复，仅一次放行写入文件。代码和文档仍在 `codely_bridge` 本地工作区。断流后的只读 Session 对账已通过类型检查，实际断流用例待运行。下一步先构建 Host 并运行 `node apps/web/tests/fixtures/taskboard-smoke.mjs --disconnect-sdk`。桌面 `get_usage_limits` 的 10080 分钟窗口剩余 66%，11 月 24 日 17:34:52（上海）重置。无需更新 Architecture、Memory 或 WORKFLOW。

2026-11-22T12:51:38Z，认证 Web 通过断流验收。SDK 将 Session 终止事件入库后故障退出，Host 从只读 Session 找回位置并保留租约，第二 Run 未收到输入。任务工具的独占 SDK 入口已经过认证 Web 与 Host 用例，正在复核最终构建。证据见 [macOS Web 验收](evidence/macos-web.json)。桌面 Codex 10080 分钟窗口剩余 66%，11 月 24 日 17:34:53（上海）重置。下一步按 TBOARD-06 实现交付和人工验收。无需更新 WORKFLOW。

2026-11-22T12:52:10Z，最终构建复核通过 9 项认证 Web 与 117 项定向测试。任务工具校验 SDK 根 Session、当前租约、写入版本与调用幂等性。SDK 断开后的 Run 仍待独立退出证明或后续恢复，不会因事件对账自动重启。任务代码仍在 `codely_bridge` 本地工作区。下一步由 Codex 接续 [TBOARD-06](../dsh-tboard-06/plan.md)。
