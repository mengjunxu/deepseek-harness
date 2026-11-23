# 执行记录

2026-11-23T03:21:31+00:00 桌面 get_usage_limits 的 Codex 10080 分钟窗口剩余 61%，2026-11-24 17:34:52 上海重置；停止线 20%。

2026-11-23 11:23 上海，原有 Host 回归 24 项、共享 SQLite 双 Host 抢占与路径互斥回归 1 项通过。并行 SDK 的正式 Web 路径留到第三步验证。桌面 Codex 周剩余 61%，11 月 24 日 17:34:52 上海重置。

2026-11-23 11:28 上海。Host 回归 26 项通过。正式 Web、Chromium 和两个并行 SDK 的单场景通过，用隔离本地模型端点控制交错，三个不同 Session，授权领取一次，依赖等待人工接受，重启保留历史。桌面 Codex 周剩余 60%，11 月 24 日 17:34:52 上海重置。下一步完成权限与完整 Taskboard 回归。

## macOS 产品验收

- `pnpm run build` 通过。正式 Web profile、SDK、launchd、SQLite、Git 工作树和 Chromium 均在 macOS 15.6.1 arm64、Node 26.5.0 上执行。模型响应使用本地 HTTP 测试服务，以确定两个输入重叠的时点。
- `node_modules/.bin/vitest run packages/api/taskboard-controller/tests/taskboard.host.spec.ts` 26 项通过。双 Host 竞争时拒绝重叠目录；并发 SDK 使用相同审批请求 ID 时各自收到指定结果。跨项目关系、父子环、依赖环、未获授权的提早执行和原目录自动领取均被拒绝。授权未领取时可撤销，重放原命令保持已取消。
- `node_modules/.bin/vitest run --config vitest.web.config.ts apps/web/tests/taskboard.e2e.ts` 21 项通过。前一次测试与文档门禁的构建同时运行，后者重建 CLI 时有 5 项找不到入口。完成构建后独立重跑整组通过。
- `node_modules/.bin/vitest run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts -t taskboard-dispatch` 命中 1 个已录制的 SDK 场景，通过。
- 最终构建执行 `node apps/web/tests/fixtures/taskboard-smoke.mjs --parallel --evidence` 与 `--parallel-crash --evidence`。前者验证浏览器设置关系、单次授权、独立 Session、定向停止、匿名写入拒绝和验收触发；后者验证两个原 Run 均中断且第三个排队 Run 完成。每份输入只出现一次。[实测记录与构建指纹](evidence/macos-parallel.json)。
- TypeScript 受影响工程编译、受影响目录 Oxlint、两份 README 双语配对和导出 JSDoc 检查通过。配置及 Cordis API 目录已再生成。

2026-11-23T03:37:02+00:00 最终 doc-sync 为 37/42。五项失败来自历史文档中的链接和 TypeScript 示例、规划文档的换行与双语配对、跨设备旧证据中的提交引用。当前导出 JSDoc、配置和 Cordis 目录以及工作台两个包的 README 配对均通过。两份浏览器测试脚本通过 Node 语法检查。七个构建或源码指纹已重新计算核对，任务测试启动的 SDK launchd 作业已退出。桌面 get_usage_limits 的 Codex 10080 分钟窗口剩余 59%，2026-11-24 17:34:52 上海重置；本轮停止线为 20%。
