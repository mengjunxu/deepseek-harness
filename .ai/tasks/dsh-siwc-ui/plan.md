# Plan

- [x] 核对现有服务、UI、官方 SIWC 文档和单写入者。
- [x] 实现显式启用的实验插件，复用 pi-ai 翻译与现有服务。
- [x] 实现设置页登录/状态/使用说明和会话中的订阅标识。
- [ ] 定向测试、Loader 真实组合与 Session 快照覆盖。
- [ ] 启动正常 Web profile，在 UI 完成真实授权、对话并录制。
- [ ] 更新双语文档、结果、交接和未验证项。

2026-10-26 文档审计补充：供应商矩阵、README、Checklist 与 Memory 已同步；重新读取的脱敏 Session 证据有三个 completed 轮次，见 [audit-evidence.json](../dsh-chatgpt-plan-update/artifacts/audit-evidence.json)。这些记录更新不完成本任务的真实长回复、Loader、录制快照、重启/GIF 验收。后续业务实施按主计划 CG0–CG5 与用户阶段授权进行，P1-05 保持 Partial。

## Validation

2026-10-26（目录限流）：将成功流回归中的 `/models` 响应改为 429，先以 `node node_modules/vitest/vitest.mjs run packages/experimental/chatgpt-plan/tests/provider.spec.ts -t "uses the public Responses endpoint" --reporter=dot` 确认修复前失败于 RATE_LIMIT（沙箱缓存 EPERM 后原命令宿主重试）。修复后插件完整 19 项测试通过，HTTP 断言只发送一次 `/responses` 请求。包 Host/Client 类型检查、局部 lint、README 双语配对、`git diff --check` 和 Host 定向构建通过。未引入目录缓存、重试或新配置，账户凭据仍在推理入口校验。真实请求、Session 快照及 Loader 组合验收 NOT_RUN。

2026-10-26（流式超时）：真实 Session 前两轮 completed，第三轮 step/start 至 step/end 为 120807 ms，终态为缺少终止事件 / ABORTED。已将默认总期限从 120000 调整为 600000，并保留超时信号以区分 TIMEOUT、调用方 ABORTED 和上游截断 TRANSPORT。新增回归以受控信号和响应流关闭触发结束，不等待真实时钟；19 测试通过（沙箱缓存 rename EPERM 后同命令宿主重试）。包 Host/Client 类型检查、局部 lint、双语配对检查与 Host 插件定向构建通过；真实长回复重试及 Session 快照 NOT_RUN。最终修改未 Commit / Push。

2026-10-26：额度误报修复后，插件 3 文件 / 16 测试通过（沙箱缓存 rename EPERM 后原命令宿主重试）；同包 Host/Client 类型检查、局部 lint、README 双语配对、`git diff --check` 通过，Host 插件定向 tsdown 构建完成。回归覆盖 HTTP 429 限流、明确订阅限额、HTTP 503 额度查询不可用及两类流内错误，保留原始诊断。本地 Session 两条 turn/end 只含 HTTP 429 / QUOTA，不足以确认原始端点或额度原因；未执行真实账户重试、Session 快照及完整组合验收。

2026-10-25：命名空间必填描述修复后，`node node_modules/vitest/vitest.mjs run packages/experimental/chatgpt-plan/tests --reporter=dot` 在沙箱因临时缓存 rename 的 EPERM 未运行测试，原命令宿主重试 3 文件 / 11 测试通过。包 Host/Client `tsc -b`、定向 `run-oxlint.ts`、README 命名双语配对检查、`git diff --check` 通过。`node node_modules/tsdown/dist/run.mjs --env.DSH_BUILD_FACE host --filter @deepseek-ai/dsh-experimental-chatgpt-plan` 重建成功。HTTP 回归包含一个函数工具并断言命名空间和函数描述均保留；此次未运行真实账户请求、Session 快照或完整组合验收。新增命名空间描述为 `Tools available in this DSH session.`；未实测首轮 Token 差值。

2026-10-24 的以下检查针对本次本地检查点中的源码，均通过：

- `node node_modules/vitest/vitest.mjs run packages/experimental/chatgpt-plan/tests --reporter=dot`：3 个文件，11 个测试通过。
- `node node_modules/typescript/bin/tsc -b packages/experimental/chatgpt-plan/tsconfig.host.json packages/experimental/chatgpt-plan/tsconfig.client.json`。
- `node node_modules/tsx/dist/cli.mjs scripts/run-oxlint.ts packages/experimental/chatgpt-plan packages/llm/llm-pi-ai/src/index.ts`。

2026-10-23 已执行的辅助验证：GUI 测试 592 个文件通过、9335 个测试通过、1 个跳过；Host/Client 和 Web 构建通过；Client 包、UI 本地化、导出 JSDoc 和两个受影响双语配对检查通过。这些结果属于当时的工作区，未作为本检查点的完整仓库验收。

真实 Web profile 已启动并从 Settings → Models 打开官方授权页，用户报告授权完成。最后一次 DSH 页面观察仍为等待授权，尚未核实回调和账户提交，不能据此声称产品链路通过。临时服务、截图、私有数据目录和覆盖配置位于忽略的 `.playwright-mcp/siwc-ui/`；不提交凭据或包含本地信任 Token 的日志。

NOT_RUN：Session 录制快照、Web 回放检查、真实 UI 对话与 GIF、重启复用；这些是后续验收项。完整文档检查未针对本检查点重跑；此前工作区已有双语配对、换行、仓库引用、文档类型检查和 Cordis 目录失败，不能将定向检查等同于完整文档通过。
