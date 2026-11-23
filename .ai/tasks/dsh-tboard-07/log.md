# 执行记录

2026-11-22T13:09:36Z，接续已验收的 TBOARD-06。`codely_bridge` 本地单写权仍由 Codex 持有。桌面 Codex 10080 分钟窗口剩余 66%，11 月 24 日 17:34:52（上海）重置。

2026-11-22T13:31:26Z，PASS `/opt/homebrew/bin/node apps/web/tests/fixtures/taskboard-smoke.mjs --browser` 与 `--browser-run`。测试分别覆盖项目编辑和正式 SDK 请求与人工验收，模型指向隔离的本机确定性服务。桌面 Codex 10080 分钟窗口剩余 65%，11 月 24 日 17:34:52（上海）重置。

2026-11-22T13:41:36Z，12 项认证 Web 测试通过，GUI 9,344 项通过、1 项跳过。核对键盘排序、中文深色窄屏、英文刷新和正式 SDK 的问答、审批及人工验收。当前环境无 DeepSeek API 密钥，真实模型演示留给 TBOARD-09。[验收证据](evidence/macos-web.json)。桌面 Codex 周额度剩余 65%。下一步 [TBOARD-08](../dsh-tboard-08/plan.md)。
