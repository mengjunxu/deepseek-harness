---
description: "面向用户与维护者的具备回放感知的 token 与上下文压力计量说明：评估提示词规模或构建压缩（compaction）与占用显示。"
kind: "package-reference"
---

# @deepseek-ai/dsh-token-meter

[English](README.md) | 中文

## 概述

使用 `ctx.tokenMeter` 估算会话当前的请求与上下文压力，或为单条消息计价。测量会回放持久会话日志，结果确定且不进行模型调用，因此压缩、占用显示与遥测可以共享同一结果。会话投影可用时，消费方可以读取 `tokenUsage`、`contextPressure` 与 `contextBreakdown`；文本和没有图片定价的路由采用近似的固定启发式规则，存在声明时应用视觉 token 定价，文件则按模型可见的句柄文本计价。只有请求 envelope 完全相同时才复用提供方报告的用量；本包不添加模型可见内容，也不在 loop 中做决策。

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

当消费方需要为压缩决策、占用显示或遥测获取 token 或上下文压力时挂载本插件。估算器没有任何配置，也不添加模型可见表面；模型容量属于拥有精确提供方／模型路由的适配器，可通过 `ctx.llm.resolveModelInfo().context` 获取。

### 何时选择

当多个插件应该就同一种基于回放的测量达成一致时选择它——压缩规划、占用 UI 与压力检查都读取同一个 fold。测量回放持久会话日志，因此确定、无需模型调用，并精确反映已记录内容。文本和未声明图片定价的路由使用固定启发式规则；当部署需要精确到计费级别的计数时，使用提供方分词器。

<a id="measuring-pressure"></a>
### 测量压力

`ctx.tokenMeter` 暴露两个操作。`measure(session, requestHeader?)` 在同一个已消费日志 revision 上返回独立、深度不可变的快照：`totalTokens` 是请求与响应压力，`surfaceTokens` 是仅表面的路由定价总量，等于 `nodes[].tokens` 之和。可选 `requestHeader` 覆盖会选择计价路由与压力字段；节点集合仍描述当前会话。`estimateMessage(message)` 用固定启发式规则为一条消息计价。每次调用都会克隆带位置的表面节点，因此测量是 O(surface)。

```text
const { totalTokens, surfaceTokens, nodes } = ctx.tokenMeter.measure(session)
const price = ctx.tokenMeter.estimateMessage(message)
```

每次测量都会通过可选的 `llm` 服务解析生效 envelope 的提供方／模型。适配器声明图片定价时，图片出现处使用路由请求的视觉 token 价格加模型可见文本，`image/offload` 事件选中的出现位置则按路由的占位文本计价，与表层实际发送的一致；其他路由保持固定启发式规则。文件出现处使用同一个 `llm` 服务为适配器分发解析的确切、与路由无关的 句柄文本，其中包含当前执行世界路径或明确的无路径说明。每个节点还携带与路由无关的 `heuristicTokens`，供替换影子价使用。只有当最新成功调用的规范请求 envelope 与已测量 envelope 匹配、且其总量不低于该调用完整路由定价锚点时，才复用提供方用量；否则会对完整当前 envelope 与表面做估算。表面变更保持相对于按同一路由重新定价的匹配锚点的带符号值，包括缩减替换后的负 delta。

测量锚点包含成功的 `assistant/message` 之前的已计价表面，包括 `step/start` 之后接纳的系统与用户消息，以及重试之前执行的替换。持久输出未变时，完成调用的表面增量为零：其提示词已包含在提供方用量中。后续表面变更仍是相对于该锚点的带符号增量。

### 会话投影

当组合提供 `ctx.sessionProjections` 时，token-meter 注册三个投影单元。`tokenUsage` 携带完整持久日志中的 `uncachedInputTokens`、`outputTokens`、`cacheReadTokens` 与 `cacheWriteTokens`。最终 assistant 消息样本会替换同一次尝试的流式用量；`llm/retry-started` 会结束该替换范围，因此同一步骤中的重试会贡献另一次计费用量。`contextPressure` 携带可选 `pressureTokens`（提供方报告的最新提示词规模）、可选 `projectedTokens`（下一个请求的提示词将花费多少）与来自最新一条 `request/context` 记录的可选 `contextWindow`。`contextBreakdown` 携带启发式 `systemTokens`、`toolsTokens` 与 `messageTokens`——上下文的构成，而非提供方计费规模。卸载插件会移除全部三个键。

图片省略重新计算现有节点的价格，同时保留此前的用量锚点。固定引用启发式规则不计入 `offloaded` 元数据，因此一次省略决定不改变 `contextBreakdown` 或标量启发式总量，按路由的测量则把所选图片的视觉价格换成占位文本价格。

`contextBreakdown` 把 surface 顺序中最后一个非空且存活的 `system/message` 归入 `systemTokens`；休眠的空节点不贡献 token，没有非空系统消息时为零。`messageTokens` 包含其余所有可见节点，包括被取代的提示词。两者之和始终等于 `measure().nodes[].heuristicTokens`，未计量替换、压缩和逐节点清空提示词之后也成立。`toolsTokens` 跟随最新 `request/header`。三个数字都使用固定启发式规则，而非路由图片定价或文件句柄投影；它们是近似构成，不是计费数据或 `projectedTokens`。

`deriveTurnTokenUsage(events)` 为浏览器消费方把一个完整轮次折叠为精确的逐次尝试与整轮用量。生命周期证据缺失、计数不安全或精确总量矛盾时不返回结果；只有每次参与的尝试都报告可选缓存、推理或路由值时，相应汇总才会出现。

轮次路线的 `usageSource` 仅取自明确关联到该循环尝试的唯一记账；证据缺失、重复或不匹配时为 `unknown`。匹配的失败尝试也可保留捕获路线。同一模型使用不同来源时分别保留条目；既有适配器样本的算术汇总不变。

### 组合

```yaml
- name: '@deepseek-ai/dsh-token-meter'
- name: '@deepseek-ai/dsh-compaction-basic'
```

两个插件都有可用默认值。meter 只消费可选的 `llm` 服务，且仅用于解析路由声明的请求图片定价；压缩保持可选。部署会在 LLM（大语言模型）适配器上配置容量与图片定价，并在 `dsh-compaction-basic` 上配置压缩策略。

<a id="request-records"></a>
### 原生请求记账

需要持久化原生分发结算的路线/来源归属时，将可选的 `@deepseek-ai/dsh-token-meter/request-records` 入口与 `llm`、`sessions` 和 `sessionProjections` 一同挂载。默认计量器不启用它。

```yaml
- insert:
    - id: request-accounting
      name: '@deepseek-ai/dsh-token-meter/request-records'
```

读取 `ctx.sessionProjections.snapshot(session, ['requestAccounting'])` 获取 `recordCount`、按来源划分的 `bySource` 计数，以及带已提交 `seq` 的最后记录。既有异步 [Session 查询](../../session-query/session-query/README.zh.md)读取历史记录；Session ID 与已提交序号标识每条记录。适配器返回的计数本身可能是估算，不证明官方计费或余额。

同一入口还提供 `preparationFailures`，单独展示原生准备失败的次数与最后记录。通过 `ctx.sessionProjections.snapshot(session, ['preparationFailures'])` 读取。这类审计不增加分发次数或 token 总量。缺少原生适配器时，虚拟中间件仍可能完成请求。

记录的 token 样本保留可选 `measurement: provider-reported | estimated`。缺失口径保持未知，不从 `usageSource` 推断。已完成 Turn 的详情独立显示计数口径与费用来源；尝试口径不一致或部分未知时显示混合。记账缓存版本 3 从事件重建版本 1/2 缓存。两种口径均不证明实际账单金额或官方余额。

### 解读数字

占用是参考数字，不是计费记录：harness 中没有任何机制依据它做决定，压缩读取的是 `measure()`。UI 用测量压力除以所选模型独立解析的容量来计算占用。`contextBreakdown` 数字是估算值，其总和不会等于 `projectedTokens`；后者的提供方锚点恰好携带启发式误差——CJK 文本与 JSON schema 在每 token 四字符下严重低估。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本节解释服务背后的设计；可观察行为已在[使用本包](#use-this-package)中完整说明。

### 设计理念

服务建立在一个 fold 与一个锚点之上。每个会话都有隔离的回放状态——已消费事件游标、规范请求标头、已计价表面、步骤边界与测量锚点——通过折叠持久日志推进。只有当提供方用量的规范 envelope 匹配、且其总量不低于同一次调用的完整路由定价时，才用它锚定测量；否则会估算完整 envelope 与表面。与路由无关的 `heuristicTokens` 字段使替换影子价投影保持确定性。fold 是整体且分配全新的：格式错误事件会在任何变更前抛出，因此同一份日志每次重试都以相同方式失败。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | `TokenMeter` 服务：回放状态、fold、`measure()` 与 `estimateMessage()` |
| [`src/estimate.ts`](src/estimate.ts) | 固定启发式规则：每 token 四字符加块与角色开销 |
| [`src/surface-fold.ts`](src/surface-fold.ts) | 与 `measure()` 共享的位置表面 fold |
| [`src/surface-projection.ts`](src/surface-projection.ts) | O(1) 投影单元的影价协议 |
| [`src/usage-projection.ts`](src/usage-projection.ts) | `tokenUsage` 与 `contextPressure` 投影定义 |
| [`src/breakdown-projection.ts`](src/breakdown-projection.ts) | `contextBreakdown` 投影定义 |
| [`src/client.ts`](src/client.ts) | 面向投影消费方、可安全用于浏览器的客户端接口 |
| [`src/turn-usage.ts`](src/turn-usage.ts) | 精确逐次尝试与逐 Turn 用量的纯 fold |

### Fold 流程

每次 `measure()` 调用都把 fold 同步到当前持久尾部，然后读取一份连贯快照。fold 跟踪完整请求标头快照、步骤边界、表面追加与替换、成功 assistant 消息及提供方用量。用量锚点的提供方输出从 assistant 消息的精确内嵌流重新组装，与监听器对持久内容的改写相互独立；空的重组内容计价为零。

### 投影语义

`contextBreakdown` 按 surface 顺序保留纯 JSON 的 `{ seq, heuristicTokens, system }` 条目，并复用测量服务的 plan/commit fold。其状态与 surface 转换成本为 O(当前保留 surface)，不是 O(1)，也不是 O(完整历史日志)；被替换条目和消息正文不保留。状态版本 5 使计入省略元数据的检查点失效。`contextPressure` 仍是标量影子价消费方：没有相邻 claim 的替换贡献零增量。用量 fold 保留一个最后样本槽，因为合法日志不会在更晚步骤报告用量后再次报告更早步骤的用量。

`./estimate` 导出无服务状态的文字与内容估算函数，供工具结果保留复用。图片的实际请求成本由模型适配器的 `imageRequestPricing` 提供。

### 原生记录语义

每条 `llm/request-accounting` 事件包含捕获的服务 `provider`、解析后的 `model`、声明的 `usageSource`、可选 `intent`/`purpose`、观察到的 `outcome`、可选终态 `finishKind` 和 `usage`。注册替换不会改变已捕获的服务注册；model、intent 和 purpose 在委托前捕获。未声明来源时仍为 `unknown`。

循环提供的 `loopAttempt` 将记录关联到已提交 `step/start` 序号及该步骤内从 1 开始的尝试序号；所属 Session 补齐身份。重试递增尝试序号，恢复后的生命周期提交新的步骤序号。实时 `LlmAttemptId` 仍只在当前生命周期内有效。辅助与历史记录不带该引用；消费方不能根据到达顺序或当前 Provider 目录推断关联。

`usage.kind: adapter-reported` 只携带最后一次返回的 token 样本。这些计数本身也可能是估算；该标记只说明由谁返回，不声明官方计费精度或余额。缺少计数时记录 `usage.kind: unknown`。启发式测量仍由 [TokenMeter.measure](README.zh.md#measuring-pressure) 单独负责，不会替代缺失的返回计数。同一尝试的重复样本相互替换；每次重试分发各有一条记录。

`completed` 表示观察到 `stop`、`tool-calls` 或 `max-tokens` 终态。错误和取消保留其结果，不复制错误消息或响应正文。消费方在终态前关闭，以及未知的可扩展终态原因，均记录为 `unknown`。记录不证明提供方已接受请求、已授权付费或已退款。

`llm/preparation-failed` 记录请求路线、捕获的来源、入口阶段和固定失败类别，不包含任意错误代码／消息或请求内容。显式准备通过 `prepareCall(config, signal, { sessionId, purpose? })` 提供 Session 身份；标准循环传入自己的 Session ID。直接流使用既有调用身份。未知失败仍记为 `unknown`；成功准备不产生失败审计。准备观察者会被等待。观察者故障会通过 `AggregateError` 保留原始错误，并阻止在缺少必需审计时继续。

插件只复制列出的元数据和 token 计数，不记录提示词、响应文本、凭据或不透明的提供方重放数据。同一个有序 effect 拥有监听器、有界投影和活动尝试。应用排空或插件卸载先取消自有传输，等待结算写入，再撤销贡献。嵌入方使用 app-boot 的 `disposeApplication`；直接关闭根节点不提供应用排空阶段。

投影通过注册表游标折叠既有 Session 日志，并恢复其 JSON 检查点。它不保存第二份 transcript 或逐请求索引。请求记账使用缓存版本 3，准备失败使用版本 2；过期缓存通过既有日志重建；新增必读 Session 事件不改变 Session 信封语法。不认识该事件的旧构建会拒绝日志。

此入口不需要独立的 invariant companion：一条原子元数据事件供给有界投影，游标和检查点验证由既有注册表负责。它不单独持久化提交状态或 token 总数。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当包级约定不够用时阅读以下页面。它们从计量服务逐步进入压缩消费方与共享类型。

- [Token 计量子系统](../../../docs/subsystems/token-meter.zh.md)——`ctx.tokenMeter` 背后的测量语义。
- [dsh-llm 服务](../llm/README.zh.md)——其容量元数据由 `resolveModelInfo()` 提供的模型调用服务。
- [压缩能力](../../../docs/subsystems/compaction.zh.md)——读取 `measure()` 的压力敏感消费方。
- [投影 token 用量](../../../.agents/notes/implemented/architecture/2026-07-29-projected-token-usage-and-request-context.zh.md)——`projectedTokens` 背后的设计与被否决的原子配对比较。
- [LLM 流式子系统](../../../docs/subsystems/llm-streaming.zh.md)——本服务计价的消息与块类型。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过 `dsh-compaction-basic` 等消费方；服务本身不添加任何提示词、消息、schema、工具或模型调用。

#### KV Cache 影响

不直接失效；任何请求前缀变更都由点名的消费方负责。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明计量在哪里停止、由未来工作接续。它们是当前包约束，不是通用 token 计量对比或任务积压。

- **固定启发式规则是近似值**——没有可复用提供方用量的文本按字符数加结构开销计价，而非精确提供方分词器或请求序列化器；只有声明了定价的路由上的图片出现处携带提供方精确的视觉 token。
- **每次测量都克隆当前表面**——连贯不可变快照让读取为 O(surface)，包括低于阈值的压力检查。
- **提供方用量只在规范 envelope 完全相同时可复用**——工具、提供方、模型或调用配置变化会刻意回退到完整启发式估算；系统提示词变更在下一次成功调用之前按带符号的表面增量计量。
- **系统提示词改写不带影子价**——循环替换 system 节点时没有紧邻的计量事件，因此 `contextPressure.projectedTokens` 以零增量折叠该替换，直到下一个用量样本；`contextBreakdown.systemTokens` 与 `measure()` 会立即按新提示词重新计价。
- **构成检查点保留当前 surface**——精确的 system/message 分类需要位置条目；检查点大小和 surface 事件折叠成本为 O(当前保留 surface)。

- 没有本地活动 Session 的调用与虚拟路线分发不属于结算覆盖范围。原生准备拥有者观察到的准备失败有单独审计；其他外层中间件拒绝仍不在覆盖范围。
- 进程在结算前退出可能不留下记录。既有预算回执独立保留可能已提交请求的占用；记账不会回收它们。
- Task/Run 关联、完整政策决定历史、官方余额、外部执行器及独立账单核验仍待实现。适配器原始计数不会与本地估算合并。
- 记录次数表示观察到的分发结算，包括下游拒绝；它不是提供方确认的提交数或计费请求总数。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

本开发备注是不具权威性的工作上下文：维护者备注与开放问题。已交付的行为与既定理由以上文、包代码和相关 Agent Note 为准。

- 固定每 token 四字符启发式规则会低估 CJK 文本与 JSON schema；复用用量时提供方锚点恰好携带该误差，请把构成行呈现为近似构成，绝不呈现为总量。
- 按提供方的精确分词器尚未决定；保持单一确定性启发式规则，正是让每个消费方的测量一致且回放稳定的原因。

</details>

**运行时不变式：** 不发布伴生入口。用量 fold 在每次尝试内替换样本，总量不必单调。构成和测量共享位置替换规划器与固定估算器，因此启发式 surface 总量按构造一致，而非需要比较的独立可变观测。路由定价总量有意与之不同。
