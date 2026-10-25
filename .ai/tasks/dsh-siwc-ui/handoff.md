---
schema_version: 1
task_id: dsh-siwc-ui
state: IN_PROGRESS
previous_agent: codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-10-26T02:27:41+08:00"
---

# Checkpoint

实验集成已保存为本地检查点提交，用户现授权将后续修复与计划/证据一并本地提交；本任务保持 IN_PROGRESS。当前已有真实会话 completed 证据，但完整验收尚缺。新计划将本任务归为 P1-05 Partial，额度政策进入待批准的 CG1；提交不代表产品验收完成，不 Push。

## Implemented

- `packages/experimental/chatgpt-plan/`：显式启用的 Host/Client 实验插件，复用 authorization、credentials、LLM、Remote 和 Models 设置扩展；实现 PKCE、OIDC 校验、凭据刷新、撤销、安全状态投影与账户模型目录。
- 设置页包含登录、取消、账户状态、使用说明及使用量入口；会话显示订阅标识，文案归本地化字典所有。
- Responses 适配复用 pi-ai 历史和流转换；相关导出及双语说明位于 `packages/llm/llm-pi-ai/`。
- 根 TypeScript 配置、锁文件新增实验包接入。锁文件仅保留新增 importer，排除安装导致的其他依赖变更。
- 前序修复后的 19 个定向测试覆盖授权、权限、取消、刷新、目录、流输出、撤销、限流诊断、超时/断流和 UI 状态。Host/Client 类型检查、局部 lint、Host 构建通过；本轮文档审计未重跑产品检查。准确命令与真实范围见 [Plan](plan.md)。
- 本地真实 Session 在本次计划审计时已有三个 completed 轮次，另有 ABORTED / RATE_LIMIT 失败；前序修复仍缺系统性真实长回复/完整生命周期验证。脱敏计数和源码摘要见[审计证据](../dsh-chatgpt-plan-update/artifacts/audit-evidence.json)。SIWC 使用 `work_codex_shared`；UsageSource 类型、按意图路由、额度保护和 Ledger 尚未实现，见[增量计划](../../../docs/workflows/DSH_IMPLEMENTATION_PLAN.md)。

## Unfinished and risks

- 2026-10-26（目录限流）：用户截图明确 `/v1/models` 429。PlanAdapter.resolveModel 每次推理都查询目录且要求成员资格，违背 LlmAdapter 的 advisory catalog 约定。已改为本地解析选定模型 ID 与已知文本/容量元数据，不改设置页目录查询，也不跳过推理凭据与服务端权限校验。负向回归确认旧实现失败，新实现只发一次 `/responses` 且成功；19 测试、类型、lint、配对和 Host 构建通过。重启后真实验证仍待完成；未 Commit / Push。

- 2026-10-26（流式超时）：本地真实 Session 已有两轮 completed，第三轮约 120.8 秒后缺少终止事件且 ABORTED。根因符合插件默认 120 秒整轮超时。默认期限改为 600 秒，期限触发报告 TIMEOUT，主动取消及真正断流分别保持 ABORTED / TRANSPORT。19 定向测试、包类型检查、lint、双语配对与 Host 重建通过。真实长回复重试、Session 快照、GIF 等整体验收仍待完成；未 Commit / Push。

- 2026-10-26：用户确认 ChatGPT Usage 仍有余额。本地 Session 记录只含 HTTP 429 / QUOTA；`jsonRequest` 把全部 429 映射成额度不足且丢弃正文，流适配还把额度查询不可用映射成 QUOTA。已区分 RATE_LIMIT / 明确 QUOTA / SERVER，并保留账户请求路径、状态、可用请求 ID 与正文。16 个定向测试、包类型检查、lint、双语配对和 Host 构建通过。重启后真实重试才能判断原始服务端原因；未 Commit / Push。

- 2026-10-25 用户真实运行到达 Responses API，但因命名空间缺少 `description` 返回 400。已补字段，实际 HTTP 回归、11 个定向测试、包类型检查、局部 lint 与双语配对通过，Host 插件已重建。需重启服务后再次真实验证；本轮未使用账户额度。修改留在本地，未 Commit / Push；其余验收待办保持不变。

- 早期“仍等待授权”的观察已被真实会话成功证据补充；完整 UI 授权展示/重启复用和网络生命周期仍未验收。独立探测属于 `dsh-p0-siwc`，不能替代产品验收。
- Session 快照、Web 回放、真实对话/GIF、重启凭据复用和完整文档检查尚未完成；撤销和卸载的定向覆盖不能替代真实网络生命周期验收。
- 继续审查目录请求、凭据刷新与插件卸载的取消和等待语义，补充相应测试。
- 测试服务启动后源码包含额外修正，包括退出时写入无 Token 的 signed-out 记录；旧服务未保证使用最新构建，恢复时先检查或重建，不能用旧进程验收当前源码。
- 仅支持文本、一个账户和插件级上下文容量配置；显式 reasoning、temperature、输出上限和 stop 被拒绝。
- P0-03 的 API Key 路线状态不变；本任务未将其标为完成。

## Recovery

先核对 Git、本记录与主计划 CG0–CG5 的阶段授权。已有本地修复应在正确构建的服务上验收；不要重做独立探测来代替真实产品测试。完成剩余 Loader/Session 快照、真实长回复、重启复用与 GIF，再评估 P1-05 是否满足验收；本次只合并计划，不自动进入 QR-01。

原有改动包括共享规则、Codely 配置、P0 基线/SIWC 探测、`docs/dsh/`、两个 DSH 工作流文档及 OpenAI 路由矩阵测试。这些文件不属于本次 SIWC UI 检查点。
