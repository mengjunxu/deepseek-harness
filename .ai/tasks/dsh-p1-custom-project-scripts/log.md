# 验证记录

2026-11-24T15:15:51+08:00 桌面 get_usage_limits，七天窗口剩余 21%，用户停止线 20%。基线为上次已推送的工作台提交。

- 15:17 定向 Vitest 4 项通过。随后运行完整的 taskboard.host.spec.ts，34 项通过。受影响的 Host、Client 与 Web TypeScript 构建、定向 tsdown 和 build:web 通过。
- 源码构建执行 `node apps/web/tests/fixtures/taskboard-smoke.mjs --custom-npm` 通过，验证退出 17、人工豁免、摘要和恢复。
- 首次 `--custom-pnpm` 检测到快照改变。在独立临时项目复现 pnpm 11 运行脚本前生成 pnpm-lock.yaml 和 node_modules 内容。SDK 禁用运行前自动安装后，重新构建 Host 并重跑 `--custom-pnpm`，退出 0、人工接受和恢复通过。
- verify-persistence-changes 和 verify-cordis-catalog 通过。两个 README 对已更新翻译配对记录。定向 oxlint 报告三项：taskboard.e2e.ts:208 与 TaskboardPage.tsx:242 回调参数缺括号，TaskboardPage.tsx:220 行长超限。
- 15:20:38 桌面 get_usage_limits，窗口 10080 分钟，剩余 20%，北京时间 2026-11-24 17:34:52 重置，停止新增工作。

- 2026-11-24T15:23:25+08:00 已核对 Git 与上次暂停记录，Codex 接回单写。桌面 7 天窗口剩余 20%，重置时间 17:34:53，按 WORKFLOW 的 10% 停止线继续。

- 2026-11-24T15:25:08+08:00 定向 oxlint、git diff --check、三个手写双语文档对及生成配置目录的配对检查通过。doc-sync 首轮 36/42；本步触发的配置目录行号已重新生成，verify-config-catalog 复验通过。其余五项为既有的文档类型、Markdown 链接、翻译配对、换行和旧提交号引用。独立安装开始前及阶段复核的桌面七天窗口剩余 20%，17:34:52 重置。

- 2026-11-24T15:26:55+08:00 正式构建、323 个 DSH tarball 打包、334 个本地产物解析和 CLI 独立安装验收均通过。`--taskboard custom-scripts` 的两个探针分别完成失败与成功脚本、人工接受以及新业务库恢复。Vitest Web 定向运行 4 项全部通过，涵盖新脚本与原有 npm 两种入口。[可复核的证据](evidence/local.json)。
