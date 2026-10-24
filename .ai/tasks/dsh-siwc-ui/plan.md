# Plan

- [x] 核对现有服务、UI、官方 SIWC 文档和单写入者。
- [x] 实现显式启用的实验插件，复用 pi-ai 翻译与现有服务。
- [x] 实现设置页登录/状态/使用说明和会话中的订阅标识。
- [ ] 定向测试、Loader 真实组合与 Session 快照覆盖。
- [ ] 启动正常 Web profile，在 UI 完成真实授权、对话并录制。
- [ ] 更新双语文档、结果、交接和未验证项。

## Validation

2026-10-24 的以下检查针对本次本地检查点中的源码，均通过：

- `node node_modules/vitest/vitest.mjs run packages/experimental/chatgpt-plan/tests --reporter=dot`：3 个文件，11 个测试通过。
- `node node_modules/typescript/bin/tsc -b packages/experimental/chatgpt-plan/tsconfig.host.json packages/experimental/chatgpt-plan/tsconfig.client.json`。
- `node node_modules/tsx/dist/cli.mjs scripts/run-oxlint.ts packages/experimental/chatgpt-plan packages/llm/llm-pi-ai/src/index.ts`。

2026-10-23 已执行的辅助验证：GUI 测试 592 个文件通过、9335 个测试通过、1 个跳过；Host/Client 和 Web 构建通过；Client 包、UI 本地化、导出 JSDoc 和两个受影响双语配对检查通过。这些结果属于当时的工作区，未作为本检查点的完整仓库验收。

真实 Web profile 已启动并从 Settings → Models 打开官方授权页，用户报告授权完成。最后一次 DSH 页面观察仍为等待授权，尚未核实回调和账户提交，不能据此声称产品链路通过。临时服务、截图、私有数据目录和覆盖配置位于忽略的 `.playwright-mcp/siwc-ui/`；不提交凭据或包含本地信任 Token 的日志。

NOT_RUN：Session 录制快照、Web 回放检查、真实 UI 对话与 GIF、重启复用；这些是后续验收项。完整文档检查未针对本检查点重跑；此前工作区已有双语配对、换行、仓库引用、文档类型检查和 Cordis 目录失败，不能将定向检查等同于完整文档通过。
