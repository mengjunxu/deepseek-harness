---
schema_version: 1
task_id: dsh-web-provider-poc
title: "WB-01 / VN4-06 Browser-only 与 DSH Web Provider 验证"
status: DONE
created_at: "2026-11-01T00:15:58+08:00"
updated_at: "2026-11-02T00:19:30+08:00"
---

# Goal

按主实施计划第 15 节验证 Web ChatGPT Provider 的浏览器通路、真实收发与 DSH 最小适配，分别报告真实、Mock/Manual 和生产准入结果。

## Scope and ownership

用户要求继续当前第一优先工作，Codex 延续本对话单一写入者；前一规则任务已完成，未启动 Codely。保留该任务未提交规则及用户 .codely-cli/settings.json，不读取或修改个人设置。本轮不 Commit/Push，不改全局 Codex 配置，不提取 Cookie，不启动 Full Harness / Native Host。

## Acceptance criteria

- [x] 明确隔离 launcher 通路及当前登录条件；其浏览器由参考 launcher 持有，DSH 自身持有和最小接入仍待验收。
- [x] 真实唯一标记请求记录明确模型、提交接受、回复与终态；参考成功证据与 DSH 接入分开。
- [x] DSH Adapter / Session 接入与失败、取消、未知提交分别有证据，不以手工点击或 Mock 替代：真实请求成功（唯一标记精确回显、completed、真实 usage）与三次提交前失败均有 Session 级证据；取消证据在适配器层（Python/TS SDK 无 wire-level cancel，文档明确），未知提交有参考 preflight 拒绝与桥接 rejected 切片证据。
- [x] 保存逐步 Checkpoint、相关知识与主计划状态；DSH 实际接入已验收（见 handoff/log 证据），主计划 WB-01 / VN4-06 打勾待用户确认后执行。

## 2026-11-02 outcome

阶段 3b 完成：独立 worker + 桥接 Adapter + 禁用本地工具的运行时 patch 全部落地，适配器层 18 项与运行时层 Mock 验证 PASS，真实浏览器请求 PASS（唯一标记精确回显、response.completed、真实 usage、准入/路由/关联/attribution 正确、worker 干净退出）。三次提交前失败定位为参考 console.info 混入协议 stdout 的桥接缺陷并已修复，未消耗模型用量。收尾全仓 lint PASS。全部变更仍在本地未 Commit/Push；launcher 为重启后进程 pid 66262。剩余决策：主计划 Checklist 打勾、Commit/Push 授权，均待用户确认。

## Current decision dependency

参考网页验证与真实 DSH 默认门禁拒绝均已有证据；DSH 实际 Adapter 接入等待用户决定是否批准 admission-proposal.md 的显式受限 PoC 准入。该提案未实施，当前没有放开任何生产政策。用户确认前不推进依赖此变更的实现；已完成部分不因此标为整项 DONE。

## Constraints

真实路线保持 chatgpt_web_unofficial；现有默认生产门禁保留。仅无敏感信息的最小探测；不自动接受条款、绕过验证码、换模型或付费路线。按 WORKFLOW 检查 Codex Plus 五小时余量，小于 15% 停止并交接。

## Approved PoC admission

2026-11-01 用户明确批准 admission-proposal.md 的受限 PoC 范围。Codex 接续本对话、核对 Git 后恢复唯一写入权；不再等待相同授权。仅独立 home 的进程内注册授权，绑定路线/模型/期限/调用额度，普通注册保持拒绝；预算在准备阶段保守消费、热替换不续额、撤销阻止已准备但未分派的调用。进入实现与聚焦验证，尚未宣布完成。开始余量 39%。

## Quota stop

01:02:29+08:00 Codex 五小时剩余 14%，按用户规则停止，Checkpoint HANDOFF_READY。Task 尚未完成，状态保持 IN_PROGRESS，当前无写入者；不将额度停止写成外部依赖阻塞或 DONE。真实 DSH worker 及最终修复后的剩余检查待接续；已授权范围不变。

## Takeover

2026-11-01T23:58:46+08:00 用户明确指示 Codely 接手。Codely 按 WORKFLOW §5.2 核对 Checkpoint、真实 Git 状态与实现一致性：阶段 3a 的准入实现/测试/fixture、文档对、生成目录与快照均在工作区且与声明吻合，无 Commit/Push，Codex 已停止写入，取得单一写入权。从首个未完成事项继续：先补齐最终修复后未重跑的全仓 lint、SDK replay 与双语配对检查，再实施阶段 3b。Codex 五小时额度规则只约束 Codex 账户，不构成 Codely 的外部阻塞；真实浏览器请求发起前仍单独向用户确认。
