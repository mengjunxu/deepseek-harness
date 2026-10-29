# Execution Plan

- [x] 读取新旧需求、现有架构索引和相关决策，核对 Git；用户确认旧写入者停止。
- [x] 核对 Provider、Executor、Task/Workflow、上下文、权限、UI 与外部参考源码。
- [x] 更新审计矩阵、v5.1 对照、参考锁定、ADR 提案、主计划及 Checklist；保持输入原文。
- [x] 运行验证并记录通过/失败，完成 Checkpoint；未进入 P1–P7。

## Verification

源码及输入摘要见 artifacts/audit-evidence.json；没有允许的固定发布 ref，base_commit/tested_code_commit 留空。此轮无业务代码修改。61 项定向测试、三组命名双语配对、lint、git diff --check 通过。test:docs 与 doc-sync 全仓失败；详情见 handoff.md。新增工单的 T/UAT 是未来验收映射，并未执行。
