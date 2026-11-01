---
schema_version: 1
task_id: dsh-web-provider-poc
state: HANDOFF_READY
previous_agent: Codex
next_agent: Codely
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-11-02T00:16:28+08:00"
---

# Current checkpoint

用户已明确批准 admission-proposal.md；不再等待同一确认。额度停止线已触发，Codex 保存本记录后停止写入并释放写入权。参考浏览器真实验证完成，DSH 受限准入实现阶段 3a 完成；真实 DSH 浏览器 worker 阶段 3b 尚未实现。WB-01 / VN4-06 未完成，不能标 DONE。

## Completed

参考 DEV Browser-only 真实 smoke、唯一标记 SSE、客户端取消和本地清理有脱敏证据；服务器停止生成/额度返还未知。此前 DSH 默认门禁拒绝已记录。用户批准后，registerAdapter 增加可选 LlmValidationAdmission：实际非默认 home 绑定、单一路线/精确模型、到期、准备额度和注册代次撤销。预算在准备时原子消费，失败/未使用也不退还；替换不续额，撤销/到期拒绝已准备未分派的调用。默认 ProviderPolicy 仍 gated，普通注册保持拒绝，没有全局配置变化。

118 项聚焦测试、SDK keyless refresh 和最终构建 replay 各 1 项通过；包 tsc、定向 tsdown、范围 oxlint、导出 JSDoc、两组文档配对、2321 文件链接和 git diff --check 通过。全仓 lint 收尾结果待写入 Log；没有本轮 full coverage/平台矩阵/真实 DSH 模型通过的声明。新快照保留 authored V3 与生成 V4；未覆盖既有代次。

## Files and Git

本轮新增 packages/llm/llm 的授权实现/测试/SDK fixture，修改 README 对及子系统对、manifest/tsconfig 和 3 行锁文件；新增 snapshots/sdk/web-validation-admission。gen-cordis-catalog.ts 增加新类型归属，并补齐阻断生成的既有 chatgptPlan 服务和状态归属；生成的 llm-streaming 与 tool-cordis/api-catalog 同步。前序共享规则及个人 .codely-cli/settings.json 保留，该设置未读取或修改；无 Commit/Push。

参考源码在 .artifacts/references/codex-chatgpt-web-current，Bun 在 .artifacts/cgw-tools，私有 DEV 数据在 .artifacts/cgw-dev-runtime；它们均忽略，不提交登录数据。DEV launcher 保持运行，没有活动模型 probe。再次启动前核对进程，不能并发共享其浏览器数据目录。开始时余量 39%，最近已降至 17%，必须重新查询后再开始高消耗工作。

## First remaining action

先核对额度、写入权和实际 Git；再实施独立 worker 与测试用 DSH Adapter，复用参考进程内 responseRequest，不启动其禁止的 Responses listener。使用已授权独立 DSH home，只允许一次明确模型的真实请求，禁用 SDK profile 的本地工具；通过 sessionId 和当前 user/message id 关联参考 thread/Turn。commentary、最终文本、错误和取消保持区别，不把额外费用来源伪标为 local/api_metered。先验证 wire JSON、取消及子进程清理，再启动真实 DSH 请求。当前没有这段 transport 代码，不能把参考成功或 keyless Mock 当成实际集成。

Memory 当前稳定的源码接口结论索引应指向 LLM README；临时进度在本 Task，WORKFLOW 无进一步变化。ADR 提案未冒充完整 Web 实现。此前等待授权的记录仅属历史，当前授权已收到。

## Quota stop — latest authoritative state

2026-11-01T01:02:29+08:00，get_usage_limits 实测 Plus / Codex / 300 分钟窗口剩余 14%，低于用户 15% 停止线；重置 2026-11-01T04:44:11+08:00。停止新增开发、检查及模型请求，仅保存本次交接；接收 Agent 和时间待实际接手时填写，不自动启动 Codely。用户要求恢复时先重新查额度，不能凭历史余额继续。

最后 Python SDK 两次 Mock 请求发现准备阶段拒绝码曾被 Agent 归为 UNKNOWN；已在 LlmRuntime.prepareCall 将该授权错误转成 LlmError。最终包 tsc、定向 tsdown、118 项测试与 Python 双调用回归通过：第一次 VALIDATION_OK，第二次 VALIDATION_ADMISSION_DENIED。目录生成命令已收尾。最后修复后尚未重跑全仓 lint、keyless replay 或双语配对；此前通过的结果对应修复前版本，不能混称最终全通过。真实 DSH worker 和真实浏览器调用仍未实现/运行，主任务未完成。

当前所有变更仍在本地，无 Commit/Push；保留用户 .codely-cli/settings.json。Memory 已指向已验证的准入接口，WORKFLOW 无进一步变化；下一步按本 Checkpoint 的 worker 任务执行，先完成剩余验证。

## Takeover

2026-11-01T23:58:46+08:00 Codely 接手并取得单一写入权；2026-11-02 验证轮补齐最终 prepareCall 修复后的全仓 lint、SDK web-validation-admission keyless 回放与两组双语配对，全部 PASS（命令与证据见 log.md）。

**当前状态（2026-11-02T00:16:28+08:00，写入者 Codely）**：阶段 3b 完成并经真实请求验证。独立 worker（Bun 子进程，console 噪音重定向 stderr，stdout 纯 NDJSON 协议，abortCause/capturedAt 诊断字段）+ 桥接 Adapter fixture（受限准入注册、commentary/最终文本/错误/取消区分、attribution UA 上 wire、意外 tool 流量 fail-closed）+ 禁用全部本地工具的运行时 patch。适配器层 18 项 PASS；运行时层 Mock 完成/准入拒绝/失败投影 PASS；**真实浏览器请求 PASS**：唯一标记精确回显（exactMarker=true，非手工/Mock）、response.completed、真实 usage（estimated 口径）、request/header 路由与无工具正确、worker 干净退出。三次提交前失败已定位并修复（参考 console.info 混入协议 stdout 炸掉行解析；launcher 重启经用户授权执行过一次，非根因），均未消耗模型用量。收尾全仓 lint PASS（5063 文件，含新 fixture）。

**证据**：evidence/dsh-web-real-request.json、dsh-web-real.ndjson、dsh-web-bridge-mock.json、bridge-mock-complete.ndjson、bridge-mock-rejected.ndjson、参考 turn 诊断目录。

**剩余与边界**：Session 级取消无 SDK wire-level cancel 入口（Python/TS client 文档明确），取消证据止步适配器层；主计划 WB-01 / VN4-06 已按用户确认打勾（第 12 节 Checklist 与第 15 节 2026-11-02 段落，doc gates：links 2321 全过、budgets 合规、plan wrap 0 违规）；按用户决定全部变更保持本地不 Commit/Push；launcher 为重启后新进程 pid 66262，浏览器数据目录独占使用中；用户 .codely-cli/settings.json 保持未读取未修改。Memory 已含 loader/strip 两条新结论，WORKFLOW 无进一步变更。

**任务状态：DONE（2026-11-02T00:19:30+08:00）**。四项验收标准全部满足且有证据；生产准入按范围保持 gated（属后续独立决策，非本任务缺口）。后续如开启新工作（M2 产品化、生产准入申请、Git 收尾），新建任务或由用户明确授权后在记录中接续。
