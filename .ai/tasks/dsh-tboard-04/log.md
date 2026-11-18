# 检查点

Codex 取得 codely_bridge 单写权。TBOARD-02 数据层已经交接。本阶段先检查 Git 工作目录、严格验证失败路径以及本机的进程生命周期能力。正常双实例停止证据在 ../dsh-tboard-01/evidence/stop-tree.json。

- 2026-11-16T11:22Z 周剩余 23%，15:57Z 余 22%。均来自 get_usage_limits 的 Codex 10080 分钟窗口，重置时间为 2026-11-17T09:33Z。
- PASS · pnpm exec tsc -b packages/api/taskboard-controller；pnpm exec vitest run packages/api/taskboard-controller/tests/taskboard.host.spec.ts，9 项通过。工作目录准备和停止状态可在 Host 层验证。

- 2026-11-16T15:59Z / 16:03Z / 16:07Z 周剩余 22%，16:09Z / 16:15Z 余 21%。窗口与重置时间同上。
- PASS · 真实双 SDK，`node .ai/tasks/dsh-tboard-04/evidence/stop.mjs --controlled-tool` 取得原始输入回执及固定子进程退出证据，保留同一时刻正常运行的独立 SDK。无参数版本验证根进程退出而范围未知时保留租约。重放不再追加活动或重新发送停止信号。
- AC19 初测发现普通 SDK 组合允许审批插件配置失败后继续初始化。工作台通过最终部署补丁将原生服务激活设为握手条件。PASS · `node .ai/tasks/dsh-tboard-04/evidence/permission.mjs`。工作台验收观察到审批错误、子进程退出、零模型请求与零目录写入。
- PASS · `pnpm exec tsc -b packages/api/taskboard-controller`、Host tsdown、`pnpm exec tsc -b packages/api/remotes/tsconfig.client.json`。Taskboard、storage-domain、storage-sqlite 的 79 项测试通过。真实 Web profile E2E 1 项通过，覆盖认证后的目录检查和重启后数据读取。
- PASS · 聚焦 oxlint、verify-package-dependencies、verify-cordis-config、verify-export-jsdoc、verify-doc-graphs、4 对相关文档翻译配对、verify-package-readme-model-experience、verify-plugin-packages、22 项 doc-standard 单测和 git diff --check。

- 全仓 doc-sync 未通过。配置目录已重新生成并单项复验通过。仍有旧文档及中文规划文档的示例类型、链接、双语配对和换行问题。当前控制器构建、SDK 验收与 Web 验收的源码和产物分别见 evidence/sha256.json。
- 2026-11-16T16:18:27Z，get_usage_limits 的 Codex 10080 分钟窗口实测周剩余 20%，重置 2026-11-17T09:33Z。首发强停验收平台待用户决定。
