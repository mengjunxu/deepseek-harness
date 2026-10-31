---
schema_version: 1
task_id: dsh-web-provider-priority
title: "Web ChatGPT Provider 第一优先验证排期"
status: DONE
created_at: "2026-10-31T23:54:31+08:00"
updated_at: "2026-11-01T00:06:32+08:00"
---

# Goal

按用户新决定，将 Web ChatGPT Provider 可行性验证提升为当前第一优先，消除 PRD、Plan 和 Checklist 的延后/可跳过冲突，并定义真实验证证据。

## Scope and ownership

Codex 为本 Task/Workspace 唯一写入者；同一 Agent 前序任务已结束，QR-02 尚未建立新 Task 或写入代码。保留所有前序改动及用户 .codely-cli/settings.json，不读取或修改该设置。更新现有两份有效规划文档、既有 ADR 提案和架构索引，并修正前序 README 的 Model Experience 门禁格式；不创建第三份有效 Plan/PRD，不 Commit/Push。本 Task 完成仅代表优先级和验收入口更新，不代表真实 Web PoC 通过。

## Acceptance criteria

- [x] Web Provider 验证排在 QR-02 等剩余工作之前，不以 P2/P3/P4 产品化为启动前提。
- [x] 区分真实网页可行性、DSH Adapter 接入及 Mock/Manual 结果；明确账号/通路、往返、会话映射、失败/取消和证据标准。
- [x] 保留既有真实访问准入与默认生产门禁；不将本次排期决定记成已通过账号或条款审查。
- [x] PRD、Plan/Checklist、ADR 提案与索引一致，完成相关文档检查和 Checkpoint。

## 后续提交授权

2026-11-01 用户明确要求提交当前累计修改，覆盖此前各任务“不 Commit”的阶段限制。本次纳入累计 P0/P1 与 Web 优先级成果，排除用户 .codely-cli/settings.json，不 Push；已完成的验证状态不因此改变。
