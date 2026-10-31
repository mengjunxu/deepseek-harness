---
schema_version: 1
task_id: dsh-p1-intent-routing
title: "P1 显式意图路由与能力准入"
status: DONE
created_at: "2026-10-31T00:39:00+08:00"
updated_at: "2026-10-31T01:17:32+08:00"
---

# Goal

通过既有 Agent 请求扩展实现显式 chat/plan/review/execute 路由，日志保留实际意图和能力要求，拒绝能力不明或不支持的路线，不静默回退。

## Scope and ownership

Codex 为此 Task/Workspace 唯一写入者；同一 Agent 前序任务已完成，用户授权继续。分支 codely_bridge，保留 P0/P1 未提交成果及用户 .codely-cli/settings.json（不读取或修改）。不 Commit/Push。API Key 真实验证按用户要求免测，Web 不访问。

## Acceptance criteria

- [x] 既有 llm 配置携带可选意图与显式能力要求，prepare 和直接 stream 均拒绝能力不符；准备调用防止后续改变政策字段。
- [x] 可选 Agent 路由插件对四种意图使用显式 Provider/model；配置无隐式默认或回退；同一 Turn 捕获一份配置，后续 Turn 生效；准备与提示词变量一致。
- [x] 单元、真实 profile Session 回放、类型/持久化兼容记录、相关文档和主计划同步；尚未实现 UI/预算/完整 QR Gate 不标完成。
