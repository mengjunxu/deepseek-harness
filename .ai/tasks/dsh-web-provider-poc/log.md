# Task Log

## 2026-11-01 — 接续第一优先验证

用户要求继续，Codex 读取共享规则、前序 Checkpoint、主 Plan 第 15 节和 proposed ADR，核对真实 Git 后建立本 Task，保持单写入者。五小时余量实测 75%，未触发停止线。CUA 盘点没有连接的浏览器扩展，原生 Edge 可用；下一项为接入与登录条件检查，不把工具盘点当真实 Web 成功。

## 2026-11-01 — Step 1a DONE / 1b 等待登录

- `npm install --prefix .artifacts/cgw-tools --no-audit --no-fund bun@1.4.0` PASS；参考根与 launcher 各执行 `bun install --frozen-lockfile --ignore-scripts` PASS；launcher `node node_modules/electron/install.js` PASS。所有工具、依赖和私有浏览器数据均在忽略目录，DSH 依赖/锁文件未变。
- 参考根 `bun run scripts/build-browser-helper.ts` PASS；launcher 首次绝对路径调用 build 因子脚本找不到 PATH 中 bun 返回 127，补上仅该命令的私有 Bun PATH 后 `bun run build` PASS（tsc + Vite），未改源码或脚本。
- launcher `node --test tests/profile.test.cjs`：3 PASS；参考根 `bun test tests/dev-profile.test.ts tests/browser-worker-contract.test.ts`：153 PASS / 0 FAIL。均未发送真实模型请求。
- `python3 .artifacts/cgw-launch-dev.py` 在前一回合启动 DEV；中断后进程不再存在，本轮关闭了 CUA 自动打开的 Electron 默认窗口，再用 `python3 .artifacts/cgw-launch-dev.py --detach` 恢复。原生窗口可由 CUA 控制，`dev status --json` 显示 running / development、configured=false、MCP not required。参考检出 `git status --short` 为空。
- DEV 登录入口先出现 Cloudflare challenge，已请用户亲自验证；恢复后 CUA 已到 ChatGPT 登录表单，仍未登录。截图保存在本地 `.artifacts/cgw-dev-login.png`，未记录账户信息。当前无真实 prompt、reply 或完成状态证据。
- 00:19:49 额度剩余 69%；00:22:34 恢复检查剩余 67%，均为 Plus / Codex / 300 分钟窗口，未触发停止线。后续重新查询。
- 新增长期结论是 DEV listener 禁止及 handler 复用约束，Memory 保留本 Task 索引；WORKFLOW 无变更需要。下一步等待登录并完成独立接口检查，不绕过现有 Web 默认门禁。

## 2026-11-01 — Step 1 DONE / 真实 smoke PASS

用户亲自登录并处理新 smoke 页的人机验证。CUA 确认登录；启动器自动 smoke 发送固定标记并得到精确回复，网页显示 `5.6 High` / Response complete，Setup 显示 Smoke test passed。随后 Initialize profile 成功，dev status --json 实测 configured=true / browser-only / dev-harness，MCP 不需要。未由 Agent 点击验证码、提取凭证、安装全局路由或启动系统服务。00:28:23 的 Codex 五小时余量为 56%，未触发停止线；下一步为唯一标记的程序化请求。Memory/WORKFLOW 无进一步更新需要。

## 2026-11-01 — Step 2 DONE / 唯一标记与 SSE

- 本地脱敏环境 wrapper 执行 DEV CLI `dev chat dsh-wb01-20261101-0029 --model gpt-5.6-sol` 并提交唯一标记提示，退出 0。日志为 `.artifacts/cgw-dev-runtime/unique-turn.log`，提交 accepted / generation_running，浏览器最终 settled=final。
- 本 Task `artifacts/reference-request-probe.ts` 的 stream 模式最终退出 0，00:33:13–00:33:25 的真实 SSE 证据位于 `evidence/reference-stream.json`：HTTP 200、精确标记、response.completed、无 adapter error、清理后活动 Turn 为 0。来源始终为 chatgpt_web_unofficial，未注册或绕过 DSH 路由。
- 最初独立 probe 未激活 DEV 环境，在配置读取处失败且没有浏览器请求；随后消息缺少 current-turn metadata 被参考预检同步拒绝，已保留拒绝 JSON。按参考 driver 明确补齐后才进入真实收发；未对不确定提交自动重发。
- 第一轮流探测已真实完成，但脚本将参考 commentary 混入答案导致 exactMarker=false，原始 JSON 保留为 reference-stream-unclassified.json；按 source phase 分类后重跑 PASS。这是测量修正，不修改参考实现。最终回答只有一段 delta，未将 commentary 或 heartbeat 数量当作模型渐进分块能力。
- 下一步为参考取消探测及 DSH 准入/接入方案；Memory 更新相关协议约束索引，WORKFLOW 无变更需要。

## 2026-11-01 — 参考取消 / DSH 门禁 DONE，等待准入决定

- reference-request-probe.ts 的 cancel 和 cancel-generating 模式均退出 0，JSON 分别保存客户端取消、非成功终态和清理计数。生成 trace 取消无最终回答 delta；最终文字取消可能已在网页生成完后发生，不把本地错误终态当服务器额度返还证据。没有对已接受的同一请求自动重发。
- `PYTHONPATH=python/sdk/src /opt/anaconda3/bin/python .ai/tasks/dsh-web-provider-poc/artifacts/dsh-gated-probe.py` 退出 0，真实 DSH SDK profile 记录默认门禁 PROVIDER_UNAVAILABLE、无 request/header / 回复。
- 七份锁定参考模块指纹仍匹配前序审阅；参考检出未修改，脱敏汇总 reference-runtime-summary.json 单列真实、参考测试、DSH 拒绝和未运行项。
- `pnpm exec tsx .artifacts/web-poc-doc-check.ts`（传入 Memory、主 Plan 和本 Task 五份 Markdown）PASS；`pnpm run verify-md-links` PASS（2321 文件）；`pnpm run verify-repository-references` PASS；`pnpm run verify-doc-budgets` PASS（8 文件）；`python3 -m py_compile .ai/tasks/dsh-web-provider-poc/artifacts/dsh-gated-probe.py` PASS；证据断言、凭据模式扫描和 `git diff --check` PASS。本轮没有重复完整 test:docs/doc-sync 或产品测试，没有修复既有文档债务。
- 已向用户提交 admission-proposal.md 的明确受限方案，尚未收到批准。依据主 Plan 第 15 节与 WORKFLOW 第 2.3、4 节，不放开既有约束；Task BLOCKED / Checkpoint HANDOFF_READY。主 Plan 两个 Web 条目保持第一优先、未勾选；Memory 已同步协议结论，WORKFLOW 无进一步变化。
- 2026-11-01T00:40:08.817+08:00 五小时余量 42%，未触发停止线。DEV launcher 保持隔离运行，探测均已退出；本轮无 Commit/Push。保存最终记录后停止写入、释放写入权，不自动启动接收 Agent。

## 2026-11-01 — 用户批准后 3a 增量检查点

Codex 恢复单写入权，实施受限注册授权；policy ready 的默认拒绝未放开。vitest validation-admission.spec.ts 与 provider-policy.spec.ts 共 25 PASS；tsc -b packages/llm/llm 退出 0；tsdown --filter @deepseek-ai/dsh-llm --env.DSH_BUILD_FACE host 退出 0。仅新增 home-paths workspace 依赖和 3 行锁文件，冻结离线安装通过。README 双语同步；home 存在性小修后待复验。DSH 实际请求与 keyless snapshot 尚未执行。无额外 Memory/WORKFLOW 更新需要。

## 2026-11-01 — 3a 完成与验证

最终聚焦测试 validation-admission/provider-policy/service 共 118 PASS；新 SDK web-validation-admission 的 refresh/replay 各 1 PASS，记录/输出已审阅，保留 V3/V4。首次 fixture 从 source index 导入失败（decorator 源不适用于 built profile），修正为包 self-reference 后通过；未绕过 Loader。最终 tsc -b llm、定向 tsdown、范围 oxlint、export JSDoc、2 组配对、2321 文件链接与 diff --check 通过。目录生成最初暴露既有 ChatgptPlanState/ctx.chatgptPlan 未分类，补齐明确文档归属后生成成功，含新 LlmValidationAdmission 的公开签名。全仓 lint 收尾尚待确认。3b 真实 DSH transport 未实施，不标完成。Memory 更新稳定接口索引，WORKFLOW 无改动需要。

## 2026-11-01 — 14% 额度停止

01:02:29+08:00 读取 get_usage_limits，五小时剩余 14%，重置 04:44:11+08:00，触发用户停止规则。Python SDK 额外回归先发现预算拒绝在 prepareCall 被归成 UNKNOWN；修复为 LlmError 后 tsc、定向 tsdown、118 项测试、Python 首次 Mock 成功/第二次拒绝回归和目录生成均通过。未新增真实模型调用。最后修复后尚未重跑 lint/replay/配对，已列出，不冒称全通过。记录完成后释放写入权，Task 未 DONE，未 Commit/Push。下一步实现 DSH worker，先核对额度和写入权；不再次索要已批准的 PoC 范围。

## 2026-11-02 — Codely 接手并补齐最终修复后验证

2026-11-01T23:58:46+08:00 用户明确指示 Codely 接手；按 WORKFLOW §5.2 核对 Checkpoint 与真实 Git 状态一致（阶段 3a 文件、文档对、生成目录、快照均吻合），记录单写入权，见 task.md Takeover。Codex 五小时额度规则只约束 Codex 账户，不构成 Codely 阻塞。

最终 prepareCall 修复后此前 NOT_RUN 的三项检查全部 PASS，被测版本为未提交工作区（含该修复）：

- `corepack pnpm exec tsx scripts/verify-translation-pairing.ts packages/llm/llm/README.md docs/subsystems/llm-streaming.md` PASS：2 组命名配对一致。
- `corepack pnpm exec vitest run --config vitest.snapshot.config.ts -t web-validation-admission` PASS：1 passed / 184 skipped，web-validation-admission keyless 回放通过。
- `corepack pnpm run lint` PASS：build:lib:host 后 oxlint 5060 文件 0 warnings 0 errors，EXIT_CODE=0。

不因此冒称全仓 doc-sync、full coverage 或产品测试通过；既有全仓配对/wrap 债务保持单列。无新增跨任务 Memory 结论，WORKFLOW 无变更需要。下一步实施阶段 3b：独立 worker 与 DSH Adapter，先做 wire JSON/取消/子进程清理的 Mock 验证，真实浏览器请求发起前单独向用户确认。

## 2026-11-02 — 3b 桥接实现与 Mock 验证

组件落地：`artifacts/web-validation-worker.ts`（独立 Bun worker，mock-complete/mock-generating/mock-rejected/real 四场景；mock 不触碰浏览器，real 复用参考进程内 responseRequest/createLauncherDevAdapter、不启动 Responses listener、保留 purpose 校验与 closeChatGptBrowserWorkers 清理；`--evidence` 把全部协议记录镜像进本地文件）、`packages/llm/llm/tests/fixtures/web-bridge.ts`（经受限准入注册的桥接 Adapter：worker NDJSON→StreamChunk 映射，commentary→reasoning 块、最终文本→text 块、error→LlmError（code/status 进 failure 事实）、取消→worker abort+SIGKILL 兜底；prompt 提取跳过 runtime-context 注入；attributionHeaders user-agent 进 wire 请求；不声明工具能力，意外 tool 流量 fail-closed）、`artifacts/web-bridge-adapter-check.ts`、`artifacts/dsh-web-bridge-check.py`（生成禁用全部本地工具行与 llm-deepseek 的 patch，经真实 built sdk profile 驱动）。

- 适配器层 18 项全 PASS：wire 往返（模型/提示词/effort/threadId/turnId 关联/attribution/系统提示长度）、commentary 与最终文本分块、取消（mid-stream abort 无 finish、worker 退出 activeTurns=0、无孤儿进程）、失败映射（invalid_request/400/消息）与三路径子进程清理。命令：`corepack pnpm exec tsx .ai/tasks/dsh-web-provider-poc/artifacts/web-bridge-adapter-check.ts`。
- 运行时层 PASS：`PYTHONPATH=python/sdk/src /opt/anaconda3/bin/python .ai/tasks/dsh-web-provider-poc/artifacts/dsh-web-bridge-check.py`。完成路径 final_response 与提示词逐字一致；第二次调用 turn/end 为 VALIDATION_ADMISSION_DENIED（受限准入经真实桥接注册生效）；mock-rejected 的 turn/end 携带 invalid_request/400/消息；session log request/header 记录 provider=chatgpt_web_unofficial、model=gpt-5.6-sol、无本地工具；worker 证据含 threadId/turnId（真实 user message id）与 attribution UA，退出记录 failure=null/activeTurns=0。证据：evidence/dsh-web-bridge-mock.json、bridge-mock-complete.ndjson、bridge-mock-rejected.ndjson。
- 排障事实：built 运行时经 Node 22.18 原生 type-stripping 加载 .ts 插件，构造器参数属性在 strip-only 模式不支持（已改显式字段赋值）；`--patch` 内插件 `name` 按 patch 文件目录解析 `.` 前缀相对路径，`file://` 形式不可导入。两条均已写入 Memory。
- 门禁：fixture 定向 oxlint 0 警告 0 错误；原生 Node 导入 OK；适配器/运行时验证在最终形态复跑通过。全仓 lint 为 fixture 加入前结果，fixture 由定向检查覆盖；真实请求后收尾时重跑全仓 lint。取消验证在适配器层完成——Python/TS SDK 均无 wire-level cancel（client 文档明确），不冒称 Session 级取消证据。
- 真实浏览器请求未发起，等待用户确认。DEV launcher（pid 20597）存活，`dev status --json` 实测 running/development、configured=true、browser-only、dev-harness、MCP not required；登录态是否仍有效未知，以真实请求结果或重新登录为准，不并发共享浏览器数据目录。

## 2026-11-02 — 真实请求第一次尝试：提交前失败，无用量消耗

用户明确同意后执行 `PYTHONPATH=python/sdk/src /opt/anaconda3/bin/python .ai/tasks/dsh-web-provider-poc/artifacts/dsh-web-real-request.py`（scenario=real、maxCalls=1）。结果 FAIL，不自动重发：

- turn/end 为 error/UNKNOWN：`Unexpected token 'c', "[chatgpt-we"... is not valid JSON`；wire 记录 response.created → response.failed（in_progress → failed），无最终文本 delta。
- 参考 turn 诊断（`.artifacts/cgw-dev-runtime/runtime/dsh-bridge/diagnostics/browser-turns/05bfec253917-ea10b915/`）：checkpoint `browser-page-acquired` 与 `turn-failed`，error=`ChatGPT prompt attachment aborted`；页面 origin="null"、bodyTextChars=0、无 composer/UI 组件——浏览器页面不是 chatgpt.com，24 小时后页面状态已失效。
- 判定：失败发生在提示词附载阶段，**提交从未被接受**，未消耗模型用量；准入预算按设计被本次失败消费。运行时侧准入、路由、清理行为符合预期（request/header 正确、worker exit activeTurns=0）。
- `browser check`/`dev launcher` 子命令不适用（前者需全局配置，隔离设计使其不可用；后者只找已安装 launcher）。launcher 进程存活但页面空白，需要用户检查隔离浏览器窗口（重新登录或由我重启 launcher 后由用户确认登录态）。
- 证据：evidence/dsh-web-real.ndjson、dsh-web-real-request.json（断言失败前的完整 result）、参考诊断目录。等待用户处理浏览器窗口后，用全新准入运行一次重试（非对已接受提交的重发）。

## 2026-11-02 — 真实请求成功 / 3b 完成

诊断与修复：用户确认窗口已登录后按授权重启 launcher（kill 旧 pid 20597 → SIGKILL 兜底 → `cgw-launch-dev.py --detach` 新 pid 66262，dev status 正常），第三次尝试仍同样失败，据此排除 launcher 进程本身。真正根因是桥接协议缺陷：参考 transport 经 `console.info` 输出 `[chatgpt-web]` / `[chatgpt-web-helper]` 日志行，与 worker 的 NDJSON 协议共用 stdout；adapter 对每行 `JSON.parse`，首个日志行即抛错 → 运行时中止信号级联 → worker 中止浏览器 turn（"ChatGPT prompt attachment aborted"，诊断停在 page-acquired 后 0.5 秒、页面仍空白——"空白页"是正常初始态，导航被中止才未发生）。修复：worker 将 `console.info` 重定向到 stderr（stdout 只留协议记录），adapter 对非 JSON 行容错跳过；worker 退出记录增加 `capturedAt`/`abortCause` 诊断字段。三次失败均发生在提交被接受之前，未消耗模型用量。

修复后全链路复验与真实请求：

- Mock 链无回归：适配器层 18 项 PASS；运行时层 mock 完成/拒绝 PASS。
- 真实请求 PASS（用户此前已同意本次重试）：`dsh-web-real-request.py` 断言全过——finishReason=completed、final_response 与唯一标记 `DSHWEBBRIDGEF421814894F5` 精确一致（exactMarker=true，非手工/Mock）、wire 记录 response.created→…→response.completed（in_progress→completed）、真实 usage（inputTokens 8937 / outputTokens 24 / totalTokens 8961，estimated=true，原始记录保留于 evidence/dsh-web-real.ndjson）、request/header 为 chatgpt_web_unofficial/gpt-5.6-sol 且无本地工具、worker 退出 failure=null/aborted=false/abortCause=null/activeTurns=0、threadId/turnId 关联真实 user message id、attribution user-agent 在 wire 请求上。证据：evidence/dsh-web-real-request.json、dsh-web-real.ndjson。
- 收尾门禁：`corepack pnpm run lint` 全仓 PASS（5063 文件 0 警告 0 错误，含新 fixture）；`tsc -b packages/llm/llm` PASS（fixture 不在 src include 内，类型正确性由运行时验证与原生 Node 导入覆盖）；适配器/运行时验证最终形态复跑通过。
- 证据边界：Session 级取消无 SDK wire-level cancel 入口（Python/TS client 文档明确），取消证据止步适配器层；真实失败路径有三份提交前失败证据（turn/end error + response.failed + 参考诊断），非模拟；usage 为参考 estimated 口径。
- Memory 无需再更新（loader/strip 结论已入）；WORKFLOW 无变更。本轮全部变更仍未 Commit/Push；launcher 为重启后新进程 pid 66262。
