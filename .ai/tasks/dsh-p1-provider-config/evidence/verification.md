# Verification

被测工作区：codely_bridge，未提交源码；固定发布 ref 未填写。源码/fixture 指纹由 source-sha256.txt 保存，不以可变分支充当版本证据。

## Product and source

| Command | Result |
|---|---|
| `pnpm exec vitest run packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts packages/llm/llm-pi-ai/tests/adapter.spec.ts packages/llm/llm/tests/provider-policy.spec.ts --reporter=dot` | PASS：4 文件 100 项；共享 schema 最终版本 |
| `pnpm exec vitest run packages/llm/llm-pi-ai/tests/config.spec.ts --reporter=dot` | PASS：19 项；最终只读快照转换类型处理 |
| `pnpm exec vitest run packages/llm/llm-pi-ai/tests/dynamic-config.spec.ts --reporter=dot` | PASS：13 项；最终包含拒绝更新后原配置不变断言 |
| `DSH_SNAPSHOT=refresh pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t provider-policy-configured` | PASS：1 场景，写新 V4 输出 |
| `pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t 'provider-policy-(configured\|gated)'` | PASS：2 场景；最终共享 schema 后复验 |
| `pnpm exec tsc -b packages/llm/llm/tsconfig.json packages/llm/llm-pi-ai/tsconfig.json --pretty false` | PASS |
| `pnpm run lint` | PASS：最终包含 Host tsc、打包与 contracts-ready lint |

100 是唯一测试用例数量；两文件复验不额外累计。所有 HTTP 请求仅到临时 loopback 模拟服务。OpenAI API Key 真实验证 NOT_RUN：用户明确免测。真实 Web NOT_RUN：尚未准入。未执行全仓测试/coverage，当前变更由定向测试、真实 profile 回放与 Host 构建覆盖。

## Documentation

| Command | Result |
|---|---|
| `pnpm run gen-config-catalog` / `pnpm run verify-config-catalog` | PASS：3 个 artifact 新鲜；生成的 SIWC 节反映前序现有插件 |
| `pnpm run gen-persistence-catalog` | PASS：仅来源行号变化，类型 hash 不变 |
| `pnpm run verify-export-jsdoc` | PASS |
| `pnpm run verify-type-equiv` | PASS：470 主块、470 成对派生 |
| `pnpm run verify-translation-pairing --write packages/llm/llm/README.md packages/llm/llm-pi-ai/README.md docs/subsystems/llm-streaming.md docs/config-catalog.md docs/persistence-catalog.md` | PASS：命名记录；编辑后的两对另行刷新 |
| `pnpm run verify-translation-pairing packages/llm/llm/README.md packages/llm/llm-pi-ai/README.md docs/subsystems/llm-streaming.md docs/config-catalog.md docs/persistence-catalog.md` | PASS：5 对 |
| `pnpm run test:docs` | FAIL：18 PASS / 2 FAIL，既有缺失配对与硬换行 |
| `pnpm run doc-sync` | FAIL：35 PASS / 7 FAIL；persistence catalog/history、配置目录和类型等价等已通过 |
| `pnpm run doc-typecheck` | 初次 FAIL：新测试的只读输入类型问题；已修复并完整 lint 通过 |
| `pnpm run doc-typecheck:contracts-ready` | 最终 FAIL：仅 docs/legacy 代码块缺失类型、重名、非模块 await 等历史问题；没有本轮源码或文档错误 |
| `git diff --check` | PASS |

全仓 doc-sync 其余失败：doc graphs/cordis catalog 的既有 ChatgptPlanState 类型链接分类缺失、Client 目录、插件包清单、历史/输入文档的配对和换行。未重新翻译 legacy 或修改无关目录。最终只复验被修复问题所属检查，未重复已通过的全仓门禁。

## Corrected attempts

初次配置 schema 将可选对象扩展为空对象，已修复默认值与明确的输入/输出类型。完整 Host 构建发现新测试将 Volatile 的只读快照直接传给可变输入；已按既有调用方式复制并显式类型转换，最终完整 lint 通过。初次 snapshot 重复挂载 pi-ai 导致可配置目录冲突，已改为 patch 既有 llm-pi-ai 条目，最终刷新与回放通过。这些失败尝试不计入 PASS。
