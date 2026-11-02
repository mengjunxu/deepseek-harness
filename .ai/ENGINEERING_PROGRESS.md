# DSH ChatGPT 集成工程进度总结（截至 2026-11-02）

本文件是[主实施计划](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md)第 12 节 Checklist 与各任务记录的人工可读叙事投影，回答"完成了什么、已经可以使用什么"。状态权威始终以主计划第 12 节与对应任务记录为准，本文件不另建状态体系；每次重要里程碑后更新本文件。

## 工程目标

按 vNext.4 计划把 ChatGPT 系能力接入 DeepSeek Harness 作为可控的模型 Provider 与执行器：政策与费用门禁（QR 系列）、SIWC 登录链路、显式意图路由、Web ChatGPT Provider 验证，最终收敛到 P1/V0 的任务化产品闭环与后续多机执行（P2/P3）。

## 已完成（均有任务记录与验证证据）

P0 基线与可行性（2026-10-30 收尾，6 项全 DONE，Gate 0 通过）：仓库审计与能力对照（P0-01）、MockModel Gateway 正常流/工具调用/失败/断流 78 项测试（P0-02）、OpenAI 路线可行性（API Key 按用户要求免测；SIWC 独立探测完成，P0-03）、Codely 本机执行器探测含 ACP 握手（P0-04）、Codex 本机 app-server 探测 71 项测试（P0-05）、实施基线与 proposed ADR（P0-06）。证据在 .ai/tasks/dsh-p0-baseline、dsh-p0-status、dsh-p0-siwc、dsh-p0-executor-probes 及 docs/legacy/dsh/spikes/。

计划整合（CG-00 DONE）：新旧计划审计合并、vNext.4 增量、Gap Matrix 与文档验收；后续按 QR/VN4 编号推进。

Provider 政策与意图路由（QR-01 DONE；QR-03 PARTIAL）：LlmProviderInfo.policy、usageSource 分类（SIWC 为 work_codex_shared、Web 为 chatgpt_web_unofficial、官方网页为 chatgpt_regular）、能力三态与 unknown 余额语义、pi-ai 政策配置（QR-01，三个任务 dsh-p1-provider-policy / dsh-p1-provider-config / dsh-p1-intent-routing）；opt-in 的 chat/plan/review/execute 显式 Provider/model 路由、能力不匹配拒绝、失败不隐式跨路线已实现并有四个 keyless 快照（snapshots/sdk/intent-routing-chat / -plan / -execute / -review）。QR-03 剩余：QR-02 双模式接入、精确模型能力匹配与完整 Gate。

Web ChatGPT Provider 验证（WB-01 / VN4-06 DONE，2026-11-01 至 11-02）：受限验证准入 LlmValidationAdmission 绑定隔离 home、单一 gated 路线、模型允许表、到期与准备预算，失败尝试同样消费预算，替换不续额、撤销阻止已准备调用（118 项聚焦测试 + keyless 快照 web-validation-admission）；独立 Bun worker 复用参考 transport 进程内 handler（不启动其禁止的 Responses listener），桥接 Adapter fixture 把 worker NDJSON 映射为 DSH 流协议并保持 commentary/最终文本/错误/取消区别；经用户批准完成一次真实浏览器请求：唯一标记精确回显、Responses completed、真实 usage（参考 estimated 口径）、无本地工具、干净清理。生产默认门禁全程保持有效。证据在 .ai/tasks/dsh-web-provider-poc/（含 evidence/ 与 summary.md）。

协作与流程：WORKFLOW 增量 Checkpoint 规范与 Codex 五小时额度停止线合入（dsh-incremental-handoff DONE）；共享 Memory 沉淀了参考 transport 约束、built 运行时 type-stripping/patch 路径解析、console 噪音等工程结论。

## 已经可以使用

产品本体照常可用：dsh web（默认 3080 端口）、Electron 桌面、headless 一次性执行、TypeScript/Python SDK 等既有功能本轮未改动，全部照旧。

本轮工程新增、现在即可使用的能力：Provider 政策解析与 gated 生产门禁（普通注册对 chatgpt_web_unofficial 一律拒绝，负向探测有证据，生产安全语义已在运行时生效）；显式意图路由（opt-in chat/plan/review/execute 的显式 Provider/model 选择与能力校验，失败不隐式跨路线）；受限验证准入 API（registerAdapter 的可选授权参数，在隔离 Harness home 里可立即用于受控 Web 真实验证）；Web PoC 桥与验证驱动（.ai/tasks/dsh-web-provider-poc/artifacts/ 的 worker、适配器层 18 项检查与运行时 Mock/真实请求驱动脚本，可复用做后续受控验证，前置为参考 launcher 运行且已登录、用户批准、maxCalls=1 准入）；测试与回归基建（llm-mock-server 24 种行为、llm-retry transport 恢复套件、五个新增 keyless 快照进 CI 可回放）。

实验性可用、未过产品验收（可试用，不承诺产品级）：chatgpt-plan 实验包与 SIWC 登录链路——SIWC 独立探测已完成，SIWC UI 产品集成任务（dsh-siwc-ui）仍为 IN_PROGRESS，VN4-05 的三条产品链未验收。

明确不可用（边界）：Web Provider 未产品化（无 UI、无配置入口、无 Session 级取消；shipped profile 中 Web 路线保持 gated，开放需 M2 产品化与生产准入决策）；费用与预算系统未建（QR-02/QR-04/QR-05/QR-06 均 TODO，CG1 Gate 未实施）；V0 产品闭环未达成（P1-01..12 为既有源码基础 PARTIAL，P1-13 TODO，统一 TaskSpec/Task API/Task UI 未闭环，V0 Gate 未过）；P2 记忆与 Artifact、P3 多机执行未启动；VN4-10 Codex Native Host BLOCKED。

## 证据索引

P0 基线与探测：.ai/tasks/dsh-p0-baseline/、dsh-p0-status/、dsh-p0-siwc/、dsh-p0-executor-probes/。Provider 政策与路由：.ai/tasks/dsh-p1-provider-policy/、dsh-p1-provider-config/、dsh-p1-intent-routing/。SIWC 产品集成（进行中）：.ai/tasks/dsh-siwc-ui/。Web Provider 验证：.ai/tasks/dsh-web-provider-poc/（任务四文件 + evidence/ + summary.md）。共享规则：.ai/tasks/dsh-incremental-handoff/。历史规划与审计：.ai/tasks/dsh-chatgpt-plan-update/、dsh-vnext4-audit/、docs/legacy/。

## 当前状态与下一步候选

Git：分支 codely_bridge 领先 origin 3 个 commit（含本轮两个新提交），未推送；工作区仅剩用户个人 .codely-cli/settings.json 未提交。环境：隔离 DEV launcher 运行中（本机 pid 66262，登录态经 2026-11-02 真实请求验证有效）；参考源码、Bun 工具与私有浏览器数据均在忽略目录，不随 git 提交。

下一步候选（由用户决定优先级）：QR-02（Auth/Provider/Executor/费用来源分离，QR-03 完整 Gate 的前置）→ QR-03 收尾 → CG1 Gate；或按第 15 节推进 Web Provider 的 M2 产品化与生产准入申请；或继续 dsh-siwc-ui 的 SIWC 产品集成；或回补 P1/V0 产品闭环（TaskSpec、统一 Task API 与验收 UI）。
