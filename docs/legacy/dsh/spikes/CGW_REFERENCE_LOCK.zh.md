# 外部参考源码锁定

[English](CGW_REFERENCE_LOCK.md) | 中文

## Scope and evidence

2026-10-28 静态源码审阅；两个仓库均位于临时参考目录中的本地只读检出。git ls-remote 的远端 HEAD 与本地检出一致。未运行参考应用、安装脚本、账户流程或浏览器自动化。下列不可变源码链接锁定版本，维护正文不保存裸提交标识。两个根 LICENSE 均声明 MIT；复制前仍需核对版权声明与依赖许可。

## Selected modules

| Reference / locked source | Observed entry | Reuse / limits | DSH work |
|---|---|---|---|
| [codex-chatgpt-web tree](https://github.com/miuuyy/codex-chatgpt-web/tree/cfeaf04bc7f54cea29e1ff2adbcad63bd038b119) | src/adapters/chatgpt-web/conversation-key.ts: chatGptConversationKey, retainedConversationResumeRequest | 会话键与保留上下文检查可供绑定设计借鉴；Codex 请求身份需映射到 DSH Session/ContextEpoch，不能直接复制为权威 | VN4-06/08；CGW-04/10/11 |
| [turn broker](https://github.com/miuuyy/codex-chatgpt-web/blob/cfeaf04bc7f54cea29e1ff2adbcad63bd038b119/src/adapters/chatgpt-web/turn-broker.ts) | TurnBroker; owner_completion_fence_begin/commit; retirement | 请求租约与单调完成版本可供工具终结设计借鉴；DSH 自行认证调用者/作用域并拥有撤销，不信任模型自报 ID | VN4-07/10；CGW-02/08/09 |
| [turn execution](https://github.com/miuuyy/codex-chatgpt-web/blob/cfeaf04bc7f54cea29e1ff2adbcad63bd038b119/src/adapters/chatgpt-web/turn-execution.ts) | ChatGptTurnSession, ChatGptTurnSessions, chatGptTurnRetryKey | 区分逻辑执行、物理清理与能力撤销；不代表 DSH TurnAttempt 已持久化或账号已授权 | VN4-06/07；CGW-07/08/10 |
| [ChatToHarness task store](https://github.com/DJ-Huang/ChatToHarness/blob/d2a5c6caaca320994c6ea5d42a8f2a6e4a3c53df/app/task-store.cjs) | TaskStore.start, request, existing | 项目/幂等键和载荷指纹拒绝冲突重发；限时查询返回原 ID。复用语义，不再建 JSON Task Store | VN4-07/10；P1-03、P3-07/08 |
| [task worker](https://github.com/DJ-Huang/ChatToHarness/blob/d2a5c6caaca320994c6ea5d42a8f2a6e4a3c53df/app/task-worker.cjs) | main; durable claim and saved state | 崩溃后保留领取记录可借鉴以免重复执行；不提供跨机器 fencing，也不证明可恢复执行 | VN4-07/11；T17/25 |
| [MCP gateway](https://github.com/DJ-Huang/ChatToHarness/blob/d2a5c6caaca320994c6ea5d42a8f2a6e4a3c53df/app/mcp-gateway.cjs) | McpGateway; MCP Server handlers | 工具传输与持久任务指引可供可选入站 Gateway 借鉴；不取代外部 Agent 执行，未经 DSH 授权审查不照搬指令 | VN4-10；T21/22/24/27 |

## Unverified scope

其他 CGW-01–22 主张仍为输入研究目标，未独立审计为可用能力：浏览器提交与模型身份、附件/上下文预算、生产诊断/Drain、打包升级、多 Agent 和全局 Codex 注入均未实测。禁止将全局 Codex 配置注入作为默认集成。未证明活动 Codex Native Host 存在。公开源码不代表 Web 使用许可或额度授权。实施前按锁定版本复核移动路径；更广参考测试属于另行授权阶段。
