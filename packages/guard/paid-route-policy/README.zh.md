---
description: "为精确的按量计费 Provider/model 路线提供预设同意，供配置可选付费推理保护的操作者阅读。"
kind: "package-reference"
---

# @deepseek-ai/dsh-paid-route-policy

[English](README.md) | 中文

## 概述

声明为按量计费的 Provider/model 路线只有取得精确预设或当次确认后才能调用。授权精确命名这一对值，并可通过实时 profile 设置撤销。该策略按需挂载，默认不授权任何路线，服务余额仍保持未知。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

操作者要求对 Provider 政策中声明 `usageSource: api_metered` 的路线预先同意时，挂载此插件。它不会自行在基础 profile 激活，也不选择回退路线。

```yaml
- id: paid-route-policy
  name: '@deepseek-ai/dsh-paid-route-policy'
  config:
    grants:
      - provider: paid
        models: [m]
```

没有匹配预设时如需询问用户，配置 `onMissingGrant: ask`，或使用 `pnpm dsh web --patch apps/cli/config/examples/paid-route-confirmation.yml` 启动 Web。默认值为 `deny`。既有审批面板显示捕获的路线、未知的费用/余额和单次请求范围。每次重试或辅助调用分别确认；精确预设匹配时不再询问。

```yaml
- id: paid-route-policy
  name: '@deepseek-ai/dsh-paid-route-policy'
  config:
    onMissingGrant: ask
```

确认要求处于开放 Turn 的活动 Agent、既有审批服务及答复方。`approval/policy: never` 不询问而直接拒绝；缺少服务、Agent 或答复方时拒绝。Session 的权限预设可以选择 `never`，包括出厂 danger-full-access 预设；本政策不会修改该设置。`approval/asked` 的 reason 记录精确路线及传入的步骤/尝试或辅助用途，`approval/decided` 配对结果。展示译文不持久化，也不发给模型。

该预设批准精确 `paid`/`m` 组合上的所有调用，包括使用这一对值的辅助请求。匹配区分大小写；其他 Provider、其他模型或空 `grants` 列表均不匹配。预设建立许可，不提供凭据、模型可用性或金额额度。[配置目录](../../../docs/config-catalog.zh.md#deepseek-aidsh-paid-route-policy)拥有受支持字段的说明。

默认 deny 模式未匹配时，准备调用在适配器准备前抛出 `PAID_ROUTE_CONSENT_REQUIRED`；直接流式调用以相同失败作为终止错误。已准备调用和异步查询路径在分发适配器流之前复查当前授权。撤销会阻断尚未启动的分发，不取消已启动的流。非法授权设置在持久化前拒绝。其他准入拒绝仍有效；多个策略必须全部委托才能继续。

`dsh` 启动器要求已配置的本策略完成激活，不受配置项 ID 影响。启用但未激活的策略会在启动审计前以 `ADMISSION_POLICY_INACTIVE` 阻断推理；初始配置无效会导致启动失败。直接嵌入方必须执行同样的激活要求。

[允许调用的 headless 组合](../../../snapshots/session/model-paid-route-approved/cordis.snapshot.yml)提供精确预设，[拒绝组合](../../../snapshots/session/model-paid-route-required/cordis.snapshot.yml)不授权任何路线。两者均在本地回放，不发出付费提供方请求。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

插件订阅 `llm/admission` 与 `llm/authorize`。LLM 服务传入实际提供调用的注册代次所捕获的 Provider 元数据，独立于替换后的当前发现结果。同步准入监听器每次读取已校验的实时预设，返回拒绝或委托，不执行 I/O 或资源预留。授权阶段先于 `llm/dispatch` 的预留和记账执行，不依赖监听器注册顺序。拒绝（`PAID_ROUTE_CONSENT_DENIED`）、无法确认（`PAID_ROUTE_CONSENT_UNAVAILABLE`）、撤回（`ABORTED`）或撤销 ask 模式（`PAID_ROUTE_CONSENT_REVOKED`）均不委托。审批审计写入缺陷继续抛出。任何预留之前会重新检查当前准入与组合取消。卸载或应用关闭会取消并等待未完成确认；迟到答复不能放行已撤回请求。

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 已注册路线准入与政策激活 |
| [`src/config.ts`](src/config.ts) | 实时预设与缺失授权处理的校验 |
| [`src/confirmation.ts`](src/confirmation.ts) | 当次审批、取消与等待结束 |

不发布运行时不变量伴生插件；每次决定直接来自捕获的 Provider 元数据、请求控制值和已校验授权，没有第二份存储投影；审批审计配对归 user-approval 所有。

</details>

-----

<a id="further-exploration"></a>
## 延伸阅读

- [LLM 服务](../../llm/llm/README.zh.md)——Provider 声明与已准备调用的准入。
- [LLM 子系统](../../../docs/subsystems/llm-streaming.zh.md)——类型化准入事件。
- [Guard 家族](../README.zh.md)——可选的模型与工具策略。

-----

<a id="model-experience"></a>
## 模型体验

间接通过将准入拒绝记录到 Session 或工具结果的消费方影响模型。

#### KV Cache 影响

允许的调用保留其提示词与工具声明。拒绝文本可经消费方记录的错误进入后续历史；预设变更本身不添加模型输入。

## 已知限制与延后事项

<a id="known-limitations-and-deferred-work"></a>

本插件为声明的按量计费路线提供操作者预设和 opt-in 当次确认。

- 仅检查 `api_metered` 声明；其他或缺失的额度来源保留原行为，不被归类为免费。
- 预设属于受信任的 profile 配置，在撤销前持续有效；当次授权只存在于等待中的调用，没有到期调度或账户余额查询。
- token/货币预算及购买/credits 保护仍待实现；[request-budget-policy](../request-budget-policy/README.zh.md) 提供独立的本地尝试预留与 execute 名额。
- 已启动的调用保留自身结果；撤销阻断后续分发，不代表提供方侧取消或退款。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
