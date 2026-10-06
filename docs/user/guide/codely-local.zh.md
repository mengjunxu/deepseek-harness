---
description: "配置和验证按需启用的本地 Codely 命令覆盖层，说明独立验收与取消的限制。"
---

# 运行本地 Codely 任务

[English](codely-local.md) | 中文

## 概述

本地覆盖层为 DSH 添加 `/codely` 命令。Codely 在会话的项目目录中执行任务；DSH 管理子进程、有界输出、取消和单独配置的验收命令。这些命令不会提交 DSH 模型轮次。普通聊天消息仍使用选定的 DSH 模型。

## 目录

- [配置](#configure)
- [命令](#commands)
- [限制](#limits)
- [验证](#verification)

<a id="configure"></a>
## 配置

需要已安装依赖的开发仓库、可运行的 DSH Web 构建和已登录的本地 Codely。先在可丢弃的项目中操作。此集成不提供文件系统或网络隔离；Codely 的 `strict` 路径策略不是操作系统沙箱。

[覆盖层](../../../apps/cli/config/examples/codely-local/cordis.patch.yml)需要两个包含 JSON argv 数组的环境变量。`DSH_CODELY_COMMAND` 指定可执行程序及启动参数。在 Windows 上，使用 `node.exe` 和 Codely 的 JavaScript 入口，而不是 `codely.cmd`，避免提示词经过 shell 引号解析。`DSH_CODELY_CHECKS` 至少包含一个独立运行的验收命令。请选择可信检查；agent（智能体）可以修改的检查不能独立证明验收标准已满足。

以下 PowerShell 示例适用于标准 npm 用户安装；请先确认本机入口文件存在：

```powershell
$codelyEntry = Join-Path $env:APPDATA 'npm/node_modules/@codely/cli/bundle/gemini.js'
if (-not (Test-Path -LiteralPath $codelyEntry)) { throw 'Locate the installed Codely JavaScript entry first' }
$env:DSH_CODELY_COMMAND = ConvertTo-Json -Compress @((Get-Command node).Source, $codelyEntry)
$env:DSH_CODELY_CHECKS = '[["node","check.mjs"]]'
```

`check.mjs` 位于选定项目中；请把该 argv 替换为实际验收命令。命令不会隐式经过 shell 解析。缺失或为空的命令配置会使插件激活失败。每个 Codely 任务都会请求静默完成通知，因此结果会留在 Session 收件箱中，不会开启 DSH 模型轮次。其他任务生产方仍使用控制器原有的通知配置。

Web 入口为 `node --import tsx/esm apps/cli/src/bin.ts web --patch apps/cli/config/examples/codely-local/cordis.patch.yml`。在浏览器中选择目标项目，运行无害任务，查看状态和输出，再单独取消一个长时间运行的任务。命令结果会在开启模型轮次前显示在 Chat 中。即使所选 preset 会唤醒其他后台任务，Codely 完成通知仍保持静默。

<a id="commands"></a>
## 命令

创建会话时选择目标本地项目。命令使用会话记录的目录；同一个插件实例会拒绝在同一真实目录中启动第二个尚未结束的 Codely 任务。

| 命令 | 结果 |
|---|---|
| `/codely run <task>` | 启动后台任务并返回 job id。 |
| `/codely status` | 显示本会话的任务状态。 |
| `/codely output <id>` | 显示保留的输出；提示更早输出已被丢弃。 |
| `/codely cancel <id>` | 请求取消；继续查看状态直至结束。 |

`completed` 表示 Codely 和所有配置的验收命令均以 0 退出，不代表任务语义上正确。Codely 进程失败时跳过验收。验收失败时报告该检查自身的退出码。取消或达到整体截止时间后不再执行后续检查，包括在最终清理期间发生的情况。两者均结束为 `killed`，详情分别为 `Cancelled` 或 `Timed out`；观察到的退出码和信号独立保留在任务输出中。即使已取消或超时，清理失败仍结束为 `failed`。默认截止时间为 15 分钟；`timeoutMs`、`graceMs`、`maxBytes` 和 `pollMs` 均为插件配置字段。

<a id="limits"></a>
## 限制

- 任务和输出仅保留在进程内；重启 DSH 不会恢复它们。命令调用及展示的命令结果使用现有会话事件日志。
- 输出为原始 Codely 流式 JSON，而非专用工具卡片。输出和验收日志可能包含项目内容；分享前请检查。
- Codely 使用 `auto_edit`、`strict` 和 `--no-upm`。尚未实现交互审批、继续对话、远程派发、跨进程工作目录锁和持久任务恢复。
- 进程清理由 DSH 选定的子进程提供方负责。其较弱进程控制警告仍然适用；此集成不会增强该提供方的能力。

<a id="verification"></a>
## 验证

在仓库根目录运行聚焦检查：

```powershell
node node_modules/vitest/vitest.mjs run apps/cli/tests/codely-local.spec.ts packages/jobs/tool-jobs/tests/tool-jobs.spec.ts packages/jobs/jobs-local/tests/jobs.spec.ts
node --import tsx/esm apps/cli/tests/fixtures/codely-local/live.ts
$env:DSH_SNAPSHOT = 'replay'
$env:DSH_EXAMPLE_MODE = 'lib'
$env:DSH_TEST_BROWSER_CHANNEL = 'msedge'
node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts apps/web/tests/codely-local.snapshot.ts scripts/session-snapshot-corpus.corpus.ts
```

第一条命令通过三个 Vitest 文件，包含 13 个确定性生命周期测试及两个真实 Loader/进程场景，覆盖中文多行 argv、独立验收退出 23、同目录准入、跨会话访问拒绝、配置的截止时间、取消和插件卸载清理。取消及卸载场景等待父子进程就绪信号，并确认两个进程均已退出。Loader 使用独立配置副本，测试确认源配置保持不变。第二条命令需要 `DSH_CODELY_COMMAND` 及现有 Codely 登录状态，在临时目录运行，外部检查生成文件，并在进程清理后删除该目录。最后一条命令无需 API key，即可回放 run/status/output/cancel 流程，并检查 Chat 记录、刷新后的 Session、DSH 模型调用次数为零及完整预期工作区。`DSH_EXAMPLE_MODE=lib` 会为快照测试选择构建后的 Web 产物。只有在 Playwright 自带 Chromium 不可用、且本机安装了兼容浏览器时才设置 `DSH_TEST_BROWSER_CHANNEL`。

### 开发备注

2026-10-06 在 Windows 上的 L1 自动化证据：三个聚焦 Vitest 用例全部通过，包含 13 个 Node 测试。结果报告修复前，五个新增断言失败；修复后 13 个全部通过。同步屏障控制的测试覆盖执行器和最后一个验收进程清理期间的取消/超时，以及清理返回 false 或拒绝的情况。真实 Loader 测试观察到 DSH 模型调用次数为 0、超时后未运行验收、取消/卸载后父子进程均不存在。本次子里程碑未重跑真实 Codely、浏览器验收及录制会话回放。

两份独立进程并发运行聚焦 Vitest 命令，各自三个用例均通过。Host 构建通过；修正一处箭头函数括号 lint 问题后，`lint:contracts-ready` 通过。使用说明/checklist 配对及 `git diff --check` 通过。`doc-sync` 最终为 40 通过 / 2 失败：现有架构计划仍缺少双语配对，且包含无法编译的 TypeScript 示例。

2026-10-03/04 在 Windows、Node v26.10.0 上的本地证据：真实 Codely 冒烟测试返回 `completed`，独立文件内容检查通过，DSH 模型调用次数为 0。Web profile 配置导出包含该插件及 `completionDelivery: quiet`。依赖下载已完成，但仓库 postinstall 因现有子模块 Git 公共配置中的 `core.worktree` 而失败；未修改 Git 配置。浏览器验收和录制会话回放仍待完成。这些观察仅为测试证据，不构成更广泛的兼容性或沙箱保证。

2026-10-07 Windows 浏览器证据：重新构建后的 Web profile 通过 Edge 和页内目录选择器执行了 `/codely run`、`status`、`output` 及 `cancel`。隔离执行器写入 `result.txt`；独立检查一次成功、一次以退出码 23 失败；取消结果为 `killed`。仅有命令的 Chat 在刷新页面后仍然可见；每个 job 自带的静默通知要求使三个任务完成时都没有开启 DSH 模型轮次；完整工作区与独立预期文件一致。无密钥录制包含十条命令调用及对应展示结果，回放启动的是构建后的正式 Web profile。浏览器场景及截图位于 `apps/web/tests/codely-local.snapshot.ts` 与 `.artifacts/codely-local-browser.png`。

2026-10-07 Windows 验证：上方生命周期命令通过三个文件、147 个测试，包含 13 个嵌套 Node 测试。已登录的真实 Codely 冒烟返回 `completed`，独立检查通过，观察到的 DSH 模型调用次数为零。无密钥 Web 场景及 Session 语料通过两个文件、四个测试；由于 bundled Chromium 不可用，测试使用了本机安装的 Edge。修复浏览器测试的 lint 问题后，Host 构建和 `lint:contracts-ready` 均通过；`git diff --check` 及本次修改的七组双语配对通过。`test:docs` 通过 19 个门禁，唯一失败为架构计划缺少中文配对。`doc-sync` 通过 39 个门禁，三个既有失败分别为该计划缺少配对、计划中的 TypeScript 示例无法编译，以及 `packages/extensions/tool-cordis/src/api-catalog.ts` 过期。没有提交或推送改动。
