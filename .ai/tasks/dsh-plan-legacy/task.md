---
schema_version: 1
task_id: dsh-plan-legacy
title: "归并有效计划并集中历史文档"
status: DONE
priority: P2
created_at: "2026-10-28T17:09:17+08:00"
updated_at: "2026-10-28T17:09:17+08:00"
---

# Goal

仅以最新主 Plan 和 vNext.4 PRD 作为有效规划入口，将历史规划及相关材料集中到 docs/legacy。

## Scope

合并有效 Checklist、移动历史文档并修复引用；保留业务代码、正式 ADR、协作规则和任务记录。用户明确授权文档归档；Codex 为唯一写入者，前序审计已由本 Agent 完成并释放写入权。保留前序未提交成果，不 Commit / Push。

## Acceptance criteria

- [x] 最新 Plan 与 PRD 路径不变，其余范围内文档进入统一 legacy 目录。
- [x] Checklist 有效状态与证据保留在主 Plan。
- [x] 移动映射、引用检查及配对检查有记录，Task/Plan/Checkpoint 完成。
