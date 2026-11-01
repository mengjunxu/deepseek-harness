# DSH 受控 Web PoC 准入提案

Status: APPROVED（2026-11-01 用户明确批准），实施中，尚未启用 DSH 实际请求。适用 WB-01 / VN4-06 的 DSH 最小接入；不是生产开放申请。

## 已验证的前提

参考隔离 DEV 的真实 Browser-only 往返和取消可运行。真实 DSH SDK profile 的负向探测在 Adapter I/O 前返回 PROVIDER_UNAVAILABLE，未记录 request/header 或模型回复，见 evidence/dsh-gated.json。当前 LLM 政策解析器和 Runtime 都硬性拒绝 chatgpt_web_unofficial 主动推理；单独改 availability 或 baseURL 无法完成接入。

## 拟实施范围

1. 复用既有 LLM 注册、ProviderPolicy、请求日志和 Session；为受控验证增加显式准入记录，不引入第二个 Registry、Harness 或账户 Store。
2. 准入只写入本地独立 PoC profile，绑定 chatgpt_web_unofficial 路线、明确模型、过期时间和有界调用数；默认配置无准入，仍 gated。到期、用尽、撤销、模型不匹配或普通生产 profile 都必须在 Adapter I/O 前拒绝；准备后才到期的请求也不得开始分派。
3. 通过独立 worker 复用参考 DEV 的进程内 handler / Browser Adapter，不启动其禁止的 Responses listener，不删除 purpose 校验。Browser-only 不提供本地工具，也不将其声明为 tools supported；不接入 Full Harness、MCP 或活动 Codex Host。
4. 将 DSH Session/Turn 与参考 thread/Turn 明确关联；保留 commentary、最终回答、错误和取消的区别。准入事实与实际费用来源可审计，不记录账户 Cookie、Token 或原始登录存储；不推定有已知余额。
5. 先完成拒绝路径、范围/到期/撤销、并发调用数与取消清理的 Mock/记录回放，再在用户已登录的隔离浏览器中完成受控 DSH 实际请求；只在对应验收通过后更新 Checklist。

## 需要用户确认的决定

是否允许新增上述显式、受限的实验准入能力，使本次独立 PoC profile 可以执行真实 Web 请求。用户此前的登录与参考验证授权不在本记录中改写为 DSH 的默认生产准入。获得确认前保持现有代码和生产门禁，不伪标 local/api_metered，也不使用无政策的虚拟路线绕过检查。

主计划第 15 节要求保持既有默认门禁并单独验收 DSH 接入；共享 WORKFLOW 第 2.3、4 节要求改变已确认约束前先明确提出并取得用户确认。本提案把参考网页可行性与 DSH 实验调用授权分开，后续具体类型/API 名称按已批准范围实施。
