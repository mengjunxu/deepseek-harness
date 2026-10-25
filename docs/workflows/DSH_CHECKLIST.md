# DSH v2 — Codex / Codely 共用 Checklist 与交接记录

> 版本：v2.1-draft | 更新：2026-10-26 | 实施状态：**P0-01/02 DONE；P0-03 API Key 实测 BLOCKED；SIWC UI 集成 Partial，真实会话有成功证据；CG1 额度路由尚未实施**
>
> 权威计划：[DSH_IMPLEMENTATION_PLAN.md](./DSH_IMPLEMENTATION_PLAN.md)
>
> 这是一份**工作清单，不是开发进度报告**。由接手 Agent 按实际证据更新。

## 0. 使用规范

1. 开始前确认本分支/工作区、最新 commit、是否存在他人未提交更改，并阅读 PLAN 第 0、3、5、6 节。
2. 仅根据真实代码、测试输出、有效构建、提交记录打勾。文档设计完成 ≠ 功能实现完成。
3. 单项状态：`TODO`（未开始）、`PARTIAL`（已有实现/基础但未满足整项验收）、`DOING`（执行中）、`IN_REVIEW`（待复核）、`DONE`（已验收）、`BLOCKED`（阻塞）。**状态与 checkbox 保持一致：只有 DONE 才勾选。**
4. 每次完成任务，在「任务证据台账」填：负责人、commit、测试命令、PASS/FAIL、Artifact 路径、已知风险。
5. 如果需要切换 Agent，在「交接日志」记录当前任务和下一步。一次只有一个 Agent 写同一个 worktree；并行使用不同 worktree/分支。
6. 不能真实调用 OpenAI/Codely/Codex 时可完成 Mock 相关任务，但外部能力验证保持 `BLOCKED`，不得虚构真实联调结果。

**里程碑：** P0 技术验证 → P1/V0 单机闭环 → P2/V1 记忆与跨 Agent → P3/V2 多设备 → P4 高级能力。

**当前编排：** 主计划第 10 节 CG0–CG5 合并新文档 P0–P5；旧 ID 不改名。本轮只做 CG0 审计/计划合并；CG1 的 QR-01..06 须用户批准后开始。已有模块的源码不等于整项验收通过，不能把全部原任务继续笼统写成“未实现”。

## 1. P0：基线与可行性验证（Gate 0）

- [x] **P0-01 [DONE]** 代码库审查：语言/框架/包管理/现有测试/Git 状态；落盘 `docs/dsh/spikes/repository-baseline.md`。
  - 验证：真实 build/test 命令可复现；若空仓库明确记录初始化选型。证据：`corepack pnpm run typecheck` 退出码 0；四个定向测试套件通过（81/6/78 项）；能力对照与缺口见 `docs/dsh/spikes/repository-baseline.md`。
- [x] **P0-02 [DONE]** MockModel Gateway：正常流、工具调用、失败、断流事件 fixture。
  - 验证：4 类场景的自动化测试通过。证据：复用 `packages/test-support/llm-mock-server`（24 种脚本行为）与 `packages/llm/llm-retry/tests/transport-recovery.spec.ts`，共 78 项测试通过；场景与行为对照见 `docs/dsh/spikes/repository-baseline.md`。
- [ ] **P0-03 [BLOCKED]** OpenAI Provider 能力矩阵：API Key 与 SIWC 分开验证；账户支持、授权、模型列表、流式完成和额度异常处理。
  - 验证：Mock 路由和独立 SIWC 探测证据见 [供应商矩阵](../dsh/spikes/model-provider-matrix.md)。实验 `chatgpt-plan` UI/Provider 已实现，真实 Session 有 completed 轮次，19 项定向测试覆盖授权、流、限流和超时修复。API Key 真实验证仍缺；SIWC Loader、Session 快照、修复后的真实长回复、重启/网络生命周期完整验收未完成；P0-03 不因局部成功打勾。SIWC 分类为 `work_codex_shared`，不是普通聊天额度。
- [ ] **P0-04 [TODO]** Codely 实际 `--version`、`-p`、`stream-json` 事件、进程取消、授权策略；ACP 仅做 probe。
  - 验证：`docs/dsh/spikes/codely-capabilities.md`、脱敏日志、可重放 fixture。
- [ ] **P0-05 [TODO]** Codex 可用 CLI/app-server/SDK 能力调研及最小执行样例。
  - 验证：`docs/dsh/spikes/codex-capabilities.md`、可用/不可用 Capability 清单。
- [ ] **P0-06 [TODO]** 定稿技术栈、目录、数据一致性、风险策略与初版 ADR。
  - 验证：ADR 指向明确实施选择；PLAN 与实际结构一致。

**Gate 0（全项复核）**
- [ ] 本地 Mock Path 可重复运行，核心接口不依赖私有未验证 API。
- [ ] 至少一种可用 Chat Provider 路径或明确可运行 Mock 降级。
- [ ] 至少一种可用 Executor 路径或明确可运行 Mock 降级。
- [ ] SIWC / ACP 未验证能力没有被当作 V0 必需依赖。

## 2. P1 / V0：单机 MVP 闭环（最高优先）

### Domain 与持久化

- [ ] **P1-01 [PARTIAL]** 复用 MGSD TaskRequest/Plan/Fact 与现有 Session 类型，补通用 TaskSpec、WorkItem/Run、Verification/ReviewDecision 映射；非法输入拒绝。
- [ ] **P1-02 [PARTIAL]** 复用 Session JSONL、storage 和 MGSD SQLite；补通用 Task/Run/Artifact/Review 关联与迁移，不复制 Session 权威。
- [ ] **P1-03 [PARTIAL]** MGSD 状态转移基础存在；补通用 StateMachine + Transactional Outbox + 幂等键 + Run Attempt。
  - 必测：相同 idempotencyKey 两次只创建一个任务；非法状态转移拒绝。

### UI / 对话 / 模型

- [ ] **P1-04 [PARTIAL]** 复用 Host/Remote/事件服务与鉴权，补统一 Task API、cursor 回放和 UI/执行生命周期验收。
- [ ] **P1-05 [PARTIAL]** Mock、llm-pi-ai 与实验 SIWC 已有；补 Loader、Session 快照及真实长回复/生命周期验收；费用策略归 QR-01..06。
- [ ] **P1-06 [PARTIAL]** Session、Turn、context、compaction 已有；补按意图上下文与 Task 关联、重启和跨 Provider 续聊验收。

### 执行 / 验证 / 回传

- [ ] **P1-07 [PARTIAL]** Codex app-server 子代理、Codely 本地示例已有；补统一 Run/Capabilities 与 MockExecutor，分别验证 native-model 和 external-agent。
- [ ] **P1-08 [PARTIAL]** 复用 jobs/workflow/MGSD 领取与恢复基础，补统一租约/幂等/outbox 和崩溃协调。
- [ ] **P1-09 [PARTIAL]** sandbox/guard/workspace 与本地工作区控制已有；通用 Task 单写者、审批和 Secrets 验收待补。
- [ ] **P1-10 [PARTIAL]** 本地 Codely 独立 checks 和 MGSD process_exit 事实已有；补 AC Matrix、Diff/Test Report Artifact。
- [ ] **P1-11 [PARTIAL]** MGSD review 状态/修复预算已有；补紧凑 ReviewPackage 与模型 Reviewer 三分支闭环。
- [ ] **P1-12 [PARTIAL]** Chat、设置和本地命令已有；补统一 TaskSpec 确认、Task/Run 进度、取消及验收 UI。
- [ ] **P1-13 [TODO]** README/启动脚本/Mock Demo/配置说明/备份与回滚指南。

**V0 Gate：最低完整产品演示**
- [ ] 在 DSH UI 里创建聊天并让 ChatGPT/Mock 回复。
- [ ] 从聊天生成 **TaskSpec**，明确批准后提交，记录 TaskId/Revision。
- [ ] 调度 Codely/Mock 在受控工作区执行；日志与输出可视且可追溯。
- [ ] 自动 Verification 把失败/未知和通过区分；Review 产生结构化 Decision。
- [ ] ChatGPT/Mock 发现不符合验收标准能触发修复（或要求用户决定）。
- [ ] 关闭 UI 后执行持续；重开 UI 按 cursor 查看进度。
- [ ] Daemon 意外退出后可准确恢复/标记 Run，不发生无意识重复副作用。
- [ ] 同一请求重试不会产生两个任务/两次启动。
- [ ] 未授权文件访问/高风险命令被拒绝或明确请求授权。
- [ ] Token、密钥、个人记忆不进入普通日志/代码库。
- [ ] 单元/集成/E2E 测试、干净环境启动说明有效。

## 3. P2 / V1：记忆、上下文优化、替换执行器

- [ ] **P2-01 [TODO]** Scoped Memory：User/Project/Decision/Task，去重、版本、引用来源；ADR 索引；MemorySnapshot。
- [ ] **P2-02 [PARTIAL]** 复用现有 context/compaction；补 Chat/Planning/Review Envelope、跨 Provider 能力解释、预算和恢复验收。
- [ ] **P2-03 [TODO]** Artifact Store：哈希、索引、内容引用、Retention；Review 默认不传完整日志。
- [ ] **P2-04 [PARTIAL]** MGSD 中断与恢复事实已有；补通用 Run 的崩溃/离线/孤儿进程协调与不重复执行故障注入。
- [ ] **P2-05 [PARTIAL]** 复用 subagent-codex；补同一 TaskSpec 在 Codely/Codex 不同 Run 中接力，保留两种独立执行模式。
- [ ] **P2-06 [PARTIAL]** MGSD review 修复上限与升级已有；统一任务级计量复用 QR-05 Usage Ledger，不另建 Ledger。
- [ ] **P2-07 [PARTIAL]** 复用 MGSD TaskPlan/revision，补通用可选 PlanRevision 与 Workflow 模板；简单任务不需要完整 Plan。

**V1 Gate**
- [ ] 新对话能检索同项目的已确认 Decision Memory，不混入别的 Project 数据。
- [ ] 从 Codely 切至 Codex（或反向）可依据 TaskSpec、Git、Artifact 接续工作。
- [ ] Resume 不等于恢复第三方 Agent 隐藏内部推理；降级路径明确。
- [ ] 修复循环可控且不会无限重试。
- [ ] Token 用量/上下文大小有可复现实验数据，不承诺未经测量的节约比例。

## 4. P3 / V2：多 PC Worker 与远程执行

- [ ] **P3-01 [TODO]** Worker Identity/Registry/Heartbeat/Capabilities/Online Status。
- [ ] **P3-02 [TODO]** 认证的 Outbound Worker 连接与最小权限控制。
- [ ] **P3-03 [TODO]** Coordinator + Lease + Fencing Token + 重复提交检测。
- [ ] **P3-04 [TODO]** Git worktree/Artifact/Memory 的跨设备引用与同步/冲突解决。
- [ ] **P3-05 [TODO]** Remote cancellation、offline reconnection、未知执行态安全处理。
- [ ] **P3-06 [TODO]** 两 Worker E2E、失联故障注入、安全审计、单机回退。

**V2 Gate**
- [ ] DSH UI 可查看 Worker 在线/空闲/执行状态。
- [ ] Worker A 的 Task 可安全转交 Worker B 的新 Run。
- [ ] 断网、lease 过期、原进程仍运行时不发生两个工作区写者。
- [ ] 私有凭据和敏感文件不会随同步扩散；单机模式仍能运作。

## 5. P4：后续待办（不阻塞）

- [ ] **P4-01 [TODO]** 动态 Workflow DAG 与 Agent 自动重规划。
- [ ] **P4-02 [TODO]** ACP 完整能力与实时授权 UI（以 probe 为准）。
- [ ] **P4-03 [TODO]** 细粒度模型选择、Token 成本优化、Prompt/Memory 评估体系。
- [ ] **P4-04 [TODO]** 更多 Agent Provider、非 Coding Worker、移动端访问。

## 6. 贯穿全程的验收案例

| Case | 预期 | 状态 | 证据 |
|---|---|---|---|
| T01 Schema validation | 非法输入无法创建任务 | TODO | — |
| T02 Idempotency | 重发不重复创建/运行 | TODO | — |
| T03 UI disconnect | UI 退出不影响 Daemon 执行 | TODO | — |
| T04 Daemon crash | 状态协调后可继续/安全阻塞 | TODO | — |
| T05 CLI event parsing | 正常、损坏、超大日志、异常退出可处理 | TODO | — |
| T06 Permissions | 危险操作受阻/审批、路径不能逃逸 | TODO | — |
| T07 Model errors | 额度、鉴权、断流不会变成成功 | TODO | — |
| T08 Verification | failed 与 unknown 不会被标成 passed | TODO | — |
| T09 Review | accept/request_changes/needs_user_decision 全覆盖 | TODO | — |
| T10 Memory scope | 跨项目不泄漏 | TODO | — |
| T11 Cross-agent | Codex/Codely 可互换执行独立 Run | TODO | — |
| T12 Worker fencing | V2 下防止过期租约双写 | TODO | — |

## 7. 任务证据台账（执行时逐行补充）

| Task ID | 当前状态 | Owner | Branch / Commit | 验证命令及结果 | 证据 / 风险 |
|---|---|---|---|---|---|
| P0-01 | DONE | Codely | 历史基线记录，非当前工作区复验 | `corepack pnpm run typecheck` 退出 0；定向 vitest 81/6/78 项通过 | `docs/dsh/spikes/repository-baseline.md`；当时 Node v22.18.0 低于声明范围 |
| P0-02 | DONE | Codely | 同上 | `vitest run packages/test-support/llm-mock-server/tests packages/llm/llm-retry/tests/transport-recovery.spec.ts` 78 项通过 | 复用现有 mock server，无新增代码 |
| P0-03 | BLOCKED | Codely / Codex | 已有提交和本地未提交修复 | 历史 API Mock 与独立 SIWC 探测通过；SIWC 插件当前 19 测试通过（前序修复轮次） | API Key 真实验证仍缺；SIWC 集成 Partial，见 dsh-siwc-ui 检查点 |
| P0-04 | TODO | — | — | — | — |
| P0-05 | TODO | — | — | — | — |
| P0-06 | TODO | — | — | — | — |
| P1-01 | PARTIAL | — | 既有源码 | 本轮源码审计，非重新运行产品测试 | MGSD 类型已有，通用 TaskSpec 待补 |
| P1-02 | PARTIAL | — | 既有源码 | 同上 | Session JSONL / SQLite 基础已有 |
| P1-03 | PARTIAL | — | 既有源码 | 同上 | 状态转移已有，outbox/幂等待补 |
| P1-04 | PARTIAL | — | 既有源码 | 同上 | Host/Remote 已有，统一 Task API 待补 |
| P1-05 | PARTIAL | Codex | 实验包已提交；修复未提交 | 前序 19 测试、类型、lint、Host 构建通过；本次审计 Session 三轮 completed | Loader/Session 快照/系统性真实长回复待验收 |
| P1-06 | PARTIAL | — | 既有源码 | 本轮源码审计 | Session/context 已有，按意图和 Task 关联待补 |
| P1-07 | PARTIAL | — | 既有源码 | 本轮源码审计，非真实执行器联调 | Codex 子代理与 Codely 本地示例 |
| P1-08 | PARTIAL | — | 既有源码 | 本轮源码审计 | jobs/workflow/MGSD 基础 |
| P1-09 | PARTIAL | — | 既有源码 | 本轮源码审计 | sandbox/guard/workspace 基础 |
| P1-10 | PARTIAL | — | 既有源码 | 本轮源码审计 | checks/process_exit 事实已有 |
| P1-11 | PARTIAL | — | 既有源码 | 本轮源码审计 | review 状态与预算已有，无统一模型 Reviewer |
| P1-12 | PARTIAL | — | 既有源码 | 本轮源码审计 | Chat/设置已有，通用 Task UI 未验收 |
| P1-13 | TODO | — | — | NOT_RUN | 单机全流程 Demo/恢复指南待补 |
| P2-01 | TODO | — | — | NOT_RUN | 产品 Scoped Memory 非 .ai/Memory |
| P2-02 | PARTIAL | — | 既有源码 | 本轮源码审计 | context/compaction 基础 |
| P2-03 | TODO | — | — | NOT_RUN | 统一 Artifact 索引/Retention 待验收 |
| P2-04 | PARTIAL | — | 既有源码 | 本轮源码审计 | MGSD 中断事实已有，通用 Run 协调待补 |
| P2-05 | PARTIAL | — | 既有源码 | 本轮源码审计 | Codex app-server 有源码，跨 Agent Task 接力未验收 |
| P2-06 | PARTIAL | — | 既有源码 | 本轮源码审计 | MGSD 预算已有，Ledger 复用 QR-05 |
| P2-07 | PARTIAL | — | 既有源码 | 本轮源码审计 | MGSD TaskPlan/revision 已有，通用映射待补 |
| P3-01..P3-06 | TODO | — | — | — | 按任务拆分真实行 |

所有 Partial 项均须完成各自验收后才可勾选；已有底层模块不能代替完整产品证据。

工作记录：`.ai/tasks/dsh-p0-baseline/` 保存 P0-01..P0-03 的基线；`.ai/tasks/dsh-p0-siwc/` 保存最新 SIWC 实测、验证与交接记录。

## 8. Codex ↔ Codely 交接日志（每次切换追加）

```text
Handoff #1
日期/时间：2026-10-22 17:20 (+08:00)
From Agent / To Agent：Codely → 下一位（Codely 或 Codex）
Branch / Worktree：codely_bridge（/Users/x-dt/workspace/AI/Agents/deepseek-harness）
Task ID / Status：P0-01 DONE、P0-02 DONE、P0-03 BLOCKED（Mock 部分完成）
版本证据：原记录为当时分支基线，未提供允许的固定版本证据；不能充当当前工作区复验。
是否有未提交变更及路径：是。新增 docs/dsh/spikes/{repository-baseline,model-provider-matrix}.md 及 .zh.md/.i18n.yaml；新增 packages/llm/llm-pi-ai/tests/openai-route-matrix.spec.ts；修改本 CHECKLIST；另有他人修改 .codely-cli/settings.json 与未跟踪的 PLAN/CHECKLIST 本身，均未处理。
完成的代码与文档：OpenAI 路线的 6 项 Mock 验证（Responses 与 Chat Completions 的成功/401/额度耗尽/未配置凭据）；P0-01 仓库基线与能力对照；P0-03 供应商矩阵。
实际执行的测试命令与结果：corepack pnpm run typecheck（退出 0）；vitest llm-pi-ai 全目录 345 项通过；vitest mock-server + transport-recovery 78 项通过；verify-translation-pairing 两个命名对一致；verify-md-links 与 verify-md-wrap 对新文档无报错。
阻塞原因 / 重要 ADR / 待决问题：环境无 OPENAI_API_KEY、无 ChatGPT 订阅登录，P0-03 真实账户部分保持 BLOCKED；SIWC 未实现，已记录 fallback。verify-md-wrap 仓库级失败来自既有 docs/workflows 文档，与本次改动无关。
下一位 Agent 应执行的任务 ID：P0-04。
```

```text
Handoff #2
日期：2026-10-23（+08:00）
From Agent / To Agent：Codely → Codex；用户确认 Codely 已停止写入。
Task ID / Status：dsh-p0-siwc；SIWC 真实独立探测通过，P0-03 仍因 API Key 真实验证保持 BLOCKED。
工作区：codely_bridge；既有修改保留，未 Commit / Push。
证据：.ai/tasks/dsh-p0-siwc/artifacts/siwc-result.json；模型 gpt-6.1-sol，response.completed，返回符合预期。
限制：未修改产品包；SIWC Provider 集成、token 刷新/撤销及额度耗尽未验；未执行真实 API Key 请求。
后续：P0-03 API Key 路线；无凭据时可另行开展 P0-04。
```

> **接手顺序**：检查 Git → 读 PLAN + CHECKLIST → 复验上个任务 → 检查能否安全领取新的 ID → 实现 → 测试 → 更新证据 → 交接。不得通过重置工作区来规避合并冲突。

## 9. 一键复制的共同启动指令

```text
请把本仓库当作独立、跨项目的 DSH Agent Harness 实现工程。
首先完整阅读 DSH_IMPLEMENTATION_PLAN.md 与 DSH_CHECKLIST.md，检查仓库结构、git status、现有测试和上一位 Agent 的交接记录。
严格按计划依赖选择下一项任务（首轮从 P0-01 开始），一次只完成一个可验证的任务 ID。
DSH 自有 UI 是唯一主界面；ChatGPT 类 Provider 用于 Chat/Planner/Review；Codely 是默认自主 Executor，Codex 是可替换实现；TaskSpec 和持久化状态由 DSH 控制。
不能假设原生 ChatGPT 网页历史/Memory、SIWC 授权、Codely ACP Resume、Codex CLI 私有参数已经可用。
不要绕过审批或破坏他人的未提交修改。
完成后运行真实测试并更新 CHECKLIST 的状态、证据、交接日志。只汇报已实现和已验证的事实，附上下一项任务 ID。
```

---

**当前入口：CG0 审计合并，CG1 尚未批准开始。** P0-03 的 API Key 实测仍阻塞；SIWC 是已有实验集成，剩余验收归 P1-05。P0-04/05 仍需真实能力记录；不是从零重写已有执行器。

## 10. ChatGPT 增量计划清单

任务说明、模块归属、阶段依赖与验收以主计划第 10 节为准。以下只是同一批任务的状态入口，不创建另一套实施计划。

- [x] **CG-00 [DONE]** 新旧计划审计合并、Gap Matrix、Decision Log、实现证据与 Memory 同步；本轮仅文档。三组命名双语配对、局部链接/换行/文件结尾、全仓引用、22 文档标准测试通过；最终 test:docs 为 18/2，doc-sync 为 33/9（引用随后单独修复通过），剩余限制见 [检查点](../../.ai/tasks/dsh-chatgpt-plan-update/handoff.md)。业务阶段 CG1 未开始。
- [ ] **QR-01 [TODO]** UsageSource、意图、capabilities tri-state、余额 unknown；CG1 获批后启动。
- [ ] **QR-02 [TODO]** Auth / Provider / Executor / 费用来源分离；核对旧插件名称和 Codex/Codely 双模式；依赖 QR-01。
- [ ] **QR-03 [TODO]** chat/plan/review/execute 显式路由、能力拒绝、显式回退；依赖 QR-01/02。
- [ ] **QR-04 [TODO]** 共享额度保护、预算和付费同意、reserve/settle/cancel；依赖 QR-03。
- [ ] **QR-05 [TODO]** UsageRecord 与政策决定持久化、报告/估算分列、去重/脱敏；依赖 QR-01/04。
- [ ] **QR-06 [TODO]** UI 显示来源和用量、预算同意与回退证据、真实 profile/Session 快照/GIF；依赖 QR-03/04/05。
- [ ] **P3-07 [TODO]** 可选入站任务 MCP Gateway：submit/status/result/cancel、worker.list、artifact.get；复用 P1-04/08/09、P2-03 与对应 Worker 能力，不绕过 Task Store/权限。
- [ ] **P3-08 [TODO]** 可选 Secure MCP Tunnel：单次总期限 120 秒、异步 TaskId 查询、断连不丢任务；依赖 P3-07 与真实工作区授权。
- [ ] **WB-01 [TODO / DEFER]** 默认禁用的 Web Bridge 许可/安全/失败语义研究；无生产 Provider，无 Cookie 提取，不阻塞正式阶段。

CG1 Gate（待实施）：默认路由、能力不匹配、余额 unknown、限额、不可用、断流、回退和额外付费阻断逐项验证。SIWC 必须显示 `work_codex_shared`，`chatgpt_regular` 不得成为 DSH 主动模型 Provider；费用来源变化需要预设预算或当次明确同意。CG2/CG3 复用原 P1/P2 任务，CG4 保留 V2，CG5 可完全跳过。
