# Execution Plan

## Phase 1 — P0-01 仓库基线

- [x] 核对包管理器、Node 范围、工作区包数量、应用目录与 Git 状态。
- [x] 执行 `corepack pnpm run typecheck` 与定向测试，记录实际结果。
- [x] 把计划能力映射到现有包并列出 P1 缺口，写入英文与中文对照文档。

Status: DONE

## Phase 2 — P0-02 Mock 网关证据

- [x] 核对 `llm-mock-server` 的行为清单覆盖正常流、工具调用、失败、断流。
- [x] 执行 mock server 与 `llm-retry` 恢复测试，记录 78 项通过。
- [x] 在基线文档中建立场景与行为的对照表。

Status: DONE

## Phase 3 — P0-03 供应商矩阵

- [x] 新增 OpenAI 路线的 6 项自动化验证：Responses 与 Chat Completions 两种形态的成功、401、额度耗尽、未配置凭据。
- [x] 记录失败分类、重试策略与 SIWC 结论，写入英文与中文对照文档。
- [x] 在清单中把真实账户部分标为 BLOCKED，并写明 fallback。

Status: BLOCKED

## Verification

- Command: `corepack pnpm run typecheck`
- Expected result: 退出码 0
- Actual result: PASS
- Tested code commit: NOT_RUN（工作区未提交；产品代码未改动）
- Unrun checks and reason: 未执行真实 OpenAI 请求，原因是环境无凭据；未执行全仓 `doc-sync`，原因见交接记录。

- Command: `corepack pnpm exec vitest run packages/llm/llm-pi-ai/tests packages/test-support/llm-mock-server/tests packages/llm/llm-retry/tests/transport-recovery.spec.ts`
- Expected result: 全部通过
- Actual result: PASS（18 个文件，423 项）
- Tested code commit: NOT_RUN
- Unrun checks and reason: 无

- Command: `corepack pnpm exec tsc -b tsconfig.host.json`
- Expected result: 无诊断
- Actual result: PASS
- Tested code commit: NOT_RUN
- Unrun checks and reason: 无

- Command: `corepack pnpm exec tsx scripts/verify-translation-pairing.ts docs/dsh/spikes/repository-baseline.md docs/dsh/spikes/model-provider-matrix.md`
- Expected result: 两个命名对一致
- Actual result: PASS
- Tested code commit: NOT_RUN
- Unrun checks and reason: 全仓配对检查未执行。

- Command: `corepack pnpm exec oxlint packages/llm/llm-pi-ai/tests/openai-route-matrix.spec.ts`
- Expected result: 无诊断
- Actual result: PASS
- Tested code commit: NOT_RUN
- Unrun checks and reason: 无
