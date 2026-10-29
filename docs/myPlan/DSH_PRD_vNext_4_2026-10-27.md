# DSH 产品需求文档（PRD）vNext.4

> **文档版本**：vNext.4 / 2026-10-27
> **文档性质**：产品目标与验收基线（不是对现有代码完成情况的声明）
> **适用范围**：独立、跨项目、跨设备的通用 Agent Harness（DSH）
> **关联文档**：`DSH_Implementation_Plan_vNext_4_2026-10-27.md`
> **替代关系**：纠正 vNext.2/vNext.3 中“ChatGPT Web + Reverse Codex 是唯一核心主链路”的定位；保留此前 V0–V2 和有价值的可靠性、安全性方案。
> **决定性约束**：**ChatGPT Web 与 SIWC 是 DSH UI 中平级、可选择的 Chat Provider；Planner/独立 LLM Reviewer 均不强制；Codex 与 Codely 是独立可选的工程执行 Agent。**

---

## 0. 一页产品定义

**一句话**：DSH 是用户进行 AI 协作的主界面和统一控制平面。用户选择 ChatGPT 的接入方式（ChatGPT Web、SIWC 或其他 Provider）来聊天、理解需求、按需规划/审查；当确实需要工程实现时，DSH 创建可持久化的 TaskSpec，并调度 Codex 或 Codely 保留自身 Agent Loop 完成执行。

**不应误读为**：
- 每条消息都必须创建 Task、生成 Plan、执行 Code、再做一次模型 Review。
- ChatGPT Web 是 Codex 的附属功能，或只能配合 Codex 使用。
- DSH 等于 Codex 的替代前端，或只能复用 Codex 原生工具完成工作。
- 通过 ChatGPT 账号登录，就能自动使用普通 ChatGPT 聊天额度。
- 非官方 Web Bridge 一定可以长期、合规、无风险地自动收发 ChatGPT 消息。

### 0.1 权责划分

| 角色 | 唯一权责/主要职责 | 不承担的职责 |
|---|---|---|
| DSH UI | 对话、工作空间、Provider/Executor 选择、任务状态、审批、结果展示 | 不是官方 ChatGPT 网页的替身 |
| Chat Provider | 根据 DSH 提供的上下文进行聊天、任务理解、**按需**规划、**按需**语义验收 | 不直接掌管跨机器任务/授权/源代码权威状态 |
| DSH Orchestrator | 判断是否任务化，选择 Workflow，Task/Plan/Run/Checkpoint 持久化、调度和权限 | 不强制引入独立 Planner 回合 |
| Codex/Codely Executor | 使用自身 Agent Loop 执行代码修改、构建、测试、查错、局部自规划 | 不负责 DSH 的全局 Session/Memory/Task 权威记录 |
| DSH Verification | 确定性构建/测试/检查、产物与执行收据 | 不等同于“每次都调用 ChatGPT 审查” |
| Optional Tool Bridge | ChatGPT 通过受控 MCP 访问 DSH 工具/可证明存在的原生工具能力 | 不代替整个 Codex/Codely Executor |

### 0.2 成功标志

1. 使用者只操作 DSH 主 UI，就能完成日常聊天和一项从需求到实现再到验收的工程任务。
2. **Chat Provider** 与 **Executor** 可以分别切换，互不强绑定；切换后历史和 Task 连续。
3. 普通聊天没有 Task/Plan/Executor/Reviewer 的额外模型调用。
4. 简单工程任务可通过 **最小 TaskSpec → Codex/Codely 原生 Agent Loop → 确定性验证** 完成，不强制生成独立 Plan。
5. 复杂工程任务可按需输出 PlanRevision、阶段依赖、Checkpoint 和独立 ReviewPackage。
6. 各 Provider 的**额度来源、接入合法性/可用性、工具能力**清晰可见；系统不会暗中跨额度源切换。

---

## 1. 背景与核心问题

此前 DSH 已确认：自有 UI 为主要入口；DSH 管 Session/Memory/Task/Workflow/Checkpoint；Codex 和 Codely 可平行执行并共享工程协作记忆；应尽量减少重复推理。新调查带来两种互补能力：

- **SIWC + Responses API**：官方订阅授权模型调用方式。当前 OpenAI 文档明确说明：合格的模型请求计入 **ChatGPT Work/Codex 共享使用量**，不是普通 ChatGPT 聊天的独立使用量。
- **codex-chatgpt-web**：社区提供非官方浏览器模型桥接、Responses/SSE 映射、Session/Turn 绑定以及 ChatGPT → MCP Tunnel → Codex 工具回环。其工作机制可供 DSH 参考，但非官方自动化的条款与稳定性风险须独立管理。

过去 vNext.2/vNext.3 将“Web → Reverse Codex”写成唯一主路径，偏离了产品定位。本版重构为**平级模型 Provider + 独立 Executor + 自适应 Workflow**。

### 1.1 产品目标（Goals）

- G1：提供 DSH 原生 Chat UI 和可切换 Chat Provider：`ChatGPT Web`、`SIWC`，并可扩展 `OpenAI API/Local/Other`。
- G2：ChatGPT 是聊天与任务理解的基础，可按需产生 Plan、按需 Review，而非固定 Planner 流水线。
- G3：选择 `Codex` 或 `Codely` 作为工程执行器，各自保持自身 Agent Loop；未来支持更多 Executor。
- G4：DSH 统一持有 Session、Messages、Memory、TaskSpec、PlanRevision、ExecutionRun、Checkpoint、Artifacts、Approval 和审计日志。
- G5：切换 Provider 或 Executor 不丢失 DSH 权威任务状态，明确切换点与正在运行的任务归属。
- G6：明确不同额度及授权风险；Web Bridge 可见但处于实验性门禁，不影响受支持路径。
- G7：留出 ChatToHarness 式 ChatGPT 官方 MCP 入口和 `codex-chatgpt-web` 反向工具机制作为**可选扩展**。

### 1.2 非目标（Non-goals）

- NG1：不以“ChatGPT Web 自动化一定合规且可生产”为产品前提；不设计绕过登录/风控/频控的能力。
- NG2：不要求每次聊天都能操作 Shell、不自动生成或提交 PR。
- NG3：不强制重建 Codex 或 Codely 内部 Planner，也不要求重实现它们的全部原生工具。
- NG4：不宣称可同步读取 ChatGPT 官方 Memory、历史对话或原生 Thread。
- NG5：不以 GitHub 作为运行时任务队列；GitHub 仅用于代码/知识同步和可选工件。
- NG6：本次 PRD 不要求替换仓库现有 V0–V2 实现、不要求立即上线自动 Web Bridge。

---

## 2. 目标用户和关键场景

### 2.1 用户角色

- **开发者/工程负责人**：通过一个 DSH UI 从聊天切换到工程执行，在 Codex 和 Codely 间选择执行能力。
- **多设备使用者**：在家/公司/远程机器之间调度 Worker，继续查看既有任务结果。
- **高级用户/维护者**：配置账号/Provider、配额保护、工具审批、Workflow 模板与诊断。

### 2.2 核心使用场景

**S1 — 普通聊天：** 用户问“解释 Responses API 的对话状态机制”。DSH 将消息交给所选 Chat Provider，直接流式展示回复；不创建正式 TaskSpec、不调用 Codex/Codely、不单独请求 Planner 或 Reviewer。

**S2 — 简单开发：** 用户问“修复 README 中失效的配置示例”。DSH 识别为可执行工程任务，ChatGPT 可输出**最小 TaskSpec**（目标、仓库、约束、验收），无需单独 Plan；用户选择 Codex 或 Codely 执行；DSH 跑确定性检查并回报结果。

**S3 — 复杂需求：** 用户问“新增多 Provider 与额度隔离”。DSH 选择多阶段 Workflow（可用户 Override），必要时让 ChatGPT 形成高级 Plan 和验收标准，再按里程碑派发一个或多个 Codex/Codely ExecutionRun；必要时 ChatGPT 对 ReviewPackage 作语义验收。

**S4 — 在聊天中切换 ChatGPT Web / SIWC：** UI 可修改 Provider，但不改变任务及 Workflow 含义；切换后的下一条消息使用 DSH ContextBuilder 重新构建上下文。进行中的 Turn 不被偷偷迁移。

**S5 — Codex ↔ Codely 执行切换：** 未开始任务可自由选择；执行中的切换需显式取消/结束当前 Run 或通过 Checkpoint 创建新 Run；不重复执行未知提交状态的副作用操作。

**S6 — ChatGPT 需要读取工程信息（可选）：** 在受权限限制的 Tool Bridge 下，ChatGPT 可读取必要文件/工作区摘要；如需要完整工程开发，仍由 DSH 调度外部 Codex/Codely 执行器，不让 Tool Bridge 偷偷取代 Executor。

**S7 — Web 不可用/未许可：** Web 选项仍可见，但显示实验/未授权/不可用原因，无法自动发送；提供用户主动选择 SIWC、其他合法 Provider，或官方 ChatGPT 手动+MCP 入口。不自动变更额度来源。

---

## 3. 产品主流程：Conversation-Driven、Task-Centric、Executor-Autonomous

```
用户消息 → DSH Chat Runtime → 用户当前所选 Chat Provider
                                    │
                                    ▼
                            ChatGPT/模型输出
                                    │
                         Adaptive Task Decision
               ┌────────────────────┼─────────────────────┐
               ▼                    ▼                     ▼
          直接聊天回复         简单工程任务            复杂/高风险任务
          无 Task/Plan         最小 TaskSpec          TaskSpec + 可选 Plan
               │                    │                     │
               ▼                    └──────────┬──────────┘
            UI 输出                          ▼
                                   DSH Executor Router
                                    Codex / Codely
                                          │
                                    原生 Agent Loop
                                          │
                                    确定性验证/产物
                                          │
                              按需 ChatGPT Review → UI
```

### 3.1 必须遵守的 Workflow 规则

- **普通聊天**：不创建正式 ExecutionTask，不需要 Plan。
- **进入执行链路**：必须有可持久化的 TaskSpec（可极简），以保护任务身份、范围、验收和恢复能力。
- **显式 Plan**：只有复杂性/风险/用户要求/Workflow 策略满足条件时才出现；Codex/Codely 在其 Agent Loop 内可以自己规划具体实现。
- **模型 Reviewer**：不是强制节点；确定性验证始终运行适用的检查项。高风险、跨模块、用户指定时再让模型 Review。
- **Workflow**：早期使用有版本的模板 + DSH Router 选择，用户可以 Override；Agent 自动态生成 Workflow 列为后续 TODO，不作为首期硬依赖。
- **模型与执行器**：同一 Workflow 模板不因 Web 或 SIWC 不同而强制走不同阶段。

### 3.2 Workflow 模板（首期）

| 模板 ID | 场景 | TaskSpec | 独立 Plan | Executor | 模型 Review |
|---|---|---|---|---|---|
| `chat.direct.v1` | 对话/解释 | 否 | 否 | 否 | 否 |
| `task.quick.v1` | 小范围修复、简单修改 | 是（最小） | 否 | 是 | 默认否 |
| `task.standard.v1` | 常规开发 | 是 | 可选 | 是 | 按风险 |
| `task.milestone.v1` | 多阶段/多仓库 | 是 | 是 | 是，可多次 | 通常按阶段/最终 |
| `task.inspect.v1` | 工程调研与诊断 | 视是否派工 | 默认否 | 可选 | 按需 |

**注意**：模板可扩展，不等于每个请求必须在后台执行一个“分类模型调用”；允许使用已有对话 Turn 的结构化结果和确定性规则路由。

---

## 4. Chat Provider 体验与功能需求

### 4.1 Provider 菜单与设置

**FR-CP-01（P0）**：DSH UI 至少呈现 `ChatGPT Web` 和 `SIWC` 两个**同一级别的 Provider 条目**；不把 Web 放入“Codex 子菜单”，也不把 SIWC 强制设为所有用户的唯一选择。

**FR-CP-02（P0）**：每个 Provider 具备独立状态：`未配置 / 需要登录 / 可用 / 能力受限 / 实验性未授权 / 暂时不可用`；状态与实际可调用性一致。

**FR-CP-03（P0）**：独立保存 `providerId`、`account/workspace`、`modelId`、`effort`、`usageSource`、`toolCapabilities` 和可观测性/授权状态。

**FR-CP-04（P0）**：允许用户在会话中选择下一个 Turn 的 Provider。界面显示“下一条消息生效”；已有消息不被重写、已提交 Turn 不迁移。

**FR-CP-05（P1）**：模型选择只展示对应账户/接入方式已验证可用的能力；不可隐式回退到同名但不同 Provider 或不同 Effort 的模型。

**FR-CP-06（P1）**：配置页清楚显示额度类别、使用限制与是否为官方接口；额度不可核验时标记 `未知/本地估计`。

### 4.2 SIWC（官方）

**FR-SIWC-01（P0）**：支持受官方流程授权的账户/工作区登录、模型目录、Token 刷新及断开连接；凭据加密保护。

**FR-SIWC-02（P0）**：SIWC 请求符合官方当期规范：`store:false`、`stream:true`、必要的输入历史显式发送，成功终态为 `response.completed`；不得以流式连接关闭当作成功。

**FR-SIWC-03（P0）**：明确提示 SIWC 消耗 ChatGPT **Work/Codex 共享额度**；支持用户侧的 DSH 预算策略和官方 App limits 的引导。

**FR-SIWC-04（P1）**：Hosted tools 等能力仅按官方 SIWC 当前文档支持的范围启用；本地工具调用依赖 DSH 自己的执行能力/受支持 function 工具接口。

### 4.3 ChatGPT Web（平级，但受准入门禁）

**FR-WEB-01（P0）**：作为独立 Provider 插件具备设置、模型信息、诊断、能力声明和单独启停；其不可用**不能影响** SIWC、任务存储或 Executor。

**FR-WEB-02（P1/研究）**：参照 `codex-chatgpt-web` 的模型适配、Browser Session Lease、Context Envelope、回复投影和提交收据来设计 Adapter。真实自动收发需先通过使用授权、服务条款和安全审查；没有许可时仅实现 Mock/Manual/架构实验，不执行未授权自动化。

**FR-WEB-03（P1/研究）**：网页会话与 DSH Session/Turn 建立映射，但 DSH 是唯一权威历史；不能把 Web 的历史和 Memory 假设成可被 DSH 完整读取。

**FR-WEB-04（P1/研究）**：非官方网页额度只显示项目侧确认的提交次数/估计，不声称知道 OpenAI 官方剩余消息数或刷新时间。

**FR-WEB-05（P2/可选）**：支持手动 ChatGPT 对话入口 + 官方 MCP/Tunnel 工具调用方式。此模式由用户在官方页面主动提交，**不冒充 DSH 主 UI 的自动 Web Provider 能力**。

---

## 5. Executor、Task 与 Review 产品需求

**FR-EX-01（P0）**：用户可独立选择默认工程 Executor：Codex、Codely；不与 Provider 选择捆绑。四种基本组合 `Web×Codex / Web×Codely / SIWC×Codex / SIWC×Codely` 在契约和 UI 层均成立（Web 实际调用须满足门禁）。

**FR-EX-02（P0）**：`external-agent` 为工程执行默认模式，保留 Codex/Codely 各自 Agent Loop；不得用“请求 Codex 模型”冒充“启动 Codex 原生执行器”。

**FR-EX-03（P1）**：保持历史 `native-model/subscription` 模式为独立可选集成方向（如果已经实现先兼容），不能与 `external-agent` 合并，亦不保证 OAuth 路径拥有普通 Chat 配额。

**FR-EX-04（P0）**：正式任务生成 TaskSpec；记录工作空间、目标、约束、输入工件、执行器、验收条件、风险等级、Workflow 版本及用户授权。

**FR-EX-05（P0）**：支持 ExecutionRun 状态与进度、标准输出摘要、Diff/测试结果、取消和结构化失败。恢复仅在执行器实际支持时显示。

**FR-EX-06（P1）**：执行中切换 Executor 不覆盖旧 Run；必须使用新 Run 并显式关联旧 Run 的 Checkpoint/Artifacts，保证审计可追溯。

**FR-EX-07（P0）**：任务完成前执行可用的确定性检查（按项目配置），并出具 ValidationResult。

**FR-EX-08（P1）**：可选 ChatGPT Review 仅消费压缩、脱敏的 ReviewPackage，按 Workflow 或用户意愿启动。无独立 Review 时也显示验证结果和未覆盖风险。

**FR-EX-09（P1）**：ChatGPT Reviewer 可以要求修正，但不能绕过 DSH 自动无限递归调度执行；设置明确上限/人工停止门槛。

---

## 6. 可选的反向工具与官方 MCP 入口

**FR-TB-01（P2）**：DSH MCP Gateway 暴露有限、明确授权的能力：`task.create/status/result/cancel`、`workspace.inspect`、`artifact.read` 等；遵循当期账号/工作区可用的 MCP 权限。

**FR-TB-02（P2）**：参考 `codex-chatgpt-web` 的 Full Harness：在 ChatGPT 的同一模型回复中，通过 Connector/Tunnel → Gateway → Scope Broker → Tool Host 返回工具结果，**该能力是可选辅助工具链，不是执行工程任务的唯一或默认方式**。

**FR-TB-03（P2）**：Tool Host 可是 DSH 自己的有限工具；若要复用“活动 Codex Turn 原生工具”，必须先证明存在实际可绑定的 Codex Native Tool Host。不能用一条 CLI Shell 命令假装有原生 Codex Turn。

**FR-TB-04（P2）**：工具权限至少绑定 `caller/session/turn/task/workspace/allowedTools/expiry`；审批、撤销、只读模式与审计必备。

**FR-TB-05（P2）**：长任务不阻塞在单个 Tunnel 请求中；快速返回 Task ID，由后续工具调用查询状态。ChatToHarness 的持久任务模型可作参考。

---

## 7. 会话、记忆、上下文和切换

**FR-MEM-01（P0）**：DSH 自有 Conversation Store 是会话权威，消息均记录 Provider/Model/Workflow/Turn ID，Memory 不依赖 ChatGPT 网页历史。

**FR-MEM-02（P1）**：统一 ContextBuilder，根据上下文预算选择聊天历史、任务状态、Memory 快照、文件摘要、Checkpoint；切换 Provider 时重新编译上下文。

**FR-MEM-03（P1）**：ContextEpoch + Checkpoint 记录压缩版本、数据来源和恢复点。压缩不应抹除 TaskSpec、决策和未完成的审批。

**FR-MEM-04（P1）**：支持 Conversation Import/Fork 为 DSH 层的导入/分叉，而非声称恢复 ChatGPT 官方会话。

**FR-MEM-05（P2）**：多设备 Worker 可以继续执行已落盘任务；敏感登录凭据/网页 Cookie 不跨机器复制，具体 Provider 会话仍按设备授权边界管理。

---

## 8. 额度、失败、隐私与安全

### 8.1 额度来源与透明度

| UsageSource | 语义 | UI 表述要求 |
|---|---|---|
| `work_codex_shared` | SIWC 等订阅授权请求 | Work/Codex 共享；可能影响 Codex 可用额度 |
| `chatgpt_web_unofficial` | 实验性 ChatGPT Web 路径 | 非官方；额度按产品实际计量，本地计数不是官方余额 |
| `openai_api_billed` | 官方 API | 按量计费，需预算/授权 |
| `other_authorized` / `local` | 其他合法模型、本地推理 | 按实际规则显示 |

**FR-Q-01（P0）**：所有 Turn 留下 `requestedProvider`、`actualProvider`、`usageSource` 与已知/未知的估计；用户能回看。

**FR-Q-02（P0）**：达到预算限制时阻止进一步调用并显示可选路径。跨额度源、跨模型、额外付费均需要明确用户操作；不得静默降级。

**FR-Q-03（P1）**：提供“保留 Codex 工程执行额度”策略；不承诺准确读取所有第三方服务端余额，未验证指标标识 `unknown`。

### 8.2 可靠性和安全

**FR-RL-01（P0）**：每个 TurnAttempt 有独立 ID、请求状态、事件序列与幂等策略；提交结果未知时不自动重放有副作用请求。

**FR-RL-02（P1）**：流式连接中断、模型 `failed/incomplete`、工具待完成、用户取消和真正 `completed` 是不同终态或状态；不能把 UI 不再变化当成完成。

**FR-RL-03（P1）**：工具完成屏障确认当前回合所有已接受工具调用均终结，再将 Turn/Run 标为成功。

**FR-SEC-01（P0）**：凭据用 OS Keychain/受保护存储；禁止写入 Memory、Git、命令行参数、普通日志和导出工件。

**FR-SEC-02（P0）**：不同 Project/Workspace 的工具授权互相隔离；危险文件写入、Git Push、删除、Shell 和外网写入按政策审批。

**FR-SEC-03（P0）**：Web 自动化的未获授权/条款风险以明确门禁处理；禁止隐藏自动化、绕风控、批量多账号配额聚合、抓取未授权内部 API。

---

## 9. UI 信息架构与关键交互

### 9.1 DSH Chat UI 最小信息架构

1. 顶部：Workspace / Session 选择。
2. Chat Provider：`ChatGPT Web`、`SIWC`，并可扩展其他 Provider；显示连接状态、模型和额度标签。
3. 执行设置：默认 Executor（Codex/Codely）、执行模式（外部 Agent / 既有原生模型集成）。
4. Workflow：`Auto`（按需任务化）、`Quick`、`Standard`、`Milestone`、`Chat only`；用户可以 Override。
5. 对话区：消息、工具事件、可选 Plan、任务卡、执行阶段和状态。
6. 任务区：Task、ExecutionRun、Checkpoint、Artifacts、验收/Review、审计。
7. 设置区：账号、配额、工具权限、Worker、诊断、实验功能门禁。

### 9.2 交互要求

- 选择 Web Provider ≠ 自动授权浏览器操作；没有授权时显示不可用原因和明确的替代选择。
- 更换 Provider 必须明确“**下一个 Turn 生效**”。对继续执行中的旧 Run 不能假装它改换了模型。
- “执行任务”与“单纯聊天”在界面语义上区分，但默认 `Auto` 不要求用户每次先选择一个阶段。
- 当生成 Plan 时以可编辑/可确认的版本对象显示；简单任务不出现空 Plan 页面。
- Review 若未执行，状态显示“未请求模型审查”，不能显示“ChatGPT 已验收”。
- 任何自动付费切换、危险工具操作和跨工作空间写入都要明确授权。

---

## 10. 优先级与版本分配

| 版本 | 必须达到的产品能力 | 关键约束 |
|---|---|---|
| **M0：产品基线与契约** | UI/Provider/Executor/Workflow 的独立选择；TaskSpec + 可选 Plan；清晰额度提示 | 不改动已有代码前先审计 |
| **M1：正式基础闭环** | SIWC / 已有合法 Provider 聊天 + Codex/Codely 执行 + 确定性验证 | 不强制 Planner/LLM Review |
| **M2：Web 平级 Provider 可插拔** | Web Adapter 契约、Mock/Manual、状态及诊断；通过合规门禁才实装真实自动访问 | 实验能力不阻塞正式运行 |
| **M3：可靠性与多端** | ContextEpoch、Checkpoint、QuotaPolicy、Executor 切换、Worker | 状态可恢复且不乱执行 |
| **M4：可选 Tool Bridge** | MCP Gateway、Scoped Broker、ChatGPT 反向工具能力、长任务 | Tool Bridge 与 Executor 区分 |
| **后续 TODO** | Agent 动态生成 Workflow、更多 Agent/Provider、复杂跨设备调度策略 | 不回填首期强制需求 |

> M0–M4 是产品能力里程碑，不直接替换历史 V0–V2 研发阶段编号；开发 Plan 要依据仓库实际完成情况做增量映射。

---

## 11. 关键验收用例（UAT）

| ID | 场景 | 通过标准 |
|---|---|---|
| UAT-01 | 用户选择 SIWC 进行普通聊天 | 流式回答成功；无 Task/Executor/单独 Plan/Review 请求 |
| UAT-02 | Chat Provider 菜单 | Web 和 SIWC 处于同一级；Web 可显示门禁状态但不隐藏为 Codex 功能 |
| UAT-03 | 简单任务交给 Codex | 有最小 TaskSpec；**没有强制 Plan**；Codex 原生循环执行；验证结果可见 |
| UAT-04 | 简单任务交给 Codely | 与 UAT-03 相同；Chat Provider 无需改变 |
| UAT-05 | 复杂任务 | 可生成有版本 Plan；多个 Run/Checkpoint；按风险执行 Review |
| UAT-06 | 无需 Review 的成功任务 | 验证成功；明确显示“未请求模型 Review”，不伪造验收 |
| UAT-07 | Web 未获得准入 | Web 选项可见且不可自动提交；SIWC、Executor 不受影响 |
| UAT-08 | Provider 从 SIWC 切到 Web/Mock 再切回 | 切换只影响后续 Turn；DSH 历史、Task 不丢 |
| UAT-09 | Codex 运行中切换 Codely | 没有覆盖旧 Run；显式 Checkpoint/新 Run，杜绝重复写入 |
| UAT-10 | 工作额度达到上限 | 不自动切换到额外付费 API 或其他额度源 |
| UAT-11 | 流式请求中断 | 未把 `response.failed`/网络断开标成功；提供可判断的恢复操作 |
| UAT-12 | 反向工具权限不足 | 无法访问非授权路径；失败记录审计，不继续写入 |
| UAT-13 | Tool Bridge 不存在 | 外部 Agent 执行链仍可独立运行 |
| UAT-14 | 重启并继续任务 | 从 DSH Checkpoint/状态继续，不依赖 Web 历史完整存在 |
| UAT-15 | 组合契约测试 | Web/Mock、SIWC × Codex、Codely 四种组合在 Provider/Executor 层互不耦合 |
| UAT-16 | 含副作用操作超时/重连 | 提交状态不确定时不会自动重复执行同一写操作 |

---

## 12. 开放问题与须由仓库/账户确认的事实

1. DSH 当前代码有哪些 Provider、Executor、Workflow、TaskStore、MCP/Tunnel？**须 P0 仓库审计，不凭历史文档臆断。**
2. 当前 SIWC 是否已获得对应账户/应用授权？支持哪些模型及工具？使用官方模型目录实时确认。
3. Web 自动化能否获得所需的明确使用许可？**未确认前不得激活真实自动收发。**
4. DSH 的现有 Codex 集成是否暴露“活动原生 Turn 工具注册表”？若没有，应使用 DSH 工具或外部执行 Agent，而非伪造 Native Host。
5. Codely 实际提供哪些 CLI/ACP/API、恢复、授权和 Sandbox 能力？按安装版本核对。
6. 各工作流模板和现有 ADR 的确切编号、文件路径与已实现情况，需 P0 从仓库获取。

---

## 13. 参考资料与术语

- [SIWC — OpenAI 官方概览](https://developers.openai.com/siwc/token-sharing-open-source)
- [SIWC — Models and Inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [SIWC — Preview Limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [SIWC — 使用额度官方帮助](https://help.openai.com/en/articles/20001542-using-your-chatgpt-plan-in-other-apps-and-sites)
- [codex-chatgpt-web — GitHub](https://github.com/miuuyy/codex-chatgpt-web)
- [codex-chatgpt-web — Architecture](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/architecture.md)
- [codex-chatgpt-web — Security Model](https://github.com/miuuyy/codex-chatgpt-web/blob/main/docs/security-model.md)
- [ChatToHarness — GitHub](https://github.com/DJ-Huang/ChatToHarness)
- [OpenAI Terms of Use](https://openai.com/policies/terms-of-use/)

**术语**：`Chat Provider` = 模型接入途径；`Executor` = 保留或接入执行能力的 Agent；`TaskSpec` = 持久化任务契约；`PlanRevision` = 可选显式规划；`ReviewPackage` = 紧凑验收输入；`Tool Bridge` = 有权限边界的辅助工具调用通路；`Native Tool Host` ≠ `External Agent`。

---

## 14. 产品决策记录（本版必须覆盖旧版的描述）

| 决策 | 结论 |
|---|---|
| D-01 | DSH 原生 UI 为主要入口 |
| D-02 | ChatGPT Web 与 SIWC 在 UI/Provider Router 中平级、可切换；Web 自动功能有独立准入门禁 |
| D-03 | ChatGPT 负责聊天、按需规划、按需审查；**没有强制 Planner 阶段** |
| D-04 | 进入工程执行才产生 TaskSpec；显式 Plan 和模型 Review 均按需 |
| D-05 | Codex/Codely 是独立可选 Executor；工程执行优先保留各自原生 Agent Loop |
| D-06 | 反向 MCP/Native Tool 借鉴为可选辅助能力，不绑定默认 Workflow 或 Codex 唯一执行器 |
| D-07 | DSH 自行管理 Session/Memory/Task/Run/Checkpoint；额度来源、切换和权限透明 |
| D-08 | 采用模板化自适应 Workflow + 用户 Override；Agent 动态 Workflow 属未来 TODO |

**本 PRD 是产品设计基线；任何与 vNext.2/vNext.3 相反的流程图和优先级描述，应以本版 D-01～D-08 为准。**
