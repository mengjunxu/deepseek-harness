# DSH 仓库基线

[English](repository-baseline.md) | 中文

DSH 实施计划的历史基线记录，取自 2026-10-22 的 `codely_bridge` 分支。下列命令与机器版本描述当时观察，不代表当前验收；允许的固定代码版本记录缺失。[当前计划审计](../../../.ai/tasks/dsh-chatgpt-plan-update/handoff.md)取代本记录作为当前能力映射依据，包括实验 SIWC 与可复用的 MGSD 任务状态。

## 范围

本记录确定 P1 工作开始前仓库已经提供的能力。它列出真实工具链，把计划中每一项架构能力对应到当前拥有它的包，并列出 P1 必须补齐的缺口。它不重复计划的表述，也不声明任何未实际执行的能力。

## 工具链与目录结构

| 项目 | 观察值 | 依据 |
|---|---|---|
| 仓库 | `deepseek-harness`，Cordis 插件式 TypeScript monorepo，仅 ESM | `package.json`、`docs/architecture.md` |
| 包管理器 | pnpm 11.7.0，通过 `corepack pnpm` 调用；`PATH` 中没有 `pnpm` | `packageManager` 字段 |
| Node | 本机为 v22.18.0，低于声明的 `^22.19.0 \|\| >=24.0.0` | `engines` 字段、`node --version` |
| 工作区包 | `packages/<group>/<pkg>` 下共 316 个含 `package.json` 的包 | 目录扫描 |
| 应用 | `apps/cli`、`apps/web`、`apps/desktop`、`apps/desktop-host` | `apps/` |
| 运行时主目录 | `DSH_HOME`，默认 `~/.dsh` | `packages/*/home-paths` |

本机 Node 版本低于声明的最低版本，而下文命令仍然完成。应把这一点当作需要先修正的环境偏差，而不是支持范围比声明更宽的证明。

## 已验证的构建与测试基线

```
corepack pnpm run typecheck
corepack pnpm exec vitest run packages/llm/llm-pi-ai/tests/convert.spec.ts
corepack pnpm exec vitest run packages/llm/llm-pi-ai/tests/openai-route-matrix.spec.ts
corepack pnpm exec vitest run packages/test-support/llm-mock-server/tests packages/llm/llm-retry/tests/transport-recovery.spec.ts
```

| 命令 | 结果 |
|---|---|
| `typecheck` | 退出码 0；Host 与 Client 的 `tsc -b` 聚合均完成 |
| `convert.spec.ts` | 81 个测试通过 |
| `openai-route-matrix.spec.ts` | 6 个测试通过 |
| mock server 与 transport recovery | 3 个文件共 78 个测试通过 |

`corepack pnpm run typecheck` 会在 `tsc` 之前构建 Host lib，因此首次运行耗时较长。`test` 脚本会在 Vitest 之前构建 `native/system`；上述定向 Vitest 命令直接运行，是因为本工作区已经构建过 `native/system`。

## 基线时的 Git 状态

- 分支 `codely_bridge`，跟踪 `origin/codely_bridge`。
- 已修改：`.codely-cli/settings.json`，与本次工作无关。
- 未跟踪：`docs/workflows/DSH_IMPLEMENTATION_PLAN.md` 与 `docs/workflows/DSH_CHECKLIST.md`。
- 没有已暂存改动，本工作区没有其他写入者。

## 能力与计划的对应关系

| 计划能力 | 当前归属 | 基线状态 |
|---|---|---|
| Conversation Runtime | `packages/core/session`、`packages/session/*`、`packages/context/*` | 已具备：事件溯源会话存储、JSONL 持久化与 turn 投影 |
| Model Gateway | `packages/llm/llm`、`packages/llm/llm-deepseek`、`packages/llm/llm-pi-ai`、`packages/llm/llm-retry` | 已具备：与供应商无关的流契约、两个适配器、重试策略 |
| Task Service 与 Orchestrator | `packages/jobs/*`、`packages/workflow/*`、`packages/experimental/mgsd-workflow` | 后台任务注册表与 workflow 引擎已存在；没有计划所述迁移的 TaskSpec 状态机 |
| Executor 适配器 | `packages/subagent/*`、`packages/acp/*` | 进程内、SDK、ACP、Claude Code 与 Codex 子代理均已存在；没有带 `probe`/`observe` 的 `ExecutorAdapter` 契约 |
| Verification Service | 仅仓库测试套件 | 没有运行验收命令并记录 AC 矩阵的服务 |
| Review Service | 无 | 没有结构化 ReviewPackage 或 ReviewDecision 路径 |
| Memory | 无 | 没有按 User/Project/Decision/Task 分层的记忆存储 |
| Storage | `packages/storage/*`、`packages/session/session-persistence-jsonl` | SQLite 与 JSON KV 后端，以及 JSONL 会话日志 |
| UI | `apps/web`、`packages/client/*`、`packages/host/webserver` | 聊天、会话、任务、计划模式与设置页面已存在 |
| Executor 授权 | `packages/guard/*`、`packages/sandbox/*`、`packages/credentials/*` | 策略与凭据接缝已存在；计划中的任务级审批流程不存在 |

## Mock 模型网关（P0-02）

`packages/test-support/llm-mock-server` 已经提供了计划分配给 P0-02 的网关。它在 `/v1/messages` 上提供可编排的 Messages 兼容 HTTP/SSE 端点，每个被接受的请求消耗一条编排行为。

| P0-02 要求场景 | 行为条目 | 观察结果 |
|---|---|---|
| 流式文本完成 | `success`、`slow_success` | 已覆盖；测试断言捕获的请求与完成的流 |
| 工具调用 | `tool_call_success` | 已覆盖；推理、工具调用与 max-token 结束共用同一个用例 |
| 失败 | `auth_error`、`rate_limit`、`server_error`、`quota_exceeded`、`context_overflow`、`invalid_request` | 已覆盖；各自返回结构化供应商错误 |
| 中断的流 | `stream_disconnect`、`partial_disconnect`、`connection_reset`、`stall`、`partial_eof` | 已覆盖；关闭与停顿行为均有断言，并在 `llm-retry` 中验证恢复 |

该包不发布可安装二进制；测试直接调用 `startMockLlmServer`，或运行 `pnpm run mock:llm`。它的自动化测试就是 P0-02 证据：mock server 各套件与 `packages/llm/llm-retry/tests/transport-recovery.spec.ts` 共 78 个测试通过。

## P1 必须补齐的缺口

- 不存在 `TaskSpec`、`WorkItem`、`ExecutionRun`、`ReviewDecision` 及其 schema 校验。
- 没有状态机负责任务迁移、幂等键或事务性 outbox。
- 没有把 UI 生命周期与执行生命周期分开的 daemon API；Web profile 自身运行宿主进程。
- 没有把验收标准与已执行命令、退出码关联起来的验证记录。
- 没有把 diff 与 AC 矩阵打包给评审模型的服务。
- 不存在分层记忆存储、决策索引或快照。

## 后续工作的约束

- `docs/**` 下的文档是带 `*.i18n.yaml` 记录的双语对；`verify-translation-pairing`、`verify-md-wrap` 与 `verify-md-links` 都作用于这些文件。
- 公共质量门先构建再检查；参见 `AGENTS.md`。
- 仓库是 Cordis 插件式应用，新能力应按插件注册并具备可逆副作用，而不是独立服务进程。

## 复现

在仓库根目录运行已验证的构建与测试基线一节中的四条命令。干净机器需要先执行 `corepack pnpm install`；本工作区已安装依赖。
