# Execution Plan

- [x] 盘点历史文件与引用，核对 Git。
- [x] 合并当前清单，移动 30 个文件，更新引用和配对记录。
- [x] 检查链接、配对、换行及 Diff，记录限制并完成交接。

## Verification

PASS：58 个 Checklist 任务 ID/状态/勾选值保留；30 项移动映射核对；两个有效文档保留、PRD 摘要不变；9 组命名配对通过，README 最后文案调整后单独复验通过；全仓 Markdown 链接及 git diff --check 通过。

FAIL：test:docs 18/2；doc-sync 34/8。既有缺失配对、硬换行、类型文档/生成目录问题仍保留。NOT_RUN：业务测试和 lint；此次仅文档迁移与引用修复，无业务源码修改，前轮 lint 已通过。
