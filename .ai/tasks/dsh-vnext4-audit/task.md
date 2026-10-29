---
schema_version: 1
task_id: dsh-vnext4-audit
title: "vNext.4 源码审计与计划合并"
status: DONE
priority: P0
created_at: "2026-10-28T16:40:06+08:00"
updated_at: "2026-10-28T16:58:18+08:00"
---

# Goal

依据 docs/myPlan 的 vNext.4 PRD/Plan，完成 P0 源码审计、历史方案对照、ADR 提案、主计划与 Checklist 增量更新。

## Scope

仅写审计文档、现有计划、提案及本任务记录；不进入 P1–P7，不改业务实现、全局配置或真实账户。

## Acceptance criteria

- [x] 逐项能力矩阵关联源码入口、差距、复用、测试和风险。
- [x] 新旧计划差异、缺失历史版本和外部参考锁定有明确证据。
- [x] ADR、阶段任务与 Checklist 互相链接且区分目标与实现。
- [x] 文档检查真实记录，Task / Plan / Checkpoint 完成。

## Ownership and constraints

用户已明确确认旧 Agent 停止写入并授权接续；2026-10-28 Codex 取得本 Task 唯一写入权。起始跟踪文件无 Diff，唯一未跟踪输入为 docs/myPlan/，保留原文。当前分支 codely_bridge；不复用已 DONE 的旧 Task。不 Commit / Push。

## User decisions

仅授权 P0。涉及已有正式架构的变化以 proposed ADR 留存，实施须后续授权。

## Completion limits

P0 文档交付完成；后续功能未实施。全仓文档检查失败已记录，既有与输入文档的配对/换行、生成目录与类型文档问题未在本轮修复。新增三组双语配对通过，lint 与 61 项定向测试通过；无固定发布基线，不将其扩大为产品验收。
