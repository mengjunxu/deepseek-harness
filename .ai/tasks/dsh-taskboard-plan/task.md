---
schema_version: 1
task_id: dsh-taskboard-plan
title: "将 Taskboard 需求纳入主 PRD 和实施计划"
status: DONE
priority: P2
created_at: "2026-11-11T17:39:56+08:00"
updated_at: "2026-11-11T17:49:13+08:00"
---

# Goal

根据用户提供的 Word 任务工作台 PRD，更新主 PRD 的任务产品要求与实施 Plan 的依赖、验收和状态入口。

## Scope

更新主 PRD、主 Plan，并在 Taskboard Markdown 中关联 Word 来源；不修改 Word 原件、产品代码或已实施架构。入口与数据归属差异作为接入验证决策，不把参考文档指令当作执行授权。

## Acceptance criteria

- [x] 核对 Word 正文、表格、两张图和现有 Markdown，识别适用需求与架构差异。
- [x] 主 PRD 定义任务 UI、执行与人工验收要求，Plan 映射 FR01–14、AC01–20 和 G0–G4。
- [x] 保留旧任务编号与完成证据，新功能保持 TODO，记录文档检查结果。

## Dependencies and constraints

Codex 为本次任务唯一写入者；同一聊天前序任务已完成停止。保留主 PRD 前序两处引用、前序任务记录、用户设置及未跟踪 Word/Markdown。用户本轮授权更新规划，不启动实现或真实模型调用，不 Commit/Push。
