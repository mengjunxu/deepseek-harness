# TBOARD-03 开发记录

- 2026-11-21（上海），核对现有 Taskboard 的原子 `admit`、租约下的目录准备、SDK 惰性启动、`session/prompt` 回执与 G0 中断证据。已记录本任务实现步骤和验收覆盖。TBOARD-04 首发 macOS 复验仍待执行；本任务代码和产品验证尚未开始。

- 2026-11-22 00:14（上海），Codex 接手 SQLite 队列步骤。`get_usage_limits` 的 Codex 10080 分钟窗口剩余 93%，重置于 11 月 27 日 15:04（上海）。
- PASS · `node_modules/.bin/tsc.CMD -b packages/api/taskboard-controller` 和 `node_modules/.bin/tsdown.CMD --env.DSH_BUILD_FACE host --filter '@deepseek-ai/dsh-api-taskboard-controller' --logLevel warn` 验证类型、Host 和 RPC 描述。
- PASS · `node_modules/.bin/vitest.CMD run packages/api/taskboard-controller/tests/taskboard.host.spec.ts --testTimeout 15000` 通过 14 项。`node_modules/.bin/vitest.CMD run --config vitest.web.config.ts apps/web/tests/taskboard.e2e.ts` 在主机通过 1 项，认证 Web 读回排队和已取消的 Run。命令及版本见 [Windows 验证](evidence/windows-queue.json)。
- PASS · 定向 staged lint、`git diff --check` 和 `verify-translation-pairing packages/api/taskboard-controller/README.md docs/subsystems/workspace.md`。`gen-cordis-catalog` 更新了队列类型和已实现的停止复核条目。
- FAIL · `node_modules/.bin/pnpm.CMD run doc-sync` 为 35 通过、7 失败。Cordis 目录、文档依赖图、JSDoc 和类型等价通过。失败项为文档示例类型、站点构建、链接、配对、换行、仓库引用和站点测试。站点构建 `node_modules/.bin/pnpm.CMD run docs:build` 和站点测试 151 项在主机上单独复跑通过。
- 2026-11-22 00:28（上海），`get_usage_limits` 的 Codex 10080 分钟窗口剩余 90%，重置于 11 月 27 日 15:04（上海）。真实 SDK 调度和回执对账待 TBOARD-04 的 macOS 复验后接入。

- 2026-11-22 01:01（上海），Codex 接手持久化目录确认步骤。`get_usage_limits` 的 Codex 10080 分钟窗口开始剩余 90%，复核剩余 89%，交接时剩余 88%，重置于 11 月 27 日 15:04（上海）。
- PASS · `node_modules/.bin/vitest.CMD run packages/api/taskboard-controller/tests/taskboard.host.spec.ts --testTimeout 15000` 在 Windows 主机通过 15 项，验证重启后按原方案准备工作树、拒绝错误租约及目录替换。沙箱中的首次定向运行在创建 junction 时返回 EPERM，主机原样复跑 3 个定向用例通过。
- PASS · `node_modules/.bin/tsc.CMD -b packages/api/taskboard-controller`、`node_modules/.bin/tsdown.CMD --env.DSH_BUILD_FACE host --filter '@deepseek-ai/dsh-api-taskboard-controller' --logLevel warn` 和 `node_modules/.bin/vitest.CMD run --config vitest.web.config.ts apps/web/tests/taskboard.e2e.ts`，认证 Web 冒烟 1 项通过。被测版本见 [目录方案证据](evidence/windows-workspace-plan.json)。
- PASS · 定向 staged lint、`git diff --check`、控制器和 Workspace 文档双语配对及 `verify-cordis-catalog`。NOT_RUN · 本步未重跑全仓 `doc-sync` 或首发 macOS 复验。

- 2026-11-22 01:32（上海），Codex 接手输入投递与回执持久化。已在实施清单和 TBOARD-04 交接中明确 Windows 联调与 macOS 首发验收的适用范围。`get_usage_limits` 的 Codex 10080 分钟窗口开始剩余 88%，01:39 交接时剩余 86%，重置于 11 月 27 日 15:04（上海）。
- PASS · `node .ai/tasks/dsh-tboard-03/evidence/submit-input.mjs` 在 Windows 主机运行真实 SDK。SDK 接受输入后关闭 Taskboard 数据库，回执写入因数据库关闭而失败。重开后请求保持待对账，重放调用投递函数零次。夹具从绑定 Session 核对消息 ID 并补写回执。本机模型收到一次请求。[结果与版本](evidence/windows-sdk-input.json)
- PASS · `node_modules/.bin/vitest.CMD run packages/api/taskboard-controller/tests/taskboard.host.spec.ts --testTimeout 15000` 通过 16 项。`node_modules/.bin/vitest.CMD run --config vitest.web.config.ts apps/web/tests/taskboard.e2e.ts` 通过 1 项。控制器增量类型检查、Host 构建、定向 lint、双语配对、Cordis 目录鲜度及 `git diff --check` 通过。
- NOT_RUN · 本步未重跑全仓 `doc-sync` 或 macOS 首发平台复验。自动调度及自动对账待接入。
