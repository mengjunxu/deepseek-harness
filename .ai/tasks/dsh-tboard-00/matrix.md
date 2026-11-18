# G0 接入矩阵

下表记录 TBOARD-00 时的基线。本分支后续新增能力与复测结果见 [TBOARD-01 当前矩阵](../dsh-tboard-01/matrix.md)。

被测为 macOS 15.6.1 arm64、Node 26.5.0、本分支构建版 CLI 与 SDK 0.1.7-rc.2、sdk profile、deepseek-official / deepseek-v4-pro 路线。请求只发到本机确定性模型。两个实例分别使用临时 home 与工作目录，探测结束后清理。本矩阵仅描述候选组合。完整命令、断言和观测分别见[探测脚本](evidence/sdk-probe.mjs)和[输出](evidence/sdk-result.json)。

| 专题 §10 用例 | 当前结果 | G0 还需要的证据 |
|---|---|---|
| 创建真实 Session | 通过。两个 Session 分别收到持久输入回执、模型回复，日志头匹配 Session ID 和工作目录。 | 首发模型和权限配置还需按选定组合验证。 |
| 同任务连续执行两次 | 未验收。存活实例可在同一 Session 接收第二次输入。 | 通过业务 taskId 关联两次独占 runtime 的 Run 与各自输入回执。 |
| 关闭后恢复原 Session | 阻塞。以原 home 和目录重开时，session/resume 被拒绝；磁盘日志保持原样且没有新请求。 | 引入显式恢复后验证历史、目录、占用冲突和失败不创建替代会话。 |
| 审批允许、拒绝、取消 | 阻塞。当前协议与客户端缺少服务端请求桥，构建版 client.onRequest 为 undefined。 | 在 SDK 管辖的真实工具调用上验证三个结果、取消后的迟到答复及权限效果。 |
| 用户问题 | 阻塞。该版本协议没有 user-question/ask，未运行实际问答。 | 验证同一请求身份的回答、取消及断线。 |
| 双实例停止隔离 | SDK 子进程隔离通过。在 A 请求进行中关闭 A，调用中断；B 随后继续原 Session 并收到回复。 | 用有活动子进程的组合验证整棵进程树退出和业务租约释放。 |
| 目录变化可追溯 | 部分。两个真实 Session 的初始化目录均可从各自日志头回读；当前服务端拒绝 session/working-directory/get。 | 在支持的组合中实际变更目录，核对生效范围、事件与历史。 |
| 服务中断不重复执行 | 未验收。单纯初始化/关闭没有重发输入。 | 在业务启动意图落盘与输入回执之间注入服务中断，以实际请求数核对。 |

## 缺口处置

核对官方仓库固定源码的 [SDK 协议](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/sdk/protocol/src/types.ts)及[客户端说明](https://github.com/deepseek-ai/deepseek-harness/blob/39163dd30f703a79079e2d2446545cff3c453738/packages/sdk/client/README.md)，该树的 SDK 客户端清单版本为 0.2.2-rc.3，已有 session/resume、工作目录请求、服务端审批和用户问题协议。这里只核验源码。保留现有 fork 的 Provider、预算、Session 格式与授权行为，优先在隔离候选组合中评估这些公开接口，再决定最小兼容改动。不能用自动重发 prompt 代替恢复，或用默认允许代替真实审批。G0 未通过，发布配置、模型和权限组合尚未冻结。

## 官方候选实测

在临时 npm 项目安装与 CLI 配套的 `@deepseek-ai/dsh-sdk-client@0.2.2-rc.3`，使用全新的 home 和本机模型端点。在首次显式输入后修改工作目录，关闭 runtime，启动新实例并恢复同一 Session。恢复没有发起模型请求，恢复后的目录与修改值一致。第二次显式输入观察到第一次输入仍在模型上下文中。恢复不存在的 Session 被拒绝，模型请求总数保持两次。[脚本](evidence/official-resume.mjs)与[观测](evidence/official-resume.json)针对独立安装的官方组合。本分支仍使用 0.1.7-rc.2，两个组合使用完全分开的测试数据。

同一官方组合还验证了审批和用户问题。测试 patch 仅为临时工作目录内的 write 增加询问。真实调用经 SDK 回答允许一次后文件出现，回答拒绝或取消时文件未出现，三次操作均有对应 approval/decided 记录。ask_user_question 的回答按 Session 与问题 ID 回到工具事件；另一次在问答等待中关闭 runtime，客户端收到取消信号，迟到答复没有引起第二个模型请求。[脚本](evidence/official-interaction.mjs)与[观测](evidence/official-interaction.json)。

复核官方候选时，在空的临时 Node 项目安装 `npm install --ignore-scripts --no-audit --no-fund @deepseek-ai/dsh-sdk-client@0.2.2-rc.3`，将两个 official 脚本复制到该项目分别用 Node 26 运行。构建版 fork 探测则直接在本仓库运行。正式任务须保留 fork 的权限和费用策略；隔离安装的试验通过只证明可选技术路径。
