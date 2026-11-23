---
schema_version: 1
task_id: dsh-tboard-11
status: IN_PROGRESS
---

# G4 团队权限

首项验收为本地 Web Host 上的团队账号、项目角色、撤权和权限隔离。沿用 Host 操作者作为管理员；编辑者可修改本项目任务和评论，只读成员可读项目任务。运行、审批、交付验收、备份和账号管理由 Host 操作者持有。G2 参考机复测另行保留。

本地三角色、双人协作和恢复后的账号隔离已通过。Host 27 项、正式 Web 22 项与 SDK 快照 1 项通过。[团队验收证据](evidence/macos-team.json)。

交付版本 1 已关联[实际分支提交和 GitHub Actions](evidence/branch-ci.json)。[同分支对照](evidence/ci-attribution.json)核对了两次成功的 CI，只有本次提交与交付快照匹配。

使用者已在页面接受交付。原 Host 重启后以及本机独立空库恢复后，任务均为已完成，人工接受记录均只有一条。已保存验收后的独立业务备份，供第二台设备到位后复核。[持久化与恢复证据](evidence/accepted-restart.json)。

草稿 PR 暂缓。第二台设备恢复、远程节点和 G2 参考机复测等待相应设备。[剩余验收计划](plan.md)。
