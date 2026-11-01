# Execution Plan

## Step 1 — 共享规则与入口

- [x] 核对 Git、前序任务、共享文档职责与单写入权。
- [x] 查询当前 Codex Plus 五小时余量并记录；将增量记录及停止线写入 WORKFLOW，入口和 Memory 保留索引。

Status: DONE

## Step 2 — 文档验证与最终交接

- [x] 执行适用文档检查，区分本轮问题与既有失败。
- [x] 复查实时额度、Diff 与文件归属，保存最终 Checkpoint 并释放写入权。

Status: DONE

## Verification

产品代码未变，产品单元测试、真实模型请求与额度耗尽实验为 NOT_RUN。规则属于 Agent 操作约定，不是自动强制中断实现；检查实际用量工具返回、链接和 Markdown 格式，并记录未能通过的既有全仓检查。

PASS：`pnpm exec tsx .artifacts/incremental-handoff-check.ts` 检查本轮八份 Markdown 的链接、锚点、段落换行与文件末尾；`git diff --check`。`pnpm run test:docs` 实际为 18 PASS / 2 FAIL，失败为既有 translation pairing 与 markdown wrap，完整输出位于本地忽略目录 `.artifacts/incremental-handoff-test-docs.log`。本轮未运行 doc-sync、lint 或产品测试：仅共享操作规则和任务记录变化，已执行相关快速文档检查，无产品行为或类型改变。
