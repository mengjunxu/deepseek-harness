---
description: "对照架构计划记录 MGSD 实施状态与 Codely 交接清单，优先完成本地 DSH，随后实施远程派发。"
---

# MGSD 实施 checklist 与 Codely 交接

[English](MGSD_Implementation_Checklist.md) | 中文

## 概述

本清单让 Codely 从当前仓库状态继续实施 MGSD。原始计划为 `docs/MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan.md`，重点对照其中编号明确的 Phase 0–21。用户当前选择的顺序是先完成本机 DSH 改造，再做远程任务派发。本地 Codely 执行原型已跑通；完整本地任务流程和分布式 MVP 尚未完成。

状态日期：2026-10-04，Asia/Shanghai。已勾选表示具有实现及已记录的验证。标为**部分完成**的未勾选项仅完成所述子集。标为**未验证**的未勾选项表示当前仓库没有证据，不表示其他机器一定没做。相关代码或环境变化后必须重新验证历史结果。

## 目录

- [接手当前仓库](#take-over)
- [已完成的本地工作](#completed-local-work)
- [原计划阶段对照](#phase-mapping)
- [接下来的本地 checklist](#next-local-checklist)
- [远程阶段 checklist](#remote-checklist)
- [验证与阻塞项](#verification)
- [Codely 接手提示词](#handoff-prompt)
- [维护本清单](#maintenance)

<a id="take-over"></a>
## 接手当前仓库

在本机从 `F:\Agents\deepseek-harness` 开始。检查时分支为 `codely_bridge`；编辑前重新确认分支和状态。原型尚未提交或推送。重新 clone 的仓库不会包含这些未跟踪文件。

按以下顺序阅读：

1. [根目录指令](../AGENTS.md)及 [Codely 上下文](../CODELY.md)。
2. 本清单，以及原始计划的组件职责、Phase 5–12、Phase 17–18 和 MVP 验收条件。
3. [本地 Codely 使用说明](user/guide/codely-local.zh.md)，了解配置、行为及已记录结果。
4. [执行器实验报告](MGSD_Codely_Executor_Validation_Report.zh.md)，了解实际观察到的退出码、提示词传输、自动保存及沙箱限制。
5. 开始实现前阅读[架构](architecture.zh.md)、[测试策略](testing.zh.md)和[防御模式](defensive-patterns.zh.md)。

保留现有改动：`website/docs.ts`、`apps/cli/config/examples/codely-local/`、`apps/cli/tests/codely-local.spec.ts`、`apps/cli/tests/fixtures/codely-local/` 及本地使用说明三件套。`.codely-cli/` 和 `docs/.obsidian/` 是另外两处原先就存在的未跟踪目录；只检查与任务有关的文件，不要整体加入 Git。不要 reset、clean、自动提交或自动推送当前仓库。

| 现有文件 | 接手执行器应检查的内容 |
|---|---|
| [覆盖层](../apps/cli/config/examples/codely-local/cordis.patch.yml) | 按需加载及 `completionDelivery: quiet`；它也会改变本组合其他任务的完成通知方式。 |
| [命令插件](../apps/cli/config/examples/codely-local/plugin.mjs) | 直接执行的人类命令、会话归属、目录准入、截止时间及 effect 管理的清理。 |
| [执行 runner](../apps/cli/config/examples/codely-local/run.mjs) | Codely argv、独立 stdout/stderr、独立检查、有界收集及进程清理。 |
| [测试入口](../apps/cli/tests/codely-local.spec.ts) | 两个 Vitest 用例，包含六个嵌套确定性 Node 测试和真实 Loader/进程场景。 |
| [Loader 驱动](../apps/cli/tests/fixtures/codely-local/driver.ts) | 真实覆盖层执行、文件断言、验收失败、取消、跨会话拒绝、卸载及模型调用次数。 |
| [真实冒烟测试](../apps/cli/tests/fixtures/codely-local/live.ts) | 已登录的真实 Codely 在临时目录运行，并接受外部内容检查。 |

<a id="completed-local-work"></a>
## 已完成的本地工作

这些勾选项描述本地原型，不表示原计划整个 Phase 已完成。详细证据由上方链接的本地使用说明和执行器报告负责记录。

- [x] 当前主机 Node 为 `v26.10.0`，满足本仓库声明的版本范围；Git 为 `2.42.0.windows.2`。
- [x] 已在 Windows 验证非交互式 Codely 文件修改及 JSON/流式输出。
- [x] 已通过现有 DSH 命令和后台任务实现 `/codely run <task>`、`status`、`output <id>`、`cancel <id>`。
- [x] 中文多行提示词作为单个 argv 值传入，不经过 Windows shell 包装脚本。
- [x] DSH 独立运行配置的验收命令；执行器退出 0、验收退出 23 时得到失败结果。
- [x] 输出保留有界，丢失早期输出时明确提示。
- [x] 同目录并发准入、其他会话输出访问拒绝、手动取消及插件卸载清理具有 Loader/进程测试覆盖。
- [x] 真实 Codely 冒烟测试生成预期文件、通过独立检查，并记录 DSH 模型调用次数为 0。
- [x] Web profile 配置组合包含按需启用的插件及静默完成通知。
- [x] 中英文本地使用说明及网站映射已存在；此前 lint/Host 构建和网站检查通过。
- [ ] **部分完成：**已有截止时间处理；仍需专门验证真实超时、后代进程，以及最终清理期间超时的回归场景。
- [ ] **部分完成：**stdout 为原始流式 JSON；尚未实现结构化事件解析、持久审计及完整输出恢复。
- [ ] **部分完成：**根目录 `CODELY.md` 已有仓库上下文；尚未实现 MGSD 任务/envelope 协议及其 Codely skill（技能）。
- [ ] **待完成：**浏览器命令验收及仓库要求的录制会话场景。

<a id="phase-mapping"></a>
## 原计划阶段对照

保留原编号方便追踪。启用远程派发前先完成本地前置条件；用户调整后的顺序将原 Phase 1–3 延后。现有通用 DSH 能力是依赖，不能作为 MGSD 专属阶段已完成的证据。

| 原阶段 | 当前状态 | 仍需满足的验收条件 |
|---|---|---|
| 0 — 环境/账号 | 部分完成 | 已验证当前本机 Node/Git 及真实 Codely；两节点账号、工具版本及 runner 用户登录状态未验证。 |
| 1 — 私有 Control Repo | 延后 / 未验证 | 私有可见性、可信写入者及已提交控制文件。 |
| 2 — Self-hosted runners | 延后 / 未验证 | Home 与 Office 的 runner 服务身份、标签及在线状态。 |
| 3 — Dispatch 冒烟测试 | 延后 / 未验证 | Home 到 Office 的打印任务派发及实际运行结果。 |
| 4 — 节点本地配置 | 待完成 | 已验证的别名到路径映射、工作目录根及能力配置。 |
| 5 — Harness Core | 部分完成 | 已有进程执行器；仍缺 MGSD Task schema、TaskStore、工作流 Core、策略及 Core/DSH 分离。 |
| 6 — FSM | 待完成 | 显式转换校验器、持久化、非法转换测试及 review 循环上限。 |
| 7 — Worktree 服务 | 待完成 | 自动任务 worktree 创建、冲突/失败处理、保留及主 checkout 保护；手工实验 worktree 不满足此阶段。 |
| 8 — Context Builder | 待完成 | 本地文件/历史/日志选择、输出预算及可复现上下文包。 |
| 9 — Codex 适配器 | 待完成 | 只读规划/评审、风险预算、CLI（命令行界面）/版本检查及 mock 命令覆盖。 |
| 10 — Codely 协议 | 部分完成 | 已有仓库上下文；仍需落实任务状态、批准计划、允许文件及执行报告。 |
| 11 — Codely harness skill | 待完成 | 任务/上下文/envelope 发现及真实 Harness CLI 指令。 |
| 12 — 本地 E2E | 部分完成 | 执行器冒烟测试通过；完整任务准备、worktree、上下文、批准、执行、验收及风险评审尚未完成。 |
| 13 — GitHub 到 Harness | 延后 | Runner 侧受控入口、本地别名解析及真实端到端路由。 |
| 14 — `agent` CLI | 延后 | `nodes/send/status/approve/cancel`、任务身份及 GitHub 调用测试。 |
| 15 — 多节点批准 | 延后 | 两阶段 plan/execute 流程及本地批准校验。 |
| 16 — Cancel | 部分完成 | 本地任务取消已可用；持久任务取消、排队运行取消及 Unity 安全检查点仍缺失。 |
| 17 — DSH 集成 | 部分完成 | 源码覆盖层已可用；仍缺 Core 驱动的可安装组合包、独立工作流 Core 及 profile 验收。 |
| 18 — DSH 状态界面 | 部分完成 | 复用现有任务/命令输出；仍缺 Task/Plan/Review/Node 视图及浏览器验收。 |
| 19 — Codely subagents | 延后 | 本地工作流稳定后增加只读 scout 及受限 test runner。 |
| 20 — 高级索引 | 延后 | 基础上下文生成足够且完成度量后再增加文件/符号/Unity 索引。 |
| 21 — 能力调度 | 延后 | 先手工指定目标；MVP 后再做能力选择及子任务。 |

<a id="next-local-checklist"></a>
## 接下来的本地 checklist

每次完成一组事项。下一个可执行里程碑是 **L1**，不是注册 GitHub runner。L2–L5 是计划交付项，不是已经存在的命令或目录。

### L1 — 完成当前 DSH 原型验收

- [ ] 使用下方验证入口复现聚焦测试；保留失败输出，并在当前插件中修复回归。
- [ ] 补充截止时间到达、最终进程清理期间截止时间/取消、清理失败的确定性回归；分别报告超时及退出事实。
- [ ] 对实际 Windows 提供方验证托管子进程终止，包含子命令；不要用 `strict` 或 worktree 布局证明隔离。
- [ ] 使用 Codely 覆盖层及仓库要求的页内目录选择器覆盖层启动真实 Web profile；选择临时本地项目，在浏览器执行 run/status/output/cancel。
- [ ] 在界面观察成功执行及独立验收失败；确认两者都不会发起 DSH 模型请求。
- [ ] 为命令/任务输出补充仓库要求的无密钥录制会话场景；按 `snapshots/AGENTS.md` 选择归属，不要自创回放归一化。
- [ ] 将可运行步骤及结果记录到本地使用说明；若创建涉及界面变更的 PR（Pull Request），提供真实流程 GIF 证据。

L1 验收：CLI/Loader 与浏览器路径展示一致结果，检查失败不能报告成功，取消/卸载/截止时间处理在托管清理后结束，录制输出无需 API key 即可回放。

### L2 — 本地任务数据及确定性工作流（Phase 4–6；第 22 节）

- [ ] 实现节点本地配置、不可变任务请求、运行状态、品牌化任务标识及持久 TaskStore。
- [ ] MGSD 工作流 Core 不导入 DSH/Cordis；当前 DSH 子进程包装器仍归适配器，而非独立 Core。
- [ ] 实现显式合法转换及中断/重启恢复；拒绝 `queued → executing` 和未经批准的执行。
- [ ] 明确处理原计划 `NEEDS_REPLAN` 文字与 FSM 状态清单的差异；扩大范围必须使执行批准失效。
- [ ] 落实风险/预算决策及最多两次 review/fix；第二次评审失败进入 `needs_human`。
- [ ] 持久记录任务/执行/验收/取消事实，区分 Task ID 和进程内 job id。

L2 验收：序列化及重启测试通过，非法转换失败，模型输出不能直接赋值工作流状态或批准自身计划。

### L3 — Worktree 和上下文（Phase 7–8；第 23 节）

- [ ] 解析获准的本地 repo 别名、固定 base ref，为每个任务创建分支/worktree；冲突时失败，禁止回退到主 checkout。
- [ ] 保护 dirty 主 checkout 的文件及索引；多个宿主/进程可能写同一工程时增加跨进程工作目录归属控制。
- [ ] 在 diff/允许文件检查前处理 `.codely-cli/auto-saves`，并在本地保留适当审计证据。
- [ ] 使用本地 Git/搜索/日志工具生成上下文，明确文件/日志/字节预算；延后 embedding 及高级索引。
- [ ] 保留任务 worktree 供检查；删除前确认结果保留及明确的清理授权。

L3 验收：两个临时任务使用独立 worktree，主目录文件字节不变，准备失败时不启动执行器，大输入下仍满足上下文限制。

### L4 — 计划、执行 envelope 和 Codely 协议（Phase 9–11）

- [ ] 实现规划/评审接口及基于风险的只读 Codex 调用；命令生成测试使用 mock，简单任务不调用 Codex。
- [ ] 持久保存计划、允许/禁止文件、验收检查及绑定已批准计划版本的人工批准。
- [ ] 生成执行 envelope，在模型外落实允许文件/批准策略；更新计划后需要更新批准。
- [ ] 扩展项目协议，保留 DSH 现有 `AGENTS.md` 及根目录 Codely 仓库上下文。
- [ ] 任务/status/envelope/report 命令真实存在并已验证后，再增加 Codely harness-workflow skill。

L4 验收：规划/评审不修改业务代码，拒绝未批准执行，扩大范围不能自行授权，Codely 能发现准确任务输入并报告执行完成。

### L5 — 完成本地工程工作流（Phase 12、16–18）

- [ ] 让一个无害任务完整经过 create/prepare/context/policy/approval/worktree/execution/独立验收/report。
- [ ] 验证风险评审、一次评审失败/修复、两轮上限、取消及重启恢复。
- [ ] DSH 视图读取 Core 的权威任务状态；FSM 仅保留一份实现。
- [ ] Core 稳定后按当前组合包/profile API 打包本地适配器；验证安装后的产物及配置。
- [ ] 开始远程里程碑前记录本地验收矩阵及已知限制。

L5 验收：完整本地流程可复现，任务数据重启后仍存在，检查决定验收结果，批准机制有效，日常 checkout 保持不变。

<a id="remote-checklist"></a>
## 远程阶段 checklist

这些事项属于第二实施阶段，L5 验收后再开展。定义发布里程碑时保留原计划的分布式 MVP 验收清单。

- [ ] **R0 — 安全/数据前置条件（第 13–14 节）：**用目录外读写哨兵验证选定执行账号/隔离能力；定义 Standard/Restricted 上传策略；凭证及敏感源码/diff/日志留在节点本地。
- [ ] **R1 — 路由冒烟测试（Phase 1–4）：**私有 Control Repo、可信写入者、两端 runner 身份/标签、本地节点配置及受控 `workflow_dispatch` 打印测试。
- [ ] **R2 — 受控执行（Phase 13–14）：**工程意图 schema、runner 侧 Harness 入口、`agent` 命令、稳定任务/运行关联及 Home 到 Office 的 worktree 执行。
- [ ] **R3 — 批准/取消（Phase 15–16）：**独立 plan/execute/cancel 流程、本地批准校验、排队和运行中取消，并保留取消任务的 worktree。
- [ ] **R4 — 分布式 MVP（第 24.2 节）：**在两端独立验证远程 MVP 每项条件，包含高风险规划/评审、测试结果、评审上限及主 checkout 保护。只有本地 DSH 通过第 24.1 节后才能开始远程开发。
- [ ] **后续（Phase 19–21、第 31 节）：**专用 subagent、高级上下文/Unity 索引、能力调度、编辑器/ADB 集成及有度量依据的 Hub 迁移条件。

当前原型没有配置远程派发。私有仓库、runner 注册、账号权限及数据上传批准需要用户真实账号/项目选择；不能根据原计划中的示例名称或路径自行推断。

<a id="verification"></a>
## 验证与阻塞项

以下现有入口运行无密钥执行器及 Loader/进程测试。2026-10-04 已记录结果为两个 Vitest 用例通过，包含六个嵌套 Node 测试。本次 checklist 编写不重新调用模型推理。

```powershell
node node_modules/vitest/vitest.mjs run apps/cli/tests/codely-local.spec.ts
```

单独调用真实冒烟测试时，先按本地使用说明配置 `DSH_CODELY_COMMAND`，再使用以下现有入口。它需要本地 Codely 登录状态并调用其模型。真实测试 fixture（测试前置数据）将自身验收 argv 替换为可信文件内容检查，并在清理后删除临时工程。

```powershell
node --import tsx/esm apps/cli/tests/fixtures/codely-local/live.ts
```

交接时的已知事实：

- 当前 Codely 通过 `node.exe` 加安装的 JavaScript 入口启动，而非 `codely.cmd`；应实际定位入口，不要复制某用户专属绝对路径。
- 已验证 Node 升级；`v26.10.0` 是 Node.js 版本，不是 Codely 版本。早期执行器报告的 Node v22.18.0 及 Codely nightly 版本仅描述当时实验。
- 依赖文件已下载；根目录 postinstall 因现有子模块 Git `core.worktree` 配置失败。不要仅为了运行命令就在未确认归属时修改 Git 公共配置。
- 此前固定版本 pnpm 调用使用 `pnpm_config_verify_deps_before_run=false` 避免重复安装。这不能证明新 clone 的依赖就绪；新环境应按正常流程安装和设置。
- 此前 `lint` 及 Host 构建、`docs:check` 通过。此前 `test:docs` 为 18 通过 / 2 失败；`doc-sync` 为 39 通过 / 3 失败，剩余失败均指向原计划缺少双语文件、硬换行及无法编译的 TypeScript 示例。相关编辑后重新检查；不要宣称全仓完全通过。
- 2026-10-04 的计划修订在第 24.1 节定义本地 DSH 验收、第 24.2 节定义远程验收。checklist 配对、Markdown 链接、`lint` 和 `git diff --check` 通过。原计划的硬换行已修正，换行检查通过；完整文档检查仍报告它原有的双语配对缺失及无法编译的 TypeScript 示例。这些文档问题不代表本地或远程实现完成。
- 根目录 `CODELY.md` 是现有仓库上下文。当前本地任务插件没有完成 MGSD TaskStore/FSM、worktree 自动化、执行 envelope 强制校验、持久流审计、浏览器验收及会话回放。

<a id="handoff-prompt"></a>
## Codely 接手提示词

将当前工作目录设为本仓库后，把以下提示词粘贴给 Codely。两个语言版本保留相同提示词。

```text
Continue the MGSD work in the current deepseek-harness checkout.

Read AGENTS.md, CODELY.md, and docs/MGSD_Implementation_Checklist.zh.md first.
Use docs/MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan.md
for the final architecture, and this checklist for current status and order.

The user chose local DSH integration first and remote dispatch second.
Start with L1: finish acceptance of the existing local Codely prototype.
Inspect git status and preserve the uncommitted prototype and user files.
Read the existing plugin, runner, overlay, tests, and local user guide.
Reproduce the focused keyless test, then implement and verify the next
unchecked L1 items, including deadlines, managed cleanup, browser command
acceptance, and the repository-required recorded-session coverage.

Codely is the primary execution loop. DSH owns deterministic execution,
state, validation, and presentation. Keep DSH model-call count zero for
/codely execution and job completion. Normal chat is a separate DSH path.
Configured independent checks determine acceptance; exit 0 from Codely alone
does not. Do not treat worktrees or strict path policy as OS confinement.

Keep the workflow Core independent of DSH/Cordis when reaching L2.
Reuse the current adapter; do not duplicate task state machines.
Do not configure GitHub runners, remote dispatch, or upload project data
during L1. Do not reset, clean, auto-commit, or auto-push user changes.

For each completed item, update both checklist languages and their pairing
record with file evidence, exact checks run, observed result, and remaining
limitations. Leave partial or unverified items unchecked. Finish the current
local milestone before moving to the next dependent milestone.
```

<a id="maintenance"></a>
## 维护本清单

每完成一段实现，保留稳定的 L/R 及原 Phase 标识，仅勾选有实际验收证据的事项，并同步两个语言版本及配对记录。详细运行证据存入本地使用说明或任务报告，不要将原始提示词/日志复制进本清单。记录下一个里程碑及任何依赖被阻塞的原因。切换机器时，继续前先确认所有引用的未跟踪实现文件都已转移。

### 开发备注

这是实施交接快照，不是分布式架构已交付的声明。原计划包含拟议 API 及安装示例；实现前按当前仓库及已安装工具验证。当前本地原型的范围小于原计划完整 Harness Core 和 MVP。
