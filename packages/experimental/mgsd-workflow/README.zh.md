---
description: "持久化本地 MGSD 任务，并执行显式人工审批、资源预算和有界审查轮次。"
kind: "package-library"
---

# @deepseek-ai/dsh-experimental-mgsd-workflow

[English](README.md) | 中文

## 概述

调用方可以保存本地任务、批准指定计划版本，并在重启后保留执行和验证事实。第二次审查失败要求人工介入。可选 DSH 适配器通过人工命令提供这些操作。本库不启动应用、不调用模型，也不限制文件系统访问。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

[本地 MGSD 指南](../../../docs/user/guide/mgsd-local.zh.md)说明源码检出的适配器配置。库调用方从包入口导入 `MgsdWorkflow` 和 `parseNodeConfig`；[公开声明](src/index.ts)定义 DSH 品牌标识符。独立 [Core](src/core.ts)接收调用方标识符类型，仅导入 Node 模块与本地记录。

人工请求选择已有仓库别名、风险，以及显式执行次数、专家调用次数和时间预算。请求固定基准引用与时间戳；适配器随保留的 worktree 记录解析后的提交。未知 JSON 字段、未审批执行、过期版本与非法转换均失败。准备阶段仅能按失败结算，不需要执行事实。预算耗尽会持久化 `needs_human`；累计时长从任务创建开始计算，包含规划时间。

执行要求人工审批匹配计划版本与摘要，并至少配置一项独立检查。完成要求执行器与检查按顺序记录退出码零，且受管进程清理成功。低风险任务随后完成；普通和高风险任务要求审查。首次审查失败允许一次修复执行；第二次失败停在 `needs_human`。高风险计划与审查要求可信调用方提供 `source: expert`。

范围扩大会撤销审批。执行中的任务先记录取消意图，仅在进程结算后进入 `needs_replan`。准备阶段的取消同样保持待结算，直到适配器结算受管理的进程。重新打开未完成的活动任务会记录 `interrupted`、撤销审批，且不会重启作业。`resume` 后必须重新规划与审批。仅在等待所属进程停止后关闭存储。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

SQLite 存储不可变请求与仅追加事实。事务在追加事实前验证下一状态投影。状态由事实重新计算，不接收模型输出指定的状态。数据库 PID/token 租约拒绝其他存活控制器；进程归属不明确时拒绝接管。SQLite `user_version` 单调递增，当前为 1；未知版本直接失败，不降级或回退。

不发布 invariant companion，因为状态由唯一的持久化事实序列派生，不存在独立维护的状态投影。解析器与确定性转换检查在每次读取时拒绝无效持久化记录。[Core 测试](tests/workflow.spec.ts)覆盖重启、损坏、审批、预算与审查语义。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [本地 MGSD 操作](../../../docs/user/guide/mgsd-local.zh.md) — 配置与人工命令。
- [Codely 进程适配器](../../../docs/user/guide/codely-local.zh.md) — 可执行程序选择与独立检查。
- [实现清单](../../../docs/MGSD_Implementation_Checklist.zh.md) — 本地里程碑依赖。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本地任务持久化不注册面向模型的上下文或工具。

#### KV Cache 影响

本库不改变模型请求或其缓存前缀。

## 已知限制与延后工作
<a id="known-limitations-and-deferred-work"></a>

- 同步 SQLite 操作与完整事实回放适用于小规模本地任务历史，不是分布式调度器。
- 可信适配器接收人工对专家输入的声明；本库不验证真实专家调用。
- 允许文件列表仅记录，不强制执行。工作树隔离、执行包与操作系统隔离由各自调用方负责。
- 持久化事实可跨重启保留；进程内作业输出与进程重新连接不能。PID 复用可能保守地阻止租约恢复。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
