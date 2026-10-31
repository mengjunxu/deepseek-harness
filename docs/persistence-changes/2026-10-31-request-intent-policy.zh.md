---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-31-request-intent-policy

[English](2026-10-31-request-intent-policy.md) | 中文

## 概述

在既有 request/header 调用配置中增加可选 intent 和 requiredCapabilities。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-31-request-intent-policy
baseline: false
changes:
  - root: "event:request/header"
    previous: "2026-09-16-session-format-v4"
    after: "ef3ef7d100d899c74a7def5af245cabb12b0bcea65e49cd4e920bb9602643b60"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有记录仍可读取：缺少 intent 表示未分类，缺少能力要求时不增加能力限制。这些字段记录模型不可见的准入输入；provider/model 与重建的模型内容保持原有含义。旧读取方可忽略这些字段并投影显式路线和内容，但不实现新增政策检查；不承诺降级执行时的政策保证。新持久化读取方拒绝未知意图或能力值。

<a id="verification"></a>
## 验证

LLM、Session 与意图路由拥有者的 207 个定向单元测试通过。四个真实 SDK profile Session 回放覆盖 chat、plan、review、execute；Python SDK 投影覆盖相同四条路线。准备调用和直接流式测试在适配器 I/O 前拒绝未知或不支持的能力，以及缺失的政策路线。

<a id="dev-note"></a>
## 开发备注

无。
