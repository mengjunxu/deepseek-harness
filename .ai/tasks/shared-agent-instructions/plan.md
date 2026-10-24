# Execution Plan

## Phase 1 — 检查现有规则与现场

- [x] 读取入口、WORKFLOW、架构与 Memory 索引、文档规范和现有试点 Checkpoint。
- [x] 检查分支、HEAD、Diff 和未跟踪文件，区分用户已有修改。
- [x] 执行修改前的 `corepack pnpm run test:docs`，记录原有失败。

Status: DONE

## Phase 2 — 整合共享规则

- [x] 在两个入口加入简洁的共享指令，链接现有共享工作流。
- [x] 将九组规则整合到 WORKFLOW，映射现有架构和正式决策记录。
- [x] 保留既有规则、未提交修改和历史任务状态。

Status: DONE

## Phase 3 — 验证与结束

- [x] 检查所有本任务 Markdown 的链接、段落换行与文件结尾。
- [x] 执行文档检查，区分本任务问题与原有失败。
- [x] 核对 Diff，更新 Task、Plan、Checkpoint 和日志。

Status: DONE

## Verification

- 产品代码验证：NOT_APPLICABLE；本任务只修改文档和相关预算。
- 修改前 `corepack pnpm run test:docs`：FAIL；翻译配对、Markdown 换行和仓库提交号引用已有失败。
- 修改后 `corepack pnpm run test:docs`：FAIL；17 项通过，3 项失败，失败文件诊断与修改前完全一致，无新增诊断。
- `corepack pnpm exec tsx /tmp/dsh-shared-agent-verify.mts`：PASS；7 个本任务 Markdown 的相对链接、段落换行及单个结尾换行通过。
- `corepack pnpm run verify-doc-budgets`：PASS；8 份文档均在预算内。
- `corepack pnpm run lint`：PASS。
- `git diff --check`：PASS。
- `corepack pnpm run doc-sync`：FAIL；37 项通过、5 项失败：doc-typecheck、cordis catalog、translation pairing、markdown wrap、repository references。快速检查涉及的三类诊断与基线一致；完整检查另报未改动计划文档的代码块编译错误，以及 `packages/extensions/tool-cordis/src/api-catalog.ts` 过期。
- 字数预算：`AGENTS.md` 从 1947 增至 1976 个空白分词；预算从 1950 调整为 2100，为新增共享入口保留约 5.9% 余量，现有项目规则未删减。
- 本任务无需更新产品架构、Memory 或正式架构决策；既有索引已覆盖相关文档。
