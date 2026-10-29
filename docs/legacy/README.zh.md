# 历史规划文档

[English](README.md) | 中文

## Summary

本目录保留已替换的计划、Checklist 快照、实施总结与带日期的审计证据。这些文档解释历史决策与验证；其默认值、下一任务指令和完成声明不作为当前执行指令。

## Table of Contents

- [Current documents](#current-documents)
- [Archive groups](#archive-groups)
- [Maintenance](#maintenance)

## Current documents

仅保留 `docs/workflows/DSH_IMPLEMENTATION_PLAN.md` 与 `docs/myPlan/DSH_PRD_vNext_4_2026-10-27.md` 为有效规划文档。主 Plan 第 11–12 节负责当前路线、有效 Checklist 与任务证据。独立 Checklist 已并入主 Plan，归档副本仅为快照。正式决策及开发任务记录仍由本目录外的既有位置维护。

## Archive groups

| Group | Contents |
|---|---|
| Generic Agent Harness | `Generic_Agent_Harness_Architecture_Execute_Plan_v4.md`、`Generic_Agent_Harness_v5_ACP_Architecture_Execute_Plan.md`、`Generic_Agent_Harness_v5_1_CN_Technical_Design_and_Codex_Implementation_Plan.md` |
| MGSD | `MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan.md`、`MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan_v2.md`、[Checklist](MGSD_Implementation_Checklist.zh.md)、[L1 总结](MGSD_L1_Local_DSH_Implementation_Summary.zh.md)、[L2 总结](MGSD_L2_Local_DSH_Implementation_Summary.zh.md) |
| DSH 工作流 | `workflows/DSH_CHECKLIST.md`、`workflows/DSH：Codex 与 Codely 无缝切换工作流（V0–V2）.md` |
| vNext.4 输入 | `myPlan/DSH_Implementation_Plan_vNext_4_2026-10-27.md`、`myPlan/AGENTS.original.md` |
| 带日期的审计证据 | [仓库基线](dsh/spikes/repository-baseline.zh.md)、[供应商矩阵](dsh/spikes/model-provider-matrix.zh.md)、[vNext.4 差距分析](dsh/spikes/DSH_VNEXT4_GAP_ANALYSIS.zh.md)、[参考锁定](dsh/spikes/CGW_REFERENCE_LOCK.zh.md) |

## Maintenance

文件保留历史内容，仅调整迁移所需的相对链接。双语三件组一起移动。本目录与冻结的 Agent Note 归档无关，不改变正式决策状态。迁移任务在 `.ai/tasks/dsh-plan-legacy/moves.json` 记录原路径、目标路径和文件摘要。任务日志中的旧命令描述当时实际执行内容，可通过迁移映射查找已移动证据。既有文档检查失败继续如实记录，不添加豁免。
