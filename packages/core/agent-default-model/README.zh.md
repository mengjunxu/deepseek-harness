---
description: "面向用户与维护者的部署默认模型选择说明，用于选择、配置或调试新创建的 agent（智能体）初始使用哪个模型。"
kind: "package-reference"
---

# @deepseek-ai/dsh-agent-default-model

[English](README.md) | 中文

## 概述

为会话未指定模型的新 agent 提供共享默认 provider 和模型。Provider、模型和推理强度都是即时 Config 字段。保存的选择更新当前 profile patch，并用于后续读取；会话级选择仍由入口负责。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在创建 agent 且未显式给出模型路由的任何地方挂载本包。该服务回答一个问题——新 agent 应该使用哪个模型？——因此创建 agent 的入口查询它，而不必重新实现默认值。

### 配置默认值

组合要求提供 provider 和模型。即使没有挂载配置编辑器，消费者也可读取即时引用。

```yaml
- name: '@deepseek-ai/dsh-agent-default-model'
  config:
    provider: deepseek
    model: deepseek-chat
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `provider` | 必填 | 新 agent 使用的已注册提供方路由 |
| `model` | 必填 | 新 agent 使用的、由提供方持有的模型 id |

生成的[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-default-model) 列出所有接受的字段。`reasoningEffort` 是可选的；保存不含此字段的选择，会从 profile 的完整配置覆盖中移除此字段。

### 读取与更改默认值

`currentSelection()` 为新创建的 agent 返回一份独立的 `{ provider, model, reasoningEffort? }`；`saveSelection()` 为后续 agent 保存完整选择。

```text
const selection = ctx.agentDefaultModel.currentSelection()
await ctx.agentDefaultModel.saveSelection({ provider, model, reasoningEffort: 'high' })
```

没有配置编辑器时，`saveSelection()` 不执行写入。此服务不验证目录成员资格；发起模型请求的消费者负责可用性诊断。

### 路由显式意图

可选的 `@deepseek-ai/dsh-agent-default-model/intent-routing` 插件为 `chat`、`plan`、`review` 或 `execute` 选择模型。每条路线可以声明固定 provider/model（默认模式，或 `selection: configured`），也可以通过 `selection: entry` 读取入口所选模型和推理强度。固定路线覆盖入口选择，省略推理强度时清除继承值。`execute` 只分类模型请求，不启动外部执行器。

显式声明四条路线和一个意图。以下本地 fixture 路线需要匹配的 Provider 声明，见[完整 SDK 组合](../../../snapshots/sdk/intent-routing-chat/cordis.yml)：

```yaml
- id: agent-intent-routing
  name: '@deepseek-ai/dsh-agent-default-model/intent-routing'
  config:
    routing:
      intent: chat
      routes:
        chat: { provider: intent-chat, model: chat-fixture, requiredCapabilities: [tools] }
        plan: { provider: intent-plan, model: plan-fixture, requiredCapabilities: [tools] }
        review: { provider: intent-review, model: review-fixture, requiredCapabilities: [tools] }
        execute: { provider: intent-execute, model: execute-fixture, requiredCapabilities: [tools] }
```

入口路线可写为 `chat: { selection: entry, requiredCapabilities: [tools] }`，不能同时声明 provider、model 或推理强度。它要求已安装 `installModelSelection` 拥有者，Web/API 会话、headless 与 ACP 均提供该拥有者。缺少拥有者（包括独立 SDK server）或尚未选择模型的入口会以 `ENTRY_MODEL_SELECTION_UNAVAILABLE` 失败。该意图的能力要求仍约束所选路线。Turn 期间改变入口选择会保留给下一 Turn；当前请求和模型切换提示使用捕获的选择。见 [headless 组合](../../../snapshots/session/entry-model-routing/cordis.yml)。

`routing` 是一个实时配置值。每个 Turn 在提示词组装前捕获所选路线；配置变化影响后续 Turn。提示词的 provider/model 变量和请求头使用捕获的同一对值。不可用路线在准备请求时失败。要求的能力必须由 Provider 声明为支持；未知支持状态会拒绝。省略能力要求时不额外限制该能力。限额、传输失败或中断后，插件不会尝试其他意图的路线。Session 请求头记录意图、实际 provider/model 和能力要求；不会额外发送分类请求。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释该服务如何实现上述行为；可观察约定已在[使用本包](#use-this-package)中完整说明。

### 设计理念

此服务保留已验证的 Config 引用，并在 `currentSelection()` 中读取。`saveSelection()` 捕获提交值，并按提交顺序串行写入 profile，包括调用重叠的情况。每个调用方收到各自的写入失败；一次写入被拒绝不会阻止后续保存。消费者优先使用会话级选择。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 即时默认选择与 profile 写入 |
| [`src/intent-routing.ts`](src/intent-routing.ts) | 可选的逐 Turn 意图选择与请求路由 |

### 行为说明

`currentSelection()` 返回分离的选择值。已捕获的选择保持稳定，后续操作则读取更新后的 Config 引用。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

包级约定对大多数消费方已经足够；需要周边领域时再阅读以下页面。

- [Core 子系统](../../../docs/subsystems/core.zh.md)——`Agent` 句柄与 `AgentOptions` 路由选择。
- [agent-loop 包](../agent-loop/README.zh.md)——agent 在请求时如何解析提供方与模型。
- [生成配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-agent-default-model)——每个受支持配置字段及其源声明。
- [core 分组地图](../README.zh.md)——core 各包如何组合。

-----

<a id="model-experience"></a>
## 模型体验

通过提供给请求组装的模型选择和提示词 provider/model 变量间接影响；意图与能力要求仍是元数据，不增加分类调用。

#### KV Cache 影响

默认值影响新 agent；现有会话保留其选择。可选意图路由在组装前捕获 provider/model，并可在后续 Turn 改变路线。渲染的模型名或提供方变化可能改变输入 token 并阻止前缀复用；渲染输入不变时，元数据不产生模型输入 token。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定该服务的范围。它们是当前包约束，不是任务积压。

- **路由政策与账户、额度授权分离**——提供方能力声明不授予账户访问，不预留预算，也不授权付费回退；本插件不提供精确到模型的能力匹配。
- **没有独立运行时不变量**——默认选择没有派生注册表；路由插件为每个 Turn 保留一份私有捕获值。LLM 准入和请求/日志重建仍由各自服务检查。
- **单一的进程级默认值**——该服务只拥有一个默认值；按会话的模型选择仍由入口负责。
- **持久化需要 profile 配置编辑器**——没有编辑器时，保存默认值不会保留选择。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
