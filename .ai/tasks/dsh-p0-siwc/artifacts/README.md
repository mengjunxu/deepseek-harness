# SIWC P0 probe

Run from the repository root after installing its existing pnpm dependencies:

```sh
node .ai/tasks/dsh-p0-siwc/artifacts/siwc-probe.mjs
```

The probe uses the installed transitive `jose` dependency for OpenID Connect signature verification. It prints a loopback origin; open that origin in the system browser and choose Continue with ChatGPT. The server expires after 30 minutes; stop it after receiving the inference result. The probe queries the account model list and sends one synthetic prompt to its first visible model. The 2026-10-23 run selected `gpt-6.1-sol`.

Host and registration records and validated credentials are stored under `~/.config/deepseek-harness/siwc-p0/` with directory mode `0700` and file mode `0600`. Reauthorization reuses this host ID and issued client ID. The probe does not refresh or revoke tokens. Disconnect DeepSeek Harness in ChatGPT settings to withdraw access. Do not copy credentials into this directory or logs.

[siwc-result.json](siwc-result.json) contains the sanitized live result and source digests. The retained script only narrows usage reporting to aggregate counts after the live run; it preserves the tested authorization and inference requests. A new probe run replaces the result file. This diagnostic does not exercise the DSH Provider or Session services.
