# 执行记录

2026-11-23T05:37:19+00:00，TBOARD-10 已释放写入权，核对 codely_bridge 及未提交改动后由 Codex 单写。桌面 get_usage_limits 的 Codex 10080 分钟窗口剩余 58%，11 月 24 日 17:34:53 上海重置，停止线 20%。

2026-11-23T05:44:01+00:00，Host 回归 27 项通过，双 Host 版本竞争仅一个提交，停用跨重启持久化，业务备份排除账号验证值。桌面 Codex 周剩余 58%，11 月 24 日 17:34:52 上海重置。下一步是正式 Web 与独立浏览器角色验收。

2026-11-23T05:47:05+00:00，正式 dsh Web + Chromium 的 operator/viewer/editor 独立会话与两个项目通过，6 个操作者 RPC 拒绝成员凭据，撤权阻断重放，轮换、重启和停用通过。命令 node apps/web/tests/fixtures/taskboard-smoke.mjs --team。Codex 周剩余 57%，重置 11 月 24 日 17:34:53 上海。下一步验收协作冲突和恢复备份后账号隔离。

2026-11-23T05:51:54+00:00，两个独立 Chromium 编辑者的旧版本写入被拒绝，保留草稿，刷新后重提成功并显示两位作者。新 Host 从业务备份恢复后账号为零，任务和署名保留，两把原密钥均失效。Codex 周余量 57%，11 月 24 日 17:34:53 上海重置。下一步为正式构建及工作台整组回归。

## 验证结果

- PASS `pnpm install --offline --frozen-lockfile`、`pnpm run build`、受影响模块 lint、导出 JSDoc、应用入口与工作区依赖检查。配置目录、Cordis 目录、依赖图及三个包的双语 README 配对通过。
- PASS `vitest run packages/api/taskboard-controller/tests/taskboard.host.spec.ts` 27 项；`vitest run --config vitest.web.config.ts apps/web/tests/taskboard.e2e.ts` 22 项；`vitest run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts -t taskboard-dispatch` 1 项。针对本次团队验收未发起模型调用。
- 连续调整同一个成员角色时，管理员面板曾在重新载入账号版本前启用控件，后一次变更会与已提交的版本冲突。修复后用 Chromium 连续升权、撤权、重新授权、替换密钥均通过。首次整组测试有 21 项通过并遇到旧的界面构建，最终重新构建后的 22 项全部通过。
- PASS `node apps/web/tests/fixtures/taskboard-smoke.mjs --team --team-export <new-file>` 与独立进程的 `node apps/web/tests/fixtures/taskboard-smoke.mjs --team-import <file>`。从同一份业务备份恢复两个项目与两位历史作者，接收端账号起初为零。目标 Host 发放的新只读密钥可以读取授权项目，写入返回 403，恢复未启动 Run。[源备份](evidence/portable-team-backup.json)和[本机接收回执及源码指纹](evidence/macos-team.json)。
- PR/CI 前置验证通过。已有 GitHub 适配器的 handler 与真实 Loader 两组测试共 19 项。GitHub 公开 API 根据工作分支 `mengjunxu:codely_bridge` 查询开放 PR，返回空列表。真实 PR 检查与交付关联仍待验。
- NOT_RUN 第二台设备、远程节点领取与恢复、G2 参考机 NFR02。后者继续依照 TBOARD-09 的 8 核、16 GB、SSD 口径。

- 最终 `pnpm run doc-sync` 37/42。遗留未通过项目为文档示例类型检查、Markdown 链接、全仓双语配对、换行、历史证据的提交引用；与 TBOARD-10 的最终五项相同。本次涉及的配置目录、Cordis 目录、图谱、导出 JSDoc、三个 README 配对单独通过。核对 15 个源码/制品指纹和完整归档 SHA-256 均一致。

2026-11-23T06:00:39+00:00，桌面 get_usage_limits，Codex 10080 分钟窗口剩余 56%，2026-11-24 17:34:52 上海重置，停止线 20%。当前分支没有开放 PR，未指定第二台验收设备。本阶段工作结束并释放本地单写权。

2026-11-23T06:28:57+00:00，用户暂缓建 PR，继续核对 push CI。独立工作树完成回执验证器，四项行为测试通过；正式本地 Web/SDK 已封存分支提交的全部六个文件，状态 in_review，人工决定为 0。桌面 Codex 周额度剩余 55%，11 月 24 日 17:34:52 上海重置。下一步把 GitHub 的已结束运行与该交付核对并写入任务活动。

## 提交与真实分支 CI

2026-11-23T06:31:49+00:00。独立工作树 `deepseek-harness-tboard11-pr` 的 `codex/tboard-11-delivery-ci` 已推送至当前仓库 origin。提交前的四项 Node 测试、双语 README 配对、提交钩子与两次 pre-push typecheck 通过。原工作区 G2/G3 等修改保留在本地。按用户更新暂缓创建草稿 PR，未合并或代为验收。

正式 Web + SDK 通过本地确定性提供方封存 Git 交付。独立接收工作树从基线快进至实际提交，运行变更测试后通过 SDK 提交交付；未调用付费模型。Host 封存的干净工作树指纹与交付、远端分支 SHA 一致。GitHub 匿名 REST 配额当时耗尽，使用 GitHub 公开的运行页、job 页面及完整提交链接做交叉核验，再调用同一回执验证函数。真实运行、尝试号、工作流、推送事件、分支和测试步骤均来自 GitHub，结果成功。[Actions 运行](https://github.com/mengjunxu/deepseek-harness/actions/runs/45124401035)及[实测记录](evidence/branch-ci.json)。

通过认证 Web Remote 将交付 ID、提交和 CI 链接写入任务活动，两次独立启动 Host 复核后该关联仅一条，状态 `in_review`，人工决定 0。完整私有交接、回执和可打开的人工验收入口位于本机 `/Users/x-dt/.dsh/taskboard-acceptance/web-taskboard-QR8RPC`。阶段检查通过，无需修改通用 WORKFLOW 或 Memory。

2026-11-23T06:36:58+00:00，已在 Edge 打开私有验收 Host 的「查看交付」面板，交付 1、版本 1。助手未提交人工决定。读取 GitHub 两次实际成功的运行与 job 页面，用已发布的 deliveryReceipt 对同一份交接做只读比对：当前提交成功记录匹配，旧提交的成功记录被拒绝。[实测](evidence/ci-attribution.json)。匿名 GitHub REST 命令本次仍返回 403，页面及提交关联验证通过。草稿 PR、设备验收按约延后。周余量 53%，窗口于 11 月 24 日 17:34:53 上海重置，停止线 20%。本次未修改产品代码，未新增通用规则或 Memory。

2026-11-23T06:43:12+00:00，源 SQLite 读取一个 operator accepted 活动和一个 accept 决定。正常停止原 Host，按相同目录与端口重启，在认证 Remote 读取同一决定；任务 done、快照和命令 ID 一致。backup 导出后在空目录经独立 Host 的 restoreBackup 恢复并再次读取，验收状态一致、无新增 Run。已用最新 exportHandoff 生成独立的 accepted-ci-receipt.json，原待审回执作为历史保留。Codex 周剩余 53%，20% 停止。下一步复核匿名 REST 恢复后的发布命令路径。

2026-11-23T06:45:49+00:00，从源数据库的一致性副本经正式 exportBackup 导出 accepted-backup.json，从保存的文件在独立空库恢复成功，状态 done、人工决定 1 条及历史 Run 1 条。备份位于私有验收目录，SHA-256 见 [证据](evidence/accepted-restart.json)。桌面 get_usage_limits 的 Codex 10080 分钟窗口剩余 53%，11 月 24 日 17:34:52 上海重置，20% 停止。等待 GitHub REST 当前限额窗口重置。

2026-11-23T06:53:51+00:00，PASS：在已发布的分支工作树运行 node scripts/taskboard/delivery-ci.mjs，对当前交付核对真实 GitHub REST，正式回执所有字段与页面生成的回执一致。同一命令指向上一个成功运行，按预期因提交不同而拒绝关联。已保存私有 accepted-ci-rest-receipt.json，详见 [验收证据](evidence/accepted-restart.json)。桌面 Codex 10080 分钟窗口剩余 52%，北京时间 11 月 24 日 17:34:52 重置，停止线 20%。
