# TBOARD-00 首版入口决策

2026-11-16 用户确认首版工作台位于现有 DSH Web 内，复用 Web Host 与认证。任务服务持有业务库，每个 Run 经官方 TypeScript SDK 启动独占 runtime。

产品依据为[主 PRD §9.4 和 D-10](../../../docs/myPlan/DSH_PRD_vNext_4_2026-10-27.md)及[专题 PRD §9–10、16](../../../docs/myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md)。两种外壳都保留原生 Chat 主界面、单操作者、本地任务服务及同一条 SDK 执行路径。

| MVP 入口 | 部署及复用 | 实施代价 |
|---|---|---|
| 已选用现有 DSH Web 内的工作台页面 | 复用 Web Host、已有 UI 扩展、认证连接与启动 profile。任务服务随 Host 运行；浏览器关闭时任务服务继续运行。 | 提前实现专题放在 G3 的原生入口。必须把任务执行与 Web Host 内的聊天 Session 分开，Host 停止后要对账。 |
| 专题默认的独立本地 Web 工作台 | 用单独的具名 dsh profile 启动任务服务及其本地界面。保留现有原生 Chat，任务可以独立于聊天 Host 运行。 | 需要独立部署、认证入口和升级验证。以后加入原生入口时须连接同一任务服务。 |

两案共同的设计：任务服务单写业务库，持有需求版本、Run 启动意图、租约、Delivery 与人工 Review。Harness 持有 Session 日志中的模型、消息与工具事实。Run 保存 Session ID、目录、持久 dshHome 引用和执行身份。Adapter 经官方 TS SDK 为每个 Run 启动独占 sdk profile。默认串行。Web 聊天 runtime 不接管任务 Session。数据库结构、进程树退出确认、启动后故障对账分别按 TBOARD-02、05、03/08 验证。

首轮候选环境为本机 macOS 15.6.1 arm64、Node 26.5.0、本地 0.1.7-rc.2 CLI/SDK/client/server/protocol 与 sdk profile。先用仅监听本机的确定性模型验证真实子进程、stdio 和落盘，再按实际模型及权限配置验收。备份候选放在操作者选定、位于代码工作目录及运行时 home 之外的本地目录，验收须验证可写、可导出并可恢复到新实例。公布支持组合须等全部 G0 用例通过。

源码依据为[启动约束](../../../docs/architecture.md#application-launch)、[UI Slots](../../../packages/client/ui-slots/README.md)、[SDK 请求及通知](../../../packages/sdk/protocol/src/types.ts)和[服务端方法分发](../../../packages/sdk/server/src/server.ts)。TBOARD-00 检查时，本分支的请求为 initialize、session/prompt 和 shutdown。后续在本分支补入的能力及真实运行证据见 [TBOARD-01 接入矩阵](../dsh-tboard-01/matrix.md)。
