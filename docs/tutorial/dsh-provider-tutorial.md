# Configure DSH model providers on Windows

English | [中文](dsh-provider-tutorial.zh.md)

Launch DSH from PowerShell, connect DeepSeek, the OpenAI API, a custom gateway, or your ChatGPT plan in Web settings, then send a test message to check that the model responds.

## 1. Start DSH Web

In PowerShell, open the root of the built DSH checkout and start the Web UI.

```powershell
pnpm dsh web
```

For a fresh checkout, run `pnpm install --frozen-lockfile` and `pnpm run build` from the repository root before starting the server. Keep the terminal running and open the URL it prints. The default address is `http://127.0.0.1:3080`. To use another port, stop the current server and run `pnpm dsh web --port 3090`. [Running from source](../../README.md) · [Web CLI options](../../apps/cli/reference/README.md)

## 2. Choose a provider

Choose the option for the provider you want to use in your session.

### A. DeepSeek API

1. Open **Settings → Models**.
2. Enter your DeepSeek API key in the **DeepSeek** card and save it.
3. Return to the session and select a DeepSeek model in the model picker.

### B. OpenAI API or another catalog provider

1. Open **Settings → Models → Add model provider**.
2. Under **Third-party model provider**, select a service. OpenAI uses `openai`, Anthropic uses `anthropic`, Kimi uses `moonshotai`, and GLM uses `zai`.
3. Enter the service's **API key** and save it. The built-in catalog supplies the default endpoint, protocol, and model options.
4. Return to the session and select a model from the provider you just configured.

This OpenAI route uses an OpenAI API key. For ChatGPT plan sign-in, follow section D. [Model configuration guide and screenshots](../user/guide/providers.md)

### C. Custom API gateway or local model server

Open **Settings → Models → Add model provider → Custom model API** and enter the connection details from the service. The URL and model ID below are placeholders.

| Field | What to enter |
| --- | --- |
| Provider ID | Enter a unique lowercase ID such as `my-gateway`. Sessions and model defaults reference this ID, so confirm it before saving. |
| Display name | Enter a recognizable name such as `My model gateway`. |
| Base URL | Enter the API base URL from the service, such as `https://gateway.example.com/v1`. DSH appends the request path for the selected protocol. |
| API protocol | Use the gateway's documentation to choose **OpenAI Chat Completions**, **OpenAI Responses**, or **Anthropic Messages**. |
| API key | If the service requires authentication, enter the key it issued. |
| Model catalog | Enter the exact model ID the gateway accepts. You can also click **Fetch available models**, select models, and click **Add selected**. |

Save the provider, then return to the session and select a model. If the gateway does not expose a compatible model list, enter the model ID manually. [Custom API form and model discovery](../user/guide/providers.md)

### D. Sign in with a ChatGPT plan (experimental SIWC plugin)

1. Press **Ctrl+C** in the terminal running DSH to stop the Web server.
2. From the repository root, restart the server with the supplied patch.

   ```powershell
   pnpm dsh web --patch packages/experimental/chatgpt-plan/cordis.patch.yml
   ```

3. Open the Web URL printed in the terminal and go to **Settings → Models → Continue with ChatGPT**.
4. Click **Open sign-in page** and complete authorization in the browser. Return to DSH, wait for the settings card to show the connected account, then select one of the account's models in the session's model picker.

This experimental route sends requests through the Responses API and draws from shared Codex / ChatGPT Work usage. Available models depend on the account. The plugin accepts text input. [ChatGPT plan plugin](../../packages/experimental/chatgpt-plan/README.md) · [Supplied launch patch](../../packages/experimental/chatgpt-plan/cordis.patch.yml)

Direct DSH access to the **ChatGPT website** has only been exercised in a controlled proof of concept. Production access remains gated, and the standard Web settings have no setup entry for this route. [ChatGPT website admission](../../packages/llm/llm/README.md)

## 3. Send a test message

1. In the Web UI, click **Choose workspace**, then add and select your project directory.
2. Start a new session and confirm the provider and model in the picker next to the input box.
3. Send `Reply only with OK`. A reply confirms that the selected model can receive and answer a request. [Selecting a workspace and running a session](../user/guide/index.md)

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| The input box is disabled | Add and select a workspace, then make sure the session has a model selected. |
| A model is missing or DSH reports `UNKNOWN_MODEL` | Check that you saved the provider. For a custom gateway, check the exact model ID and select it under that provider. |
| `MISSING_CREDENTIAL` or model discovery returns `401` | Check and save the provider's API key in model settings. |
| The gateway returns an empty model list | Add the exact model ID supplied by the service and save the provider. |
| **Continue with ChatGPT** is missing | Make sure you started DSH with the patch in section D and that the plugin is built. Open the URL printed by that launch. |

For protocol compatibility and proxy setup, see the [model troubleshooting guide](../user/guide/providers.md) and [network proxy guide](../user/guide/network-proxy.md).
