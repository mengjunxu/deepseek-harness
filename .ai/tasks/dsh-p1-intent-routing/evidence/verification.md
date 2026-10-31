# Verification

被测代码为未提交的 codely_bridge 工作区；版本定位使用 source-sha256.txt 中的源码/配置/fixture 指纹，未填写固定发布 ref。

## Product and types

| Executed command | Result |
|---|---|
| `node node_modules/vitest/vitest.mjs run packages/llm/llm/tests/provider-policy.spec.ts packages/llm/llm/tests/call-config.spec.ts packages/core/session/tests/session.spec.ts packages/core/agent-default-model/tests/intent-routing.spec.ts packages/core/agent-default-model/tests/agent-default-model.spec.ts packages/llm/llm/tests/service.spec.ts --reporter=dot` | PASS：6 文件 207 项 |
| `node node_modules/vitest/vitest.mjs run packages/core/agent-loop/tests/contract-regressions.spec.ts -t 'policy-bearing virtual' --reporter=dot` | PASS：1 项，44 项按名称过滤；缺失政策路线不进入中间件，不写入请求头 |
| `DSH_SNAPSHOT=refresh node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts -t intent-routing-` | PASS：4 场景，生产 pi-ai 配置、路由插件、SDK wire、V4 日志；只回放模型回复 |
| `node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts -t intent-routing-` | PASS：最终 4 场景 keyless replay，25 项按名称过滤 |
| `PYTHONPATH=python/sdk/src /opt/anaconda3/bin/python -m pytest python/sdk/tests/test_intent_routing_snapshot.py` | PASS：最终 4 项，真实 built dsh sdk profile 与构建后回放插件 |
| `pnpm run lint` | PASS：最终完整 Host tsc/打包与 contracts-ready lint |
| `node node_modules/typescript/bin/tsc -b packages/core/agent-default-model/tsconfig.json packages/core/session/tsconfig.json --pretty false` | PASS |
| `node node_modules/typescript/bin/tsc -p packages/core/agent-default-model/.artifacts/tsconfig.json --pretty false` | PASS：无 paths 的 NodeNext consumer，消费已发布 subpath 的类型与 Config/apply |
| `node node_modules/publint/src/cli.js packages/core/agent-default-model` | PASS，保留既有 ./src/* 不匹配打包文件的警告 |

另在包目录通过 Node ESM self import 加载 @deepseek-ai/dsh-agent-default-model/intent-routing，确认 built plugin name 并拒绝不完整 Config。NodeNext 临时 consumer、配置和产物位于忽略的 .artifacts，不是应用启动器。fixture 进程均经 dsh sdk profile，Python 没有使用私有 argv 逃生入口。

208 是 207 加 1 个唯一用例；中途重跑不额外累计。并行执行 TypeScript/Python profile 测试时使用各自私有临时 HOME/cwd；没有共享端口、真实 API Key 或外部模型请求。Python 的新 POSIX built-launcher 测试在 Windows 跳过。真实 API Key 验证 NOT_RUN（用户免测），真实 Web NOT_RUN（未准入），独立 exe 和平台矩阵 NOT_RUN（CI 拥有）。未执行全仓 test/coverage/hygiene。

## Documentation and compatibility

以下 scripts 均通过 `node node_modules/tsx/dist/cli.mjs` 执行，除两条 pnpm 聚合命令外不重复列相同前缀。

| Script / command | Result |
|---|---|
| `scripts/verify-export-jsdoc.ts` | PASS |
| `scripts/verify-type-equiv.ts` | PASS：475 主块 / 475 成对派生 |
| `scripts/verify-translation-pairing.ts --write packages/core/agent-default-model/README.md packages/llm/llm/README.md docs/subsystems/core.md docs/subsystems/llm-streaming.md docs/config-catalog.md` | PASS：编辑后的 package 对另行刷新 |
| `scripts/verify-translation-pairing.ts packages/core/agent-default-model/README.md packages/llm/llm/README.md docs/subsystems/core.md docs/subsystems/llm-streaming.md docs/persistence-catalog.md docs/persistence-changes/2026-10-31-request-intent-policy.md docs/persistence-changes/historical-formats/README.md` | PASS：7 对 |
| `scripts/gen-config-catalog.ts` | PASS：3 artifacts 新鲜，本轮未写入 |
| `scripts/gen-persistence-catalog.ts` / `--check` | PASS：目录和 schema 新鲜 |
| `scripts/persistence-changes.ts --check --json` | 记录前拒绝 2 个未确认可选字段；记录后 PASS：62 roots / 8 history records，无剩余变化 |
| `scripts/persistence-changes.ts --record 2026-10-31-request-intent-policy --prose .artifacts/intent-policy-prose.json --json` | PASS：只影响 event:request/header，same-version |
| `scripts/persistence-formats.ts --write` / 无参数复验 | PASS：刷新 3 个索引文件，5 份格式引用完整 |
| `scripts/gen-tsconfig-paths.ts` / `--check` | PASS：自定义 subpath 位于手写区，最终新鲜 |
| `pnpm run test:docs` | FAIL：17 PASS / 3 FAIL；本轮格式索引失败已单独修复/复验，剩余旧配对和硬换行 |
| `pnpm run doc-sync` | FAIL：33 PASS / 9 FAIL；本轮格式索引和源码别名失败已单独修复/复验 |
| `git diff --check` | PASS |

其余 7 个 doc-sync 失败门禁为：doc-typecheck（仅 docs/legacy 代码块）、doc graphs / cordis catalog（既有 ChatgptPlanState 类型链接）、Client 目录、插件包清单、历史/输入文档的双语配对与硬换行。聚合结果保留实际执行数字，不把修复后的单项检查伪报成新的全仓聚合结果。完整 lint 和 doc-sync 的 Host 构建已覆盖当前源码/测试消费者。

已 fetch origin master，四份改动文档的远端参考可读取；当前行为以工作区源码和已执行的配置、测试与 profile 为准。没有合并或改动分支历史。

## Corrected attempts

初次离线 lockfile 安装因缓存元数据不足失败；随后包管理器自动重链已有依赖，无下载。锁文件只保留本包新增的两个 workspace 链接，其他归一化噪声已排除。初次 snapshot 脚本生成失败/过滤未匹配测试不计 PASS；修复 V3 消息形式、SDK composition 的 sdk- 前缀与模型专属 prompt sidecar 后实际 4 场景通过。Python built profile 不能解析未安装的 replay 包裸名，已通过私有临时 patch 引用其构建后插件文件；没有替换生产 Provider 或使用自造应用入口。首次完整 lint 的 Promise void 用法已修复，最终完整 lint 通过。新增持久化字段产生的索引 freshness，以及放进生成区的 subpath 别名，均已修复并用各自检查复验。
