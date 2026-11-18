---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-15-durable-loop-request-attribution

[English](2026-11-15-durable-loop-request-attribution.md) | 中文

## 概述

为原生结算及准备审计记录增加可选的持久循环尝试归属。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-15-durable-loop-request-attribution
baseline: false
changes:
  - root: "event:llm/preparation-failed"
    previous: "2026-11-15-native-preparation-audit"
    after: "4ba862098b06a8e106301df464d293bddbd89f51118b74d6cafab4b660904792"
    decision: same-version
  - root: "event:llm/request-accounting"
    previous: "2026-11-15-native-request-accounting"
    after: "633fd528d0be127b8f0ddaee77c45a952975bccabb798949e187ec8805d40797"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

两个既有事件根新增可选 loopAttempt 引用。既有记录仍有效，缺失归属保持未知。新引用由所属 Session、已提交 step/start 序号及步骤内尝试序号组成，不复用生命周期内的实时 frame ID。两个投影状态均升至版本 2，丢弃版本 1 缓存后重放。Session 信封语法与物理存储版本不变。

<a id="verification"></a>
## 验证

61 个文件中的 1096 项相关拥有者测试通过，准备／记录／投影／不变量模块的聚焦可执行覆盖率达到 100%。五个记账组合刷新及九项相关回放通过。Python SDK 七项用例通过，使用保留输入及固定归属元数据。两个构建版 headless Host 恢复同一个持久 Session，使用不同步骤引用且尝试序号均为 1；两个独立测试副本并发也通过。仅移除构建产物的结算引用会使真实 SDK 固定元数据断言失败，随后恢复完全相同的文件。没有调用真实提供方账户；不把 SDK prompt 接口当作恢复接口。

<a id="dev-note"></a>
## 开发备注

无。
