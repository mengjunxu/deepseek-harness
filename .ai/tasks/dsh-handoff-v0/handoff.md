---
schema_version: 1
task_id: dsh-handoff-v0
state: BLOCKED
previous_agent: codex
next_agent: next-device-agent
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-10-20T08:45:57+08:00"
---

# 跨设备续作 Checkpoint

## 当前状态

V0 文件与通用 Skill 已生成，真实 Codex → Codely → Codex 接力尚未通过，任务保持 `BLOCKED`。本轮结束后 Codex 停止任务写入；接手方仍须确认旧设备没有其他写入进程。

## 已完成

- `AGENTS.md`、`CODELY.md` 已链接共享工作流；`.ai/` 包含规则、架构/记忆索引、四种模板和本任务记录。
- 已确认决策仍由 `.agents/notes/implemented/` 和架构文档拥有；原有 MGSD Checklist 与计划文件保持原样。
- 通用 `cross-agent-handoff` Skill 已在本机个人目录安装，包含 11 个文件：Skill 指令、UI 元数据、7 份模板及 V1/V2 路线和验证参考。
- Skill 格式校验、资源链接、文件结尾、空目录模板渲染和压缩包完整性检查通过；这不构成真实 Agent 编辑接力验收。

## 未完成问题

1. **真实双向接力未验证。** 本机 Codely 读取试点的调用在创建用户目录临时文件夹时遇到 `EPERM`，尚未启动模型。主机重试被自动审查拒绝，原因是向外部模型发送仓库指令、任务记录和 Git 状态尚缺明确的载荷与目的地授权。授权没有在后续对话中补充；不能通过其他入口绕过拒绝。新设备需重新确认实际能力、认证及适用权限，分别记录两个方向的接手、继续、停止与核对。
2. **完整文档检查未通过。** 历史 `test:docs` 结果是 17 个门禁通过、3 个失败；其中配对和换行涉及现有计划文件，标准测试另遇沙箱临时缓存 `EPERM`。标准测试单独提权重跑已通过 22 项。`doc-sync` 尚未执行；不得写成全量文档验证通过。
3. **固定代码基线证据待解决。** 仓库禁止在维护文件中保存原始提交号，之前用可变 `HEAD` 的说明不足以保存固定基线；本 Checkpoint 将 `base_commit` 明确留空。续作前选择项目允许的稳定版本证据方式或记录需审查的规则冲突，不把当前分支名或 `HEAD` 当成不变版本。
4. **跨设备传输未完成。** 本任务所有修改仍未提交、未推送，`.ai/` 仍未跟踪。本地分支按现有跟踪引用落后上游 3 个提交；本轮没有 fetch，远端实时状态未知。新设备不能只拉取仓库后假定本轮文件已到达，也不能先覆盖本地现场来追上远端。
5. **新设备的 Skill 安装与实测待做。** 本机个人 Skill 目录不会随仓库自动同步。接手方应从任务内压缩包恢复完整 Skill 并检查目标是否已存在，按新设备真实机制安装；结构/模板自检不能替代新设备能力或真实双向试点。
6. **V1/V2 尚未实施。** 保留原方案中的详细路线，完成 V0 验收后再决定 V1；V2 先映射现有 DSH 服务和数据所有权，不提前开发临时调度器。

## Git 与文件归属

- 本机目录：`F:\Agents\deepseek-harness`；新设备可以使用其他路径。
- 分支：`codely_bridge`；`git status --short --branch` 显示落后 `origin/codely_bridge` 3 个提交。暂存区为空。
- 本任务文件：`AGENTS.md`、`CODELY.md` 的增量修改，以及全部 `.ai/**`。
- 原有已跟踪修改：`docs/MGSD_Implementation_Checklist.md`、`.zh.md` 和 `.i18n.yaml`；不要把它们作为本任务修改提交。
- 原有未跟踪文件：`docs/Generic_Agent_Harness_v5_1_CN_Technical_Design_and_Codex_Implementation_Plan.md`、`docs/Generic_Agent_Harness_v5_ACP_Architecture_Execute_Plan.md`，以及 `docs/workflows/` 中的原始 V0–V2 方案；保持用户文件和对应归属。
- 远端同步：本任务没有提交或推送；本记录也尚未同步到另一设备。

## Skill 转移文件

- 可随本任务文件转移的完整包：[artifacts/cross-agent-handoff.zip](artifacts/cross-agent-handoff.zip)。该路径没有被 Git 忽略，但仍未跟踪、未提交。
- SHA-256：`E20C9E38BF4F56CB9980CD13F98963A72D2204D49DAF2C5E7E3E0F618596A4DA`。
- 本机安装路径：`C:\Users\admin\.codex\skills\cross-agent-handoff`；该绝对路径只说明本机安装位置，不是新设备路径要求。
- 原始压缩包和模板自检目录位于被忽略的 `tmp/skill-output/`；换机不依赖该目录。Skill 本身不依赖临时安装的校验器 PyYAML 包，也不包含凭证。

## 已执行验证

以下为此前轮次的结果；本次记录更新不代表产品代码或全部文档重新测试。

- `codely --version`、`codely --help`：通过；本机历史版本 `1.0.0-nightly.57`，帮助说明支持层级 `CODELY.md`。新设备需重新确认。
- `pnpm run verify-md-links`、`pnpm run verify-doc-budgets`、`pnpm run verify-repository-references`、`git diff --check`：通过。
- `pnpm run test:docs`：17 通过、3 失败，详情见上述问题和 [plan.md](plan.md)。
- `pnpm exec vitest run scripts/doc-standard.spec.ts`：因明确的沙箱错误提权重跑后，22 项通过。
- Skill 的官方 `quick_validate.py`：通过；安装前后 11 个文件摘要一致。模板渲染和压缩包自检通过。
- 产品代码测试、真实双向接力和跨设备恢复：未完成或不适用于本轮文档/Skill 创建，不能声称已验收。

## 新设备继续顺序

1. 先确认本轮未提交文件已完整转移，至少包含两个入口文件的本任务增量、整个 `.ai/`（含 Skill 包），以及继续任务所需的原始未跟踪方案；不要覆盖新设备已有修改。单靠 Git 拉取当前远端不能取得这些本地文件。
2. 读取 `AGENTS.md`、`CODELY.md`、`.ai/WORKFLOW.md`、[task.md](task.md)、[plan.md](plan.md) 和本 Checkpoint；核对文件归属、实际版本、旧写入者状态与远端差异，再决定如何整合上游变化。
3. 按新设备实际路径恢复 Skill，检查执行端版本和指令加载机制。`CODELY.md` 中历史机器记录不证明新机器状态。
4. 先解决真实 Codely 调用所需授权或能力阻塞，再分别完成 Codex → Codely、Codely → Codex 的真实接力。若只做读取摘要，标为上下文接力，不能声称编辑接力通过。
5. 在明确计划文档归属和文档约定后处理现有配对/换行失败，运行相关检查并再执行 `doc-sync`；完成全部 V0 条件才进入验收。

## 可直接使用的续作提示词

接手 `dsh-handoff-v0`。先读取项目入口、`.ai/WORKFLOW.md` 和该任务的四份记录，核对本轮未提交文件是否已转移、当前分支与上游差异、旧设备写入者是否停止。保留用户原有 MGSD 和计划改动，先继续 Checkpoint 中未完成的 V0 验证。真实外部调用仍须满足已记录的授权要求，不把历史本机测试或 Skill 模板自检当作新设备验收；V1/V2 暂不开发调度器。
