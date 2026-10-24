---
schema_version: 1
task_id: shared-agent-instructions
title: "整合 Codex 与 Codely 共享开发指令"
status: DONE
priority: P2
created_at: "2026-10-22T23:53:36+08:00"
updated_at: "2026-10-22T23:58:25+08:00"
---

# Goal

将用户提供的共享开发指令整合到两个 Agent 入口及现有共享工作流，使上下文加载、任务执行和交接使用同一份规则。

## Scope

- 更新根目录 `AGENTS.md`、`CODELY.md` 的共享规则入口，保留现有项目规则和用户修改。
- 将九组详细规则整合到 `.ai/WORKFLOW.md`，沿用 `.ai/ARCHITECTURE.md`、`.ai/MEMORY.md` 和现有 Agent Notes。
- 记录本任务的计划、验证证据与最终 Checkpoint；必要时调整入口文档字数预算。
- 不修改产品代码，不续作 `dsh-handoff-v0` 的真实双向交接试点，不改动其他任务。

## Acceptance criteria

- [x] 两个入口引用同一份共享规则，并明确开发前的上下文加载与单写入者要求。
- [x] 用户提供的九组规则均有归属，ADR 使用现有正式决策记录，不建立平行目录。
- [x] 已有未提交修改保留；验证结果和仓库原有失败分别记录。
- [x] Task、Plan、Checkpoint 和执行日志与实际结果一致。

## Dependencies and constraints

- 用户本次请求授权整合共享规则；正式规则和已确认架构的后续变更仍需按共享规则获得用户确认。
- 当前分支为 `codely_bridge`；这是独立的文档任务，产品代码验证不适用。
- 原有 `.ai/MEMORY.md`、`.codely-cli/settings.json`、`CODELY.md` 修改及未跟踪文档和测试均属于既有工作。

## User decisions

- 无待确认事项。
