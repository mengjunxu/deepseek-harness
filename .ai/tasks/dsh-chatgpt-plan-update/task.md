---
schema_version: 1
task_id: dsh-chatgpt-plan-update
title: "合并 ChatGPT 接入增量计划与实现证据"
status: DONE
priority: P0
created_at: "2026-10-26T02:09:22+08:00"
updated_at: "2026-10-26T02:27:41+08:00"
---

# Goal

依据用户提供的 ChatGPT Integration Plan vNext 更新现有主计划、Checklist、实现记录和共享 Memory，保留 V0–V2 与既有代码。

## Scope

- 审计 Chat UI、Provider、Codex/Codely 双模式、Task、Context、Worker 与 MCP 的源码和证据。
- 合并阶段依赖、任务归属、额度类型、Decision Log 和验收条件。
- 更新 SIWC 真实成功与未提交修复记录，区分实现、定向验证与完整验收。
- 不修改业务代码，不进入新计划 P1–P5，不 Commit / Push。

## Acceptance criteria

- [x] 有基于仓库证据的现状与缺口矩阵。
- [x] 原任务编号保留，新阶段没有重复任务，P1 的依赖与验收明确。
- [x] Memory 只保存长期事实、限制及索引，任务记录保存临时进度。
- [x] 文档检查结果及未验证项准确记录。

## Ownership and constraints

Codex 是本聊天持续授权的唯一写入者；本任务仅写文档。保留此前 SIWC 源码/测试/README 修改及用户的 Codely、Obsidian 配置。起始 Git 状态与受影响路径见 Checkpoint。

## User decisions

用户授权本次计划合并；下一阶段功能实现须另获授权。
