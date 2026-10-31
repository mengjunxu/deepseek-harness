---
schema_version: 1
task_id: dsh-p1-provider-config
state: DONE
previous_agent: Codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-10-31T00:24:41+08:00"
---

# Checkpoint

本 Task 完成并释放写入权；未 Commit / Push。当前工作区仍包含前序 P0 与 Provider 元数据任务成果，另有用户 `.codely-cli/settings.json` 修改，本轮未读取或改动。没有可固定引用的发布 ref，被测源码与 fixture 指纹见 evidence/source-sha256.txt；Git 分支仅用于定位现场。

## Completed

共享 LlmProviderPolicyInput / ProviderPolicySchema 接入 pi-ai 的 providers.<route>.policy，resolveProviderPolicy 仍负责跨字段验证。policy 省略时保持省略，不推断用量来源或能力。配置加载和设置更新在发布前验证；policy 进入注册事实，变更更新注册代次。gated 路线可查询，新 prepareCall/直接 stream 在适配器 I/O 前拒绝；旧 prepared call 仍使用旧政策与端点。非法更新不改变原配置或注册状态。余额只允许 unknown，实验 Web 来源不能声明 ready。

新测试覆盖部分配置、非法声明、热更新、零网络拒绝、原代次调用、重新开放、拒绝更新后的配置不变。修正 adapter.spec 中针对既有公开历史/流转换函数的过期断言，未增加其生产导出。新 headless Session 场景使用真实 pi-ai 配置插件，通过记录中的工具调用验收准入；只替代模型响应并拦截 fixture 工具。保留 authored V3 输入和新 V4 输出，无已提交代际覆盖。

README、LLM 子系统双语类型、type-equiv manifest、配置与持久化目录、主 Plan 第 14 节和架构索引已同步。持久化生成仅更新来源行号，没有 Session 格式或类型语义变化。沿用已有扩展点，未改变正式 ADR；Memory 无新增跨任务知识，无需更新。

## Verification

详见 evidence/verification.md。100 个定向测试、最终相关两文件复验、2 个 keyless Session 回放、目标 tsc、完整 lint、导出 JSDoc、470 组类型等价、5 组命名双语配对与配置目录 freshness 通过。doc-sync 内 persistence catalog/history 通过。

全仓 test:docs 为 18 PASS / 2 FAIL；doc-sync 为 35 PASS / 7 FAIL。新增测试的类型错误已修复并由完整 Host 构建通过；doc-typecheck:contracts-ready 复验只报告 docs/legacy 代码块错误。其余失败为既有 ChatgptPlanState 类型链接、Client/插件目录、历史与输入文档配对/换行。没有将全仓文档门禁标为通过。

## Remaining and next step

QR-01 / VN4-01 仍 PARTIAL，VN4-02 TODO。下一步给既有请求/路由机制接入可记录的意图输入，显式选择每种意图的 Provider，拒绝能力不匹配且不静默跨源/付费回退；随后实现 Provider/Executor/Workflow 独立选择 UI。额度预留/结算、通用执行器生命周期、SIWC 剩余验收也未在此 Task 完成。

无 GUI 或模型请求内容变化，无需新增 GIF 或 SDK 输出。OpenAI API Key 真实验证继续按用户要求免测；本轮仅本地模拟 HTTP，未访问真实 Web、登录或外部模型服务。不要重复 P0 smoke，不覆盖用户设置。所有修改仅在本地，未提交或推送。
