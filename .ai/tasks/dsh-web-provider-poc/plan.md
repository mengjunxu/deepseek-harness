# Execution Plan

1. [x] 浏览器/参考运行时接入：确认版本、隔离方式、登录条件与可运行入口。
2. [x] 实际最小往返：唯一文本标记、模型与提交证据、回复和终态；Manual 独立记录。
3. [x] DSH 最小接入：既有 LLM/Session 服务、请求关联、能力和准入，不复制第二个 Harness。
4. [x] 生命周期与结论：取消、错误、超时和不确定提交；补检查并保存 Checkpoint/Checklist。

当前步骤：1–3 DONE。4 的真实完成路径与真实提交前失败路径有 Session 级证据（三次提交前失败 + 一次成功），参考取消切片 DONE，适配器层取消/清理 DONE；Session 级取消无 SDK wire-level cancel 入口（文档明确），该子项止步适配器层并如实记录。DSH 实际接入验收材料齐备，主计划 WB-01 / VN4-06 是否打勾由用户确认后更新。

## Step 4a / DSH 负向验证 — DONE

cancel 与 cancel-generating 模式均退出 0：分别在最终回答首段后和生成 trace 后触发 AbortSignal，终态为 response.failed，没有 response.completed，清理后 activeTurns=0。前一种可能发生于网页已生成完整答案后；后一种没有最终回答 delta。仅验证客户端终态/本地清理，不推定服务端终止生成或额度返还。未对已接受或不确定提交自动重发。

运行 artifacts/dsh-gated-probe.py：通过真实构建的 dsh CLI / sdk profile 挂载 chatgpt_web_unofficial / gated 路线，返回 PROVIDER_UNAVAILABLE，空 request/header 和空回复；退出 0。DSH 默认保护没有因为参考浏览器成功而失效。

检查 PASS：本轮 7 份 Markdown 定向检查、verify-md-links（2321 文件）、verify-repository-references、verify-doc-budgets（8 文件）、Python py_compile、脱敏证据断言、凭据模式扫描和 git diff --check。未改 packages，未重复既有通过的产品测试或 full doc-sync/test:docs；既有未配对 Plan/legacy 和硬换行问题保持单列。具体命令见 Log。

## Step 1a — DONE

锁定参考源码 6.1.17，使用本地忽略目录中的 Bun 1.4.0，分别以 frozen lockfile / ignore scripts 安装参考根目录和 launcher 依赖，再显式安装 Electron 42.11.16 二进制。browser-helper 构建与 launcher 类型检查/Vite 构建 PASS。参考 launcher profile 三项测试与根目录 dev-profile、browser-worker-contract 两文件 153 项测试 PASS，共 156 项；这些是参考测试，不是 DSH 或真实账号收发验收。

启动入口为本地 `.artifacts/cgw-launch-dev.py --detach`，仅启动 `--dev-profile`，数据归属 `.artifacts/cgw-dev-runtime`；脱敏环境不含 Harness 模型密钥。中断前前台进程已退出，本轮恢复为独立进程。`dev status --json` 实测 development / running、configured=false、MCP 不需要、Bigger Context=false。源检出 Git 状态干净，未改外部源码或锁文件；没有全局配置注入、Responses listener 或系统服务。

## Step 1b — DONE

用户亲自完成账号登录，CUA 确认已登录，启动器重新探测后显示 Signed in。真实 smoke 新页面遇到的 Cloudflare 验证由用户亲自完成，Agent 未操作验证码。初始化后 dev status --json 显示 development / configured=true / browser-only / purpose=dev-harness，MCP not required。

## Step 2a — 参考 smoke DONE

CUA 启动 launcher 自带的真实 smoke，页面提交 `Reply with exactly: CODEX WEB GPT READY`，返回完全相同标记；页面模型选择显示 `5.6 High`，Response complete 与启动器 Smoke test passed 一致。该探测由参考 worker 自动收发，不是手动粘贴模型回复。它尚不是 DSH Adapter 接入，不推定 GPT-6、其他 effort 或完整产品化成功；流式粒度与取消仍需独立证据。

## Integration constraint

参考 startServer 明确拒绝 dev-harness 配置启动 Responses listener；不能删除 purpose 或改 profile 来绕过。DEV driver 使用进程内 responseRequest 与真实 Browser Adapter，因此 DSH 接入需要显式传输设计，不能把 DEV 当可直接配置的 OpenAI baseURL。DSH ProviderPolicy 对 chatgpt_web_unofficial ready 的拒绝保持有效；不会用 local/api_metered 标记真实浏览器请求。

## Step 2b — DONE

参考 DEV CLI 的唯一标记请求退出 0，日志记录 modelFamily=5.6 / effort=high、submission accepted / generation_running、最终浏览器 outcome=final。下划线标记在原始 Markdown 中被转义，未将原始字节与页面渲染文本混同。

`artifacts/reference-request-probe.ts` 复用参考的真实 responseRequest / Browser Adapter，在 DEV 进程内请求，无 Responses 监听器。最终 stream 探测 PASS：HTTP 200、唯一纯字母数字标记精确匹配、response.completed、清理后 activeTurns=0，见 `evidence/reference-stream.json`。本例仅观察到一个最终回答 text delta；支持 SSE 事件不等于已验证多段渐进输出或其他模型/effort。

前置探测曾因缺少消息的 current-turn metadata 被同步拒绝，证据 `reference-preflight-rejection.json`；加入与线程/Turn 一致的消息元数据后才实际提交。首个成功收发的流探测把 commentary 与最终回答合并导致验收脚本退出 1，原样保留 `reference-stream-unclassified.json`；修正 phase 分类后重新验证 PASS。取消探测只在最终回答 text delta 后触发，不能将参考注入的 commentary 当成已提交后生成证据。

## Approved Step 3a — Implementation checkpoint

用户已批准受限准入。现有 registerAdapter 增加仅进程内的可选授权；绑定实际独立 home、单路线和模型，准备时原子消费有界额度，过期/替换/释放使未开始分派失效。默认政策解析器不变。新增及既有政策测试 25 项 PASS，包 tsc 构建 PASS，llm 定向 tsdown 构建 PASS；后续有 home 存在性与 JSDoc 小修，须再跑相关测试和类型检查。实际 DSH 模型请求、记录回放与完整质量检查仍待执行，未标完成。Memory 没有新增跨任务结论，WORKFLOW 无需修改。

## Step 3a — DONE / 3b pending

受限注册授权已实现并通过 118 项聚焦测试，SDK web-validation-admission 记录刷新及最终构建回放通过；llm 包 tsc 和定向 tsdown 通过，范围 oxlint、导出 JSDoc、2 组配对和链接检查通过。源码与 README/子系统文档同步，生成 Cordis 目录所需的既有 SIWC 服务/类型归属缺项已补齐。真实 DSH worker 尚未实现或启动，步骤 3b 与真实生命周期仍 TODO；Web 总体验收保持未勾选。

## Stop checkpoint

额度 14% 触发停止。最终 Python 双调用 Mock 暴露并修复 prepareCall 的拒绝码投影；修复后包 tsc、定向 bundle、118 项测试、Python 首次成功/第二次额度拒绝及目录生成通过。最终修复后全仓 lint、SDK replay、配对检查尚未重跑；不冒称最终所有门禁通过。步骤 3b 未实现，真实 DSH Web 请求 NOT_RUN。

## 2026-11-02 — 剩余验证补齐 / 3b 进行中

Codely 接手单写入权（见 task.md Takeover）。最终修复后未重跑的三项检查已全部 PASS：全仓 lint（5060 文件 0 警告 0 错误）、SDK web-validation-admission keyless 回放、两组双语配对；命令与证据见 Log。

3b Mock 部分完成：独立 worker（Bun 子进程承载参考进程内 transport，mock 场景不触碰浏览器）+ 受限准入注册的桥接 Adapter fixture + 禁用本地工具的运行时 patch 已实现。适配器层 18 项验证全 PASS（wire 往返、取消、失败映射、子进程清理）；运行时层经真实 built sdk profile 验证 PASS（完成路径逐字回显、二次调用 VALIDATION_ADMISSION_DENIED、mock-rejected 的 turn/end 携带失败事实、request/header 无本地工具、threadId/turnId 关联真实 message id、attribution UA 上 wire）。证据见 Log 与 evidence/dsh-web-bridge-mock.json。

3b 剩余：一次真实浏览器请求（经用户确认后执行，scenario=real，maxCalls=1）；随后收尾门禁（全仓 lint 复跑含新 fixture）与最终 Checkpoint。取消证据限于适配器层（Python/TS SDK 无 wire-level cancel）。
