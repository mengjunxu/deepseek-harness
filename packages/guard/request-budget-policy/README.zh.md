---
description: "为配置可选持久预算的运维人员提供跨 Host 的本地 LLM 请求次数限制与 execute 名额保留。"
kind: "package-reference"
---

# @deepseek-ai/dsh-request-budget-policy

[English](README.md) | 中文

## 概述

限制一组已配置路线可执行的注册模型请求次数，包括辅助调用。为明确标注 `execute` 的请求保留名额，并在重启及共用原子后端的协作 Host 间保留用量。这些次数由运维人员在本地定义；官方服务余额仍为 unknown。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在 LLM 与存储服务旁挂载此可选插件。把 `request_budget` domain 路由到 SQLite；JSON 后端不支持原子记录修改，受保护请求会持续被拒绝。其他 domain 继续使用应用已配置的默认后端。

```yaml
- id: storage-sqlite
  name: '@deepseek-ai/dsh-storage-sqlite'
  config:
    path: ./local-request-budgets.db
- id: storage-domain
  config:
    backend: json
    routes:
      request_budget: sqlite
- id: request-budget-policy
  name: '@deepseek-ai/dsh-request-budget-policy'
  config:
    budgets:
      - id: development-period
        usageSource: local
        maxRequests: 10
        maxRequestsPerSession: 3
        reserveExecuteRequests: 2
        routes:
          - provider: local-model
            models: [model]
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `budgets` | `[]` | 实时预算集合；null 重置为空列表 |
| `id` | 必填 | 持久预算身份；使用新身份开始新的本地周期 |
| `usageSource` | 必填 | 精确匹配捕获的 Provider 声明；缺失声明只匹配明确的 `unknown` |
| `maxRequests` | 必填 | 非负安全整数，由所有匹配路线及意图共享 |
| `maxRequestsPerSession` | 省略 | 可选非负安全整数，限制本预算内每个精确 Session ID 的次数 |
| `reserveExecuteRequests` | `0` | 仅供明确 `intent: execute` 使用的名额，不超过 `maxRequests` |
| `routes` | 必填 | 非空的精确 provider/model 白名单，在集合内唯一 |

[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-request-budget-policy)列出接受的字段。匹配区分大小写。无意图请求及辅助请求消耗普通部分的名额。插件不识别业务意图，也不授权付费；[paid-route-policy](../paid-route-policy/README.zh.md) 可独立要求 API 计费路线的预设同意。

同一持久身份的容量、execute 保留数及来源不可更改，包括零容量预算。已在本地获知的冲突修改会在设置写入前被拒绝；其他 Host 写入的冲突定义会阻止激活。路线成员可变更，但不会重置计数。删除规则或卸载插件会明确取消其对后续调用的保护。初始化中、存储不可用或无效、后端不支持原子更新时，受保护路线返回 `LOCAL_REQUEST_BUDGET_UNAVAILABLE`；来源不匹配返回 `LOCAL_REQUEST_BUDGET_SOURCE_CHANGED`。修复后端或选择匹配的不可变身份后，重新加载或应用有效规则。

`dsh` 启动器要求已配置的本策略完成激活，不受配置项 ID 影响。初始配置无效会导致启动失败，并在启动审计前以 `ADMISSION_POLICY_INACTIVE` 阻断推理。直接嵌入方必须执行同样的激活要求。

会话上限将所有意图及辅助请求计入同一个精确持久 Session ID。恢复该 ID 会保留占用；其他 Session 在共享预算内拥有各自的上限。缺少身份返回 `LOCAL_REQUEST_BUDGET_SESSION_REQUIRED`；零上限或已用尽返回 `LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED`。两者均在原生模型分发前拒绝，包括已准备调用。只读准备可解析模型元数据，但不会预留容量。委托前取消释放两类名额；已结算或遗留尝试保留两类占用。会话上限对已存预算 ID 不可变，包括新增或移除；改变定义应选择新预算身份。省略时保留旧记录的无会话上限行为，也不要求 Session 身份。

准备请求只检查来源与就绪状态，不消耗名额。分发会原子预留，并在调用下一个处理器前立即提交。普通请求触及 execute 保留名额时返回 `LOCAL_REQUEST_BUDGET_EXECUTE_RESERVED`；预算用尽时返回 `LOCAL_REQUEST_BUDGET_EXHAUSTED`。委托前观察到取消或规则撤销，会记录取消并释放本地名额。委托后的结果及下游拒绝会保守保留占用。插件卸载先取消拥有的传输，再等待回执写入完成并关闭存储。整机退出使用启动器等待的 `app-boot/before-dispose` 阶段；嵌入方调用 app-boot 的 `disposeApplication`。实时规则修改会阻止尚未分发的预留；已委托请求保留其结果。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

纯 `llm/admission` 监听器的安装不依赖存储就绪状态。`llm/dispatch` 携带捕获的注册元数据，并在保留调用方 signal 的同时加入生命周期取消。每个预算定义及其 UUID 回执存放在同一条原子 `request_budget` 记录中，因此独立加载的 Host 不能根据过期缓存计数放行。回调只读取最新记录及捕获的数据，不执行 I/O，也不读取配置。相同预留及状态转换可幂等重复；冲突身份及无效转换会被拒绝。

| 文件 | 职责 |
|---|---|
| [`src/config.ts`](src/config.ts) | 实时规则校验与重复项拒绝 |
| [`src/index.ts`](src/index.ts) | 准入、实时激活与存储所有权 |
| [`src/runtime.ts`](src/runtime.ts) | 预留、取消与排空生命周期 |
| [`src/store.ts`](src/store.ts) | 持久模式与原子回执转换 |

不发布运行时 invariant companion：最新原子回执更新直接执行容量与不可变定义约束，不存在独立存储的计数或用量投影。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [LLM 服务](../../llm/llm/README.zh.md) — 准入与注册分发。
- [存储 domain](../../storage/storage-domain/README.zh.md) — 原子记录更新。
- [SQLite 后端](../../storage/storage-sqlite/README.zh.md) — 跨 Host 事务。
- [Guard 组](../README.zh.md) — 独立可选策略。

-----

<a id="model-experience"></a>
## 模型体验

间接可见，由消费方把预算拒绝记录进 Session 或工具结果。

#### KV Cache 影响

允许的请求保留原有提示与工具声明。预算配置及回执不增加模型输入；已记录的拒绝可进入后续历史。API 发现仅在请求时暴露分发文档。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

此插件统计本地注册分发尝试次数。

- 不获取官方 Codex/ChatGPT 余额、不估算 token 或货币、不限制 Task，也不统计外部执行器。
- 会话上限只覆盖一个预算内的精确 ID，不合并无关预算、Fork 或子 Agent Session；共享容量仍然生效。
- 崩溃后待定或已提交的回执保留占用。没有按时钟自动重置、推断退款或回收遗留尝试。
- 回执在预算记录内累积；归档及有界保留仍待实现。应选择适合部署的有限周期及容量。
- 运维人员必须在每个协作 Host 挂载此策略，并路由到同一原子数据库。其他进程可绕过本地规则或直接修改存储。
- 委托后的下游中间件拒绝可能在没有 Provider I/O 时消耗名额。传输取消不代表 Provider 已退款。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
