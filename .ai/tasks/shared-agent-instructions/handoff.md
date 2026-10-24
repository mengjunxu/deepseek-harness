---
schema_version: 1
task_id: shared-agent-instructions
state: DONE
previous_agent: codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-10-22T23:58:25+08:00"
---

# Handoff Checkpoint

## Status

共享开发指令整合已完成；本任务不需要转交其他 Agent。Codex 完成最终只读验证后停止本任务写入；后续接手仍须确认没有其他写入者。

## Completed

- 两个入口均已加入共享开发指令，链接同一份 `.ai/WORKFLOW.md`。
- WORKFLOW 已按用户提供的九个部分整合上下文加载、文档职责、冲突处理、交接、Git 安全和完成要求。
- 正式决策沿用 `.agents/notes/implemented/`，产品架构沿用现有文档，没有新建平行规则目录。
- `AGENTS.md` 的字数预算已调整，保留项目原有规则和用户修改。
- Task、Plan 和 Log 已同步实际结果；无需更新产品架构、Memory 或正式决策记录。

## Remaining

- 本任务无未完成事项。其他文档和生成目录的检查失败保持原有归属，不在本任务修复。
- 历史任务 `dsh-handoff-v0` 的双向交接试点仍保持原有阻塞状态。

## Git state

- 分支：`codely_bridge`；已核对 HEAD、Diff 和未跟踪文件，未 Commit / Push；所有本任务变更仍在本地。
- 已执行 `git fetch origin`，最终状态显示本地分支与远端跟踪引用没有 ahead / behind 标记；工作区修改未远程同步。
- 本任务文件：`AGENTS.md`、`CODELY.md` 的共享入口增量与结尾换行、`.ai/WORKFLOW.md`、`scripts/doc-budgets.manifest.json`、`.ai/tasks/shared-agent-instructions/` 四份记录。
- 保留的既有修改：`.ai/MEMORY.md`、`.codely-cli/settings.json`、`CODELY.md` 中既有的项目记忆更新。
- 保留的既有未跟踪文件：`docs/dsh/`、`docs/workflows/DSH_CHECKLIST.md`、`docs/workflows/DSH_IMPLEMENTATION_PLAN.md`、`packages/llm/llm-pi-ai/tests/openai-route-matrix.spec.ts`。
- 维护文档不保存原始提交号；本任务只验证文档，不声称验证了固定产品代码版本，因此基线及被测代码提交字段留空。

## Verification evidence

- `corepack pnpm exec tsx /tmp/dsh-shared-agent-verify.mts`：PASS；7 个本任务 Markdown 的链接、段落换行和文件结尾符合要求。
- `corepack pnpm run verify-doc-budgets`：PASS；8 份受预算约束文档均通过。
- `corepack pnpm run lint`：PASS。
- `git diff --check`：PASS。
- `corepack pnpm run test:docs`：修改前后均为 17 项通过、3 项失败；失败文件诊断完全一致，无新增诊断。
- `corepack pnpm run doc-sync`：37 项通过、5 项失败，完整失败项及归属见 [plan.md](plan.md)。
- 产品行为测试：NOT_APPLICABLE；本任务未修改产品代码。

## Risks and decisions

- 全仓文档检查未全绿，不能将本任务的文档整合表述为全仓验证通过。
- 新增规则属于用户本次明确授权的整合；后续正式规则或已确认架构决策的变更仍遵循共享确认流程。

## Next actions

- 如开展新任务，使用独立 Task 并先核对当前 Git 和写入者状态。

## User decisions

- 无待确认事项。
