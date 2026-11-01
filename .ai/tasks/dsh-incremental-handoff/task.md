---
schema_version: 1
task_id: dsh-incremental-handoff
title: "增量交接记录与 Codex Plus 额度停止规则"
status: DONE
created_at: "2026-11-01T00:12:31+08:00"
updated_at: "2026-11-01T00:14:07+08:00"
---

# Goal

落实用户授权的每步/阶段交接记录规则与 Codex Plus 五小时余量停止线，使 Codely 能核对现场后接手。

## Scope and ownership

Codex 是本 Task/Workspace 的唯一写入者，前序任务已完成并提交；本轮只修改共享开发规则、入口索引、Memory 索引与本 Task。保留用户 .codely-cli/settings.json，不读取、修改或提交该设置。不启动 Web PoC，不修改产品额度策略，不自动 Commit/Push。

## Acceptance criteria

- [x] 每个可验收步骤/阶段后保存 Task / Plan / Checkpoint / Log，检查相关 Memory / WORKFLOW 的更新需要。
- [x] Codex 实时读取五小时窗口，剩余小于 15% 时停止新增工作、保存交接并提醒；未知额度如实记录。
- [x] 两个 Agent 入口指向同一规则，保持单写入者及正式交接要求。
- [x] 完成相关文档检查，记录实际余量与限制并保存最终 Checkpoint。

## User decisions

2026-11-01 用户明确要求每一步或阶段完成后更新相关共享记录，并在 Plus 五小时余量小于 15% 时停止运行和提醒。本规则由活动 Agent 检查点执行，不新增后台自动化或 DSH 产品服务。
