---
schema_version: 1
task_id: dsh-siwc-ui
title: "DSH UI 的 SIWC 登录与对话验证"
status: IN_PROGRESS
created_at: "2026-10-23T02:07:24+08:00"
updated_at: "2026-10-26T02:27:41+08:00"
---

# Goal

从 DSH 设置页面完成 SIWC 授权，选择账户模型并完成真实对话；作为显式启用的实验插件实现，不修改 agent-loop。

## Scope

- 用户明确要求验证 UI 接入，授权本任务先于其余 P0 调研开展；既有 P0-03 API Key 状态不变。
- 复用 authorization、credentials、llm、Remote 和设置页扩展，独立实验插件承载集成。
- 支持登录、取消、重新授权、刷新、撤销与安全状态；凭据不进入 Client 或 Session。
- 仅声明文本输入能力；通过 pi-ai 复用请求/历史/流翻译，不复制协议解析器。
- 定向测试、真实 UI/model 验证、录制本地 GIF，更新文档与 Checkpoint；不 Push、不创建 PR。

## Acceptance criteria

- [ ] UI 可发起/取消授权并显示账户和订阅状态；重启后凭据可复用。
- [ ] 模型目录来自账户，普通 DSH 会话可完成真实 SIWC 流式回复。
- [ ] 错误、取消、刷新、撤销及卸载有定向测试，秘密不跨 Remote。
- [ ] 有真实 UI 验证证据与文档，未验证项如实记录。

## Ownership

Codex 为本 Workspace 唯一写入者；此前用户已确认 Codely 停止，授权在本会话持续有效。保留所有既有未提交文件。

## Current checkpoint

2026-10-26（目录限流）：截图确认 `/v1/models` 429 `Rate limit exceeded`。移除每次推理元数据解析对目录的查询和成员校验，遵循 LlmAdapter 的目录仅用于发现原则；推理使用选定模型 ID，由 Responses 校验权限。目录 429 回归修复前失败、修复后通过。19 定向测试及类型、lint、配对、Host 构建通过；真实重启重试待验收。

2026-10-26：用户报告有流式文字后缺少终止事件。只读 Session 核对发现前两轮成功，第三轮约 120.8 秒后以 ABORTED 结束，与默认整轮期限一致。默认 requestTimeoutMs 调整为 600000，期限触发明确报告 TIMEOUT。19 项定向测试通过，Host 插件已重建；真实长回复重试待验收。

2026-10-26：用户报告 ChatGPT Usage 仍有额度但 DSH 提示用尽。本地两条 turn/end 记录仅保存 `ChatGPT request failed (HTTP 429)` / QUOTA，无法还原原始服务端错误。已修复账户 HTTP 429 与流内额度查询不可用的分类，保留请求诊断并完成 16 项定向测试；真实原因待重启重试确认。

2026-10-25：用户报告真实请求被 `tools[0].description` 缺失拒绝。Codex 在本任务持续写入权下修复 SIWC 命名空间描述，补充实际 HTTP 请求回归断言并重建 Host 插件。用户的 `.codely-cli/settings.json`、`docs/.obsidian/workspace.json` 修改保留。真实重试验收仍待完成。

实验插件已有本地检查点提交，后续修复未提交。本次审计的真实 Session 有三个 completed 轮次，前序 19 项定向测试通过；系统性真实长回复、Loader/Session 快照、重启复用、完整 UI/GIF 验收尚缺。本任务保持 IN_PROGRESS，对应合并计划 P1-05 Partial；CG1 的配额路由与 Ledger 尚未实现。详细证据和恢复入口见 [Checkpoint](handoff.md)。
