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

`check.mjs` 位于选定项目中；请把该 argv 替换为实际验收命令。命令不会隐式经过 shell 解析。缺失或为空的命令配置会使插件激活失败。覆盖层将此组合的任务完成通知设为 `quiet`，包括其他任务生产方，因此完成任务不会唤醒 DSH 模型。

Web 入口为 `node --import tsx/esm apps/cli/src/bin.ts web --patch apps/cli/config/examples/codely-local/cordis.patch.yml`。本次仓库验证覆盖了 Loader 执行和 Web 配置组合，尚未覆盖浏览器交互；用于日常工作前应完成浏览器验收。

<a id="commands"></a>
## 命令

创建会话时选择目标本地项目。命令使用会话记录的目录；同一个插件实例会拒绝在同一真实目录中启动第二个尚未结束的 Codely 任务。

| 命令 | 结果 |
|---|---|
| `/codely run <task>` | 启动后台任务并返回 job id。 |
| `/codely status` | 显示本会话的任务状态。 |
| `/codely output <id>` | 显示保留的输出；提示更早输出已被丢弃。 |
| `/codely cancel <id>` | 请求取消；继续查看状态直至结束。 |

`completed` 表示 Codely 和所有配置的验收命令均以 0 退出，不代表任务语义上正确。Codely 进程失败时跳过验收。验收失败时报告该检查自身的退出码。取消或达到整体截止时间后不再执行后续检查。默认截止时间为 15 分钟；`timeoutMs`、`graceMs`、`maxBytes` 和 `pollMs` 均为插件配置字段。

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
node node_modules/vitest/vitest.mjs run apps/cli/tests/codely-local.spec.ts
node --import tsx/esm apps/cli/tests/fixtures/codely-local/live.ts
```

第一条命令执行六个确定性生命周期测试及真实 Loader/进程场景，覆盖中文多行 argv、独立验收退出 23、同目录准入、跨会话访问拒绝、取消和插件卸载清理。第二条命令需要 `DSH_CODELY_COMMAND` 及现有 Codely 登录状态，在临时目录运行，外部检查生成文件，并在进程清理后删除该目录。

### 开发备注

2026-10-03/04 在 Windows、Node v26.10.0 上的本地证据：真实 Codely 冒烟测试返回 `completed`，独立文件内容检查通过，DSH 模型调用次数为 0。Web profile 配置导出包含该插件及 `completionDelivery: quiet`。依赖下载已完成，但仓库 postinstall 因现有子模块 Git 公共配置中的 `core.worktree` 而失败；未修改 Git 配置。浏览器验收和录制会话回放仍待完成。这些观察仅为测试证据，不构成更广泛的兼容性或沙箱保证。

验证记录：聚焦测试的两个 Vitest 用例通过（包含六个嵌套 Node 测试）；`lint` 及其 Host 构建通过；`docs:check` 的 151 个测试、网站构建和片段链接检查通过；本文配对检查通过。`test:docs` 为 18 通过 / 2 失败，最终 `doc-sync` 为 39 通过 / 3 失败。剩余失败均指向现有 MGSD 架构方案：缺少双语文件、段落硬换行以及无法编译的 TypeScript 示例。仓库脚本使用已安装的固定版本 pnpm 入口，并设置 `pnpm_config_verify_deps_before_run=false`，避免因无关 postinstall 失败重复安装。未提交或推送改动。
