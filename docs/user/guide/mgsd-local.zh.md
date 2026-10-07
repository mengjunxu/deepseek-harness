---
description: "配置人工审批的本地 MGSD 任务，查看持久化状态、验收、审查和重启行为。"
---

# 运行持久化本地 MGSD 任务

[English](mgsd-local.md) | 中文

## 摘要

使用 `/mgsd` 创建本地任务、提交计划、显式批准版本，然后运行 Codely 和独立检查。任务事实在 DSH 重启后保留。第二次审查失败要求人工介入。这些人工命令不调用 DSH 模型；普通聊天另行处理。

## 目录

- [配置](#configure)
- [命令](#commands)
- [恢复与限制](#recovery)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="configure"></a>
## 配置

需要已构建的开发检出与已认证的 Codely 安装。按照 [Codely 指南](codely-local.zh.md)配置可执行程序、可信独立检查与进程限制。每个项目仅启用 Codely/MGSD 覆盖层中的一个：两者进程内目录准入记录相互独立。先使用临时项目；本功能不隔离文件系统或网络访问。

在项目外创建私有节点 JSON 文件，目录必须已经存在且使用绝对路径。`workspaceRoot` 标识本地工作区存储，目前不是受管工作树根目录。`defaultBaseRef` 以文本固定，尚不解析为 Git 提交。当前配置有意不包含远程能力。

```json
{"nodeId":"local","workspaceRoot":"F:/Agents","repos":{"project":{"path":"F:/Agents/my-project","defaultBaseRef":"HEAD"}}}
```

将 `DSH_MGSD_NODE_CONFIG` 设为该文件路径，`DSH_MGSD_DATABASE` 设为私有 SQLite 路径，两者均为绝对路径。必要时自动创建数据库父目录。请求、计划、检查与数据库文件均保存在本地，可能含项目内容。不要提交这些私有文件。

可选 [MGSD 覆盖层](../../../apps/cli/config/examples/mgsd-local/cordis.patch.yml)随已提供的 Web profile 运行。录制验收通过已构建 `dsh` CLI 启动 `web --patch <MGSD-overlay> --patch <picker-overlay> --patch <test-runtime> --no-open --port 0`；选择器与测试运行配置仅用于验收。[Web 场景](../../../apps/web/tests/mgsd-local.snapshot.ts)保存完整启动环境和参数。

<a id="commands"></a>
## 命令

创建或运行任务前，为 Session 选择配置中的仓库目录。以下命令 JSON 与自动验收一致；请有意识地替换任务目标、路径、标准与预算。

```text
/mgsd create {"title":"Local task","prompt":"success","repoAlias":"project","risk":"trivial","budget":{"maxExecutionAttempts":2,"maxExpertCalls":0,"maxDurationMs":60000}}
/mgsd plan TASK-ID {"summary":"Write result","allowedFiles":["result.txt"],"acceptanceCriteria":["Independent check passes"],"source":"human"}
/mgsd approve TASK-ID 1
/mgsd run TASK-ID
/mgsd status TASK-ID
/mgsd output TASK-ID
```

将 `TASK-ID` 替换为返回的 `TASK-<uuid>`。`/mgsd status` 仅列出当前 Session 的任务。审批必须指定当前计划版本；重新规划会使其失效。`/mgsd run` 返回另外的进程内作业 ID。作业成功不代表普通或高风险任务已经完成审查。

| 操作 | 含义 |
|---|---|
| `review <id> {"passed":false,"source":"human","findings":"Missing case"}` | 记录已执行普通任务的审查结果。 |
| `fix <id>` 然后 `run <id>` | 首次审查失败后执行一次修复，并消耗另一次执行预算。 |
| `replan <id> <reason>` | 撤销审批；活动执行先停止，再进入 `needs_replan`。 |
| `cancel <id>` | 持久化取消意图，并等待活动受管进程清理。 |
| `resume <id>` | 将中断任务转为待重新规划，不启动进程。 |

高风险计划与审查要求 `source:"expert"`，且专家调用预算未耗尽。在当前仅接受人工命令的适配器中，该字段是可信人工声明，不证明已调用 Codex。所有风险级别均要求人工审批。低风险任务跳过外部专家输入与审查；普通任务要求审查；高风险任务要求标记为专家的规划与审查。

<a id="recovery"></a>
## 恢复与限制

重新打开同一数据库与 Session 即可查看保留任务。未完成的活动状态变为 `interrupted` 并失去审批；不会自动重启作业。继续执行前需要 resume、提交新计划并批准新版本。稳定的已审批或终态任务仍可读取。第二个存活控制器不能打开该数据库。

任务事实、退出码、取消意图与结算在重启后保留。原始输出仍由进程内作业注册表保存，重启后不可用。适配器通过已有 Session 事件记录命令结果，不请求模型回合；已有作业完成通知可能在后续普通聊天回合送达模型。数据库需独立于导出的 Session 日志保留。

预算必须显式指定：执行次数包含修复；标记为专家的计划和审查消耗专家预算；总时长包含规划。准入时预算耗尽会持久化 `needs_human`，不启动执行器。运行截止时间会取消受管任务。第二次审查失败同样进入 `needs_human`；不存在自动第三次审查或终态重置。

[库限制](../../../packages/experimental/mgsd-workflow/README.zh.md#known-limitations-and-deferred-work)同样适用。本阶段不提供工作树创建、Git 提交固定、强制允许文件执行包、自动专家调用或远程派发。执行器接收不可变的原始目标；计划是审批记录，尚不是执行包。

<a id="verification"></a>
## 验证

完成 Host 构建后，在仓库根目录运行定向检查。它们使用临时目录与测试执行器，不需要真实 Codely 凭据或模型 API。

```powershell
node node_modules/vitest/vitest.mjs run packages/experimental/mgsd-workflow/tests/workflow.spec.ts apps/cli/tests/mgsd-local.spec.ts apps/cli/tests/codely-local.spec.ts scripts/doc-standard.spec.ts --coverage --coverage.include='packages/experimental/mgsd-workflow/src/**/*.ts'
$env:DSH_SNAPSHOT = 'replay'
$env:DSH_TEST_BROWSER_CHANNEL = 'msedge'
node node_modules/vitest/vitest.mjs run --config vitest.web.config.ts apps/web/tests/mgsd-local.snapshot.ts apps/web/tests/codely-local.snapshot.ts
```

Windows 上于 2026-10-07 实测：四个文件通过 69 个 Vitest 用例（43 个 Core、四个 CLI/Loader、22 个文档用例），包含原有 13 个嵌套 runner 测试。新包逐文件语句、分支、函数与行覆盖率均为 100%。Web 回放通过 MGSD 与 L1 两个场景，验证重载后命令行保留、零模型调用及完整工作区结果。[Core 测试](../../../packages/experimental/mgsd-workflow/tests/workflow.spec.ts)验证重启、过期审批、损坏拒绝、独立退出、预算与审查限制；[Loader 驱动](../../../apps/cli/tests/fixtures/mgsd-local/driver.ts)验证真实受管执行、跨 Session 拒绝、卸载及重开后的持久化取消。

<a id="dev-note"></a>
## 开发备注

<details>
<summary>验收记录 — 点击展开</summary>

两个独立启动的 Vitest 进程在同一宿主机于 16:14:25 开始运行，各自通过全部 43 个 Core 用例；运行时间重叠，且各自拥有独立临时数据库。补齐 MGSD sidecar 后，录制 Session 清单的三个归属、请求头与版本检查全部通过。最终四组指定双语配对检查通过，`git diff --check` 通过。用户本地设置及 Codely 上下文修改均予以保留。

完整构建与最终 Host 构建通过。已执行 lint、公开包验证、NodeNext 消费方、持久化历史与定向包约束检查。`test:docs` 初次为 18 通过/2 失败；已修正新中文概述标题，其 22 个所属测试通过。`doc-sync` 初次为 37 通过/5 失败；已修正新导出 JSDoc 与配置目录失败，其检查通过。剩余原有失败为架构计划缺少中文配对、其 TypeScript 示例无法编译，以及 Cordis 目录过期。Hygiene 初次为 14 通过/4 失败；已修正新依赖位置和 invariant 说明，其检查通过。剩余 Windows 检出失败是 ACP 配置符号链接保存为链接文本，HEAD 同样如此。这些结果不构成全仓库聚合检查通过。本次验收不包含 L2 提交、推送、远程 runner 或上传。

</details>
