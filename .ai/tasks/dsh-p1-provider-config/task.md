---
schema_version: 1
task_id: dsh-p1-provider-config
title: "P1 Provider 政策配置接入"
status: DONE
created_at: "2026-10-31T00:10:47+08:00"
updated_at: "2026-10-31T00:24:41+08:00"
---

# Goal

将已有政策元数据/准入连接到真实 pi-ai Provider 配置与设置热更新，不增建 Registry。

## Scope and ownership

用户要求继续 P1；Codex 为新 Task 唯一写入者，前序本 Agent 已完成。核对前序代码/记录与 Git，保留所有 P0/P1 未提交成果，另有用户 .codely-cli/settings.json 修改不读取或纳入本轮。实现共享 Cordis schema、profile 解析、注册事实更新、拒绝与在途请求隔离及真实 profile 验收。API Key 真实验证仍免测，不改全局账号或访问真实 Web，不 Commit / Push。

## Acceptance criteria

- [x] cordis.yml/既有设置可声明 policy，非法声明在写入/加载时拒绝。
- [x] 政策变更更新注册代次；新请求拒绝 gated，已有 prepared call 保留旧代次，拒绝的设置不污染原状态。
- [x] 实际 pi-ai Provider 的生产 profile 回放、定向测试和文档同步；未完成意图/选择 UI 不打勾。
