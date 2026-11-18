# DSH v2 — Codex / Codely 通用开发执行计划

> 更新：2026-11-16｜状态：实施与验收进行中，完整产品尚未验收。
>
> **需求来源仅限 `docs/myPlan/` 的两份当前 Markdown PRD**：[主 PRD vNext.4](../myPlan/DSH_PRD_vNext_4_2026-10-27.md)与[Taskboard PRD v0.1](../myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md)。本文件负责拆解实施、跟踪进度和关联证据，不补充第三套产品要求，也不沿 PRD 中的旧链接重新引入历史计划。
>
> 目标与约束以两份 PRD 正文为准；主产品决定以主 PRD D-01–D-10 为准，工作台详细行为以专题 FR01–FR14、AC01–AC20、NFR01–NFR09 为准。原 Word 文档是专题原稿索引，不用于扩大当前 Markdown 需求。
>
> [当前进度](#12-有效-checklist-与任务证据)｜[可体验范围](#14-p1-当前实现范围)｜[Web 前置验证](#15-当前第一优先web-chatgpt-provider-可行性验证)｜[Taskboard 实施](#16-taskboard-增量实施计划)。P/CG/QR/VN4/TBOARD 编号保留用于追踪，不能依据编号或底层组件存在推断功能完成。

## 0. 给执行 Agent 的第一条指令（必须遵循）

先读取两份 myPlan PRD 及本计划当前任务的需求映射，再按 [WORKFLOW](../../.ai/WORKFLOW.md) 核对 Task、真实 Git 状态和单一写入权。仓库架构、代码和既有测试用于判断实现方式及完成证据，不能替代 PRD 决定产品范围。旧业务示例、历史提案和已移除文档不构成实施前置。

每步保存可恢复记录，并读取 Codex 的七天周额度；剩余小于或等于 10% 时停止新增开发、测试和后台任务，仅完成安全停止与 `HANDOFF_READY`，释放写入权。动态额度仅写当前 Task，不写本计划或长期 Memory。

## 1. 不可妥协的产品目标与范围

### 1.1 必须实现的体验

- 普通聊天不创建 Task，不启动 Executor，不额外调用 Planner 或 Reviewer；简单工程任务采用最小 TaskSpec、原生执行器循环和确定性验证。
- ChatGPT Web 与 SIWC 是平级 Provider；Provider、Executor、Workflow 独立选择，已提交 Turn 和已有 Run 保留绑定。
- Codex/Codely 默认作为 `external-agent` 保留原生 Agent Loop；已有 `native-model/subscription` 是另一种集成模式。
- Task、Run、Delivery 与人工 Review 分开；仅用户接受指定有效 Delivery 才能使任务完成。
- 额度来源、未知计数、额外付费与切换行为透明；跨来源、跨模型、额外付费均须明确用户操作。

来源：主 PRD 第 0–5、8–9 节及 D-01–D-10；专题 PRD 第 2–8 节。

### 1.2 明确不做或推迟

不强制独立 Plan 或模型 Review，不重建 Codex/Codely 内部 Planner，不声称读取官方 ChatGPT Memory。反向 MCP/Native Tool 是可选辅助工具链。团队、跨机器、复杂自动领取和完整编辑器按专题 G3/G4 及主 PRD M3/M4 的实际范围实施，不成为工作台 MVP 的额外前置。

### 1.3 已知边界（实施时重新验证）

Web 受控 PoC 不等于生产准入；OAuth 登录不等于普通 ChatGPT 额度。SDK 控制 Harness 不等于已启动 Codex/Codely 原生执行器。Session 恢复、原生 Executor resume、环境恢复分别验证；不能用新会话冒充恢复，也不能用 SDK idle 或最终文本冒充人工验收。

## 2. 推荐架构：Local-First Modular Monolith

2026-11-16 用户确认首版工作台位于现有 DSH Web 内，复用 Web Host 与认证。任务服务持有业务库，每个 Run 经官方 TypeScript SDK 启动独占 runtime。部署与归属见[入口决策](../../.ai/tasks/dsh-tboard-00/decision.md)。

### 2.1 已有技术栈与存储归属

| 职责 | PRD 要求 | 实施评估范围 |
|---|---|---|
| 产品任务服务 | 业务状态、版本、启动意图、Delivery、人工验收、目录/runtime 租约 | G0 明确一个状态拥有者；数据库与迁移方案在 TBOARD-02 落实 |
| Harness | Session、模型与工具事实、原有权限语义 | Session 日志继续是执行事实权威，任务库只保存引用与业务记录 |
| Harness Adapter | 创建/恢复 Session、提交输入、问题/审批、目标 runtime 停止 | 使用已核验的公开 TypeScript SDK 和受支持 dsh profile |
| Executor | Codex/Codely 原生循环、进度、结果及支持的取消/恢复 | 按驱动能力逐项验证，不能以模型 Provider 代替 Executor |
| UI | 聊天、选择器、任务看板、待处理、交付验收 | 现有 DSH Web 页面复用 Host 与认证 |

### 2.2 目录复用

先查 SDK、Session、storage、workspace、sandbox、interaction、subprocess/jobs、workflow、deliverables 和现有 Client 扩展接口。目录中存在某个实现只说明它可被评估，不决定新任务模型、状态机或审核流程。`.ai/tasks/` 仅保存人工开发记录，不是产品 Task Store。

### 2.3 进程/边界

默认串行执行，每个活动 Run 独占 runtime，并关联真实 Session、持久 dshHome 和规范化工作目录。关闭 UI 不停止执行；停止只作用于目标 runtime，确认退出前保留所有权。不得让两个控制路径同时接管同一 Session，不自动删除工作成果。

## 3. 目标语义（实施前映射现有类型，不作为第二套已发布 Schema）

### 3.1 TaskSpec v1：最小可执行目标

正式工程任务保存目标、约束、输入工件、工作空间、Executor、验收条件、风险、Workflow 版本及授权。任务版本与 Run 的输入快照不可原地覆盖；普通聊天没有这些执行对象。具体字段以主 PRD FR-EX-04 与专题 FR02/03、第 11 节为准，本计划不发布额外 JSON Schema 或执行器默认值。

| 对象 | 实施必须保留的信息 |
|---|---|
| Project / Task | 目录与基线、运行配置引用；标题、目标/描述、验收标准、优先级、标签、状态、版本 |
| Run / SessionRef | 前序 Run、冻结输入、真实 Session、runtime、dshHome、兼容版本、目录租约、结束原因 |
| Delivery | Task/Run/需求版本、交付版本、代码快照、逐条验证、已知问题与未完成项 |
| 人工 Review | 指定 Delivery 与代码指纹、接受/退回、操作者、理由及时间 |
| Event / Interaction / Lease | 来源身份与游标、真实请求身份及撤销、执行和目录所有权及对账结果 |

### 3.2 状态模型与转移

Task 业务状态使用专题第 7 节的 `backlog / todo / in_progress / in_review / blocked / done / canceled`。Run 使用第 8 节的 `queued / preparing / running / finished / failed / canceled / interrupted`；控制状态和连接状态另存。等待回答、等待审批不直接等同业务阻塞。

开始执行须原子校验期望版本、任务/Session/目录所有权及幂等键。有效 Delivery、Run 已结束、无未决问题/审批且快照可定位，才可进入待验收；只有人工接受可到 done。停止 Run、取消 Task、退回 Delivery 是不同操作。重试/继续建立新 Run，保留旧记录。

### 3.3 ExecutorAdapter v1（语言无关语义）

Adapter 明确声明启动、进度、输出、权限回调、取消、结果、resume 等能力的已验证/不支持/未知状态。工程执行使用 `external-agent`；请求 Codex 模型不构成执行 Codex 原生任务的证据。恢复不自动重放副作用；不支持时返回可解释结果，不伪造成功。

### 3.4 Verification & Review 契约

确定性检查保存实际命令、工作目录、退出码、证据与未覆盖风险；没有执行就不记录通过。模型 Review 按 `none / on-risk / required-by-user` 和 Workflow 触发；没有请求时记录 skipped。模型 accept、Run 成功、检查通过均不替代人工接受 Delivery。失败/未执行的验证可如实交给用户审查，豁免必须由人说明理由。

### 3.5 Conversation / Event 合约

DSH Session 保存模型和工具事实；产品 Event 保存来源身份、自有游标及脱敏载荷引用。输入接纳回执、活动结束、runtime 退出和交付验收分别判断。重复/乱序事件不重复入账，不回退已确认终态；输入接纳未知先对账，不盲目重发。来源：主 PRD FR-RL、FR-MEM，专题 FR04/06/08/13。

### 3.6 最小 Memory 语义

Memory/Checkpoint 与 Task、Run、Workspace 按引用关联；ContextBuilder 选择必要的历史、任务、文件与快照，记录实际模型可见输入。切换 Provider 重新编译上下文；导入/Fork 不声称恢复官方网页会话。跨项目授权隔离，不复制登录 Cookie 或凭据。

## 4. 里程碑、依赖与具体开发任务

M0–M4 与 G0–G4 分别来自主 PRD 第 10 节和专题第 15 节。P/CG/VN4 编号仅保留为实施追踪；范围与验收由当前 PRD 决定。

### P0 — Repository Baseline & Integration Spikes（实施第一关）

P0-01..06 仅表示已有代码审计、Mock 与 Provider/Executor 可行性验证的历史基线。其证据见第 12–13 节，不替代 Taskboard 的 G0，也不批准旧任务领域实现成为产品要求。

### P1 — V0：单机最小闭环（Web 前置验证后推进）

| ID | 当前交付目标 | 依赖与验收来源 |
|---|---|---|
| P1-01 | TaskSpec/需求版本、Task/Run/Delivery/人工 Review 及验证类型、JSON 校验与错误语义 | TBOARD-00；FR-EX-04；专题 FR02/03/10/12、第 11 节 |
| P1-02 | 任务业务记录与 Session 引用持久化、事务、迁移/备份 | P1-01、TBOARD-01；专题 NFR03/07/09 |
| P1-03 | 期望版本、合法状态转移、幂等启动与先落启动意图 | P1-02；专题 FR05、第 7–8 节、AC02/13/17 |
| P1-04 | 任务与验收命令、actor/作用域校验、事件游标与 UI 断连 | P1-02；专题 FR04/06/13、第 11 节 |
| P1-05 | SIWC 与已有 Provider 的真实聊天、状态、凭据与生命周期 | FR-CP、FR-SIWC；UAT-01/02/07 |
| P1-06 | Chat/Task 上下文、输入快照、Session/Run 与 Checkpoint 引用 | FR-MEM；专题 FR03/08 |
| P1-07 | Codex/Codely 独立选择及统一 Run 的能力/事件/取消适配 | FR-EX-01..06；TBOARD-01 |
| P1-08 | 默认串行队列、runtime/Session 所有权及重启对账 | P1-02/03；专题 FR05/07/08、AC11–18 |
| P1-09 | 权限、工作目录/worktree、别名和父子目录锁、停止隔离 | FR-SEC；专题 FR01/07/09/13、AC12/15/18/19 |
| P1-10 | ValidationResult、逐条验收证据、代码快照及只读 Diff | FR-EX-07；专题 FR10/11、AC05–08 |
| P1-11 | 可选模型 Review、有限修复；独立的人工接受/退回/豁免 | FR-EX-08..10；专题 FR12/14 |
| P1-12 | 聊天与独立选择器、任务/运行详情、待处理、交付验收 | FR-CP/EX/TASK；TBOARD-07 |
| P1-13 | 已验证配置的完整演示、发布、备份/恢复和升级指南 | TBOARD-09；全部 P0 功能及 AC01–AC20 |

M1 的退出证据是正式 Provider + 原生 Executor + 确定性验证的任务闭环；Taskboard MVP 还须通过 G0–G2、全部 AC01–AC20 与真实编码验收链。Mock 演示单列。

### P2 — V1：共享记忆、恢复与 Agent 无缝替换

P2-01 Scoped Memory；P2-02 按预算 ContextBuilder；P2-03 工件/验证/交付引用；P2-04 Task/Run 重启与未知状态对账；P2-05 新 Run 的 Executor 接力；P2-06 任务级调用/修复预算；P2-07 可选 PlanRevision 与版本化 Workflow。来源为 FR-MEM、FR-EX-06/08/09、FR-Q 及专题恢复要求；工作台 G2 必需项不推迟到后续扩展。

### P3 — V2：多 PC Worker 与远程执行

P3-01..06 分别跟踪节点身份/能力、授权通道、claim/lease/fencing、代码/工件同步、远程取消/恢复、独立节点验收。跨设备不复制敏感凭据，当前是后续目标，不作为单机 MVP 的额外前置。

### P4 — 后续扩展（不阻塞 V2）

主 PRD M4 的可选 Gateway/Scope Broker/工具桥，与专题 G3/G4 的有限并行、依赖、受控领取、团队、PR/CI 分别拆项；Agent 动态 Workflow、复杂调度与完整编辑器不回填首期范围。

## 5. 开发协作：Codex 与 Codely 一致执行规范

Task 领取、单一写入者、检查点、Git 安全和周额度停止线以 [.ai/WORKFLOW.md](../../.ai/WORKFLOW.md) 为准。每个实施 Task 写明对应 FR/AC/UAT、范围、实际验证和下一步。`.ai` 的开发记录不充当产品业务数据库；产品 Workflow 不写成开发协作规则。

## 6. 测试计划 / 故障注入矩阵

主产品验收使用[主 PRD 第 11 节](../myPlan/DSH_PRD_vNext_4_2026-10-27.md#11-关键验收用例uat)的 UAT-01–16；工作台使用专题 AC01–AC20 与 G0 接入矩阵。以下 T 编号是本计划的检查类别，不再引用旧计划的测试定义。

| 检查类别 | 必须覆盖的证据 |
|---|---|
| T01 数据校验 | 非法/缺失输入、版本、作用域及无 AC 启动被拒绝 |
| T02 幂等 | 双击、请求重放、启动后写库失败不额外执行 |
| T03 生命周期 | 关闭 UI 不中断；只停止目标 runtime |
| T04 恢复 | 崩溃/重启、旧 runtime 未退出、未知输入不重发 |
| T05 事件 | 原始来源、去重、乱序、断流与终态不回退 |
| T06 权限 | 允许/拒绝/取消/撤销、迟到答复、配置失败、路径别名 |
| T07 Provider | 能力不匹配、额度、鉴权、断流与明确切换 |
| T08 验证 | 失败、未执行、不适用不伪造通过；代码快照含选定未跟踪文件 |
| T09 验收 | 人工接受/退回/豁免、过期交付、Agent 越权拒绝 |
| T10 Memory | Workspace 隔离、引用完整、导入不恢复审批/进程 |
| T11 Executor | 独立选择、原生循环、按实际能力取消/恢复 |
| T12 后续 Worker | 仅对应后续跨设备范围的过期所有者/双写保护 |

## 7. 安全、可靠性和回滚要求

执行与验收写入必须校验 actor、任务、runId、期望版本与幂等键；服务端绑定 Agent 可写范围。默认本地回环服务；凭据不写任务、日志、Memory 或导出包。磁盘/持久化失败时拒绝新的执行与验收，不能返回未落盘成功。

备份带版本、清单与校验信息；在无活动执行的新数据库/实例中恢复。损坏、不兼容、ID 冲突不得覆盖合并；导入不启动进程、不重放输入或审批。停止、结束或验收不自动删除目录；不兼容升级保留数据并给出恢复路径。

## 8. 各阶段提交与验收模板

每项证据记录需求编号、被测源码指纹、版本/系统/profile/脱敏配置、Task/Run/Session/runtime 身份、工作目录、操作与原始结果、退出确认、持久化结果及已知限制。测试结果区分 PASS、FAIL、NOT_RUN 与不支持；静态审阅、Mock、真实产品进程和真实 Provider 分层记录。

### 全项目 Definition of Done

当前 PRD 的范围已实现，确定性检查与记录回放通过，关键数据/权限/恢复路径有失败证据，用户可复现操作，Taskboard 人工验收链完整。历史单测或底层 SDK 可用不能替代端到端验收；G1 演示不等于 G2 发布。

## 9. 变更规则

需求变更先更新两份 myPlan PRD，再映射本计划的任务与验收。代码实现、历史计划、旧业务示例和参考仓库不自行产生需求。证据与已完成代码保留；被撤销的范围不继续开发，也不沿旧检查点自动恢复。已有编号的状态调整须以当前目标是否有实现/验收为依据。

## 10. ChatGPT 接入增量阶段与现状审计

### 10.1 当前实现、目标与缺口

| 能力 | 已验证范围 | 尚缺产品验收 |
|---|---|---|
| Provider 元数据/意图/精确能力 | QR-01/02；已知/未知/不支持及配置职责 | Web/SIWC 平级完整 UI 与账户生命周期 |
| 逐 Turn 选择/能力拒绝 | QR-03 的真实 Web 组合、受控模型与 SDK 回放 | 全部明确回退流程、真实模型 GUI 验收 |
| 本地预算/付费授权 | QR-04 的原子请求名额、Session cap、预设/当次确认 | 官方余额、token/金额及 Task 预算、状态展示 |
| 用量与来源/口径 | QR-05/06 的原生记录、准备失败、尝试引用、弹窗 | 完整政策/Task/Run/外部执行器账本 |
| Taskboard | 已实测部分 G0 SDK 能力，G0–G2 尚未通过 | TBOARD-00..09；不能由已有组件推定 PARTIAL |

### 10.2 Provider、执行模式与额度

保留 `work_codex_shared / chatgpt_web_unofficial / api_metered / third_party / local / experimental_unverified / unknown` 的明确来源，普通 `chatgpt_regular` 不作为 DSH 主动模型 Provider。提供方余额、适配器返回计数、本地估计与本地预算分别展示。Executor 模式与认证方式不绑定费用来源。

### 10.3 阶段依赖与任务归属

已通过的受控 Web 前置 PoC → M0 的独立选择/任务契约与 G0 决策/接入验证 → M1/G1 的执行、验证、交付及人工验收 → G2 恢复与发布。Web M2 产品化独立准入，不能以真实 PoC 当生产通过。CG 编号仅作 Provider/额度/任务/可靠性/工具桥工作分组；不从旧增量计划补需求。

### 10.4 CG1 的明确任务与验收

| ID | 对应当前要求 | 验收重点 |
|---|---|---|
| QR-01 | FR-CP-02/03/05/06、FR-Q-01 | 来源与能力三态，未知余额不伪造 |
| QR-02 | FR-EX-01..03、D-05/D-07 | Provider/Executor/认证/费用职责独立 |
| QR-03 | FR-CP-04/05、FR-Q-02 | 捕获实际路线、能力拒绝、下一 Turn 生效、明确回退 |
| QR-04 | FR-Q-02/03、FR-SIWC-03 | 本地预算、保留执行额度、额外付费明确同意 |
| QR-05 | FR-Q-01、FR-RL-01 | 请求/实际路线/口径/政策/Task/Run 关联 |
| QR-06 | FR-CP-06、FR-Q-01/02 | 费用、未知值、预算、同意和回退 UI |

### 10.5 数据归属与 Decision Log

Task 数据库拥有业务状态、需求版本、Run、Delivery 与人工 Review；Harness Session 日志拥有模型/工具事实。两者以真实引用关联，不复制第二份执行权威。TBOARD-00 已确认由 Web Host 中的任务服务单写业务库；不能预设某个旧业务模型及其强制 Plan/Review 是产品基础。开发记录和 Git 不作为实时任务队列。

## 11. vNext.4 增量实施路线（P0 合并结果）

本节只映射主 PRD D-01–D-10、FR 模块、M0–M4 与专题需求；VN4 编号沿用，验收编号直接引用当前 PRD。

| myPlan 需求范围 | 实施任务 | 验收来源 |
|---|---|---|
| FR-CP-01–06 | VN4-01/02、QR-01/03/06 | 主 PRD UAT-02/07/08/15 |
| FR-SIWC-01–04 | P1-05、QR-01/04 | 主 PRD UAT-01/07/08 |
| FR-WEB-01–05 | WB-01、VN4-06；可选入口归 VN4-10 | 主 PRD UAT-02/07/08、D-09 |
| FR-EX-01–10 | P1-01/07/10/11/12、VN4-02..05、TBOARD-06 | 主 PRD UAT-03–06/13/15；专题交付验收 |
| FR-TB-01–05 | VN4-10、P3-07/08 | 主 PRD UAT-12/13；M4 |
| FR-MEM-01–05 | P1-02/06、P2-01..05、VN4-08/11 | 主 PRD UAT-08/09/14 |
| FR-Q-01–03 | QR-01..06、P2-06 | 主 PRD UAT-10 |
| FR-RL-01–03 | VN4-07、P1-03/08、TBOARD-03/05/08 | 主 PRD UAT-11/16；专题 AC02/13/14/17 |
| FR-SEC-01–03 | VN4-09、P1-09、TBOARD-04/05 | 主 PRD UAT-07/12；专题 AC09/10/12/15/18/19 |
| FR-TASK-01–07、专题 FR01–FR14 | TBOARD-00..09、P1-01..04/08..13 | 专题 AC01–AC20、NFR01–NFR09、G0–G2 |

| ID | 当前目标 | 主要任务/验收来源 |
|---|---|---|
| VN4-00 | 需求与实现分开、当前两份 PRD 的任务映射 | 文档核对，不表示产品验收 |
| VN4-01 | Web/SIWC 平级 Provider 与能力/费用元数据 | QR-01..03；FR-CP/SIWC/WEB |
| VN4-02 | Provider/Executor/Workflow 独立选择并固定到 Turn/Run | P1-07/12；FR-CP-04、FR-EX-01/02；UAT-02/09/15 |
| VN4-03 | TaskSpec、需求版本与可选 Plan | P1-01..03、TBOARD-02；FR-EX-04、专题 FR02/03 |
| VN4-04 | 自适应模板、用户 Override、可选模型 Review | P1-11、P2-07；主 PRD 3.1/3.2、D-03/04/08 |
| VN4-05 | 正式 Provider + Codex/Codely 原生执行闭环 | P1-05/07/10；UAT-01/03/04/13/15 |
| VN4-06 | 受控 Web 前置验证与独立的产品化 | WB-01；FR-WEB-01..04、D-09；UAT-07/08 |
| VN4-07 | 尝试/提交回执、终态、工具完成屏障、预算 | QR-04/05；FR-RL、FR-Q；AC02/13/14/17 |
| VN4-08 | Task/Run/Memory/Checkpoint 与恢复/导入 | P1-02/06、P2-01..05；FR-MEM；AC11/16/20 |
| VN4-09 | 受保护凭据、权限/审批、目录隔离、脱敏 | P1-09、TBOARD-04/05；FR-SEC；AC09/10/12/15/18/19 |
| VN4-10 | 可选入站 Gateway / Scope Broker / 工具桥 | P3-07/08；FR-TB；M4 |
| VN4-11 | 后续 Worker、跨设备、诊断和升级可靠性 | P3-01..06；FR-MEM-05、M3；专题 G4 |

### 11.1 旧需求处理与决策冲突

旧计划的固定 Planner/Reviewer 流水线、指定业务任务状态机、重新建 Core、统一 ACP 前置及固定 Codex/Codely 分工均不作为当前要求。主 PRD D-01–D-10 与专题正文是判定依据。TBOARD-00 的入口决定已记录在第 16.1 节。

## 12. 有效 Checklist 与任务证据

DONE 表示该行明确范围已有证据，PARTIAL 表示已验证一部分当前目标，TODO 表示目标尚无对应实施验收。底层基础与产品任务分别记录，不能用旧业务库、通用 jobs 或 Session 存在证明工作台能力已实现。未勾选的 UAT/AC 不因本次文档调整自动通过。

### 12.1 P0：基线与可行性验证（Gate 0）

| ID | 状态 | 已有验证及边界 |
|---|---|---|
| P0-01 | DONE | 历史代码/环境基线审计；不是 Taskboard 完成证据 |
| P0-02 | DONE | Mock 错误与传输恢复基础；不代表真实账户全路径 |
| P0-03 | DONE | 用户已免测 API Key 路线；NOT_RUN 不改写为 PASS，SIWC 产品验收仍 PARTIAL |
| P0-04 | DONE | Codely 原生进程/本地受控模型及适配器探测；统一 Run 未验收 |
| P0-05 | DONE | 固定 Codex 产品/适配器的受控模型、权限、取消与清理；原生 resume 不作承诺 |
| P0-06 | DONE | 历史可行性基线整理；当前架构与数据拥有者仍按 myPlan/G0 决定 |

已有验证记录见[基线](../../.ai/tasks/dsh-p0-baseline/handoff.md)、[执行器探测](../../.ai/tasks/dsh-p0-executor-probes/handoff.md)和[SIWC 探测](../../.ai/tasks/dsh-p0-siwc/handoff.md)。这些记录是证据索引，不是当前需求来源。

### 12.2 P1 / V0：单机 MVP 闭环（最高优先）

| ID | 状态 | 已验证部分或剩余范围 |
|---|---|---|
| P1-01 | PARTIAL | 项目、任务、需求版本和操作回执已在 Web Host 工作台服务中实施；运行与交付验收关联待完成 |
| P1-02 | PARTIAL | 任务与历史在独立 SQLite 域原子写入，已验证重启保留；正式业务库备份与 Session 关联待验收 |
| P1-03 | PARTIAL | 项目内任务命令已校验期望版本与重放回执；启动意图及租约事务待实施 |
| P1-04 | TODO | 通用 Task/验收 API、作用域与游标补偿尚未实施 |
| P1-05 | PARTIAL | SIWC Loader/配置/持久化/取消与生产适配器回放已有证据；真实账号长回复/生命周期待补 |
| P1-06 | PARTIAL | Session/context/compaction 基础已有；Task/Run 输入快照及统一 ContextBuilder 未贯通 |
| P1-07 | PARTIAL | 原生 Codex/Codely 接入基础已验证；独立选择 UI、统一 Run 与完整生命周期未验收 |
| P1-08 | TODO | 工作台串行队列、Run 所有权与重启协调尚未实施 |
| P1-09 | PARTIAL | sandbox/workspace/interaction 基础已有；任务级目录租约与停止隔离未验收 |
| P1-10 | TODO | 通用 ValidationResult、逐条 AC Matrix 与 Delivery 代码快照未实施 |
| P1-11 | TODO | 可选模型 Review 产品链与独立人工验收未实施 |
| P1-12 | PARTIAL | 聊天、模型选择和用量/付费确认有证据；任务看板/详情/验收仍 TODO |
| P1-13 | TODO | 干净环境全链路和 G2 发布证据未完成 |

### 12.3 P2 / V1：记忆、上下文优化、替换执行器

P2-01 TODO；P2-02 PARTIAL（已有 Session/context 基础）；P2-03 TODO；P2-04 TODO；P2-05 PARTIAL（适配器基础，不含任务接力验收）；P2-06 TODO；P2-07 TODO。工作台必需的恢复/备份仍在 G2 实现，后续项的编号不用于推迟 MVP 要求。

### 12.4 P3 / V2：多 PC Worker 与远程执行

P3-01..06 均 TODO；未形成独立节点、权限、过期所有者及恢复的产品证据。P3-07/08 的可选工具桥见 QR 清单，不能由现有 MCP 客户端推定完成。

### 12.5 P4：后续待办（不阻塞）

专题 G3/G4 和主 PRD 的后续动态 Workflow、复杂调度、编辑器均未启动；需保持与首期范围分离。

### 12.6 贯穿全程的验收案例

UAT-01–16 与 AC01–AC20 均须按当前 PRD 逐项验收；本计划未声明已通过完整 UAT 或工作台 AC。局部自动化、PoC、版本/平台限制见相应实施 Task。

### 12.7 任务证据台账（执行时逐行补充）

Provider/额度/用量的具体证据集中在第 12.8 节，Taskboard 集中在第 12.10 节，P0 的范围在第 13 节。每项新增证据保存固定源码指纹和真实操作结果；分支名不作为固定被测版本。当前修改尚未提交/推送，实际 Git 状态须在接手时重新检查。

### 12.8 ChatGPT 增量计划清单

任务说明、模块归属、阶段依赖与验收以本文件第 10–11 节为准。以下只是同一批任务的状态入口，不创建另一套实施计划。

- [x] **CG-00 [DONE]** 新旧计划审计合并、Gap Matrix、Decision Log、实现证据与 Memory 同步；本轮仅文档。三组命名双语配对、局部链接/换行/文件结尾、全仓引用、22 文档标准测试通过；最终 test:docs 为 18/2，doc-sync 为 33/9（引用随后单独修复通过），剩余限制见 [检查点](../../.ai/tasks/dsh-chatgpt-plan-update/handoff.md)。此为历史 CG0 记录；当前 P1/CG1 已获授权，进度以下列 QR 状态为准。
- [x] **QR-01 [DONE]** LlmProviderInfo.policy、usageSource/能力三态/unknown 余额、实验准入、SIWC 共享来源、pi-ai 政策配置和显式意图/能力要求输入已有解析与验收证据。见[元数据任务](../../.ai/tasks/dsh-p1-provider-policy/handoff.md)、[配置任务](../../.ai/tasks/dsh-p1-provider-config/handoff.md)和[意图任务](../../.ai/tasks/dsh-p1-intent-routing/handoff.md)；不将 VN4-01/02 或 CG1 Gate 标完成。
- [x] **QR-02 [DONE]** Auth / Provider / Executor / 费用声明独立配置已核对：Loader 回归覆盖凭据/政策独立更新、已存 OAuth 账户替换与删除、显式 Key 优先及缺失时不回退；Codex 实例模型/环境/权限隔离和 Codely 无模型轮次的 Loader 执行有证据。Codex 两模式有实现，Codely external-agent 为本地示例、native-model 仍 unknown；旧插件名未定位为独立包，未删除插件。见[首轮证据](../../.ai/tasks/dsh-p1-auth-route-separation/handoff.md)与[OAuth/执行配置验收](../../.ai/tasks/dsh-p1-oauth-route-composition/handoff.md)。完成范围为配置职责与模式审计；真实账户/生命周期、统一 Run/UI 仍归 P1-05/07、VN4-02。
- [ ] **QR-03 [PARTIAL]** opt-in chat/plan/review/execute 显式 Provider/model 路由、逐 Turn 捕获、要求能力 unknown/unsupported 拒绝、失败不隐式跨路线已有证据；显式 vision 要求已按精确模型 inputModalities 校验，拒绝未知/仅文本模型且有记录回放，见[模型视觉准入](../../.ai/tasks/dsh-p1-exact-model-vision/handoff.md)；tools 要求已增加精确模型 toolSupport 三态声明与 pi-ai 配置/热更新验收，见[模型工具支持](../../.ai/tasks/dsh-p1-model-tool-support/handoff.md)；streaming 要求已按精确模型 streamingSupport 三态声明校验，见[模型流式支持](../../.ai/tasks/dsh-p1-model-streaming-support/handoff.md)；`selection: entry` 已接入现有入口选择拥有者，验证逐 Turn 固定、下一轮生效与提示一致，见[入口模型路由](../../.ai/tasks/dsh-p1-entry-model-routing/handoff.md)；真实 Web 组合的无密钥浏览器测试已验证选择器、实际请求、工具步骤、下一轮切换，以及限流/额度/断流失败后用户手动改选恢复，见[浏览器验收](../../.ai/tasks/dsh-p1-entry-routing-web-acceptance/handoff.md)；原生严格 JSON Schema 请求、精确模型 structuredOutputSupport、完成输出校验与 headless/双 SDK 记录回放已有证据，见[原生结构化输出](../../.ai/tasks/dsh-p1-native-structured-output/handoff.md)；resume 已区分 Provider 原生持久续接、DSH 历史重放/Session 恢复与外部执行器续接，pi-ai 拒绝无法兑现的 supported 声明，见[恢复语义与准入](../../.ai/tasks/dsh-p1-resume-semantics/handoff.md)；原生执行器恢复实现、真实模型 GUI/GIF、显式回退与完整 Gate 待补；QR-02 配置职责验收已完成。
- [ ] **QR-04 [PARTIAL]** 可选 paid-route-policy 已对声明为 api_metered 的精确 Provider/model 要求预设同意，见[付费路线验收](../../.ai/tasks/dsh-p1-paid-route-consent/handoff.md)；可选 [request-budget-policy](../../packages/guard/request-budget-policy/README.zh.md) 已通过 SQLite 原子回执跨 Host 保护本地请求名额，为明确 execute 意图保留名额，支持 reserve/commit/cancel/settle 幂等转换、已知未分发取消返还及崩溃保守保留占用；真实 Loader/Settings、两个构建版 dsh Host、重启及记录回放证据见[预算验收](../../.ai/tasks/dsh-p1-local-request-budget/handoff.md)。可选 `maxRequestsPerSession` 已在同一原子回执中按精确 Session ID 限制本地次数，覆盖所有意图与辅助请求、缺失身份拒绝、取消返还和重启保留占用，见[会话预算验收](../../.ai/tasks/dsh-p1-session-request-budget/handoff.md)。可选 `onMissingGrant: ask` 已复用既有审批面板，为每次 API 按量付费原生请求单独确认；授权先于预算预留，发送前复查许可，拒绝/取消不占本地名额，见[当次确认验收](../../.ai/tasks/dsh-p1-paid-route-interactive/handoff.md)。这些是每个预算内的本地次数限制，不代表官方余额；官方共享余额查询、token/金额预算、任务上限、预算状态展示与 credits 保护仍未实现；依赖 QR-03。
- [ ] **QR-05 [PARTIAL]** 可选 `token-meter/request-records` 已将本地活动 Session 的原生分发结算路线、捕获的 usageSource、终态和适配器返回计数写入既有 Session 日志，并提供有界来源/次数投影；记录用 Session ID + 已提交 seq 标识，不复制提示词、响应正文或凭据，重复样本只取最后一份，重试分发各自记录。真实 headless、TypeScript/Python SDK 与负向对照见[记账验收](../../.ai/tasks/dsh-p1-usage-records/handoff.md)。适配器计数本身可能是估算，不代表官方计费或余额；原生准备拥有者在分发前观察到的失败已有独立 `preparationFailures` 审计，不增加结算次数；真实组合、双 SDK、保留 V3 输入与负向对照见[准备失败验收](../../.ai/tasks/dsh-p1-preparation-records/handoff.md)。循环请求已通过所属 Session、已提交 `step/start` 序号与步骤内尝试序号关联记账，覆盖重试、并发辅助调用隔离与构建版 Host 恢复；旧记录不推断归属，见[请求关联验收](../../.ai/tasks/dsh-p1-request-attempt-link/handoff.md)。可选计数口径已贯通 `TokenUsage`、结算记录、缓存、SDK 与 Turn 详情，区分提供方报告/估算/未知及混合；DeepSeek 直连只在原始输入/输出计数均被观察到时声明报告，pi-ai/SIWC 不推断；见[口径与负向对照](../../.ai/tasks/dsh-p1-usage-measurement/handoff.md)。官方账单核验、完整政策决定、其他外层拒绝、崩溃未结算、Task/Run 关联及外部执行器记账仍待补；依赖 QR-01/04。
- [ ] **QR-06 [PARTIAL]** 本轮用量弹窗已按日志中的显式尝试引用显示提供方/模型与费用来源；缺失、重复或不匹配的来源显示“未知”，切换当前模型不回填历史。可选 [request-accounting overlay](../../apps/cli/config/examples/request-accounting.yml) 已有受控原生模型的真实 Web 组合验收、V3/V4 Session 回放、明暗主题及 420px 窗口/关闭行为验证，见[用量来源验收](../../.ai/tasks/dsh-p1-turn-usage-source/handoff.md)。API 按量付费原生请求的 opt-in 当次确认也已通过既有审批面板验证，见[审批与 SQLite 组合验收](../../.ai/tasks/dsh-p1-paid-route-interactive/handoff.md)。这是无密钥受控模型证据；官方余额、预算状态展示、完整回退 UI 和真实账号/GIF 仍待补；依赖 QR-03/04/05。
- [ ] **P3-07 [TODO]** 按 FR-TB-01/04 提供授权范围内的 MCP Gateway 能力，包括 `task.create/status/result/cancel`、`workspace.inspect`、`artifact.read`，记录审批、撤销和审计。
- [ ] **P3-08 [TODO]** 按 FR-TB-02/03/05 验证可选工具回环及 Tool Host 能力。长任务快速返回 Task ID，调用方据此查询状态。依赖 P3-07 与工作区授权。
- [x] **WB-01 [DONE]** Browser-only 真实收发与 DSH Adapter 最小接入验证完成：参考 DEV 唯一标记真实往返、客户端取消与本地清理有既序证据；2026-11-02 经受限准入的独立 worker 与桥接 Adapter 完成一次真实 DSH 请求，唯一标记精确回显、Responses completed、真实 usage（estimated 口径）、路由/无本地工具/thread-Turn 关联/attribution 与 worker 清理均有 Session 级证据；三次提交前失败有真实失败路径证据且未消耗模型用量。取消证据止步适配器层（SDK 无 wire-level cancel，文档明确）；生产默认门禁保持有效，未放开任何生产准入。证据：[dsh-web-real-request.json](../../.ai/tasks/dsh-web-provider-poc/evidence/dsh-web-real-request.json) 与[任务记录](../../.ai/tasks/dsh-web-provider-poc/handoff.md)。

完整路由/额度产品验收仍待实施：默认选择、能力不匹配、未知余额、限额、不可用、断流、明确回退及额外付费阻断，分别按 FR-CP、FR-Q、FR-RL 验收。QR-01/02 的 DONE 仅指已有元数据与配置职责，不关闭 VN4-01/02 或 Taskboard。

### 12.9 vNext.4 增量 Checklist

| ID | 状态 | 完成边界 |
|---|---|---|
| VN4-00 | DONE | 当前两份 PRD 的实施映射与证据分类；文档完成不是产品完成 |
| VN4-01 | PARTIAL | 元数据、路由和受控 Web 验证；平级 Provider 完整 UI 待补 |
| VN4-02 | TODO | Provider/Executor/Workflow 的独立产品选择与 Run 绑定 |
| VN4-03 | TODO | 通用 TaskSpec、需求版本与可选 Plan |
| VN4-04 | TODO | 版本化自适应 Workflow 与可选 Review |
| VN4-05 | PARTIAL | 正式 Provider/原生执行器基础；完整产品闭环待补 |
| VN4-06 | DONE | 仅受控 Web PoC；M2 及生产准入未完成 |
| VN4-07 | PARTIAL | 原生尝试引用/预算/失败基础；统一 Run/回执/屏障待补 |
| VN4-08 | PARTIAL | Session 导入/恢复基础；任务/Memory/Checkpoint 关联待补 |
| VN4-09 | PARTIAL | 既有凭据/审批/沙箱基础；完整任务隔离及存储验收待补 |
| VN4-10 | TODO | 可选入站工具桥，活动 Native Tool Host 能力未确认 |
| VN4-11 | TODO | 跨设备 Worker 与恢复 |

### 12.10 Taskboard 增量 Checklist

下表分别记录产品决策、接入验证和功能实施的进度。

| ID | 状态 | 当前交付重点 |
|---|---|---|
| TBOARD-00 | DONE | [首版入口与归属决策](../../.ai/tasks/dsh-tboard-00/decision.md)已确认；SDK 组合验收归 TBOARD-01 |
| TBOARD-01 | DONE | 专题 §10 八项 G0 用例在本分支通过；换目录时新建 Session，新旧 Run 保留引用，材料显式选择。已冻结 macOS 本地接入组合。[矩阵和实测范围](../../.ai/tasks/dsh-tboard-01/matrix.md) |
| TBOARD-02 | DONE | [任务业务库验收](../../.ai/tasks/dsh-tboard-02/handoff.md)：现有 Web 认证、项目与任务、需求与 Run 快照、交付与人工 Review、请求与租约、版本冲突、排序、归档、重启和重放。调度、真实代码复核和 UI 由后续步骤接入 |
| TBOARD-03 | TODO | 持久启动、输入回执、串行队列、重试与继续 |
| TBOARD-04 | IN_PROGRESS | 已验证工作树基线、原目录二次确认、[定向停止可核实的工具进程](../../.ai/tasks/dsh-tboard-04/evidence/controlled-stop.json)、[强停未确认保留租约](../../.ai/tasks/dsh-tboard-04/evidence/stop.json)及[无效审批配置阻断输入](../../.ai/tasks/dsh-tboard-04/evidence/permission.json)。[首发沿用 macOS G0 组合](../../.ai/tasks/dsh-tboard-04/platform.md)。同一 Host 的停止复核已实现，最新控制器待在首发 macOS 复验。 |
| TBOARD-05 | TODO | 事件游标、问题/审批及服务端任务工具作用域 |
| TBOARD-06 | TODO | 交付快照、只读 Diff、人工接受/退回/豁免 |
| TBOARD-07 | TODO | 看板、详情、待处理、设置与异常状态 |
| TBOARD-08 | TODO | 重启对账、导出/备份恢复及升级 |
| TBOARD-09 | TODO | 全部 AC/NFR 与真实编码链的 G2 发布验收 |
| TBOARD-10 | TODO | G3 扩展，未启动 |
| TBOARD-11 | TODO | G4 团队/远程扩展，未启动 |

## 13. P0 执行器能力与实施基线（2026-10-30）

### 13.1 实际版本、协议与能力

[执行器探测记录](../../.ai/tasks/dsh-p0-executor-probes/handoff.md)保存当时固定 Codex 产品、Codely 原生进程、受控本地模型、权限、错误、取消和退出证据。其结论限于当时版本和测试配置；原生流能力与 DSH 的最终结果投影分别记录。未实测的 resume、云服务和活动工具 Host 保持未知/不支持。

### 13.2 P0 定稿的实施选择

后续实现保持 Provider 与 Executor 独立、采用受支持启动路径、保留原有权限语义及 Session 事实。产品入口、业务状态和任务数据以当前 myPlan/G0 决策为准；不沿历史基线继续构建未被当前 PRD 要求的任务流程。P0 探测不是当前版本矩阵，也不是 Taskboard G0 的替代。

## 14. P1 当前实现范围

当前可在相应配置下验证逐 Turn 原生模型选择、精确能力拒绝、本地请求预算/Session cap、API 预设或当次确认、原生结算/准备失败记录，以及用量弹窗的路线/费用来源/计数口径。操作、受控模型性质和未验证范围见[Provider 使用指南](../user/guide/providers.md)与第 12.8 节 Task 证据。

这些成果不代表通用 TaskSpec、Taskboard、Delivery 或人工验收已实现。SIWC 产品完整生命周期、Web 生产产品化、官方余额、Task 预算、完整回退、Provider/Executor/Workflow 独立 UI 和任务闭环仍需实施；普通聊天与工程执行的路线不能混为一谈。

## 15. 当前第一优先：Web ChatGPT Provider 可行性验证

主 PRD FR-WEB-02/D-09 的前置验证已形成受控 PoC 证据，WB-01/VN4-06 的 DONE 仅指该范围。参考网页最小往返、DSH 请求/Session 接入与生产准入分别判断；生产路线继续 gated，不把参考实现、手动网页操作或 Mock 当成生产验证。

[现有 PoC 证据](../../.ai/tasks/dsh-web-provider-poc/evidence/dsh-web-real-request.json)及[检查点](../../.ai/tasks/dsh-web-provider-poc/handoff.md)记录受限 worker 的真实唯一标记往返、终态、无本地工具、请求关联及清理。取消证据不承诺服务器停止生成或额度返还。后续 M2 仍需平级 UI、状态/诊断、登录/断流/限额/提交不确定等生命周期与独立生产准入；不作为 Taskboard G0 已通过的证据。

## 16. Taskboard 增量实施计划

本节承接[主 PRD 第 9.3–9.4 节](../myPlan/DSH_PRD_vNext_4_2026-10-27.md#93-任务工作台-mvp)及[Taskboard PRD v0.1](../myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md)。详细产品行为由专题 PRD 拥有，本节只定义仓库实施归属、依赖、验收与未决事项；状态统一放在[第 12.10 节](#1210-taskboard-增量-checklist)。需求来源仅为上述两份 myPlan PRD；实现候选不构成额外产品要求。

### 16.1 入口与数据决策

TBOARD-00 先处理下列差异；G0 决策、技术验证和功能完成分别记录。架构差异按既有 Agent Notes 流程提出，未确认前保持现有正式决策和已发布数据；无需新增平行 ADR 目录。

| 议题 | Taskboard 提案与本仓库处理 |
|---|---|
| 产品入口 | 现有 DSH Web 内的工作台页面，复用 Host 与认证。任务服务随 Host 运行，关闭浏览器不终止执行。 |
| Task 与 Session | 任务服务拥有业务库和人工验收记录，每个 Run 引用其 SDK runtime 持有的 Session。Harness Session 日志拥有模型和工具事实。 |
| SDK 与 Executor | TypeScript SDK Adapter 负责 Harness Session 控制；Codex/Codely 仍是独立 Executor，SDK 接入通过不等于外部 Agent 已接通。复用受支持的 dsh profile，不增加 package bin 或 argv 逃生路径 |
| 状态与 Review | 专题 Task/Run 状态映射到第 3 节目标语义；人工 Review 与模型 ReviewDecision 分开。仅用户接受当前有效 Delivery 可完成任务；保持旧数据回放和版本迁移要求 |
| 工具与费用 | MVP 的任务级工具桥不是 FR-TB 可选入站 MCP Gateway；只提供当前作用域的读取、进度、评论、交付和阻塞。专题后续预算范围不降低 QR 费用授权要求 |
| 发布组合 | G0 冻结首发系统、Harness/SDK/runtime 版本、profile/模型配置、权限能力和备份目录；仅对实测组合宣称支持。工期在 G0 后估算，不承诺发布日期 |

### 16.2 阶段与现有路线映射

专题 P0 是 G0–G2 的完整 MVP；G1 可演示不等于可发布。G3/G4 对应扩展范围，需单独确定实施范围；跨机器能力继续归主 Plan 的 V2，不提前变为 MVP 前提。

| Taskboard 阶段 | 主 Plan 复用范围 | 退出标准 |
|---|---|---|
| G0 接入验证 | P0-06、P1-07/09、VN4-02/09；TBOARD-00/01 | 入口及状态拥有者决策明确；专题第 10 节的全部真实接入用例通过，冻结版本/系统/配置矩阵 |
| G1 任务闭环 | P1-01..04/07..12、P2-03 的工作台子项；TBOARD-02..07 | AC01–AC10 通过，人工接受/退回可完成一个任务；启动幂等与目录锁先于任何真实执行，不推迟到 G2 才实施 |
| G2 恢复与发布 | P1-13、P2-04 的工作台子项；TBOARD-08/09 | AC11–AC20 及全部 P0 要求通过；完成真实编码、失败重试、交付、退回、再验收全过程 |
| G3 能力扩展 | P2-07 与 Taskboard 扩展；TBOARD-10 | 并行、依赖和自动领取有新增权限与并发回归 |
| G4 团队协作 | P3-01..06、未来 PR/CI 集成；TBOARD-11 | 身份/角色、协作编辑、远程节点及跨设备恢复独立验收 |

### 16.3 可领取任务与验收映射

TBOARD 编号细化现有 P1/P2 任务的工作台缺口，不重复建立通用 Session、Task API 或 Executor。FR/AC/NFR 编号均指专题 PRD；T/UAT 继续使用原编号。下表依赖是工作台内部最小实施顺序，须结合第 11 节的通用能力依赖领取；G0 已通过，业务数据层已完成，当前推进 TBOARD-04 的工作目录与运行隔离。

| ID / 阶段 | 复用任务与拥有者候选 | 依赖 | 最小交付与验收映射 |
|---|---|---|---|
| TBOARD-00 / G0 | 主 PRD 9.4/D-10；SDK、runtime、Session、storage | 本节需求与当前源码审计 | 第 16.1 节决策、兼容矩阵计划及缺口；落实 FR01、NFR09；入口采用现有 Web |
| TBOARD-01 / G0 | P1-07/09；sdk/client、server、protocol、interaction、subprocess | TBOARD-00 | 真实 Session 创建、同任务连续两次执行、关闭后恢复；审批允许/拒绝/取消、用户问题、双实例停止隔离、目录追踪和服务中断无重复执行；专题第 10 节全部通过 |
| TBOARD-02 / G1 | P1-01..03；任务数据库、版本记录、Session 引用 | TBOARD-00/01 | Project/Task/Run/Delivery/HumanReview/Interaction/Lease 映射、任务版本和输入快照、状态命令期望版本/事务/幂等、历史与归档；FR02–FR04、FR14；AC01、AC03、AC05 |
| TBOARD-03 / G1 | P1-04/07/08；jobs/workflow、SDK Adapter | TBOARD-02/04 | 手动启动与默认串行队列、先落启动意图、独占 runtime、Session/Run 关联、输入接纳回执、重试/继续新建 Run；FR05、FR08；AC02、AC04、AC11、AC17 |
| TBOARD-04 / G1 | P1-09；workspace、sandbox、subprocess | TBOARD-02 | 规范化目录及别名/父子目录锁、基线/worktree 验证、显式原目录串行；停止请求、目标进程树退出证据、超时保留锁；FR01、FR07、FR09；AC12、AC15、AC18、AC19 |
| TBOARD-05 / G1 | P1-04/06/09；Session events、interaction、authorization | TBOARD-03 | 原始事件/稳定身份或自有游标、历史与通知去重、真实进度；问题/审批分别路由及撤销/迟到响应拒绝；服务端绑定任务级工具权限；FR04、FR06、FR13；AC09、AC10、AC14 |
| TBOARD-06 / G1 | P1-10/11、P2-03；deliverables、Artifact/验证、storage | TBOARD-03/05 | Delivery 必填证据、需求版本与代码指纹、只读 Diff、过期拒绝；人工接受/退回/豁免与历史 Review；Agent 无完成权限；FR10–FR12、FR14；AC05、AC06、AC07、AC08 |
| TBOARD-07 / G1 | P1-12、VN4-02；现有 Web Client/Host | TBOARD-02..06 | 项目导航、看板/列表、搜索/筛选/拖拽、详情中的需求/执行/变更/验收、待我处理与设置；FR01–FR14；AC01–AC10 的 UI E2E、异常态回放和演示 |
| TBOARD-08 / G2 | P1-02/08/13、P2-04；Session/storage、subprocess | TBOARD-03..06 | 重启对账、输入未知状态不重发、旧 runtime 确认退出后恢复；版本化导出/备份、冲突拒绝和兼容升级；NFR03–NFR09；AC11、AC13、AC14、AC16、AC17、AC18、AC20 |
| TBOARD-09 / G2 | P1-13；发布配置、测试与文档 | TBOARD-07/08 | 全部 AC01–AC20、NFR01–NFR09、真实工程闭环、版本矩阵与恢复指南；不得以 Mock 代替 G0 或真实发布验收 |
| TBOARD-10 / G3 | P2-07；Client Slots、任务服务、调度 | TBOARD-09 及扩展范围确认 | 有限并行、父子任务/阻塞依赖、受控自动领取；新增并发/权限回归，入口不争抢同一 Session |
| TBOARD-11 / G4 | P3-01..06；identity、authorization、远程协调 | TBOARD-09 及团队/远程范围确认 | 团队账号/角色、协作编辑、PR/CI 与远程节点分别拆项；权限与跨设备恢复独立验收 |

依赖顺序为 TBOARD-00 → 01 → 02 → 04 → 03 → 05 → 06；07 在 02–06 就绪后验收，08 在 03–06 就绪后加固，09 汇总 07/08 的发布证据。01 的停止隔离验证使用受控双实例，不代表 MVP 已允许两个业务任务并行。TBOARD-08 只承接工作台必需的本地恢复，P2-04 的更广恢复范围仍按原计划推进。

### 16.4 验证、证据与完成条件

单元/集成测试覆盖业务状态、版本冲突、幂等、Delivery 过期、人工权限、事务与恢复；SDK/进程测试覆盖真实请求身份、取消/退出、工作目录及启动后写库失败。UI E2E 验证用户可见的待处理、停止中、断连、失败、过期交付和验收拒绝；产品文案使用 locale 字典，非平凡模型/用户输出补 keyless 记录回放，事件或 loop 改动同步 TypeScript/Python SDK expected outputs。具体测试由实现所属包拥有，不新建脱离真实 profile 的演示替代验收。

每个 AC 保存对应版本、脱敏配置、Task/Run/Session/runtime 身份、工作目录、关键事件、进程退出证据、最终持久化记录及实际命令；审批测试同时检查真实副作用，验收测试同时检查 Delivery/HumanReview 指纹。Mock、静态源码审阅和真实路径分开记录；NOT_RUN、失败和不支持均不得写为 PASS。

发布须满足专题 PRD 第 14 节门槛：非预期重复执行、验收丢失、审批扩大及误停其他任务均为 0，done 的人工 Review 完整率为 100%。NFR02 在 8 核/16 GB/SSD、本地连接、2000 任务的参考环境测量首屏 P95 ≤ 2 秒、状态到达服务后 1 秒内反映到 UI；这些是验收目标，不是当前测量值。每项 TBOARD 完成后更新第 12.10 节及对应 Task Checkpoint，G2 之前不宣称 Taskboard MVP 已发布。
