---
description: "MGSD L2 本地任务流程的实现、审批与恢复方案、验收证据及 L3 交接。"
---

# MGSD L2：本地任务流程实现总结

[English](MGSD_L2_Local_DSH_Implementation_Summary.md) | 中文

## 概述

L2 让用户创建可持久化的本地任务、批准精确的计划版本、运行 Codely 并接受独立检查，以及在重启后查看保留的结果。标准任务必须经过评审；第二次评审失败必须由人介入。人工命令控制流程，不请求 DSH 模型轮次。L2 不提供 worktree 隔离、自动专家调用或远程派发。

[Checklist](MGSD_Implementation_Checklist.zh.md)负责完成状态，[本地指南](user/guide/mgsd-local.zh.md)负责配置与可执行的验证命令。本参考文档总结实现职责与验收证据，供接手维护者使用。

## 目录

- [交付范围](#scope)
- [执行职责](#responsibilities)
- [实现方案](#implementation)
- [验收](#acceptance)
- [代码与文档入口](#files)
- [限制与 L3 交接](#handoff)
- [开发备注](#dev-note)

<a id="scope"></a>
## 交付范围

L1 负责受管理的执行器进程；L2 负责准入这些进程的本地任务生命周期，以及结果的持久化。

| 能力 | 可观察结果 |
|---|---|
| 持久化任务记录 | 不可变请求与只追加事实保存在私有 SQLite 数据库中，重启后仍可读取。 |
| 显式审批 | 执行必须获得针对当前计划版本及摘要的审批。 |
| 按风险评审 | 简单任务通过检查后完成；标准任务需要评审；高风险任务需要专家标记的规划和评审。 |
| 有界修复 | 第一次评审失败后可修复一次；第二次评审失败进入 `needs_human`。 |
| 取消与恢复 | 取消意图可持久化；中断的执行必须重新规划并重新审批。 |
| 资源预算 | 显式限制执行次数、专家输入次数和总耗时，避免无限重试。 |

<a id="responsibilities"></a>
## 执行职责

工作流引擎决定任务能否执行；适配器将该决策接到既有 DSH 生命周期服务。

| 组件 | 职责 |
|---|---|
| 人工操作方 | 提供请求、计划、审批和评审结论。 |
| MGSD Core | 校验持久化输入、约束状态转换和预算，并从事实推导状态。 |
| `/mgsd` 适配器 | 校验 Session 归属与仓库选择，将 Core 接到后台任务和子进程。 |
| L1 runner | 执行 Codely 与独立检查，限制输出，并等待受管理的清理完成。 |
| Codely | 执行原始任务目标，不能通过自身输出授予工作流审批。 |

```text
create -> planning -> plan_ready -> approved -> executing
  executing -> independent checks + cleanup
    trivial: success -> completed
    standard/high_risk: success -> reviewing
      pass -> completed
      first failure -> review_failed -> fixing -> executing
      second failure -> needs_human
```

此图省略准入阶段及失败分支；精确的生命周期语义由[库参考文档](../packages/experimental/mgsd-workflow/README.zh.md)负责。

<a id="implementation"></a>
## 实现方案

实现将持久化工作流决策与进程执行分离，使用既有扩展点，不修改 agent loop。

<details>
<summary>Core、持久化、审批与生命周期</summary>

### 独立 Core 与持久化事实

`CoreWorkflow` 使用 Node API 与 SQLite，不在运行时导入 DSH 或 Cordis；DSH 包装层绑定带品牌类型的任务、Session 和后台任务标识。严格 JSON 校验拒绝配置与持久化输入中的未知字段。

SQLite 保存不可变请求及有序的只追加事实。每次读取从经过校验的事实重建状态，事务保证追加的原子性。单调递增的 schema 版本拒绝未知的未来版本；PID/token 租约拒绝第二个存活控制器，并允许记录的进程退出后接管。

任务数据库独立于既有 Session 日志，不修改已发布的 Session 历史格式；Session 导出不包含任务数据库。后台任务原始输出仅保存在当前进程内，不持久化。

### 审批与风险

提案产生一个计划版本；审批记录该版本、摘要及可信人工操作方。替换计划会撤销审批，执行在启动进程前拒绝过期审批；计划不能注入状态或审批字段。

所有风险等级都需要人工审批。高风险规划及评审要求 `source:"expert"` 且专家预算充足；在当前适配器中，该字段是可信人工声明，不是自动调用 Codex 的证据。

### 执行事实与结算

适配器在执行前校验 Session 归属及配置仓库的真实路径。Core 在启动前登记执行次数；复用的 runner 在清理前分别记录执行器与验收器退出事实，适配器在受管理的清理结束后才结算任务。

成功结算要求执行器及所有预期检查均成功退出。标准或高风险任务执行成功后仍需评审；命令执行不请求 DSH 模型轮次，但既有完成通知可出现在后续普通聊天轮次中。

### 预算、取消与重启

执行次数包含修复。专家标记的提案及评审消耗专家预算；总耗时从创建任务开始，包含规划时间。准入时预算耗尽会持久化 `needs_human`，不启动执行器；运行时截止时间会取消受管理的执行。

取消先记录意图，再中止进程并等待清理。执行中扩大范围会先停止当前后台任务，再进入 `needs_replan`。重启将未完成的活动状态转为 `interrupted` 并撤销审批；稳定的已审批记录与终态记录仍可读取。重启不会自动重启或重新接管执行器。

</details>

<a id="acceptance"></a>
## 验收

验收覆盖工作流决策、真实 DSH 进程生命周期，以及构建后 Web 命令回放。下方带日期的结果是已记录证据，不表示仓库所有汇总检查均通过。

| 关注点 | 验证入口 |
|---|---|
| 不可变事实、审批、预算、评审限制、恢复、损坏数据与控制器归属 | [Core 测试](../packages/experimental/mgsd-workflow/tests/workflow.spec.ts) |
| 真实 Loader、受管理的执行器与检查、跨 Session 拒绝、取消及卸载 | [CLI 验收](../apps/cli/tests/mgsd-local.spec.ts)及[驱动](../apps/cli/tests/fixtures/mgsd-local/driver.ts) |
| 构建后的 Web、命令行记录保留、零模型调用与工作区结果 | [Web 场景](../apps/web/tests/mgsd-local.snapshot.ts)及[录制样本](../snapshots/web/mgsd-local/) |

复现聚焦检查时使用[指南的验证章节](user/guide/mgsd-local.zh.md#verification)。这些用例使用临时目录及测试执行器，不构成新的真实 Codely 或模型 API 验收结果。

<a id="files"></a>
## 代码与文档入口

先阅读所属参考文档，再按改动需要进入实现或验收入口。

| 入口 | 用途 |
|---|---|
| [包 README](../packages/experimental/mgsd-workflow/README.zh.md) | 库语义与限制。 |
| [Core](../packages/experimental/mgsd-workflow/src/core.ts) | SQLite 存储、状态重建、转换与预算。 |
| [类型](../packages/experimental/mgsd-workflow/src/types.ts)、[校验](../packages/experimental/mgsd-workflow/src/validation.ts)、[包装层](../packages/experimental/mgsd-workflow/src/index.ts) | 记录、JSON 检查及 DSH 标识。 |
| [覆盖层](../apps/cli/config/examples/mgsd-local/cordis.patch.yml)与[适配器](../apps/cli/config/examples/mgsd-local/plugin.mjs) | 按需启用的人工命令及生命周期接线。 |
| [L1 runner](../apps/cli/config/examples/codely-local/run.mjs) | 复用的受管理执行与进程退出观察。 |
| [本地指南](user/guide/mgsd-local.zh.md) | 私有节点/数据库配置与人工命令使用。 |

<a id="handoff"></a>
## 限制与 L3 交接

L2 提供持久化本地流程，不是完整的隔离代理工作区。下一步实现由 [L3 checklist](MGSD_Implementation_Checklist.zh.md#next-local-checklist)负责。

- L3：固定基础提交，为每个任务创建独立分支/worktree，保留主工作区，并约束跨进程工作区归属。
- L3：准备有界本地上下文，审计 Codely 自动保存，保留可检查结果并定义安全清理。
- L4：自动化可信的只读规划/评审，并实施已审批的执行限制。
- 远程派发仍属于第二阶段拓展，不在 L2 范围内。

当前 `workspaceRoot` 和 `defaultBaseRef` 不创建 worktree，也不固定提交；准备阶段状态不表示已实现 Git 隔离。允许文件仅为审批数据，不是强制文件系统限制；Codely 接收原始不可变目标。控制器租约保护单个数据库，不保护跨进程仓库。每个项目只启用一个本地执行器覆盖层，因为各覆盖层使用独立的进程内准入表。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>已记录验证——2026-10-07，Windows</summary>

此日期记录总结 L2 实现会话，不是第二份状态队列，也不宣称仓库整体检查全绿；验收命令及汇总诊断保留在指南中。

| 验证 | 已记录结果 |
|---|---|
| 聚焦 Core、CLI/Loader 与文档测试 | 四个文件、69 个 Vitest 用例通过；既有 runner 覆盖包含 13 个嵌套 Node 测试。 |
| 新包覆盖率 | 逐文件语句、分支、函数、行覆盖率均达到 100%。 |
| 构建后 Web 回放 | MGSD 与 L1 场景通过；已检查命令记录、零模型调用及工作区结果。 |
| 录制 Session 样本集合 | 三个归属/头信息/版本用例全部通过。 |
| 并发 Core 运行 | 两个时间重叠的进程使用独立临时数据库，各通过 43 个用例。 |
| 构建与聚焦静态检查 | 全量构建、Host 构建、lint、包约束及聚焦声明/构建检查通过。 |

仓库汇总检查仍有既存失败：架构计划缺少中文配对且有无法编译的 TypeScript 示例；Cordis 目录过期；Windows hygiene 遇到以链接文本表示的 ACP 符号链接。汇总检查发现的新 L2 失败已修复，所属检查已通过。准确的初次统计及剩余诊断见[指南验收记录](user/guide/mgsd-local.zh.md#dev-note)。

本次总结文档更新的两个指定中英文配对及 `git diff --check` 均通过。`test:docs` 为 19 项通过/1 项失败；`doc-sync` 为 39 项通过/3 项失败，仅剩上文所列的既存文档问题。`lint` 通过。本次仅修改文档，未重新执行功能验收。

</details>
