---
schema_version: 1
task_id: dsh-p1-provider-policy
state: DONE
previous_agent: Codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-10-30T01:12:20+08:00"
---

# Checkpoint

P1 首个实现切片完成并释放写入权；未 Commit / Push。用户此前授权继续进入 P1，本轮只领取 QR-01 元数据与准入部分。QR-01/VN4-01 仍 PARTIAL，VN4-02 TODO，意图/完整配置、额度政策和独立选择 UI 尚未实现。

## Changes

LLM 的 LlmProviderInfo 增加可选 policy，既有未声明适配器仍返回原元数据并保留路由行为。resolveProviderPolicy 解析配置、未知来源/能力/余额，拒绝未知值、缺失 gateReason、将实验来源设为 ready 等输入；注册拒绝 chatgpt_regular 主动推理路线。政策按注册代次复制/冻结，listProviders 返回深拷贝；实际 prepareCall 和直接 stream 在调用适配器前拒绝非 ready/实验来源。目录/不变量查询不被准入逻辑误拦，已准备调用保留原注册代次，不追溯撤销。

SIWC 通过现有 Provider 声明 work_codex_shared、streaming/tools 支持、vision/resume 不支持；structuredOutput 与余额 unknown。不是账户余额读取或意图路由政策。没有修改 GUI、代理循环、SessionEventMap 或 SDK 行为；无新 Registry、真实 Web、付费回退、真实 OpenAI API Key 调用。

README 与子系统双语文档、类型等价清单已同步。新 headless profile 场景通过日志中的 bash 发生点调用生产 LLM 准入：fixture 只替代不可调用的 gated 外部适配器，记录拒绝工具结果和最终 DONE。场景保留 V3 authored 输入并写 V4 当前输出，未覆盖任何已有 Session 代际。

## Verification

- PASS：pnpm exec vitest run packages/llm/llm/tests/provider-policy.spec.ts packages/llm/llm/tests/service.spec.ts packages/experimental/chatgpt-plan/tests/provider.spec.ts --reporter=dot，3 文件 115 项。
- PASS：DSH_SNAPSHOT=refresh pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t provider-policy-gated；最终去掉 DSH_SNAPSHOT 的同范围 keyless replay 1 场景通过。初次命令错误多传 -- 已中断；初次场景缺 header pin/replay overlay 及本机 native addon 未构建的问题已修复；按 native 文档执行 pnpm --dir native/system run build:native 成功，未改 native 源码。
- PASS：pnpm exec tsc -b packages/llm/llm/tsconfig.json packages/experimental/chatgpt-plan/tsconfig.host.json --pretty false；pnpm run lint（完整 Host tsc/打包与 contracts-ready lint）。全 Host 构建发现 fixture 的 unknown 参数未窄化，已修复并完整 lint 通过。
- PASS：pnpm run verify-export-jsdoc；pnpm run verify-type-equiv（469 主块及 469 成对派生）；3 组命名 verify-translation-pairing；pnpm run verify-client-ui-i18n；git diff --check。
- PASS：pnpm run gen-persistence-catalog 后 verify-persistence-catalog 与 verify-persistence-changes；62 roots match 7 history records。生成器仅更新 types.ts 来源行号、hash 不变，无 Session 格式/持久化类型变化，不创建虚假迁移记录。
- FAIL（已记录既有债务）：最终 pnpm run test:docs 为 18 PASS / 2 FAIL（旧输入配对与硬换行）。首次 17/3 中新增类型等价漂移已修复并单独复验通过。
- FAIL：pnpm run doc-sync 为 31 PASS / 11 FAIL；除既有类型文档/目录、配对/硬换行失败外，本轮曾报类型等价漂移和来源行号导致的 persistence freshness/history，均已生成/修复并用对应检查单独复验通过；未伪称全仓 doc-sync 通过。

## Next step and Git

主 Plan 第 14 节记录当前范围。下一工单应接入 Provider 政策配置与意图输入，再做 QR-02/03 及 VN4-02 独立选择；不要把元数据解析器当作预算/用户同意或 GUI 功能。无 GUI 行为变化，本轮不需 GIF；下一次改选择器必须补真实 profile UI 验收和 GIF。新目标 ADR 保留 proposed；未修改既有正式决策。

保留前序 P0 未提交主 Plan、.ai/ARCHITECTURE 与两个 Task；本轮相关包、文档、manifest、新 snapshot 及本 Task 为当前改动。无允许的固定发布 ref，版本字段留空，证据用源码摘要。API Key 真实验证仍按用户免测。
