---
schema_version: 1
task_id: dsh-p0-executor-probes
title: "P0 执行器探测与决策收尾"
status: DONE
created_at: "2026-10-30T00:50:12+08:00"
updated_at: "2026-10-30T00:57:28+08:00"
---

# Goal

完成 P0-04/05 的本机执行器能力记录和 P0-06 实施基线收尾。

## Scope and ownership

用户授权完成剩余 P0；Codex 为新 Task 唯一写入者，前序状态核对由本 Agent 完成。保留未提交主 Plan 和 dsh-p0-status 记录。不进入 P1，不测试真实 OpenAI API Key，不读取凭据或修改全局配置。使用隔离临时目录与本地模拟模型，真实产品进程探测区别于真实云服务验证。正式已实施 ADR 保持不变。

## Acceptance criteria

- [x] Codely 版本、参数、流事件、错误/取消和 ACP 探测有实际证据或明确 Blocker。
- [x] Codex 固定版本适配、能力与最小执行有实际证据或明确 Blocker。
- [x] 定稿 P0 复用/状态/权限选择，保留未实施 ADR 为 proposed；更新主 Plan 和 Checkpoint。

## User clarification

用户确认使用本机已有登录环境完成 Codely smoke。仅由 Codely 原生程序使用既有登录，不读取/复制认证文件；临时工作区与本地模型设置通过进程参数传入。
