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

通过 `stopRun` 传入选定的 Run ID 和当前任务版本。正常停止只请求该 Run 的 SDK 子进程关闭。停止未确认时，用 `recheckRunStop` 重新观察同一子进程和工具进程范围，无需发送信号，也可通过 `stopRun` 显式请求强制结束。任务详情显示租约仍占用的原因。Host 只有在观察到 runtime 退出且所属工具进程范围清空后才释放租约。重新核对使用启动该 Run 的 Host 持有的进程句柄。Host 重启后，证据不足时目录继续锁定。

Host Adapter 通过 `createTaskRuntime` 创建独占客户端。它在确认的工作目录启动 `sdk` profile，并在 Host 选定的补丁之后加载工作台权限补丁。SDK 握手要求原生审批、权限预设、沙箱策略及沙箱后端服务均已激活。

项目交接文件包含已封存的 Git 交付时，可用以下仓库命令生成 JSON 回执。选择交付 UUID、同仓库的拉取请求及已结束的 GitHub Actions 运行。回执列出准确提交、CI 结论和该交付版本的人工决定。交付含未提交修改或 PR 头提交已变更时，需要新的交付。命令只读本地导出及 GitHub 元数据。

```sh
node scripts/taskboard/delivery-ci.mjs --handoff handoff.json --delivery "$DELIVERY_ID" --repo "$REPO" --pr "$PR_NUMBER" --run "$RUN_ID"
```

<a id="understand-the-implementation"></a>
## 实现说明

[任务数据域](src/domain.ts)在打开存储时校验项目及任务记录。[控制器](src/index.ts)在同一个 SQLite 事务内提交任务变更、活动和命令回执。Host Adapter 将 Run 与任务、固定输入、Session、工作目录和租约代次绑定。确认 runtime 退出后释放该代租约。人工决定保留交付版本、快照和豁免理由。version 统计已提交的操作，revision 标识需求快照。

[执行记录](src/execution.ts)按提交顺序保存排队的 Run，重放时返回原命令回执。每个排队的 Run 预留其任务和选定的 Session，并保存已确认的目录或固定基线的工作树方案。Host 在同一个 SQLite 事务内将空闲租约分配给队首 Run。认领后，`prepareWorkspace` 使用保存的方案，核对实际目录、分支与基线。缺少已保存方案的等待项需要取消并重新确认后提交。取消等待中的 Run 会保留历史，释放任务预留以及为该 Run 预留的新 Session。已有数据库缺少队列记录时，以空队列打开。

完成目录准备和 SDK 初始化后，`submitInput` 先提交投递尝试，再通过 Adapter 调用 `session/prompt`。重放返回保存的消息 ID，原尝试仍需对账时返回 `null`。任务详情显示尝试时间与回执。Adapter 可以使用 `started` 保存从绑定 Session 观察到的回执。

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
