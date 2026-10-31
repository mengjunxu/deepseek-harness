---
schema_version: 1
task_id: dsh-p1-intent-routing
state: DONE
previous_agent: Codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-10-31T01:17:32+08:00"
---

# Checkpoint

本 Task 已完成并释放写入权，未 Commit / Push。Codex 在用户继续授权下为唯一写入者；保留全部前序 P0/P1 未提交成果。用户 .codely-cli/settings.json 从未读取、改动或纳入任务。当前验证源码/fixture 指纹见 evidence/source-sha256.txt，固定发布 ref 留空，分支名不作为固定版本证据。

## Completed

LLM 增加 LlmRequestIntent、LlmProviderCapability，以及 LlmCallConfig/GenerateOptions 的可选 intent、requiredCapabilities。既有 request/header 自动记录这些字段，callConfigEquals 与 prepared call 防止分派前更改政策。准备调用和直接分派在适配器准备前拒绝 unknown/unsupported 的要求。携带政策的缺失 Provider 返回 POLICY_ROUTE_UNAVAILABLE；循环不再以其原有 NO_ADAPTER 虚拟路线分支跳过该准入。无政策的旧调用保留原语义。新增循环回归确认不进入中间件、不记录已准入请求头。未修改循环实现。

可选插件 @deepseek-ai/dsh-agent-default-model/intent-routing 要求完整、显式的四意图 Provider/model 配置，使用既有提示词与 agent/request 瀑布流。每个 Turn 按取消信号身份捕获一份不可变选择，跨异步组装及后续 step 保持同一配置，下一 Turn 读取更新。它拥有所在作用域的模型选择权，覆盖入口选择；不是交互式选择器集成，不自动猜测文本意图、不调用额外分类模型、不启动外部 Executor、不隐式改用其他路线。能力声明仅是 Provider 级要求，不是精确模型能力矩阵、认证或预算同意。

持久化读取方校验意图和能力枚举。新增同版本兼容记录 docs/persistence-changes/2026-10-31-request-intent-policy.md 及其双语/完整 schema，仅 event:request/header 新增两个可选字段，不提升 Session 格式，也未改写任何已提交的 Session 代际。新 SDK 场景保留 authored V3 输入、新写 V4 输出和 SDK wire goldens；Python SDK 选择最高 Session 代际，使用生产 dsh sdk profile 与构建后的回放插件验证同四条路线。无真实模型请求。

README、Core/LLM 子系统类型、类型等价清单、持久化目录与格式索引、源码别名、主 Plan/Checklist 第 14 节及架构索引同步。新 subpath 直接发布独立 ESM 编译文件，已做 NodeNext consumer 和 Node 导入验证。源码别名放在 tsconfig.base.json 的手写区，生成区不接受自定义 subpath。沿用既有架构与决策；无新增独立 Registry、Store 或 Agent Loop，不提升整份 proposed ADR 的状态，Memory 没有新增独立事实。

## Verification

207 个六文件定向测试，加 1 个循环拒绝回归，共 208 个唯一用例通过。TypeScript SDK 四场景刷新/最终 keyless 回放、Python SDK 四个真实 profile 场景通过。完整 lint（Host tsc/打包及 lint）、目标 tsc、NodeNext consumer、built subpath smoke、publint（仅既有 src/* 警告）、导出 JSDoc、475 组类型等价、7 对命名双语、持久化 62 roots / 8 records、目录 freshness、源码别名与格式引用检查通过。详情为 evidence/verification.md。

全仓 test:docs 实际为 17 PASS / 3 FAIL，doc-sync 为 33 PASS / 9 FAIL。两项本轮新增 freshness 失败（格式引用索引、源码别名）已生成修复并单独复验通过；其余为既有历史/输入文档的配对、硬换行、legacy 代码块，以及 ChatgptPlanState 类型链接、Client 和插件目录问题。没有伪称全仓文档门禁通过。NodeNext 和 built smoke 不等于整个 hygiene、独立 exe 或跨平台矩阵验证。

## Remaining and next step

QR-01 DONE。QR-03 与 VN4-01 仍 PARTIAL，VN4-02 TODO；整个 P1/CG1 Gate 未完成。下一步先补 QR-02 的 Auth / Provider / Executor / 费用来源分离、真实路线和 Codex/Codely 模式集成，再完成精确模型能力匹配、显式用户选择/回退、独立选择 UI，以及预算/用量记录。真实 Web 禁用，API Key 真实验证继续按用户要求免测。P0 不重复 smoke。

本轮无 GUI 改动，不需 GIF；后续 UI 必须补真实 profile E2E/GIF。Python 新用例使用 POSIX 的构建后 dsh launcher，在 Windows 显式跳过；未宣称完成独立 exe 或 Windows 新路线验证。全部成果仅在本地工作区，未提交或推送。后续必须保留用户设置及前序任务文件，不把前序 SHA 当作本轮源码版本。
