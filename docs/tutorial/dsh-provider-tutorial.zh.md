# DSH 模型提供方配置教程（Windows）

[English](dsh-provider-tutorial.md) | 中文

从 PowerShell 启动 DSH，在 Web 设置里接入 DeepSeek、OpenAI API、自定义网关或 ChatGPT 订阅，然后发一条测试消息确认模型能回复。

## 1. 启动 DSH Web

在 PowerShell 进入已构建的 DSH 仓库根目录，然后启动 Web UI。

```powershell
pnpm dsh web
```

首次检出时，先在仓库根目录运行 `pnpm install --frozen-lockfile` 和 `pnpm run build`，再启动。保持终端运行，打开终端打印的访问链接。默认地址为 `http://127.0.0.1:3080`。需要换端口时，停止当前服务，再运行 `pnpm dsh web --port 3090`。[源码启动说明](../../README.zh.md) · [Web CLI 参数](../../apps/cli/reference/README.zh.md)

## 2. 选择一种接入方式

按你要在会话中使用的提供方完成对应配置。

### A. DeepSeek API

1. 打开 **设置 → 模型**。
2. 在 **DeepSeek** 卡片填入 DeepSeek API Key，然后保存。
3. 返回会话，在模型选择器里选一个 DeepSeek 模型。

### B. OpenAI API 或其他内置提供方

1. 打开 **设置 → 模型 → 添加模型提供商**。
2. 在 **第三方模型提供商** 中选择服务。OpenAI 的 ID 是 `openai`，Anthropic 是 `anthropic`，Kimi 是 `moonshotai`，GLM 是 `zai`。
3. 输入该服务的 **API Key** 并保存。内置目录提供默认端点、协议和模型选项。
4. 返回会话，选中刚配置的提供方下的模型。

这条 OpenAI 路线使用 OpenAI API Key。用 ChatGPT 订阅登录请参照 D 节。[模型配置指南与界面截图](../user/guide/providers.zh.md)

### C. 自定义 API 网关或本地模型服务

打开 **设置 → 模型 → 添加模型提供商 → 自定义模型 API**，按服务商提供的连接信息填写。表中地址和模型 ID 是占位示例。

| 字段 | 怎么填 |
| --- | --- |
| Provider ID | 填小写且唯一的 ID，例如 `my-gateway`。会话和默认模型会引用此 ID，保存前确认命名。 |
| 显示名称 | 填一个容易识别的名称，例如 `我的模型网关`。 |
| API 地址 | 填服务商给出的 API 根地址，例如 `https://gateway.example.com/v1`。具体请求路径由 DSH 按协议拼接。 |
| API 协议 | 按网关文档选择 **OpenAI Chat Completions**、**OpenAI Responses** 或 **Anthropic Messages**。 |
| API 密钥 | 服务要求鉴权时，填网关签发的密钥。 |
| 模型目录 | 填网关识别的精确模型 ID。也可以点 **获取可用模型**，勾选后点 **添加所选**。 |

保存后回到会话选择模型。若网关没有提供可识别的模型列表，手动添加模型 ID 也可以完成配置。[自定义 API 表单与探测说明](../user/guide/providers.zh.md)

### D. 用 ChatGPT 订阅登录（SIWC 实验插件）

1. 在运行 DSH 的终端按 **Ctrl+C** 停止当前 Web 服务。
2. 在仓库根目录用随附补丁重新启动。

   ```powershell
   pnpm dsh web --patch packages/experimental/chatgpt-plan/cordis.patch.yml
   ```

3. 打开终端给出的 Web 链接，进入 **设置 → 模型 → 使用 ChatGPT 登录**。
4. 点击 **打开登录页面**，在浏览器里完成授权。回到 DSH，等设置卡片显示已连接账户，再在会话的模型选择器里选择该账户下的模型。

这条实验路线通过 Responses API 使用 Codex / ChatGPT Work 共享用量。可用模型取决于账户，当前插件支持文本输入。[ChatGPT 订阅插件说明](../../packages/experimental/chatgpt-plan/README.zh.md) · [随附启动补丁](../../packages/experimental/chatgpt-plan/cordis.patch.yml)

如果你要的是让 DSH 直接操作 **ChatGPT 网页版**，仓库目前只有受控概念验证，生产使用尚未开放。常规 Web 设置没有这条路线的配置入口。[ChatGPT 网页版准入说明](../../packages/llm/llm/README.zh.md)

## 3. 发一条消息验收

1. 在 Web UI 中点击 **选择工作区**，添加并选中你的项目目录。
2. 新建会话，在输入框附近的模型选择器中确认提供方和模型。
3. 发出 `请只回复 OK`。收到回复即完成该模型的基本连通性验证。[选择工作区和运行会话](../user/guide/index.zh.md)

## 常见问题

| 现象 | 怎么处理 |
| --- | --- |
| 输入框不可用 | 先添加并选中一个工作区，再确认会话已选模型。 |
| 找不到模型或出现 `UNKNOWN_MODEL` | 确认已保存提供方。自定义网关要核对精确模型 ID，再从该提供方选择模型。 |
| `MISSING_CREDENTIAL` 或模型探测返回 `401` | 在模型设置里检查并重新保存该提供方的密钥。 |
| 网关探测列表为空 | 手动添加服务商给出的模型 ID 并保存。 |
| 没有 **使用 ChatGPT 登录** | 确认本次启动带有 D 节的补丁，且插件已构建。打开本次启动后终端打印的 Web 链接。 |

更详细的协议兼容与代理配置见 [模型排错指南](../user/guide/providers.zh.md)和 [网络代理指南](../user/guide/network-proxy.zh.md)。
