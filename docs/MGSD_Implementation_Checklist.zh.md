---
description: "对照 Generic Agent Harness v4 记录实施状态、四模式可行性验证及 DSH 原生工作流交接。"
---

# MGSD 实施 checklist 与 Codely 交接

[English](MGSD_Implementation_Checklist.md) | 中文

## 概述

本清单依据 [Generic Agent Harness v4 执行计划](Generic_Agent_Harness_Architecture_Execute_Plan_v4.md)（2026-10-10）安排实施与交接。DSH 是唯一 harness 底座；Codex/Codely 各保留 `subscription` 与 `external-agent` 两条独立接入路径。先完成 Phase 0S，再按 Phase 0–8 验收推进；本地工作先于远程派发。旧 MGSD 计划仅作为已有 L1–L5/R0–R4 标识的历史对照。

清单更新日期：2026-10-10，Asia/Shanghai。现有实现证据仍来自此前本地验收，本次文档更新不构成重新执行验收。已勾选表示具有实现及记录；**部分完成**仅表示所述子集；**未验证**表示本清单没有证据。相关代码或环境变化后须重验。L1/L2 已验收、L3 worktree 部分完成，不代表 v4 对应阶段完成。

## 目录

- [接手当前仓库](#take-over)
- [已完成的本地工作](#completed-local-work)
- [v4 阶段与已有里程碑对照](#phase-mapping)
- [接下来的本地 checklist](#next-local-checklist)
- [远程阶段 checklist](#remote-checklist)
- [验证与阻塞项](#verification)
- [Codely 接手提示词](#handoff-prompt)
- [维护本清单](#maintenance)

<a id="take-over"></a>
## 接手当前仓库

从当前检出接手。编辑前检查实际路径、分支与 Git 状态；Windows 机器上的历史路径和分支不作为当前机器配置。切换机器前转移所需工作差异。

按以下顺序阅读：

1. [根目录指令](../AGENTS.md)及 [Codely 上下文](../CODELY.md)。
2. 本清单，以及 v4 计划第 0–2 节、Phase 0S、Phase 0–8、第 10–11 节发布检查和第 14 节原型迁移指导。
3. [L1 实现总结](MGSD_L1_Local_DSH_Implementation_Summary.zh.md)，了解职责、执行流程、验收及限制；[本地 Codely 使用说明](user/guide/codely-local.zh.md)，了解配置、行为及已记录结果。
4. [L2 实现总结](MGSD_L2_Local_DSH_Implementation_Summary.zh.md)，了解持久化流程、审批、恢复、验收及 L3 交接。
5. [执行器实验报告](MGSD_Codely_Executor_Validation_Report.zh.md)，了解实际观察到的退出码、提示词传输、自动保存及沙箱限制。
6. 开始实现前阅读[架构](architecture.zh.md)、[测试策略](testing.zh.md)和[防御模式](defensive-patterns.zh.md)。

保留现有 `.codely-cli/settings.json` 改动，以及当前执行器、测试、使用说明和 checklist 的编辑。只检查与任务有关的文件，不要整体加入本地设置或编辑器数据。不要 reset、clean、自动提交或自动推送当前仓库。

| 现有文件 | 接手执行器应检查的内容 |
|---|---|
| [覆盖层](../apps/cli/config/examples/codely-local/cordis.patch.yml) | 按需加载。Codely 生产方逐任务请求静默完成通知；其他任务保留原通知配置。 |
| [命令插件](../apps/cli/config/examples/codely-local/plugin.mjs) | 直接执行的人类命令、会话归属、目录准入、截止时间及 effect 管理的清理。 |
| [执行 runner](../apps/cli/config/examples/codely-local/run.mjs) | Codely argv、独立 stdout/stderr、独立检查、有界收集及进程清理。 |
| [测试入口](../apps/cli/tests/codely-local.spec.ts) | 三个 Vitest 用例，包含 13 个嵌套确定性 Node 测试和两个真实 Loader/进程场景。 |
| [Loader 驱动](../apps/cli/tests/fixtures/codely-local/driver.ts) | 真实覆盖层执行、文件断言、验收失败、取消、跨会话拒绝、卸载及模型调用次数。 |
| [真实冒烟测试](../apps/cli/tests/fixtures/codely-local/live.ts) | 已登录的真实 Codely 在临时目录运行，并接受外部内容检查。 |
| [Web 验收](../apps/web/tests/codely-local.snapshot.ts) | 构建后的 Web profile、页内选择器、执行器/验收结果、模型调用探针、浏览器回放及工作区预期值。 |
| [MGSD Core](../packages/experimental/mgsd-workflow/README.zh.md) | 持久化本地请求、合法转换、精确审批、预算与重启恢复。 |
| [MGSD 适配器与指南](user/guide/mgsd-local.zh.md) | 人工命令、Core 到 runner 接线、验收命令与 L3/L4 剩余限制。 |

<a id="completed-local-work"></a>
## 已完成的本地工作

这些勾选项描述本地原型，不表示原计划整个 Phase 已完成。详细证据由上方链接的本地使用说明和执行器报告负责记录。

- [x] Windows 验收记录中的 Node 为 `v26.10.0`，Git 为 `2.42.0.windows.2`；当前主机版本须另行检查。
- [x] 已在 Windows 验证非交互式 Codely 文件修改及 JSON/流式输出。
- [x] 已通过现有 DSH 命令和后台任务实现 `/codely run <task>`、`status`、`output <id>`、`cancel <id>`。
- [x] 中文多行提示词作为单个 argv 值传入，不经过 Windows shell 包装脚本。
- [x] DSH 独立运行配置的验收命令；执行器退出 0、验收退出 23 时得到失败结果。
- [x] 输出保留有界，丢失早期输出时明确提示。
- [x] 同目录并发准入、其他会话输出访问拒绝、手动取消及插件卸载清理具有 Loader/进程测试覆盖。
- [x] 真实 Codely 冒烟测试生成预期文件、通过独立检查，并记录 DSH 模型调用次数为 0。
- [x] Web 覆盖层加载按需插件；每个 Codely 任务逐项请求静默完成，不改变其他任务的通知配置。
- [x] 中英文本地使用说明及网站映射已存在；此前 lint/Host 构建和网站检查通过。
- [x] 截止时间、最终清理期间取消、清理失败及 Windows 父子进程终止具有 2026-10-06 的专项自动化证据。
- [ ] **部分完成：**stdout 为原始流式 JSON；L2 已持久化任务事实，结构化流解析及完整流恢复仍未实现。
- [ ] **部分完成：**根目录 `CODELY.md` 已有仓库上下文；尚未实现 MGSD 任务/envelope 协议及其 Codely skill（技能）。
- [x] 真实 Web 验收展示 run/status/output/cancel、独立退出码 23 验收失败、刷新后保留的命令记录及零 DSH 模型调用。
- [x] 无密钥的当前格式 Session fixture 通过构建后的正式 Web profile 回放，并匹配 UI 和完整工作区预期值。

<a id="phase-mapping"></a>
## v4 阶段与已有里程碑对照

v4 Phase 编号与旧 Phase 0–21 不对应。下表保留已有 L/R 标识以追踪证据，新增事项使用 v4 Phase/M 标识。现有 DSH 能力是复用基础；MGSD 原型验收不替代 v4 的适配器与跨项目验收。

| v4 阶段 / 发布里程碑 | 已有证据 / 标识 | 尚缺的 v4 验收 |
|---|---|---|
| 0S / M0S — 四模式可行性 | L1 Codely CLI 与 Web 历史证据；部分完成 | 四条路由独立探测/Mock、订阅授权与安全审查、local 路由、兼容矩阵及 Go/No-Go。 |
| 0 / M0 — 独立框架仓库 | 当前 DSH 仓库原型；未验证 | 独立框架仓库、固定工具链、可构建产物及领域无关配置；不在本次文档更新中迁移代码。 |
| 1 / M1 — Task 与持久化 | L2 已有不可变请求、SQLite、FSM、批准、预算与中断记录；部分完成 | Task/Attempt/Session Link/Checkpoint 分离、Version/CAS 原子更新、Operation 幂等记录、迁移与 CLI 骨架。 |
| 2 / M2 — Memory、Context、Skills | L3 上下文待完成 | 分层记忆、Proposal 审核/冲突/合并、本地检索、注入审计、敏感范围隔离及渐进加载。 |
| 3 / M3 — 双路由与 Workflow | L1/L2 Codely 执行和确定性流程；部分完成 | Native LLM 与 External subagent 独立注册、四适配器、能力探测、Fake E2E、可配置角色及跨平台测试。 |
| 4 / M4 — Workspace 与 Permit | L3 worktree、固定提交、主 checkout 保护与进程锁；部分完成 | 技术级 ExecutionPermit、范围/过期批准检查、自动保存审计、授权清理及完整本地 E2E。 |
| 5 / M4 — Session 与恢复 | L2 中断恢复及 L1 Session 回放；部分完成 | 原生 Session Tree/Fork/压缩观察、Checkpoint、操作幂等、Resume/Handoff 与故障注入。 |
| 6 / M5 — 多设备协调 | 旧 R0–R4；延后 / 未验证 | 私有 Control Repo、Runner、Durable Inbox、Reconciler、离线再派发、批准/取消及防双写。 |
| 7 / M6 — DSH UI 与发布 | 旧 L5 的源码覆盖层/命令输出；部分完成 | 双选择器、真实 readiness、Task/Session/Attempt 绑定、四路由独立 E2E、安装与回滚。 |
| 8 — 高级能力 | 旧高级索引/调度；延后 | MVP 后逐项验证能力路由、延迟工具加载、混合检索、DAG、多协调器及协议兼容。 |

`subscription` 未通过供应商授权及真实 E2E 时保持 `blocked/experimental`，不能因接口或 Mock 通过而标为 `ready`。生产 MVP 可使用合法的 local/external-agent 路径；若要求两条订阅路径生产可用，供应商正式支持是独立 Go/No-Go 条件。

<a id="next-local-checklist"></a>
## 接下来的本地 checklist

下一步为 v4 Phase 0S；先形成四模式可行性报告，再推进依赖阶段。下方 L1–L3 保留已有验收与缺口，后续实施以 M0S–M6 为准。[L2 操作与验证](user/guide/mgsd-local.zh.md)负责详细实现证据。

### L1 — 完成当前 DSH 原型验收

- [x] 已复现聚焦测试：三个 Vitest 用例通过，包含 13 个 Node 测试；五个结果报告断言先失败，修复后通过。
- [x] 已补充截止时间到达、最终清理期间截止时间/取消、清理失败回归；超时与观察到的退出事实分别报告。
- [x] 已使用实际 Windows 提供方确认取消和卸载后父子进程均终止；此结果不构成文件系统隔离证明。
- [x] 使用 Codely 及页内选择器覆盖层启动真实 Web profile；在 Edge 选择隔离项目并执行 run/status/output/cancel。
- [x] 界面显示了执行成功及退出码 23 的独立验收失败；模型探针及空调用记录确认没有 DSH 模型请求。逐任务静默通知阻止 preset 唤醒模型。
- [x] 按仓库规范添加并回放当前格式无密钥 Session 场景，校验 UI 与完整工作区结果，并将 owner 注册到快照清单。
- [x] 中英文使用说明记录了可复现的浏览器、真实 Codely、回放和生命周期命令及结果。当前没有创建 PR，因此无需 GIF。

L1 验收：CLI/Loader 与浏览器路径展示一致结果，检查失败不能报告成功，取消/卸载/截止时间处理在托管清理后结束，录制输出无需 API key 即可回放。所有条件于 2026-10-07 通过；命令及结果见使用说明的开发备注和验证记录。

### L2 — 本地任务数据及确定性工作流（已有证据；v4 Phase 1/3）

- [x] 实现节点本地配置、不可变任务请求、运行状态、品牌化任务标识及持久 TaskStore。
- [x] MGSD 工作流 Core 不导入 DSH/Cordis；当前 DSH 子进程包装器仍归适配器，而非独立 Core。
- [x] 实现显式合法转换及中断/重启恢复；拒绝 `queued → executing` 和未经批准的执行。
- [x] 明确处理原计划 `NEEDS_REPLAN` 文字与 FSM 状态清单的差异；扩大范围必须使执行批准失效。
- [x] 落实风险/预算决策及最多两次 review/fix；第二次评审失败进入 `needs_human`。
- [x] 持久记录任务/执行/验收/取消事实，区分 Task ID 和进程内 job id。

L2 验收于 2026-10-07 通过：序列化与重启、非法转换、审批注入拒绝、43 个 Core 用例的逐文件 100% 覆盖率、真实 Loader 验收和无密钥 Web 回放。具体命令及结果见 [L2 使用说明](user/guide/mgsd-local.zh.md#verification)。`source: expert` 当前是可信人工声明；自动专家与强制文件范围属于 L4。

### L3 — Worktree 和上下文（已有证据；v4 Phase 2/4）

- [x] 解析获准的本地 repo 别名、固定 base ref，为每个任务创建分支/worktree；冲突时失败，禁止回退到主 checkout。
- [x] 隔离执行期间保持 dirty 主目录文件及索引不变；逐任务 worktree 获取排他的跨进程归属。这不是操作系统级隔离。
- [ ] 在 diff/允许文件检查前处理 `.codely-cli/auto-saves`，并在本地保留适当审计证据。
- [ ] 使用本地 Git/搜索/日志工具生成上下文，明确文件/日志/字节预算；延后 embedding 及高级索引。
- [ ] **部分完成：**保留任务 worktree 与工作区记录，不提供删除命令或自动清理；结果保留检查及显式清理授权仍待完成。

L3 worktree 验收已覆盖独立临时任务工作树、dirty 主目录文件/索引字节不变、准备失败不启动执行器及独立进程锁拒绝。有界上下文、自动保存审计及授权清理完成前，整个 L3 仍未完成；证据见[本地指南](user/guide/mgsd-local.zh.md#dev-note)。

### M0S — 四模式可行性（v4 Phase 0S；下一步）

- [ ] 固定 DSH/Node/插件/CLI 版本，记录供应商、登录状态、许可证、兼容性与凭证管理；不读取或打印私有 token。
- [ ] 分别登记 `subscription.codex`、`subscription.codely`、`external.codex`、`external.codely` 的能力、Loop Owner、费用来源及 `ready/experimental/blocked/unavailable` 状态，提供四套独立 Mock。
- [ ] 审查 v4 引用的 pi2dsh、dsh-codex-subscription、dsh-codely；订阅路径须先确认供应商授权，未经确认保持 blocked 且不发真实请求。
- [ ] 在隔离 profile 验证无额外付费 API Key 的 DSH Web/local 路径与至少一条真实 External 委派；默认 `allowPaidApi: false`，认证/限额失败不得静默付费回退。
- [ ] 交付脱敏 `dual-mode-feasibility` 报告、兼容矩阵、四路由测试清单及 Go/No-Go。两条 Native subscription 是否可合法用作真正 DSH LLM Provider 必须分别作答。

M0S 验收：四路由有独立证据，blocked 不展示为 ready；Mock 成功与真实授权/E2E 分开记录。完成本阶段后停下交付报告，再按 v4 第 12 节阶段提示词推进。

### M0–M1 — 框架与 Task 持久化（v4 Phase 0–1；承接 L2）

- [ ] 明确独立框架仓库及迁移范围，固定 pnpm/TypeScript/DSH 工具链，排除数据库/缓存/日志/凭证；保留现有原型与用户改动，不自动移走代码。
- [ ] 纯领域数据结构可独立测试；正式产品由 DSH profile 启动，复用 Web/Agent/Tool/Session，不另建通用主循环或会话存储。
- [ ] 分离 Task、Attempt、DSH Session Link、外部原生 Session、Checkpoint 和 Memory 标识；SQLite 仅存扩展业务事实/索引，不复制 DSH 会话事件。
- [ ] 补齐 schema 版本、迁移、Version/CAS 与事件/状态原子提交、Operation 幂等标识；验证并发、非法转换及重启。
- [ ] 按实际 profile/服务实现 doctor/init/new/status/events 操作与测试；计划中的命令名是拟议接口，不能作为已存在入口。

M0–M1 验收：独立框架可构建、领域无项目硬编码，DSH 是唯一运行底座；旧 Task 数据有明确迁移/拒绝策略，DSH Session 原始记录保留。

### M2 — Context、Memory 与 Skills（v4 Phase 2；承接 L3 上下文）

- [ ] 实现用户/Workspace/Task/Session 分层记忆与 Proposal → 验证 → 人工批准 → 合并；处理拒绝、冲突、来源和敏感级别。
- [ ] 使用 FTS/rg/git 本地检索，保存来源引用/hash/版本，按角色、风险及文件/日志/字节预算去重裁剪；不要求联网 embedding。
- [ ] 分别适配 Native 上下文注入与 External ContextPacket，审计 Stored/Retrieved/Injected；未审核记忆不升格，其他 Workspace 敏感数据不可见。
- [ ] 扫描 skill（技能）元数据并渐进加载；初始化仅写显式目标，保留已有 `AGENTS.md`、`CODELY.md` 和知识文件。

M2 验收：无模型调用也能生成可复现上下文；无关存储内容不注入，敏感数据隔离与懒加载具有测试证据。

### M3 — 双模式适配与工作流（v4 Phase 3；承接 L4）

- [ ] ModelProviderRegistry 委托 DSH LLM seam（LLM 为大语言模型），AgentRuntimeRegistry 委托 DSH subagent seam；拒绝同一 Attempt 双主循环。
- [ ] Codex/Codely Native 各实现 streaming/tool-call/tool-result/error/cancel Mock；真实订阅请求仅在授权后验证，禁止把完整 CLI agent loop（智能体循环）包装为单步 completion。
- [ ] External Codex 优先现有 DSH Codex provider；Codely 探测 ACP（Agent Client Protocol），不足时明确降级为受控 stream-json CLI；保留取消/超时/结果和外部 ID，不补造不可见事件。
- [ ] 验证 Windows/macOS/Linux ProcessRunner 的 argv、cwd、UTF-8、独立输出、截止时间、进程树清理及脱敏；现有 Windows 证据不替代跨平台验收。
- [ ] 使用 FakeAgent 打通 direct、plan-execute-review、research；角色可配置，默认外部 Codex 规划/评审和 Codely 执行，可替换而无需改 Core。
- [ ] 人工批准绑定 Plan/Scope/BaseCommit 快照且不进入 Executor 工具集；保留预算与两轮 review/fix 上限，扩大范围使批准失效。

M3 验收：Fake E2E 和四适配器独立测试通过；Native 的工具由 DSH 执行，External 自己控制循环，Agent 不能自我授权。

### M4 — Permit、本地 E2E 与恢复（v4 Phase 4–5；承接 L3–L5）

- [ ] 完成 L3 未勾选的自动保存审计、结果保留及显式授权清理；签发技术级 ExecutionPermit 并校验 Plan SHA、允许路径/操作、BaseCommit、有效期及工作区归属。
- [ ] 验证越权/符号链接/过期 Permit/基准改变/重复写拒绝；worktree 和提示词均不能替代操作系统隔离，越权结果停在 needs_human。
- [ ] 在两个无关 fixture（测试前置数据）Git 仓库完成 create/context/plan/approval/worktree/execute/独立检查/review/report，保留失败 worktree 和主 checkout 用户更改。
- [ ] 复用 DSH Session 的观察、Tree/Fork 和上下文压缩（context compaction），提供脱敏投影；压缩不删改原始事件，不新建重复 Session Store。
- [ ] 在准备、计划、批准、副作用前、测试后、执行、评审和中断处保存 Checkpoint；恢复前核对 Git/批准/Operation，先确认旧进程已停止。
- [ ] 原生 Session 不可恢复或跨模式切换时创建新 Attempt，显式使用投影/Checkpoint；不承诺跨产品无损续接。
- [ ] 注入规划/编辑/测试/Checkpoint 写入中断、取消、旧检查点及变更计划；验证幂等与可解释恢复。

M4 验收：完整本地工作流、强制批准/Permit、无重复副作用及恢复证据通过，Task 与 DSH Session 事实均保留；之后才开展远程阶段。

<a id="remote-checklist"></a>
## 远程阶段 checklist

M4 本地验收后进入 v4 Phase 6，再完成 Phase 7 发布验收。旧 R0–R4 对应下方 M5；旧 L5 的 UI/打包事项对应 M6。DSH 从开始就是必需底座，Phase 7 是完善集成与发布，不是此时才接入 DSH。

### M5 — 多设备（v4 Phase 6；承接 R0–R4）

- [ ] 确认项目数据策略、私有 Control Repo 和可信写入者；采用低权限独立 Runner 用户，验证目录外哨兵与上传策略。
- [ ] 两台 Runner 标签/身份及打印派发通过；远程输入仅含 allowlist 的 repoAlias/target/workflow 和任务引用，不含任意 shell、路径或机密正文。
- [ ] 实现 Durable Inbox、Task 与 Actions Attempt 分离、稳定 deliveryId 和 Reconciler；模拟超过 24h 排队寿命后重新派发且 Task 不丢。
- [ ] 实现 send/status/approve/cancel/resume；批准绑定 Plan Hash 并启动新 execute 阶段，不占用 Runner 等待人工批准。
- [ ] 运行中/排队取消、断网、重复派发、stale worker/lease 与安全手动迁移测试通过；先确认旧写权限撤销，不把 Actions concurrency 当强一致租约。
- [ ] Standard/Restricted 数据投影验收；凭证、完整 Session、源码与敏感日志不上传协调仓库。

### M6 — DSH UI 与发布（v4 Phase 7；承接 L5）

- [ ] 通过 DSH 插件服务提供 Task/Workflow/Memory/权限审计，复用原生 Agent/Session/Tool 与唯一 FSM，验证可安装组合包/profile 产物。
- [ ] Model Selector 与 Agent/Role Selector 分离；展示四路由真实 readiness、Mode、Loop Owner、认证状态、能力、配额来源、数据去向及 Task/Session/Attempt 关联。
- [ ] 每条 ready 路由独立验证文本/工具往返/重连/拒绝/取消及 401/429；订阅已授权路径按计划各做五类实测，未授权路径不能发请求。
- [ ] 验证 Session 回放、切换审计和 ContextPacket、限额/认证失败 Checkpoint/Pause、无付费回退以及插件停用后数据保留。
- [ ] 对两个无关工程完成约定/集成/安全/恢复验收，记录兼容矩阵、安装、故障处理、升级与回滚；alpha 发布为可选的后续操作。

### Phase 8 — MVP 后高级能力

- [ ] 按需求及度量逐项增加能力路由、延迟 Tool/MCP 加载、混合检索、DAG、多 Coordinator、细粒度审批、可观测性及跨节点版本兼容；每个适配器/工作流先通过对应测试。

远程账号、仓库、Runner、上传策略及订阅授权仍未验证；示例名称与路径不作为真实配置。当前请求仅更新清单，不配置远程资源、不启用供应商路由。

<a id="verification"></a>
## 验证与阻塞项

以下现有入口运行无密钥执行器及 Loader/进程测试。2026-10-04 的记录结果为两个 Vitest 用例通过，包含六个嵌套 Node 测试。2026-10-06 最近一次聚焦生命周期回归通过三个文件、147 个测试，包含 13 个嵌套 Node 测试。2026-10-07 重新验证了 Web 验收和无密钥回放；具体命令及结果见本地使用说明的开发备注。

```powershell
node node_modules/vitest/vitest.mjs run apps/cli/tests/codely-local.spec.ts
```

单独调用真实冒烟测试时，先按本地使用说明配置 `DSH_CODELY_COMMAND`，再使用以下现有入口。它需要本地 Codely 登录状态并调用其模型。真实测试 fixture（测试前置数据）将自身验收 argv 替换为可信文件内容检查，并在清理后删除临时工程。

```powershell
node --import tsx/esm apps/cli/tests/fixtures/codely-local/live.ts
```

交接时的已知事实：

- Windows 的 Node/Git、Codely 登录及安装入口证据属于当时机器；新主机须检查实际版本与 CLI 能力，不能复制用户专属路径。
- 现有 Core 已有 TaskStore/FSM，适配器已有 worktree；仍缺强制文件范围、结构化流恢复、v4 Attempt/Checkpoint/Memory 与双注册表完整验收。
- 旧 Windows 环境的 postinstall/submodule 和文档检查问题由既有指南记录；不要据此断言当前主机被阻塞，也不要未经确认修改全局 Git 配置。
- M0S 的供应商授权、社区插件审查、四模式矩阵及无付费回退验收尚无证据；已有 Codely external CLI 成功不证明 subscription 可用。
- v4 的拟议目录、接口及命令须对照本仓库实际服务和 `dsh` profile 启动规则；本次未执行代码迁移、真实模型调用或本地功能重验。

<a id="handoff-prompt"></a>
## Codely 接手提示词

将当前工作目录设为本仓库后，把以下提示词粘贴给 Codely。两个语言版本保留相同提示词。

```text
Continue from the current deepseek-harness checkout.
Read AGENTS.md, CODELY.md, and docs/MGSD_Implementation_Checklist.zh.md.
Use docs/Generic_Agent_Harness_Architecture_Execute_Plan_v4.md as the
architecture baseline; use the checklist for implementation evidence.

Start with Phase 0S / Prompt S and deliver its feasibility report, then stop.
Do not jump directly into the remaining L3 work or migrate repositories.
Inspect git status and preserve user files and existing prototype changes.
L1/L2 passed historical acceptance; L3 worktrees are partially implemented.
Those results do not establish v4 milestone acceptance on this host.

DSH is the only harness foundation: reuse its Web UI, Agent Loop, tools,
Session events, subagents, and plugin lifecycle. Keep pure domain tests
independent, but launch supported applications only through dsh profiles.
Native subscription uses the DSH loop; external-agent uses the product loop.
One Attempt has one primary loop owner. Existing /codely direct execution
keeps zero DSH model calls; this is not a rule for Native subscription.

Assess four routes independently: Codex/Codely subscription/external-agent.
Do not activate subscription routes without supplier authorization and real
Native streaming/tool-loop acceptance. Never extract private auth caches.
Default allowPaidApi=false; no silent paid API fallback. Report blocked
routes honestly; local/external-agent workflows can remain usable.

Keep DSH Session logs authoritative. SQLite holds Task/Attempt/indices and
Checkpoint metadata, not a duplicate Session store. Approval binds the
Plan/Scope/BaseCommit snapshot; writes require enforced permits/worktrees.
Independent checks determine acceptance. Preserve failed worktrees.

Do not configure GitHub runners, dispatch tasks, upload project data,
reset, clean, auto-commit, or auto-push. For each accepted milestone update
both checklist languages and their pairing record with actual evidence,
checks run, limitations, and rollback. Leave unverified items unchecked.
```

<a id="maintenance"></a>
## 维护本清单

每完成一段实现，使用 v4 Phase/M 标识并保留已有 L/R 的证据映射，仅勾选有实际验收证据的事项，并同步两个语言版本及配对记录。详细运行证据存入本地使用说明或任务报告，不要将原始提示词/日志复制进本清单。记录下一个里程碑及任何依赖被阻塞的原因。切换机器时，继续前先确认所有引用的未跟踪实现文件都已转移。

### 开发备注

这是 v4 实施交接快照。已有 MGSD 原型是可复用证据，尚未交付通用双模式 MVP。计划中的独立仓库迁移、供应商授权和真实远程验收仍是待落实事项。
