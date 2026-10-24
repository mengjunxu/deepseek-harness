---
description: "通过官方 SIWC 授权，把本地 DSH Web UI 连接到 ChatGPT 订阅。"
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-chatgpt-plan

[English](README.md) | 中文

## 概述

在 DSH 模型设置中连接 ChatGPT Plus 或 Pro 账户，然后在现有模型选择器中选择账户支持的模型。符合条件的请求通过公共 Responses API 使用账户的 ChatGPT 订阅。本实验插件需要显式启用，API Key 路线保持独立。Token 只保存在 Host 凭据存储中。

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

在 `llm`、`credentials`、`authorization`、已鉴权 Remote Gateway 和模型 UI 旁挂载已构建插件。它注册 `chatgpt-plan` 提供方，不修改 Agent 循环，也不替换其他提供方。正常 Web profile 已提供这些前置服务。

仓库验证以绝对路径 overlay 指向本包已构建的 `lib/index.js`，使用新数据目录和页内目录选择器 overlay 启动正常 `web` profile。命令及自动测试与真实证据的区分见[任务记录](../../../.ai/tasks/dsh-siwc-ui/plan.md)。

在设置 → 模型中选择使用 ChatGPT 登录，再打开登录页面，在浏览器中完成授权。设置卡片显示已校验的账户及订阅使用情况；模型选择器读取该账户当前的模型列表。管理用量打开 ChatGPT 设置。断开连接需先确认远端撤销，再清除本地 Token；网络失败会保留账户以便重试。

| 字段 | 默认值 | 含义 |
|---|---|---|
| `appName` | `DeepSeek Harness` | 注册时显示的应用名称。 |
| `requestTimeoutMs` | `120000` | 每次网络操作与推理请求的期限。 |
| `attemptTimeoutMs` | `600000` | 整个浏览器授权流程的期限。 |
| `contextWindow` | `262144` | 上下文计量使用的后备容量，需按选用模型配置。 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部机制 — 点击展开</summary>

授权流程负责 PKCE、state、nonce 和临时回环监听器。OpenID Connect 校验签发者、签名、受众、有效期与账户身份后，通过现有授权服务提交授权记录。已签发的客户端 ID 和主机标识在退出后保留；access、refresh 和 ID token 不跨 Remote，也不进入 Session 事件。刷新使用凭据提供方的跨进程修改锁。

适配器复用 pi-ai 的请求历史与流转换。SIWC 请求保留对话历史和系统指令，使用 `store: false` 与 `stream: true`，并把函数定义放入命名空间。订阅限额失败映射为不可重试的 QUOTA 错误，并附用量设置入口。携带凭据的 HTTP 请求拒绝重定向。

本包不发布 `./invariant` 安装器：凭据记录是唯一账户权威，状态视图直接读取记录，框架负责注册，本包没有独立维护的索引可供比较。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [官方 SIWC 注册](https://developers.openai.com/siwc/token-sharing-open-source/sign-in) — 公共客户端授权。
- [SIWC 限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations) — 支持的请求字段。
- [凭据](../../credentials/credentials/README.zh.md) — 秘密存储与刷新锁。
- [授权](../../credentials/authorization/README.zh.md) — 流程取消与提交所有权。

-----

<a id="model-experience"></a>
## 模型体验

本插件不添加工具或提示段。选定模型通过正常 LLM 服务接收已有的日志消息和工具 schema。传输改变计费授权方式，不改变对话历史的来源。凭据与账户标签不进入模型内容。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

当前集成为本地实验功能。

- 支持一个活动账户注册，完整的已保存账户与工作区选择器待实现。
- 输入仅支持文本，temperature、输出 token 上限、停止序列和显式推理控制均被拒绝。
- 后备上下文容量按插件配置，尚未细分到各账户模型。
- 真实提供方访问、订阅限制与可用模型取决于 OpenAI 和选定账户。

<a id="dev-note"></a>
## 开发备注

真实 UI 验收与录制状态见上述任务的 Checkpoint。
