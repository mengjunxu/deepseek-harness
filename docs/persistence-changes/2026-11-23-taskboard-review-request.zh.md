---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-23-taskboard-review-request

[English](2026-11-23-taskboard-review-request.md) | 中文

## 概述

独立 Session 记录操作者主动请求的工作台验收覆盖审查及确切模型输入。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-23-taskboard-review-request
baseline: false
changes:
  - root: "event:taskboard/review-request"
    previous: null
    after: "b19096eb6d9ef3ec5237c2e8c94a5ff79894f3cf0e8a9b730fb7e71907ea611f"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

既有 Session 可照常读取。较早版本遇到包含新增必读事件的审查 Session 时会拒绝读取。工作台备份分别保存审查意见和人工决定。

<a id="verification"></a>
## 验证

工作台 coverage-review 场景使用 JSONL 后端读取每次审查请求，将路线、提示、脱敏输入和输出上限与提供方收到的请求逐项核对。

<a id="dev-note"></a>
## 开发备注

无。
