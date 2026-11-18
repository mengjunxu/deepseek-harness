---
description: "模型与工具策略插件：重复调用、工具限时和按量计费路线的预设同意，供组合 guard 的用户与维护者阅读。"
kind: "package-group"
---

# guard/：模型与工具策略

[English](README.md) | 中文

## 概述

`guard/` 提供模型与工具操作策略。`repeat-tool-reminder` 建议模型改变重复工具调用；`timeout-policy` 执行工具声明的限时。两者都在基础组合包中默认启用。`paid-route-policy` 要求为声明的按量计费模型路线提供精确预设，显式挂载后激活。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

每个包的 README 说明其激活方式、配置与失败行为。

| 包 | 提供什么 |
|---|---|
| [`repeat-tool-reminder/`](repeat-tool-reminder/README.zh.md) | 在模型重复完全相同的工具调用时提醒它，使其改变方法或结束任务 |
| [`timeout-policy/`](timeout-policy/README.zh.md) | 为声明了限时的工具调用设置超时，让模型得到清晰错误而不是无限等待 |
| [`paid-route-policy/`](paid-route-policy/README.zh.md) | 要求为精确的按量计费 Provider/model 路线提供预设 |
| [`request-budget-policy/`](request-budget-policy/README.zh.md) | 跨 Host 统计持久本地请求次数并为 execute 保留名额 |

-----

<a id="related-documentation"></a>
## 相关文档

先从工具子系统参考了解工具调用流水线，再看重复提醒的配置与策略背后的超时库决策。

- [LLM 子系统参考](../../docs/subsystems/llm-streaming.zh.md)——已注册路线准入与预设同意。
- [工具子系统参考](../../docs/subsystems/tools.zh.md)——工具调用流水线与工具策略决策。
- [生成配置目录](../../docs/config-catalog.zh.md#deepseek-aidsh-repeat-tool-reminder)——重复调用提醒的每个受支持字段。
- [超时截止时间库 Agent Note](../../.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.zh.md)——`timeout-policy` 所执行的时序／终止拆分。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
