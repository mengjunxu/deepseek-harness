---
schema_version: 1
task_id: dsh-p1-provider-policy
title: "P1 QR-01 Provider 元数据与准入"
status: DONE
created_at: "2026-10-30T00:59:46+08:00"
updated_at: "2026-10-30T01:12:20+08:00"
---

# Goal

在既有 LLM 注册与调用拥有者实现 QR-01 Provider 政策元数据和 gated 拒绝，不另建 Registry。

## Scope and ownership

用户授权继续进入 P1；本轮领取 QR-01（VN4-01 子项），Codex 唯一写入者，前序本 Agent 的 P0 Task 已完成。保留 P0 主计划、架构索引及两个未提交 Task。先做核心类型、解析与真实调用拒绝，再补证据及相关 README/子系统文档。不改 GUI 选择行为，不启动 Web 自动访问、额度计费或 P2 状态机。API Key 真实路线按用户免测。不 Commit / Push。

## Acceptance criteria

- [x] Provider 元数据显式承载 usageSource、能力三态、可用状态和 unknown 余额。
- [x] 普通聊天额度不能注册为主动推理 Provider，gated 路线在实际准备/调用处拒绝，旧适配器保留兼容默认。
- [x] SIWC 声明共享额度来源，测试、文档与任务记录同步；VN4-01/02 未完成部分不误打勾。

## Completion scope

完成 QR-01 的元数据与准入切片，QR-01 总任务保持 PARTIAL：意图输入/路由及完整配置入口尚缺。VN4-01/02 与 CG1 Gate 不标完成，不声明独立选择 UI 已接通。
