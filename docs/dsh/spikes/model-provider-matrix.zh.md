# DSH 模型供应商矩阵

[English](model-provider-matrix.md) | 中文

DSH 实施计划所需的供应商能力记录：Mock 证据来自 2026-10-22，SIWC 真实证据来自 2026-10-23。它把本工作区通过自动化测试验证的内容，与需要真实供应商账户才能确认的内容分开，并记录 SIWC 的结论，而不是默认其可用。

## 范围

DSH 计划要求两项独立结论：OpenAI API Key 路线，以及单独的 SIWC（Sign in with ChatGPT）结论。本页记录两者。它只覆盖聊天模型网关，不覆盖 Codex 执行，后者属于 P0-05。

## 本工作区已有的路线

| 路线 | 所属包 | 协议 | 凭据 |
|---|---|---|---|
| `deepseek` | `packages/llm/llm-deepseek` | Anthropic 兼容 Messages | DeepSeek API Key 或官方账户 |
| `openai` | `packages/llm/llm-pi-ai` | `https://api.openai.com/v1` 上的 OpenAI Responses | 通过 pi-ai 环境发现的 `OPENAI_API_KEY` |
| `openai-codex` | `packages/llm/llm-pi-ai` | `https://chatgpt.com/backend-api` 上的 Codex Responses | ChatGPT Plus/Pro OAuth |
| `azure-openai-responses` | `packages/llm/llm-pi-ai` | Azure Responses | pi-ai 供应商登录 |
| `anthropic` | `packages/llm/llm-pi-ai` | Anthropic Messages | API Key 或 OAuth |
| 手写网关 | `packages/llm/llm-pi-ai` | `openai-completions` 或 `openai-responses` | `apiKeyEnv` 引用 |

本工作区的 pi-ai 为 `@earendil-works/pi-ai` 0.85.1。`openai` 路线不是 DSH 的特殊实现：它是 pi-ai 生成式供应商目录中的一项，适配器按当前配置快照解析每个请求。

## OpenAI API Key 路线

目录路线不需要描述协议，只需要凭据和可选端点：

```yaml
- name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      openai:
        apiKeyEnv: OPENAI_API_KEY
        models:
          - id: gpt-5
            contextWindow: 400000
```

不在目录中的网关自行声明协议、端点与模型：

```yaml
- name: '@deepseek-ai/dsh-llm-pi-ai'
  config:
    providers:
      openai-gateway:
        displayName: OpenAI-compatible gateway
        apiKeyEnv: OPENAI_API_KEY
        api: openai-completions
        baseURL: https://gateway.example/v1
        models:
          - id: gateway-model
            contextWindow: 65536
            maxTokens: 4096
```

`apiKeyEnv` 保存的是凭据引用，不是密钥本身。引用解析为空时，请求在任何网络调用之前以 `MISSING_CREDENTIAL` 失败；适配器不会回退到无关的环境变量。完全省略 `apiKeyEnv` 时才交给 pi-ai 的供应商原生发现。

## 失败分类

`packages/llm/llm-pi-ai/src/stream.ts` 把供应商失败映射为稳定错误码。`packages/llm/llm/src/retry-policy.ts` 的重试策略决定哪些错误码重试：默认模式对 `EMPTY_RESPONSE`、`RATE_LIMIT`、`SERVER`、`TIMEOUT` 与 `TRANSPORT` 最多重试五次，采用有界指数退避。

| 供应商状况 | 错误码 | 默认是否重试 |
|---|---|---|
| 密钥被拒绝（`401`、`403`） | `AUTH` | 否 |
| 账户额度耗尽 | `QUOTA` | 否 |
| 瞬时速率限制（`429`） | `RATE_LIMIT` | 是 |
| 凭据引用解析为空 | `MISSING_CREDENTIAL` | 否 |
| 请求超出模型上下文窗口 | `CONTEXT_WINDOW_EXCEEDED` | 否 |
| 请求体被拒绝（`400`、`413`） | `INVALID_REQUEST` | 否 |
| 供应商 `5xx` | `SERVER` | 是 |
| 终止事件之前流被关闭 | `TRANSPORT` | 是 |
| 完成但没有任何内容 | `EMPTY_RESPONSE` | 是 |

只有在供应商的终止事件到达之后，完成的流才报告为 `stop`。被截断的流产生错误结束，因此断开的连接不会被记录为成功的一轮。

## 验证记录

以下为 Mock 支撑的证据，于 2026-10-22 在本工作区执行：

| 用例 | 路线形态 | 结果 |
|---|---|---|
| 流式文本完成 | 目录 `openai` 路线，Responses 协议 | 通过；`/responses`、Bearer 密钥、用量被记录 |
| 流式文本完成 | 手写 `openai-completions` 路线 | 通过；`/v1/chat/completions`、Bearer 密钥、用量被记录 |
| 密钥被拒绝（`401`） | 两种路线形态 | 通过；以 `AUTH` 错误结束 |
| 额度耗尽（带 `insufficient_quota` 的 `429`） | `openai-completions` 路线 | 通过；以 `QUOTA` 错误结束 |
| 未配置凭据 | `openai-completions` 路线 | 通过；`MISSING_CREDENTIAL` 且未发送任何请求 |

复现命令：

```
corepack pnpm exec vitest run packages/llm/llm-pi-ai/tests/openai-route-matrix.spec.ts
```

真实 API Key 证据：**BLOCKED**。尚未验证任何真实 OpenAI API Key 请求。Mock 端点无法确认账户模型权限或计费行为。下方独立 SIWC 结果使用 Plus 订阅，不能替代 API Key 路线验证。

## SIWC 状态

独立 P0 探测于 2026-10-23 使用用户 Plus 账户**通过**。浏览器按[官方 SIWC 流程](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)注册了 DeepSeek Harness。探测校验了回调 state，以及 ID token 的签名、签发者、受众、有效期和 nonce，随后确认获授 `chatgpt.tokens.use.direct` 权限。凭据保存在 Git 之外、仅当前用户可访问的目录中。

账户的 `GET https://api.openai.com/v1/models` 返回七个可见模型。合成请求使用 `gpt-6.1-sol`、`store: false` 和 `stream: true` 调用 `POST https://api.openai.com/v1/responses`，返回预期的 `SIWC_OK` 文本和 `response.completed`；用量为输入 13、输出 7 token。详见[脱敏证据](../../../.ai/tasks/dsh-p0-siwc/artifacts/siwc-result.json)、[探测源码](../../../.ai/tasks/dsh-p0-siwc/artifacts/siwc-probe.mjs)及[执行记录](../../../.ai/tasks/dsh-p0-siwc/plan.md)。这些结果确认账户可行性，不代表已交付 DSH Provider 集成。

集成必须遵循 [SIWC 请求限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)，并处理[订阅权限和用量失败](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)。探测未挂载 Provider，未验证 token 刷新、撤销、订阅额度耗尽或 DSH Session 回放。现有 pi-ai `openai-codex` 传输使用 ChatGPT 后端端点，与本次公共 Responses 路线分开。

对 V0 的结论：

- 本账户的 SIWC 路线可行；产品集成和生命周期覆盖仍属于 P1 工作。
- API Key 路线仍需独立的真实账户证据；SIWC 成功不免除该要求。
- 选定账户路线不可用时，DeepSeek 和 Mock 仍是退路。

## 已知限制

- 真实 API Key 权限与计费，以及 SIWC 订阅额度限制行为仍未验证。
- 验证覆盖文本流式与 HTTP 失败路径，不覆盖图像输入、针对 OpenAI 的工具调用往返或 Responses 推理条目。
- 供应商模型标识与账户资格在本仓库之外变化；本矩阵记录路线机制，不是冻结的模型列表。

## 下一任务依赖

P0-03 为 P1-05 提供聊天供应商结论。SIWC 真实可行性已通过；P0-03 仍因独立的真实 API Key 验证保持 BLOCKED。SIWC 产品集成还需通过现有 DSH 服务完成授权、凭据生命周期、请求兼容和错误处理。
