# Execution Plan

## Phase 1 — Audit

- [x] 读取新旧计划、协作规则与现有模块，核对真实状态。
- [x] 核对官方额度说明及上游文档。

Status: DONE

## Phase 2 — Merge

- [x] 更新主计划与 Checklist，添加编号映射、Gap Matrix、Decision Log。
- [x] 更新供应商矩阵、实现检查点和 Memory，清理冲突的当前状态说明。

Status: DONE

## Phase 3 — Verify

- [x] 运行局部双语/链接/格式检查与文档聚合检查。
- [x] 记录真实结果、已知失败和 P1 入口，完成本任务后停止。

Status: DONE

## Verification

产品代码测试 NOT_RUN：本轮只修改文档；此前 19 个 SIWC 测试属于先前修复证据。固定代码提交未指定，不用可变分支或 HEAD 代替固定版本。

- `git fetch origin`：沙箱无法写父目录子模块 FETCH_HEAD，原命令宿主重试 PASS；origin/master 没有当前两份工作流计划路径，不据此覆盖本分支文档。
- 官方文档：已获取 SIWC 用量、模型请求、Secure MCP Tunnel 页面；确认共享 Work/Codex 用量、无对话/Memory 授权，以及 Tunnel 120 秒总期限。本轮没有账户调用。
- 源码/事实审计：10 个拥有者文件摘要与当前本地 Session 脱敏计数见 [audit-evidence.json](artifacts/audit-evidence.json)。三个 completed 轮次及两类失败只是选定 Session 的证据，不是全功能验收。
- `node node_modules/tsx/dist/cli.mjs scripts/verify-translation-pairing.ts` 对供应商矩阵、历史基线、chatgpt-plan README 三组执行 `--write` 与命名对检查：PASS。
- `node node_modules/tsx/dist/cli.mjs scripts/verify-package-readme-model-experience.ts`：PASS（317 README）；补齐 SIWC 模型可见命名空间的完整字段，不改验证器。
- `node node_modules/vitest/vitest.mjs run scripts/doc-standard.spec.ts --reporter=dot`：沙箱缓存 rename EPERM，原命令宿主重试 PASS，22 测试。
- `node node_modules/pnpm/bin/pnpm.cjs run test:docs`：首次 15 PASS / 5 FAIL；完成本轮文档修正后的宿主复验 18 PASS / 2 FAIL。剩余为既有中文计划缺失配对和其他旧计划硬换行；包含当前两份原计划的既有配对缺口，未豁免或扩展为全篇翻译。日志 `tmp/dsh-chatgpt-plan-update-test-docs-final.log`。
- `node node_modules/pnpm/bin/pnpm.cjs run doc-sync`：沙箱运行 30 PASS / 12 FAIL；宿主原命令重试 33 PASS / 9 FAIL。失败为 doc-typecheck、doc graphs、Cordis catalog、translation pairing、markdown wrap、Client/config/plugin catalogs 和 repository references。引用失败涉及检查运行时尚未修正的历史基线，随后单独全仓 `verify-repository-references.ts` PASS；没有把总结果改写为全通过。日志 `tmp/dsh-chatgpt-plan-update-doc-sync.log`。
- 其余 doc-sync 诊断包括旧方案中未定义的 TS 示例、SIWC ChatgptPlanState 未登记类型链接、实验包导致的生成目录待同步；本轮把主计划本来仅表示目标语义的接口示例标成 text，不制造类型声明或修改业务实现来掩盖问题。完整修复仍待独立范围。
- 最终 20 份变更 Markdown 的局部链接、单段落单行、恰好一个结尾换行检查 PASS；10 个被审计源码/测试文件摘要与本轮记录一致，确认未被文档任务改动。结果见 [document-check.json](artifacts/document-check.json)。全仓引用检查 PASS；`git diff --check` PASS。
- NOT_RUN：完整产品 lint/typecheck/test 和真实 API/GUI 验收。本轮仅文档，不重做此前修复的产品验收；doc-sync 自身触发的构建不视为完整产品检查通过。没有修改 AGENTS/WORKFLOW 的站立规则，也没有把目标 Router/Policy 写成已发布架构或新增 implemented ADR。
