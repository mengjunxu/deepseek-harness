# Agent Note: 独立聊天路由与自适应任务执行

Status: proposed

[English](2026-10-28-independent-chat-provider-executor.md) | 中文

## Problem

模型路线与工程执行器的能力、授权和额度来源不同。耦合二者会让聊天 Provider 切换改变执行语义。v5.1 默认 Planner/Reviewer 链还要求简单任务显式规划和模型审查。现有 MGSD 执行要求批准 Plan，完成依赖 Review；Plan 存储可空不代表规划可选。

## Proposal

增量采用 `../../../../docs/myPlan/DSH_PRD_vNext_4_2026-10-27.md`。Provider、Executor、Workflow 独立选择。Web 与 SIWC 作为同级模型路线注册；Web 在独立准入条件满足前保持 gated。保留 native-model 集成和 Codex/Codely 外部循环，逐驱动验证能力，不强制所有驱动使用 ACP。

仅执行任务创建最小 TaskSpec。使用版本化模板、Auto 选择和用户 Override，使 PlanRevision 与模型 Review 可选。确定性验证始终必需。批准必须绑定真实 TaskSpec、授权文件/操作或显式 Plan 版本；省略 Plan 不得扩大权限。跳过审查与模型审查通过分别记录。Run 保留实际 Executor 和启动选择，后续切换仅影响新 Turn 或 Run。

Session 日志保持权威，先把任务语义映射到 MGSD facts、jobs 和 storage，再补缺失字段。改变 MGSD 执行路径前补持久化转移与回放证据。可撤销、按作用域授权的 Tool Bridge 保持可选，独立于工程执行。优先 DSH Tool Host；活动 Codex Native Host 须独立 PoC，否则返回 unsupported。额度政策阻止未授权付费或跨源回退，区分官方用量与估算。

## Existing decisions

保留[动态工作流](../../implemented/feature/2026-07-05-dynamic-workflows.zh.md)与[原生子代理后端](../../implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.zh.md)决策。它们拥有脚本工作流和产品进程生命周期；本提案补产品选择与任务政策，不取代这些决策。限定范围的取代检查未发现应归档的已实施记录。开发协作 WORKFLOW 与运行时模板政策保持独立。

## Alternatives considered

**固定 Planner → Executor → Reviewer：** v5.1 采用此默认路径，但 vNext.4 要求直接聊天及简单任务无需强制模型规划/审查。风险或用户要求时仍保留显式 Plan 与 Review。

**以 Web 为中心的反向工具工程链路：** 输入文档将其与独立执行器对照；设为必需会把任务可用性绑定 Web 准入与未验证的活动 Codex Host。因此保持可选。

**新建 Store 与统一 ACP 适配器：** v5.1 建议新的集成目录，但现有 Session、MGSD 与 subagent 已有相关机制。扩展拥有者并逐驱动探测，避免复制状态或承诺未支持的 resume。

## Acceptance criteria

`../../../../docs/workflows/DSH_IMPLEMENTATION_PLAN.md`映射实现与测试：直接聊天不创建 Task；简单任务无 Plan 且跳过模型 Review 仍可完成；复杂任务保留版本化 Plan、批准和有限修复。SIWC/Web Mock × Codex/Codely 独立可选。切换选择不能改写运行中的 Run。gated Web 零真实访问。未知提交、取消、验证失败和工具待完成不能变成成功。提案升为 implemented 前须覆盖回放、迁移、额度同意、越权拒绝与重启测试。

## Risks

MGSD 的 Plan 批准与 Review 完成目前耦合。不增加版本化事实就放宽会破坏历史回放或移除授权。Web 账号准入、支持模型与活动 Codex 工具仍是未验证外部依赖；参考代码及其许可不提供账号访问授权。P0 仅更新文档，不批准 P1–P7 实施。
