# Execution Plan

- [x] 设计既有 LlmProviderInfo 上的政策输入/解析及注册代次捕获。
- [x] 实现实际拒绝入口和 SIWC 消费者；定向测试。
- [x] 更新双语 README/子系统和主计划，运行相关检查并写 Checkpoint。

## Actual checks

PASS：LLM/SIWC 定向测试 3 文件 115 项；provider-policy-gated 的 headless profile 记录刷新及最终 keyless replay 1 场景；两个包的定向 tsc；pnpm run lint（含全 Host 构建）；verify-export-jsdoc、469 个类型等价块、3 组命名双语配对、Client i18n 检查、persistence freshness/history、git diff --check。test:docs/doc-sync 全仓失败及修复复验详情见 Checkpoint。
