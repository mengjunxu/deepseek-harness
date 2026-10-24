---
schema_version: 1
task_id: dsh-p0-siwc
title: "验证 P0-03 的 SIWC 订阅路线"
status: DONE
priority: P0
created_at: "2026-10-23T00:44:29+08:00"
updated_at: "2026-10-23T00:53:07+08:00"
---

# Goal

验证当前 Plus 账户能否通过官方 SIWC 本地客户端授权获取模型列表并完成一次流式 Responses 请求。

## Scope

- 使用官方公开 OAuth 注册、PKCE、OIDC 校验和 Responses 端点完成独立可行性探测。
- 保存不含凭据的结果，更新供应商矩阵及 P0-03 清单；API Key 路线保持独立状态。
- 不修改产品包、不把独立探测表述为 DSH Provider 已集成，不开展 P0-04。

## Acceptance criteria

- [x] 授权、身份校验、模型列表、流式终止各自有真实结果或明确阻塞。
- [x] 凭据仅保存在仓库外的用户私有目录，不进入日志或 Git。
- [x] 更新双语供应商矩阵、清单及交接记录，执行相关文档验证。

## Dependencies and constraints

- 用户于本轮明确要求先验证 SIWC，并确认 Codely 已停止写入、由 Codex 接手。
- 现有未提交成果保留；旧任务 dsh-p0-baseline 的历史验证结果不视为本轮验证。
- 使用最小合成输入，不向供应商发送仓库文件。
- 无固定被测产品提交；独立诊断脚本的实测及留存版本 SHA-256 记录在脱敏证据中，不能视为产品实现验证。

## User decisions

- Plus 订阅的浏览器登录和账户授权由用户操作。
