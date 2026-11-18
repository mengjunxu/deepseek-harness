---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-15-native-request-accounting

[English](2026-11-15-native-request-accounting.md) | 中文

## 概述

在 token-meter/request-records 下增加可选的原生分发结算记录及有界 Session 投影。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-15-native-request-accounting
baseline: false
changes:
  - root: "event:llm/request-accounting"
    previous: null
    after: "66e05c8d8ca10f720bbe1f2169f053a79d13c33d6333d4123b7e876286638069"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

既有 Session 不包含该记账事件，行为保持不变。新记录沿用 Session 信封及已提交序号作为身份。不认识该必读事件类型的读取器会拒绝日志，不会静默丢弃记账数据。新投影从状态版本 1 开始。Session 信封语法及物理存储 schema 不变；随附默认组合不启用该插件。

<a id="verification"></a>
## 验证

聚焦记录器/投影与回放辅助实现的覆盖率达到 100%。Headless 和 TypeScript SDK 的原生记账场景刷新及回放成功；Python SDK 六项测试通过，并在读取保留的 V3 输入时收到新的当前记账事件。移除构建产物记账追加的负向对照会触发固定的一条记录断言失败，随后恢复完全相同的文件。没有调用真实提供方账户。

<a id="dev-note"></a>
## 开发备注

无。
