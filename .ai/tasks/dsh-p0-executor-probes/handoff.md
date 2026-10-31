---
schema_version: 1
task_id: dsh-p0-executor-probes
state: DONE
previous_agent: Codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-10-30T00:57:28+08:00"
---

# Checkpoint

P0-04/05/06 收尾完成，主 Plan 六个 P0 项均 DONE，Gate 0 按技术可行性与明确 Mock 路线验收通过。P1 产品闭环与 UI/持久化/迁移/真实服务验收未完成。Codex 释放本任务写入权；未 Commit / Push。

## Delivered

- docs/workflows/DSH_IMPLEMENTATION_PLAN.md：第 12.1、12.7 节状态及 Gate 0 证据；第 13 节统一版本/能力矩阵、测试范围、技术栈/复用/状态/权限/失败实施基线。
- .ai/ARCHITECTURE.md：增加实施基线索引，仅指向证据，不把 proposed 目标当成 shipped 架构。
- 本 Task 的脚本、帮助、脱敏 Codely NDJSON 事件与 ACP 返回、源码 SHA-256、实际测试命令/结果位于 artifacts。无新增第三份有效规划文档，无业务源码修改；正式已实施 ADR 不变，新目标 ADR 保持 proposed。

## Actual verification

artifacts/evidence.json 记录完整命令：Codex real-product/subagent/cleanup 3 文件共 71 测试 PASS，Codex Loader 1 测试 PASS，Codely 本地执行器 3 测试 PASS。包固定产品 codex-cli 0.153.4 与主机 0.165.0-alpha.1.2 分列，后者未代替生产 Provider 测试。真实产品测试使用假密钥与 loopback Responses，覆盖成功、权限拒绝/套件临时目录绕过、失败、取消及全树清理；可选插件元数据请求曾输出无登录 401 日志，未据此声称全程零外网请求。

Codely 版本 1.0.0-nightly.53；隔离 HOME 的初次探测先观察 CUSTOM_AUTH 参数门禁，随后观察 Codely OAuth 前置门槛，零模型请求。用户明确授权本机已有登录环境后，原生 CLI 在临时 cwd 上连接 loopback chat/completions：成功返回 DSH_P0_OK、exit 0；401 输出 error/result error、exit 1；已收到挂起请求后 SIGTERM、exit -15、没有 success result。原生 stream-json 类型 init/message/error/result。首轮已登录探测虽成功但触发了继承配置的 next-speaker 辅助调用并报错；已显式关闭该判断、固定 flash 为本地模型后重跑三场景通过，最终每场景 1 次本地模型请求。未修改全局设置。raw stderr 不进入最终工件，仅保留受控诊断与事件。

ACP 实际 initialize protocolVersion=1 与 session/new 成功，loadSession=false。image/audio/embeddedContext、MCP http/sse 只按握手声明记录，未逐项验证；帮助中的 resume 参数不据此承诺续接。结束 ACP 进程后观察 SIGTERM 退出。

pnpm run verify-md-links PASS；git diff --check PASS；核对脚本确认六项勾选/DONE 与 smoke 结果及 ACP 能力一致。已有 test:docs/doc-sync 缺失配对、历史换行和生成目录/类型文档问题沿用前序记录，本轮不扩大修复或重跑。lint/全仓单测 NOT_RUN：未改业务源码，仅选择相关现有行为测试和链接检查。真实 OpenAI API Key 测试按用户免除，未进行该路线真实请求。

## Limits and next step

P0-06 定稿的是后续实现采用的复用/安全/状态基线与初版 ADR，不是宣告路由、无 Plan 任务、可跳过模型 Review 已上线。Codex/Codely 原生 resume、活动 Codex Native Host、Web 自动访问、Codely 真正文件工具审批、云模型端到端均未验证；这些限制由能力矩阵和后续 P1/VN4 工单承接。原生 Codely 的文本流不等于 DSH 已有统一流事件，DSH 本地适配器仍转发原始输出。

当前本轮只有文档与工件改动，源码摘要对应检查时 checkout；未指定允许的固定发布 ref，版本字段留空。保留前序未提交 docs/workflows/DSH_IMPLEMENTATION_PLAN.md 与 .ai/tasks/dsh-p0-status；未读取/复制凭据。后续用户授权 P1 后先领取 VN4-01/02，保留 API Key 用户免测要求，不自动进入 P1 或 Push。
