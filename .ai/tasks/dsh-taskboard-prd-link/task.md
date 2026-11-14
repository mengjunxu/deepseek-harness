---
schema_version: 1
task_id: dsh-taskboard-prd-link
title: "关联 Taskboard PRD"
status: DONE
priority: P2
created_at: "2026-11-11T16:15:56+08:00"
updated_at: "2026-11-11T16:17:56+08:00"
---

# Goal

将用户提供的 Taskboard PRD 关联到主 PRD。

## Scope

仅添加关联文档与任务区设计入口，保留 Taskboard 待评审状态；不修改产品实现、实施计划或用户原稿。

## Acceptance criteria

- [x] 主 PRD 引用 Taskboard PRD，链接可解析。
- [x] 验证结果与限制记录完整。

## Dependencies and constraints

用户授权本次局部编辑，Codex 为此任务唯一写入者；主 PRD 起始无未提交改动，无本任务旧写入者。保留用户设置与未跟踪 Taskboard 原稿；不提交或推送。
