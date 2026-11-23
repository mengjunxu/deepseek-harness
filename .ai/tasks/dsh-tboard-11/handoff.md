---
schema_version: 1
task_id: dsh-tboard-11
state: HANDOFF_READY
active_agent: null
updated_at: "2026-11-23T06:53:51+00:00"
branch: codely_bridge
---

2026-11-23T05:37:19+00:00，TBOARD-10 已释放写入权，核对 codely_bridge 及未提交改动后由 Codex 单写。桌面 get_usage_limits 的 Codex 10080 分钟窗口剩余 58%，11 月 24 日 17:34:53 上海重置，停止线 20%。

2026-11-23T05:44:01+00:00，Host 回归 27 项通过，双 Host 版本竞争仅一个提交，停用跨重启持久化，业务备份排除账号验证值。桌面 Codex 周剩余 58%，11 月 24 日 17:34:52 上海重置。下一步是正式 Web 与独立浏览器角色验收。

2026-11-23T05:47:05+00:00，正式 dsh Web + Chromium 的 operator/viewer/editor 独立会话与两个项目通过，6 个操作者 RPC 拒绝成员凭据，撤权阻断重放，轮换、重启和停用通过。命令 node apps/web/tests/fixtures/taskboard-smoke.mjs --team。Codex 周剩余 57%，重置 11 月 24 日 17:34:53 上海。下一步验收协作冲突和恢复备份后账号隔离。

2026-11-23T05:51:54+00:00，两个独立 Chromium 编辑者的旧版本写入被拒绝，保留草稿，刷新后重提成功并显示两位作者。新 Host 从业务备份恢复后账号为零，任务和署名保留，两把原密钥均失效。Codex 周余量 57%，11 月 24 日 17:34:53 上海重置。下一步为正式构建及工作台整组回归。

## 本地权限与协作验收已完成

同一 Web Host 上的操作者、编辑者和只读成员均已通过正式入口验收。管理面板在重新读取账号版本后才允许下一次修改。项目角色、撤权、换钥和停用跨重启生效，两个浏览器编辑同一任务时保留版本冲突和作者署名。独立接收进程恢复两个项目与历史署名，账号从零重新发放，仅有读权限的新凭据写入返回 403。见[验收数据和构建指纹](evidence/macos-team.json)、[可移交的测试备份](evidence/portable-team-backup.json)及[检查记录](log.md)。

工作区 codely_bridge，本轮涉及 taskboard-controller、client-connection、ui-taskboard、Web 成员入口与测试、配置/服务目录、依赖、双语说明和实施计划。原有 G2/G3 改动保留，本轮修改未提交、未推送。机制已索引到 .ai/ARCHITECTURE.md，本轮无需变更通用 WORKFLOW 或另立 Memory 记录。

## 后续验收

- 物理接收设备就绪并取得对应构建后，在干净测试环境执行 `node apps/web/tests/fixtures/taskboard-smoke.mjs --team-import .ai/tasks/dsh-tboard-11/evidence/portable-team-backup.json`。与[本机回执](evidence/macos-team.json)核对归档 SHA-256，并保存第二台设备及其构建的独立回执。该命令只创建临时测试 Host。
- 当前工作分支没有开放 PR。需要为实际 PR/CI 指定交付关联的仓库与 PR；已有签名 GitHub webhook 在本机有 19 项前置回归。实现并验证交付的准确提交、检查状态与人工验收的关系。远程节点的身份、领取、取消和恢复仍按 P3-01..06 单独验收。
- G2 NFR02 继续等待 8 核、16 GB、SSD Mac。参考机到位后按 [TBOARD-09 性能口径](../dsh-tboard-09/performance.md) 复测。

2026-11-23T06:00:39+00:00，写入权已释放。桌面 get_usage_limits 的 Codex 周窗口剩余 56%，2026-11-24 17:34:52 上海重置。再次接手前核对 Git 与 20% 停止线。

2026-11-23T06:21:50+00:00，Codex 接续已释放的写入权。当前授权为在 origin 建草稿 PR，核对正式交付、实际提交、CI 与待人工验收状态。周余量 56%，20% 停止，设备复测延后。

2026-11-23T06:28:57+00:00，用户暂缓建 PR，继续核对 push CI。独立工作树完成回执验证器，四项行为测试通过；正式本地 Web/SDK 已封存分支提交的全部六个文件，状态 in_review，人工决定为 0。桌面 Codex 周额度剩余 55%，11 月 24 日 17:34:52 上海重置。下一步把 GitHub 的已结束运行与该交付核对并写入任务活动。

## 分支提交与 CI 已验

2026-11-23T06:31:49+00:00，按用户更新保留草稿 PR 为待办。六个文件的回执工具、CI 及说明位于 origin 的 `codex/tboard-11-delivery-ci`，该工作树与远端同步。原 `codely_bridge` 的运行时、验收驱动和历史修改继续保留在本机。真实交付与 GitHub 成功运行已关联，重启后仍待人工验收，重复附加未增加活动。[分支 CI 证据](evidence/branch-ci.json)及[操作日志](log.md)。

人工验收人可打开 `/Users/x-dt/.dsh/taskboard-acceptance/web-taskboard-QR8RPC/review.command`，进入任务工作台的 **TBOARD-11 PR and CI** 项目查看交付及活动，再决定接受或退回。首次入场仍需操作者的 Web 认证。PR 创建、跨设备恢复及 8 核 16 GB Mac 的 G2 性能验收按用户要求延后。当前阶段单写权已释放。桌面 get_usage_limits 的 Codex 10080 分钟窗口剩余 54%，2026-11-24 17:34:53 上海重置，停止线为 20%。

2026-11-23T06:35:38+00:00，接手只读验收核对，正式浏览器已打开交付版本 1，人工决定交给使用者。当前周额度剩余 54%，停止线 20%。

2026-11-23T06:36:58+00:00，已在 Edge 打开私有验收 Host 的「查看交付」面板，交付 1、版本 1。助手未提交人工决定。读取 GitHub 两次实际成功的运行与 job 页面，用已发布的 deliveryReceipt 对同一份交接做只读比对：当前提交成功记录匹配，旧提交的成功记录被拒绝。[实测](evidence/ci-attribution.json)。匿名 GitHub REST 命令本次仍返回 403，页面及提交关联验证通过。草稿 PR、设备验收按约延后。周余量 53%，窗口于 11 月 24 日 17:34:53 上海重置，停止线 20%。本次未修改产品代码，未新增通用规则或 Memory。 已释放写入权，保留验收页面供使用者决定。

2026-11-23T06:41:22+00:00，Codex 接回写入权，只读核对使用者的决定并重启验收实例，周余量 53%。

2026-11-23T06:43:12+00:00，源 SQLite 读取一个 operator accepted 活动和一个 accept 决定。正常停止原 Host，按相同目录与端口重启，在认证 Remote 读取同一决定；任务 done、快照和命令 ID 一致。backup 导出后在空目录经独立 Host 的 restoreBackup 恢复并再次读取，验收状态一致、无新增 Run。已用最新 exportHandoff 生成独立的 accepted-ci-receipt.json，原待审回执作为历史保留。Codex 周剩余 53%，20% 停止。下一步复核匿名 REST 恢复后的发布命令路径。

2026-11-23T06:45:49+00:00，从源数据库的一致性副本经正式 exportBackup 导出 accepted-backup.json，从保存的文件在独立空库恢复成功，状态 done、人工决定 1 条及历史 Run 1 条。备份位于私有验收目录，SHA-256 见 [证据](evidence/accepted-restart.json)。桌面 get_usage_limits 的 Codex 10080 分钟窗口剩余 53%，11 月 24 日 17:34:52 上海重置，20% 停止。等待 GitHub REST 当前限额窗口重置。

2026-11-23T06:53:51+00:00，PASS：在已发布的分支工作树运行 node scripts/taskboard/delivery-ci.mjs，对当前交付核对真实 GitHub REST，正式回执所有字段与页面生成的回执一致。同一命令指向上一个成功运行，按预期因提交不同而拒绝关联。已保存私有 accepted-ci-rest-receipt.json，详见 [验收证据](evidence/accepted-restart.json)。桌面 Codex 10080 分钟窗口剩余 52%，北京时间 11 月 24 日 17:34:52 重置，停止线 20%。 本阶段仅更新 codely_bridge 本地任务、实施计划及证据，无新增提交或推送。无需更新架构、Memory 或共享流程。当前可执行项完成，释放写入权。第二台设备到位后核对版本和备份 SHA-256，恢复并取回设备回执；远程节点及 8 核 16 GB Mac 的 G2 按对应设备补验。草稿 PR 暂缓。
