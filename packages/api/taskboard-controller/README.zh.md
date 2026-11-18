---
description: "Web Host 中经认证的工作台项目和任务命令。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-taskboard-controller

[English](README.md) | 中文

## 概述

Web Host 通过已认证的 `taskboard` Remote 命名空间提供项目绑定、任务需求及活动记录。Web profile 将业务数据域路由至 Harness home 下的 SQLite。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

调用 `ctx.remote.taskboard.createProject` 时传入已有目录的绝对路径、项目 UUID、命令 UUID 和期望版本零。创建任务时使用独立的任务 UUID 和期望版本零。后续写入需提供所属项目、任务、期望版本及新的命令 UUID。使用相同载荷重试同一命令将返回原回执。发生版本冲突时先重新读取任务，再发起新命令。

通过 `listTasks` 读取项目任务卡片，通过 `detail` 读取需求版本快照与活动记录。通过 `reorderTask` 将卡片移到本项目另一张卡片前或列表末尾。规划命令将未安排的任务放入待办。取消与归档保留历史，显式重开会将已终结的任务放回待办。

通过 `inspectProject` 查看已登记项目的实际路径、分支、commit 和本地变更。继续执行时，`inspectPriorWorkspace` 读取最近一次已结束 Run 的目录。原目录执行会在取得租约后重新核对操作者确认的状态。隔离执行从固定 commit 在配置的 `worktreeRoot` 下创建工作树。

通过 `stopRun` 传入选定的 Run ID 和当前任务版本。正常停止只请求该 Run 的 SDK 子进程关闭。停止未确认时可显式请求强制结束。任务详情提供控制状态、连接状态和未能解锁的具体原因。Host 在观察到 runtime 退出且所属工具进程范围已清空后释放租约。

Host Adapter 通过 `createTaskRuntime` 创建独占客户端。它在确认的工作目录启动 `sdk` profile，并在 Host 选定的补丁之后加载工作台权限补丁。SDK 握手要求原生审批、权限预设、沙箱策略及沙箱后端服务均已激活。

<a id="understand-the-implementation"></a>
## 实现说明

[任务数据域](src/domain.ts)在打开存储时校验项目及任务记录。[控制器](src/index.ts)在同一个 SQLite 事务内提交任务变更、活动和命令回执。Host Adapter 将 Run 与任务、固定输入、Session、工作目录和租约代次绑定。确认 runtime 退出后释放该代租约。人工决定保留交付版本、快照和豁免理由。version 统计已提交的操作，revision 标识需求快照。

<a id="model-experience"></a>
## 模型体验

无，因为任务命令和活动记录保存在 Web Host 的业务库中。

#### KV Cache effect

该控制器不改变模型请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- 当前通过 Web API 编辑任务、查阅历史。调度执行和面向用户的交付验收依赖执行 Adapter 与当前代码快照。Host 内部记录接口接收这些组件确认的事实。

<a id="dev-note"></a>
### 开发备注

每个任务记录包含其需求快照和活动。控制器通过同一数据域持有这些记录，直接读取 SQLite 中的权威状态，因此不发布不变量 companion。
