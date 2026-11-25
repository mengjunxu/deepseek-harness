---
description: "Web Host 中经认证的工作台项目和任务命令。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-taskboard-controller

[English](README.md) | 中文

## 概述

Web Host 通过已认证的 `taskboard` Remote 命名空间提供项目绑定、任务需求及活动记录。Web profile 将业务数据域路由至 Harness home 下的 SQLite。

## 目录

- [使用本包](#use-this-package)
- [实现说明](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## 使用本包

<a id="enable-local-sdk-dispatch"></a>
### 启用本地 SDK 调度

使用 macOS 图形登录，Web Host 和 SDK 使用同一个 DSH 构建。创建本地部署补丁，配置私有 Session 根目录的绝对路径。密钥从提供给 Host 的凭据环境读取。

```yaml
- id: taskboard-controller
  config:
    worktreeRoot: !!js dshHomePath('taskboard', 'worktrees')
    execution:
      reference: local-deepseek
      sessionRoot: /absolute/private/taskboard-sessions
      provider: deepseek-official
      model: deepseek-v4-pro
      dispatch: true
      env:
        DEEPSEEK_API_KEY: !!js process.env.DEEPSEEK_API_KEY
```

运行 `dsh web --patch /absolute/path/taskboard.yml`，打开已认证的本地页面。登记工作目录，启动 Run 前查看**执行设置**。SDK 启动时检查配置的 Provider、模型和权限。退出未核实期间继续占用执行槽和工作目录。 在控制器配置中设置 `maxParallelRuns`（1–32，默认 1）可让独立工作目录同时执行；共享一个数据库的 Host 应使用相同的上限。处于同一 Git 工作树或目录重叠的 Run 轮流执行。

<a id="use-openai-for-taskboard-runs"></a>
### 工作台使用 OpenAI 执行任务

将以下 SDK 补丁保存为 `/absolute/private/taskboard-openai-sdk.yml`。SDK 从已安装的 OpenAI 目录选择模型，并从环境中读取密钥。

```yaml
- id: llm-pi-ai
  config:
    providers:
      openai:
        apiKeyEnv: OPENAI_API_KEY
```

将以下 Web Host 补丁保存为 `/absolute/private/taskboard-openai.yml`，把两处路径替换为本机绝对路径，并向 Web Host 提供 `OPENAI_API_KEY`。运行 `dsh web --patch /absolute/private/taskboard-openai.yml`，在启动窗口确认 **openai · gpt-5.4-mini**。这条路线只需要 OpenAI 凭据。

```yaml
- id: taskboard-controller
  config:
    worktreeRoot: !!js dshHomePath('taskboard', 'worktrees')
    execution:
      reference: local-openai
      sessionRoot: /absolute/private/taskboard-sessions
      provider: openai
      model: gpt-5.4-mini
      dispatch: true
      patches:
        - /absolute/private/taskboard-openai-sdk.yml
      env:
        OPENAI_API_KEY: !!js process.env.OPENAI_API_KEY
```

<a id="upgrade-or-roll-back"></a>
### 选择原生执行器

将 Codex 或 ACP 适配器安装在 SDK Loader 可解析的位置。在 Web Host 上把 `execution.nativeExecutors.codex` 或 `execution.nativeExecutors.codely` 设为对应 SDK 补丁的绝对路径。每份补丁按相应名称注册一个 Provider。Codex 使用 `@deepseek-ai/dsh-subagent-codex`，设置 `permissionMode: never`。Codely 使用 `@deepseek-ai/dsh-subagent-acp`，配置 `providerName: codely`、已安装的 `codely` 命令、`--experimental-acp`、`--path-policy strict` 和 `permission: reject`。工作台要求适配器声明 `usesParentCwd`，若 ACP 部署覆盖工作目录，会在启动子进程前拒绝执行。原生模型、凭据和文件权限由该部署配置。

在启动窗口选择执行器，或调用 `startRun` 时一起传入执行器名称 `nativeExecutor` 和 `confirmedRoute`。Host 保存本次选择，并在派发时再次核对补丁内容。每次授权启动一个新的原生会话，使用 SDK 记录的输入。结构化交付进入项目检查和人工验收。适配器不可用、执行失败或报告格式无效都会使 Run 失败。停止后可通过新的 Run 继续任务。

原生适配器返回后，SDK 会在校验交付前把工具和权限计数写入当前 Run。Host 重启和备份恢复后可继续查看。SDK 中断时可能来不及保存摘要。

### 升级或回退

等待活动 Run 退出。下载工作台备份后关闭使用该数据库的全部 Web Host。复制 Harness home 下整个 `taskboard` 目录，包括仍然存在的 SQLite 辅助文件，并单独保存配置的 Session 根目录、工作目录和部署补丁。先在独立本地实例中验证升级。将元数据备份恢复到空工作台，继续 Run 前将原 Session 文件放回配置的根目录。版本不受支持时，保留数据库与原 Session 文件，使用升级前的副本重新打开兼容实例。

本地演练升级时，在独立的检出目录中分别构建旧版本与目标版本。在目标目录运行 `node apps/web/tests/fixtures/taskboard-smoke.mjs --upgrade-from /absolute/previous/apps/cli/lib/bin.js`。检查通过旧 Web Host 写入需求修订和评论，停机后分别在两份独立的数据库目录副本上验证升级和回滚。

<a id="project-and-task-commands"></a>
### 请求验收覆盖审查

要启用**请求模型审查**，请在 Web Host 配置模型提供方。使用 OpenAI 时，在 Web Host 应用上文的 `llm-pi-ai` 提供方配置，向 Host 提供 `OPENAI_API_KEY`，并在已有的 `taskboard-controller` 配置下加入以下字段。

```yaml
review:
  provider: openai
  model: gpt-5.4-mini
  maxOutputTokens: 512
  timeoutMs: 30000
  maxAttempts: 2
```

操作者选择交付并确认页面显示的模型路线。审查模型收到与**下载审查摘要**相同的 JSON，按提示评估验收覆盖情况。每次请求都会记录模型路线、截止时间、交付指纹与结果。独立的审查 Session 保存确切的模型输入。审查模型没有工具权限。请求失败或超过截止时间仍未确认时，可在配置的次数内手动重试。接受、退回与逐项豁免仍由操作者决定。

操作者可用已完成的审查意见起草退回反馈，编辑后再退回交付。工作台随人工决定记录所选审查 ID。退回后任务回到待办；操作者再次确认启动 Run 后，执行器才会收到反馈。

### 项目和任务命令

调用 `ctx.remote.taskboard.createProject` 时传入已有目录的绝对路径、项目 UUID、命令 UUID 和期望版本零。创建任务时使用独立的任务 UUID 和期望版本零。后续写入需提供所属项目、任务、期望版本及新的命令 UUID。使用相同载荷重试同一命令将返回原回执。发生版本冲突时先重新读取任务，再发起新命令。

任务的可选字段 `constraints` 保存操作者给执行者的约束。编辑时省略该字段会保留当前约束，传入空文本可清除约束。修改约束会生成新的需求版本。可选的 `riskLevel` 支持 `low`、`medium` 或 `high`。编辑时省略该字段可保留风险等级，传入 `null` 可清除；修改等级会生成新版本。SDK 输入和 `taskboard_read` 均使用 Run 入队时保存的版本。选择 `task.quick.v1` 可直接执行；选择 `task.standard.v1` 可用有序的 `steps` 数组保存操作者编写的可选步骤。编辑时省略 `workflow` 会保留已有选择，传入 `null` 可清除。Run 输入和 `taskboard_read` 保留所选版本及步骤。

选择 `task.milestone.v1` 时，须在有序的 `steps` 数组中填写至少一个阶段目标。每次授权的 Run 保存从 1 起算的 `milestone`。交付须覆盖当前阶段目标，最终阶段还须覆盖任务验收标准。接受中间阶段会将任务移回待办。退回后再次授权时仍执行原阶段。重新打开任务或修改需求版本会从第一阶段开始。恢复备份时按顺序核对阶段与人工决定。

调用 `runTaskSpec(projectId, taskId, runId)` 可读取受理时的版本化任务说明，包含工作区基线、路线、操作者授权、前序检查点和原始 SDK 输入。历史记录缺少的路线、授权或检查点返回 `null`。

通过 `runInput(projectId, taskId, runId)` 读取某次 Run 已保存的 SDK 输入，包括原需求、退回反馈和选入材料的原文。排队取消或恢复元数据后仍可读取。该操作读取工作台数据库，不向 Session 发送输入。

通过 `listTasks` 读取项目任务卡片，通过 `detail` 读取需求版本快照与活动记录。通过 `reorderTask` 将卡片移到本项目另一张卡片前或列表末尾。规划命令将未安排的任务放入待办。取消与归档保留历史，显式重开会将已终结的任务放回待办。Run 的 `lastEvent` 提供绑定 Session 中已观察到的最大事件位置。SDK 断连后，Host 会将连接标为异常并读取已存储的 Session，在找到 Run 的输入回执时补齐遗漏事件的位置。Run 与租约由各自的终止流程处理。事件载荷由 Session 日志提供。

增量读取活动时，操作者调用已认证接口 `activityPage(projectId, taskId, cursor, limit)`，首次传入空游标和正整数条数。返回值包括按提交顺序排列的活动、游标和 `hasMore`。处理完一页后保存游标；空页保留原游标，之后可从同一位置读取新活动。Host 重启后，只要任务和游标位置的命令仍匹配，就能继续读取。任务不存在或不属于所选项目时返回 null。

通过 `pendingRunInteractions` 读取一个 Run 待处理的问题和审批。调用 `answerRunInteraction` 时提供项目、任务、Run、请求 ID 及匹配的类型。审批可选择允许一次、拒绝或取消。答复、撤下或断连后，请求即关闭。Run 详情保留请求 ID 与状态，`answered` 表示操作者已经提交答复。工具结果或策略决定保存在 Session 中。

通过 `inspectProject` 查看已登记项目的实际路径、分支、commit 和本地变更。继续执行时，`inspectPriorWorkspace` 读取最近一次已结束 Run 的目录。原目录执行会在取得租约后重新核对操作者确认的状态。隔离执行从固定 commit 在配置的 `worktreeRoot` 下创建工作树。

通过 `startRun` 将当前任务版本加入队列。在 `confirmedRoute` 中传入操作者看到的 Provider 和模型，Host 会在入队前拒绝已变更的路线。客户端省略此字段时，使用入队时的项目配置。新 Run 的历史和项目交接文件保留当时的 Provider 与模型。默认新会话模式下，传入 `inspectProject` 的结果确认原目录，或传入 `null` 选择隔离。重试时传入前序 Run ID，并提供本次选定的材料。使用 `mode: resume` 时传入前序 Run 和 `inspectPriorWorkspace` 的结果。原 Session 的目录必须匹配且收件队列为空，SDK 才会接受新输入。Host 的 `execution` 配置提供项目配置引用、绝对路径 `sessionRoot`、Provider 和模型，用于启用入队请求。重放相同请求返回原回执和 Run ID，移除执行配置后仍可以重放。Run 取得执行槽之前可以用 `cancelQueuedRun` 取消。新启动记录保存操作命令、受理时间、授权时的任务版本、所选执行器及单次入队范围。Run 详情和项目交接可区分操作者确认与部署选定的模型路线。旧记录未保存授权事实时不补写。

使用 `setRelations` 设置同项目父任务和前置任务。父任务用于分组；所有前置任务都经人工验收后才能领取。操作者可用 `startRun` 的 `whenReady: true` 为当前需求授权一次全新隔离执行。等待期间可取消；修改需求或任务关系前先取消授权。失败、退回和恢复备份后重新执行均需新的操作者命令。

通过 `stopRun` 传入选定的 Run ID 和当前任务版本。正常停止只请求该 Run 的 SDK 子进程关闭。停止未确认时，用 `recheckRunStop` 重新观察同一子进程和工具进程范围，无需发送信号，也可通过 `stopRun` 显式请求强制结束。任务详情显示租约仍占用的原因。Host 只有在观察到 runtime 退出且所属工具进程范围清空后才释放租约。在 macOS 上，SDK 在独立的 launchd 资源 coalition 中启动。发送输入前，Host 保存 coalition、launchd 任务、系统启动标识及其私有所有权锁。重启后的 Host 取得原锁后可重新观察已保存的进程范围。进程范围仍占用或证据不足时，目录继续锁定。进程范围退出后，Host 释放租约并调度下一条排队的 Run。

使用 `deliveryDetail` 查看原验收标准、验证证据和代码文件清单。工作目录仍与封存指纹匹配时，用 `deliveryDiff` 查看清单中的路径。Git 交付以 Run 固定的 commit 为基线，包含未被忽略的未跟踪文件。非 Git 交付可查看声明文件的当前内容。二进制文件及超过 `gitOutputMaxBytes` 的文件返回相应的显示状态。通过 `exportReviewPackage` 读取指定交付的验收覆盖摘要。带版本的 JSON 包含交付标识、封存指纹、原风险等级、各验收状态和文件变更类型的数量、项目检查结果，以及已报告问题和未完成项的数量。摘要省略项目文本、文件名、目录、Session 数据及凭据字段。下载只读取选定的交付，人工验收单独记录。

注册 npm 项目时可设置 `projectScript: "test"` 或 `"build"`。新启动命令须传入相同的 `confirmedScript`。提交交付时，SDK 在本次 Run 的目录中执行该脚本，遵守 Session 文件策略与 shell 执行器的时限。Host 为同一交付只分配一次脚本执行，并将执行前的代码指纹与封存指纹核对。执行结果未确认或指纹变化时，人工接受须填写理由。交付保留退出状态或失败原因，交接资料省略脚本输出。

操作者也可登记具名脚本，例如 `projectScript: { manager: "pnpm", name: "verify:unit" }`。npm 和 pnpm 脚本名以英文字母或数字开头，可含英文字母、数字、冒号、点、下划线和连字符。开始执行时确认同一包管理器及脚本名。交付保存所选命令，外发覆盖摘要以 `project-script` 标识自定义检查。 SDK 运行检查时关闭 pnpm 的自动依赖安装。

项目注册时启用 `checkTrackedDiff: true` 后，Host 在封存交付时对相对于确认基线的已跟踪变更运行 `git diff --check`，并把结果写入快照。检查失败或未能执行（包括非 Git 目录）时，操作者需在验收反馈中填写接受理由。未跟踪文件仍列在交付清单中。本地 SDK 流程封存的交付在操作者请求审查前，通过 `deliveryDetail.modelReviewStatus` 中记录 `not-requested`；较早交付缺少此字段时返回 `null`。交付详情和项目交接文件通过 `validationResults` 将检查名称、状态与封存的指纹关联。Host 保存观察时间和实际取得的退出码，无法执行时说明是否缺少 Git 基线或有效退出状态。早期交付沿用原有状态。

调用 `reviewDelivery` 时提供当前任务版本、准确的交付 ID、交付版本、需求版本及快照。接受交付要求代码与需求匹配，且每项失败或未执行的验证均有人工豁免理由。退回会将反馈带入下一 Run，并保留原交付和验收记录。重放已提交的等价请求时返回原回执。

通过 `exportHandoff` 分享单个项目的需求版本、Run 摘要、选定材料、交付和验收记录。活动执行退出后，通过 `exportBackup` 下载带版本与 SHA-256 校验值的备份。备份保存工作台记录及 Session 引用，省略凭据、工作区文件、原始工具输出和 Session 日志文件。再次受理执行时，Host 将前序 Run ID、Session ID、需求版本、输入回执及最后观察到的事件保存到 `previousCheckpoint`。项目交接文件包含该引用及新 Run 的 Session ID。早期 Run 沿用当时记录的信息。

`restoreBackup` 仅在空数据库中接受备份。写入前，Host 会核对校验值、格式版本和记录关联。Host 将每个 Run 与受理时的需求版本核对，并检查授权阶段或整个任务的有序验收条件。恢复的交付必须逐项覆盖这些条件。接受交付须保留对失败或未执行检查的人工豁免，退回交付须保留反馈。排队 Run 恢复为已取消的历史。启动前已取消的 Run 在多次恢复后仍保留历史，无需补回 Session 文件。恢复时不会启动 SDK 或交互。若要继续已恢复的 Run，请把兼容的原 Session 文件放回配置的位置，并确认工作目录。Host 在受理续接和实际启动前核对已记录的输入回执及最后观察到的 Session 事件。请使用包含该进度的副本，或显式新开 Session。恢复时按各任务的启动记录核对先后关系。新开和续接 Session 均须关联上一次实际认领的 Run，即使中间有已取消的排队请求。续接须保留原 Session、工作目录和已记录的 SDK 配置。Host 将每次人工决定与当时的命令核对，并按活动顺序检查每个 Run 的退回意见是否与受理前最后一次决定一致。

Host Adapter 通过 `createTaskRuntime` 创建独占客户端。它在确认的工作目录启动 `sdk` profile，并在 Host 选定的补丁之后加载工作台权限补丁。SDK 握手要求审批、权限预设、沙箱策略、沙箱后端及 Session 持久化服务均已激活。补丁将 JSONL 存储指向 Run 主目录下的 `sessions`。通过 `execution.patches` 指定 profile 补丁的绝对路径，通过 `execution.requestTimeoutMs` 限制等待输入回执的时间。新 Run 按加载顺序保存显式 SDK 补丁文件的内容摘要。Host 在准备启动和受理原 Session 续接时核对这些文件。补丁变更后，需新开 Run 使用更新后的部署。没有摘要的历史记录继续使用原有的路线和路径校验。

项目成员从本地 Web Host 的 `taskboard-team.html` 登录。只读成员可查看获授权项目、需求和讨论。编辑者还可修改需求并评论。Host 在同一事务中核对当前项目授权与任务版本，提交修改并记录成员身份。版本冲突返回 HTTP 409。控制 Run、审批工具、验收交付、备份及管理账号均需 Host 操作者权限。

操作者可更换成员密钥、撤销单个项目的授权或全局停用账号。Host 重启后数据库保留授权。业务备份保留署名活动，排除账号、角色授权和密钥验证值。恢复后在目标 Host 重新授权。

<a id="understand-the-implementation"></a>
## 实现说明

[任务数据域](src/domain.ts)在打开存储时校验项目及任务记录。[控制器](src/index.ts)在同一个 SQLite 事务内提交任务变更、活动和命令回执。Host Adapter 将 Run 与任务、固定输入、Session、工作目录和租约代次绑定。确认 runtime 退出后释放该代租约。人工决定保留交付版本、快照和豁免理由。version 统计已提交的操作，revision 标识需求快照。

[执行记录](src/execution.ts)按提交顺序保存排队的 Run，重放时返回原命令回执。每个排队的 Run 预留其任务和选定的 Session，并保存已确认的目录或固定基线的工作树方案。Host 在同一个 SQLite 事务内将空闲租约分配给最早满足依赖且目录可用的 Run。认领后，`prepareWorkspace` 使用保存的方案，核对实际目录、分支与基线。缺少已保存方案的等待项需要取消并重新确认后提交。取消等待中的 Run 会保留历史，释放任务预留以及为该 Run 预留的新 Session。已有数据库缺少队列记录时，以空队列打开。

启用 `execution.dispatch` 后，Host 在启动、队列命令、验收或停止后认领可执行项。它在启动 SDK 前复核已保存的路线和工作目录。Run 进程尚未启动时，准备失败会留档并释放执行槽。初始化完成后，`submitInput` 先保存尝试记录和此次输入最早可能出现的 Session 事件序号，再调用 `session/prompt`。SDK 原回复不可用时，Host 在绑定的 Session 中从该序号起查找匹配的收件消息。重启后的 Host 确认旧进程范围退出后读取已保存的 Session，记录该输入的实际回执和可观察到的结束事件。日志缺失或不兼容时，未确认的输入仍显示在 Run 历史中。每份已保存的输入只发送一次，停止确认后到达的回执仍记入原 Run 的历史。SDK 进程接收过滤后的父进程环境和 `execution.env` 中显式配置的变量。

Run 的 SDK 轮次结束后，Host 关闭 SDK 并等待整个进程范围退出。轮次成功且已有交付时，Host 检查工作目录，在同一事务中封存交付、将任务置为待验收并释放租约。Run 完成但没有交付时，任务进入阻塞状态。如果收尾阶段无法确认退出，可使用 `recheckRunStop` 复核。

`watchChanges` 在连接建立时及工作台变更持久化后发送通知。浏览器通过已认证的读取方法刷新当前视图。重新连接时先读取当前状态，再监听后续变更。

<a id="model-experience"></a>
## 模型体验

### 任务快照输入

#### 模型看到什么

启用调度后，SDK 通过 `session/prompt` 收到一条用户消息，包括保存的标题、目标、可选的约束和风险等级、验收标准、退回反馈及显式选定的材料文本。SDK 将消息记录在该 Run 的 Session 中。运行时提供 `ask_user_question`、`taskboard_read`、`taskboard_update` 和 `taskboard_submit_delivery`。读取工具返回已确认的需求与当前任务版本。更新工具记录进度、评论及阻塞原因。交付工具为原有验收标准逐条提交证据。Host 将调用绑定到所属 Run，并按工具调用 ID 重放重复写入的回执。人工验收使用操作者命令。

#### Token 影响

用户消息消耗输入 Token，包括保存的文本和字段名。模型请求携带四个工具的定义。

#### KV Cache effect

该控制器不改变模型请求前缀。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- Web profile 默认禁用调度。自动对账需要 macOS 图形登录，并且启动时已保存该 Run 的所有权证据。进程范围未核实时保留租约。

<a id="dev-note"></a>
### 开发备注

每个任务记录包含其需求快照和活动。控制器通过同一数据域持有这些记录，直接读取 SQLite 中的权威状态，因此不发布不变量 companion。
