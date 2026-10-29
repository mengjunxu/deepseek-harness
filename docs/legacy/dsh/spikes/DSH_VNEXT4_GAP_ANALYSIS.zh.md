# vNext.4 源码审计

[English](DSH_VNEXT4_GAP_ANALYSIS.md) | 中文

## 范围与证据

本参考审计日期为 2026-10-28；P0 仅修改文档。起始 codely_bridge 跟踪文件干净，docs/myPlan 是未跟踪输入。用户未指定固定发布版本；[证据](../../../../.ai/tasks/dsh-vnext4-audit/artifacts/audit-evidence.json)记录源码/输入 SHA-256 与实际执行的 61 项测试。状态指产品验收，不只指文件存在。

## 能力矩阵

| Feature | Status | Current evidence | Gap | Reuse / proposed change | Tests / work | Risk |
|---|---|---|---|---|---|---|
| FR-CP-01..06 | partial | `packages/client/ui-model-selection/src/client/catalog.ts` / `ModelCatalogDirectory.load`；`chatgpt-plan/src/index.ts` / `PlanAdapter` | 已有 Provider 分组和 SIWC 目录；无 Web gated 条目、账户/额度元数据及独立 Executor 选择 | 扩展既有 llm / modelCatalog / settings，不建第二个 Registry | VN4-01/02；T01/02/09/15；UAT-02/08/15 | 同名模型不能继承能力；运行中选择只影响后续 Turn |
| FR-SIWC-01..04 | partial | `packages/experimental/chatgpt-plan/src/protocol.ts` / `authorize, refreshGrant, planPayload`；`src/index.ts` / `accessToken, PlanAdapter` | 授权/刷新/目录/断开已有；reasoning、vision 等明确受限；Loader、真实长回复与持久化验收未补齐 | 保留 opt-in Provider；P1-05 补集成，未知余额不编造 | P1-05 / QR-02；T03/13/14/15；UAT-01/11 | 本轮 19 项 SIWC 定向测试通过，不能代替账户授权或真实模型目录 |
| FR-WEB-01..05 | todo / blocked | 包/配置搜索未发现 ChatGPT Web Provider；现有浏览器工具不等于聊天 Provider | 缺独立 Adapter、gated 注册、Lease/Receipt、Manual 入口；真实自动访问准入 blocked | 先复用 llm 接口做 Mock/Manual；Tool Bridge 独立 | VN4-01/06；T11/12/16/27/29；UAT-07/13/15 | 公开参考源码及 MIT 许可不等于真实账户 Web 自动化许可 |
| FR-EX-01..03 | partial | `packages/subagent/subagent-codex/src/run.ts` / `startCodexRun`；`wire.ts` / `CodexAppServerWire`；`apps/cli/config/examples/codely-local/run.mjs` | Codex 是单次 ephemeral thread/turn；Codely 示例走 stream-json；无统一 ExecutorRouter；无已验证 Codely native-model | 复用 subagent/subprocess/jobs；保留 DSH native-model，分别声明能力 | VN4-02/05；P1-07；T02/04/05/11/23；UAT-03/04/15 | 当前 Codex Adapter 不提供原生 Session resume 或活动工具注册表；不能以 app-server 存在推定支持 |
| FR-EX-04..06 | partial | `packages/experimental/mgsd-workflow/src/types.ts` / `TaskRequest, TaskRecord, TaskFact`；`core.ts` / `reserveExecution` | TaskRequest 不含通用 session/workflow/executor/AC 绑定；jobId 不能直接等同不可变 Run；切换恢复未贯通 | 扩展事实/Job 映射；先确定拥有者及迁移，不复制 TaskStore | VN4-03/05/08；P1-01..03/08；T04/05/10/30；UAT-09/14 | plan nullable 不代表可执行无 Plan；批准、范围和幂等不可丢失 |
| FR-EX-07..09 | partial | `mgsd-workflow/src/core.ts` / `project, review`；`codely-local/run.mjs` / 执行后 checks | 已有 process_exit/checkCount、review facts 和第二次失败转 needs_human；无通用 ValidationResult/可跳过 ReviewPackage | 复用验证事实和预算；新增 reviewerPolicy，不以 skip 冒充模型验收 | VN4-03/04；P1-10/11；T06/07/08/30；UAT-05/06 | 现有状态机 executed 后须 review 才能 completed；新分支需版本和回放验证 |
| FR-TB-01..05 | todo / blocked | `packages/mcp/mcp-client/src/index.ts`；`packages/mcp/mcp-resources/src/index.ts`；Codex `wire.ts` | 出站 Client/资源与处理 app-server 请求，不是入站 task Gateway 或活动 Codex Tool Host | 在 Task API/授权就绪后做可选 Gateway；优先 DSH Host | VN4-10；P3-07/08；T18/21..24/27；UAT-12/13 | Codex Native Host 为独立 PoC blocker；Tunnel 长任务必须返回 ID |
| FR-MEM-01..04 | partial | `packages/core/session/src/index.ts`；`packages/session/session-persistence-jsonl/src/index.ts`；`packages/context` / `packages/compaction` | 已有日志/上下文/Fork；无通用 Task/MemorySnapshot/ContextEpoch 绑定与跨 Provider 全链路验收 | Session 保持权威，产品 Memory 与 .ai/MEMORY 分开；缺语义先扩展原拥有者 | VN4-07/08；P1-06、P2-01/02；T09/19/28；UAT-08/14 | 不得覆盖已提交 Session 代际；Fork 不代表恢复官方 ChatGPT 会话 |
| FR-MEM-05 | todo | `packages/ssh`、`packages/subagent`、`packages/experimental/agent-team/src/task-board.ts` | 有远程执行与本地团队任务板；未定位跨设备 Worker Registry/lease fencing 的产品闭环 | 复用 subprocess/SSH/Job；新协调语义不另造通用队列 | VN4-11；P3-01..06；T25/26；UAT-09/14 | 单机控制器/团队成员不等于跨机器租约；凭据不得随 Checkpoint 复制 |
| FR-Q-01..03 | todo / partial | `packages/llm/llm/src/index.ts`；`packages/llm/llm-retry/src/index.ts`；现有 request/usage 事件 | 已有 usage 与重试；未定位 UsageSource/预算预留结算/跨源同意政策的完整执行 | QR-01..06 唯一承接元数据、预算与 Ledger；不重建 transcript | VN4-01/07；QR-01..06；T15/20；UAT-10 | Web 本地提交数不是官方余额；余额 unknown 不能触发付费回退 |
| FR-RL-01..03 | partial | `subagent-codex/src/wire.ts` / `runTurn`；`chatgpt-plan/tests/provider.spec.ts`；`llm-retry` | 已有终态、断流/取消处理；无跨 Provider TurnAttempt/SubmissionReceipt 与可选 Bridge 工具栅栏统一验收 | 扩展既有日志及流事件，持久化 accepted/unknown 和工具事实 | VN4-07；T14/17/18/30；UAT-11/16 | 不能把所有网络失败统一自动重发；Provider completed 与工具/Run 成功分别判断 |
| FR-SEC-01 | partial | `packages/credentials/credentials-local/src/index.ts`；`credentials-local/README.md` | 使用私有 YAML 文件与原子更新/锁；没有据此证明 OS Keychain 或静态加密 | 复用 credentials service，后续评估受保护存储；导出/诊断脱敏独立验证 | VN4-09；T26；UAT-14 | 同 OS 用户的 Agent 工具仍可读凭据；不可宣称加密隔离已完成 |
| FR-SEC-02..03 | partial / blocked | `packages/sandbox`、`packages/credentials/authorization`；`mgsd-workflow/src/core.ts` / `approve` | 有沙箱/授权/计划摘要批准；无统一 ToolGrant caller/turn/workspace/expiry 撤销链；Web 实际准入未确认 | 保留现有审批，新增 TaskSpec 批准不可要求空 Plan；先 Mock 验证失败路径 | VN4-03/06/09/10；T12/21/26/29/30；UAT-07/12/16 | 只允许受授权 Workspace，禁止把模型自报 Turn ID 作为身份认证 |
| Workflow / PRD §3、§9、D-01..08 | partial / todo | `packages/workflow/workflow/src/index.ts`；`mgsd-workflow/src/core.ts` / `project, approve` | 已有动态脚本 Workflow；新 Auto/Quick/Standard/Milestone 模板、Override 和 ReviewPolicy 未接入 UI | 新增产品模板政策，保留既有动态工作流服务；不修改站立协作 WORKFLOW | VN4-03/04；T03..08；UAT-01/03..06 | 未来 TODO 指产品自动生成模板/流程，不撤销已实现的脚本 Workflow |

## 旧版对照

当前树有 V0–V2 交接方案及 v2.1/CG0–CG5 主计划。保留 Session 权威、双执行器、有限修复及未来 Worker；v2.1 简单任务流程和 Gate 中强制模型 Review 的表述按 vNext.4 标记 obsolete。Codely 单一默认改为显式独立 Executor 选择；QR-01..06 仍唯一承接额度政策。

vNext.1–3 独立原文未在仓库文件发现中找到；其 Web 中心化及固定 Planner 描述仅归因于 vNext.4 §0.1/§15，不能当作已独立审阅的引文。TurnAttempt/Broker/ContextEpoch 保留为目标概念，不代表已实现。旧交接 V0–V2 与产品 V0–V2 编号含义不同，分别保留。

## 决策与下一步

[ADR 提案](../../../../.agents/notes/proposed/architecture/2026-10-28-independent-chat-provider-executor.zh.md)记录独立路由、可选规划/审查和工具桥政策，不覆盖已实施的脚本工作流或原生 Codex 后端决策。`../../../workflows/DSH_IMPLEMENTATION_PLAN.md`第 11 节拥有 VN4 阶段及测试映射，`../../workflows/DSH_CHECKLIST.md`拥有进度。建议阶段获授权后先做 VN4-01/02 契约工作；真实 Web、活动 Codex Native Host 和缺失旧版原文继续明确未验证。

## v5.1 comparison

用户指定的 `../../Generic_Agent_Harness_v5_1_CN_Technical_Design_and_Codex_Implementation_Plan.md`为本轮历史对照基线。`../../../workflows/DSH_IMPLEMENTATION_PLAN.md`拥有合并处理，[参考锁定](CGW_REFERENCE_LOCK.zh.md)拥有外部源码审阅。

| v5.1 scope | Disposition / observed code | Follow-up |
|---|---|---|
| §1–5、§10–11：原生/外部模式、ACP、能力清单 | 保留双模式，修改协议必需前提。Codex 使用 app-server，Codely 示例使用 stream-json；统一 ACP 和 Codely native-model 未证实 | VN4-01/02/05；能力为 supported/unsupported/unknown |
| §6/9：强制 PLANNING/REVIEWING 链 | 作为通用产品要求已废弃。MGSD 当前仍强制 Plan 批准与 Review 完成，实现保持 partial | VN4-03/04；保留授权与历史回放 |
| §7/8：Session 与三层 Memory | 保留拥有者。已有 Session 日志和上下文，持久作用域 MemorySnapshot 与任务 Checkpoint 集成仍缺 | VN4-08；不建第二套 Conversation Store |
| §12/13：worktree 与 GitHub 节点 | 保留隔离与未来协调目标；跨设备 Registry/租约/fencing 为 todo | VN4-09/11；SSH 与本地任务板不等于分布式恢复 |
| §14：固定角色和预算阶梯 | 改为独立显式选择与同意；不静默付费/跨源回退 | QR-01..06；VN4-01/07 |
| §15/16：新建 Core 和 ACP 优先阶段 | 作为全新实施指令已废弃；映射到既有拥有者与增量 P1–P7 | 主计划 §11；不移除既有 Agent 集成 |

以上为产品需求处理，不是代码改动。动态工作流和原生子代理 ADR 保持有效，新 ADR 为 proposed。本轮未进行真实 Web 访问、全局配置修改或 P1–P7 实现。
