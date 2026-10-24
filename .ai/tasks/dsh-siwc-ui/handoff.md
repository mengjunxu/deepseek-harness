---
schema_version: 1
task_id: dsh-siwc-ui
state: IN_PROGRESS
previous_agent: codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-10-24T22:37:00+08:00"
---

# Checkpoint

用户要求把当前进度保存为本地 Commit；本检查点仍为 IN_PROGRESS，不构成完成或向其他 Agent 移交写入权。提交范围为本任务代码、相关配置和本任务记录；此前其他任务的修改保留在工作区，不混入提交。不 Push。

## Implemented

- `packages/experimental/chatgpt-plan/`：显式启用的 Host/Client 实验插件，复用 authorization、credentials、LLM、Remote 和 Models 设置扩展；实现 PKCE、OIDC 校验、凭据刷新、撤销、安全状态投影与账户模型目录。
- 设置页包含登录、取消、账户状态、使用说明及使用量入口；会话显示订阅标识，文案归本地化字典所有。
- Responses 适配复用 pi-ai 历史和流转换；相关导出及双语说明位于 `packages/llm/llm-pi-ai/`。
- 根 TypeScript 配置、锁文件新增实验包接入。锁文件仅保留新增 importer，排除安装导致的其他依赖变更。
- 11 个定向测试覆盖授权回调、权限、取消、刷新、目录、流输出、撤销保留/清除行为及 UI 状态。准确命令及结果见 [Plan](plan.md)。

## Unfinished and risks

- 用户报告已完成 UI 发起的官方授权，最后一次 DSH 观察仍显示等待授权；尚未确认凭据提交、账户展示或真实对话。独立探测结果属于 `dsh-p0-siwc`，不能替代本任务验收。
- Session 快照、Web 回放、真实对话/GIF、重启凭据复用和完整文档检查尚未完成；撤销和卸载的定向覆盖不能替代真实网络生命周期验收。
- 继续审查目录请求、凭据刷新与插件卸载的取消和等待语义，补充相应测试。
- 测试服务启动后源码包含额外修正，包括退出时写入无 Token 的 signed-out 记录；旧服务未保证使用最新构建，恢复时先检查或重建，不能用旧进程验收当前源码。
- 仅支持文本、一个账户和插件级上下文容量配置；显式 reasoning、temperature、输出上限和 stop 被拒绝。
- P0-03 的 API Key 路线状态不变；本任务未将其标为完成。

## Recovery

先核对 Git 与本记录，再从授权回调/账户状态开始。浏览器和临时服务可能已失效；检查 `.playwright-mcp/siwc-ui/run.json` 及私有目录是否仍存在，不在日志或会话输出凭据。真实 UI 验证通过后完成 Session 快照、录屏和文档验收，再更新任务状态。

原有改动包括共享规则、Codely 配置、P0 基线/SIWC 探测、`docs/dsh/`、两个 DSH 工作流文档及 OpenAI 路由矩阵测试。这些文件不属于本次 SIWC UI 检查点。
