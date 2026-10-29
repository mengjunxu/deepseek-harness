# Legacy planning documents

English | [中文](README.zh.md)

## Summary

This directory retains superseded plans, checklist snapshots, implementation summaries and dated audit evidence. These documents explain historical decisions and verification; their defaults, next-task instructions and completion claims are not current execution instructions.

## Table of Contents

- [Current documents](#current-documents)
- [Archive groups](#archive-groups)
- [Maintenance](#maintenance)

## Current documents

The only active planning documents are `docs/workflows/DSH_IMPLEMENTATION_PLAN.md` and `docs/myPlan/DSH_PRD_vNext_4_2026-10-27.md`. Plan sections 11–12 own the current roadmap, live Checklist and task evidence. The separate Checklist has been merged into that plan; its archived copy is a snapshot. Formal decisions and developer task records retain their existing owners outside this directory.

## Archive groups

| Group | Contents |
|---|---|
| Generic Agent Harness | `Generic_Agent_Harness_Architecture_Execute_Plan_v4.md`, `Generic_Agent_Harness_v5_ACP_Architecture_Execute_Plan.md`, `Generic_Agent_Harness_v5_1_CN_Technical_Design_and_Codex_Implementation_Plan.md` |
| MGSD | `MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan.md`, `MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan_v2.md`, [Checklist](MGSD_Implementation_Checklist.md), [L1 summary](MGSD_L1_Local_DSH_Implementation_Summary.md), [L2 summary](MGSD_L2_Local_DSH_Implementation_Summary.md) |
| DSH workflow | `workflows/DSH_CHECKLIST.md`, `workflows/DSH：Codex 与 Codely 无缝切换工作流（V0–V2）.md` |
| vNext.4 inputs | `myPlan/DSH_Implementation_Plan_vNext_4_2026-10-27.md`, `myPlan/AGENTS.original.md` |
| Dated audit evidence | [Repository baseline](dsh/spikes/repository-baseline.md), [provider matrix](dsh/spikes/model-provider-matrix.md), [vNext.4 gap analysis](dsh/spikes/DSH_VNEXT4_GAP_ANALYSIS.md), [reference lock](dsh/spikes/CGW_REFERENCE_LOCK.md) |

## Maintenance

Files retain historical content; relative links are adjusted for relocation. Bilingual triplets move together. This directory is unrelated to the frozen Agent Note archive and does not change formal decision status. The relocation Task records source/destination paths and file digests under `.ai/tasks/dsh-plan-legacy/moves.json`. Old command text in task logs describes commands actually run at the time; use the relocation map to find moved evidence. Existing documentation-check failures remain recorded rather than exempted.
