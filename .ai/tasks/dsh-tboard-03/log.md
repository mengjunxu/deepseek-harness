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

2026-11-22T01:49:32Z，`get_usage_limits` 的 Codex 10080 分钟窗口剩余 68%，11 月 24 日 17:34:52（上海）重置。 PASS · 冻结安装、完整构建、固定工具停止复核、未知范围保留租约、强停观察超时、SDK 回执保存与认证 Web 冒烟。命令、平台与源码指纹见 [macOS 验证记录](../dsh-cross-device-handoff/evidence/macos-receipt.json)。Codex 取得 TBOARD-03 单写权。macOS 上重开数据库后补写原输入回执，重放发出零次新输入。认证 Web 冒烟通过。[macOS 验证记录](../dsh-cross-device-handoff/evidence/macos-receipt.json)。下一步接入队首认领、目录验证、SDK 初始化及输入投递。

2026-11-22T01:54:16Z，`get_usage_limits` 的 Codex 10080 分钟窗口剩余 68%，11 月 24 日 17:34:52（上海）重置。认证 Web profile 已通过真实入队、并发重放、变更载荷拒绝、取消重放、重启后原回执及无配置拒绝。下一步将队首认领和 SDK 生命周期接到 Host。无需更新 Architecture、Memory 或 WORKFLOW。 PASS · `pnpm exec tsc -b packages/api/taskboard-controller/tsconfig.json`、`pnpm exec tsdown --env.DSH_BUILD_FACE host --filter @deepseek-ai/dsh-api-taskboard-controller`、Host 定向测试 16 项及认证 Web 冒烟 1 项；在本地工作区验证，未提交。

2026-11-22T02:05:16Z，`get_usage_limits` 的 Codex 10080 分钟窗口剩余 67%，11 月 24 日 17:34:52（上海）重置。 已接入认证 Web 入队与可显式启用的 Host SDK 调度。macOS 上通过两项真实 Web Host 冒烟及一项 SDK 录制 Session 回放。范围不明时仍保留租约。下一步核对权限失败与回执写库失败在正式调度入口的表现，再接同目录恢复。无需更新 Architecture、Memory 或 WORKFLOW。 PASS · 控制器编译、定向构建、调度 Web 冒烟 2 项、keyless SDK 录制回放 1 项、README 模型体验及导出 JSDoc。仓库文档聚合仍存在旧链接、双语配对、换行与原有证据文件提交号问题，定向文档检查另行记录。

2026-11-22T02:07:47Z，`get_usage_limits` 的 Codex 10080 分钟窗口剩余 67%，11 月 24 日 17:34:53（上海）重置。正式 Web 入口的 [故障验证](evidence/macos-dispatch-faults.json)通过。下一步接入 SDK 原目录恢复，检查持久 Session 的工作目录与未处理输入，再允许新 Run 投递。无需更新 Architecture、Memory 或 WORKFLOW。

2026-11-22T02:15:39Z，`get_usage_limits` 的 Codex 10080 分钟窗口剩余 67%，11 月 24 日 17:34:52（上海）重置。原目录继续、换目录隔离和 Session 缺失均通过 [macOS Web 验收](evidence/macos-resume.json)。下一步验证 SDK 已接纳输入但 ACK 丢失时能否从绑定 Session 对账。无需更新 Architecture、Memory 或 WORKFLOW。

2026-11-22T02:22:27Z，`get_usage_limits` 的 Codex 10080 分钟窗口剩余 67%，11 月 24 日 17:34:53（上海）重置。PASS · 5 项认证 Web、96 项定向 Host/SDK 单测、30 项 Python SDK、1 项 keyless 快照、代码 lint 和 6 组定向双语检查。回执写入失败、传输丢失、停止后迟到及握手期间停止均覆盖。全仓 `doc-sync` 37 项通过、5 项失败，见 [验收证据](evidence/macos-web-acceptance.json)。当前首发缺正式 macOS 全工具范围退出证明，记录 HANDOFF_READY，释放单写权。

2026-11-22T12:14:37Z，Codex 核对本地 Git、未提交修改、进程及交接状态，接管本任务单写权。10080 分钟窗口剩余 67%（`get_usage_limits`），11 月 24 日 17:34:53（上海）重置。先验证 macOS 正式 SDK 启动器可用的完整进程范围，再复验租约与队列。

2026-11-22T12:28:45Z，正式 macOS SDK 进程范围验收 PASS。6 项真实 Web 集成、106 项工作区约束单测、SDK 与 Taskboard 定向编译和构建、快照重放、发布清单、定向文档和 lint 通过。测试过程保留所有既有改动。当前周剩余 67%，未触及 20% 停止线。[验收](evidence/macos-launchd-scope.json)。
