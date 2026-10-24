---
schema_version: 1
task_id: dsh-siwc-ui
title: "DSH UI 的 SIWC 登录与对话验证"
status: IN_PROGRESS
created_at: "2026-10-23T02:07:24+08:00"
updated_at: "2026-10-24T22:37:00+08:00"
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

实验插件及定向测试已实现，用户要求保存本地 Commit。用户已报告完成从 Models 页面发起的授权；DSH 账户状态、真实对话与重启复用尚未确认，任务保持 IN_PROGRESS。详细验证和恢复入口见 [Checkpoint](handoff.md)。
