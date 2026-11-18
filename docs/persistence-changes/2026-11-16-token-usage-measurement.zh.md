---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-16-token-usage-measurement

[English](2026-11-16-token-usage-measurement.md) | 中文

## 概述

为原生用量样本及其记账记录增加可选的 token 计数口径。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-16-token-usage-measurement
baseline: false
changes:
  - root: "event:assistant/attempt"
    previous: "2026-09-16-session-format-v4"
    after: "0315523baca73965f8f91fd99d72ee8d9137630696e5b707525e24372cded81e"
    decision: same-version
  - root: "event:assistant/message"
    previous: "2026-09-16-session-format-v4"
    after: "1f953369245561b1f919a77b50f4aa985702922234f783f95e3d34b05280b16d"
    decision: same-version
  - root: "event:compaction/summary"
    previous: "2026-09-16-session-format-v4"
    after: "88fc700d171289fc1904f59de19a2f1b1afa510efd5ecde918675b73a601537c"
    decision: same-version
  - root: "event:llm/request-accounting"
    previous: "2026-11-15-durable-loop-request-attribution"
    after: "bedcc95baa9464eb56ad543444e70a97a568a61eda993ee2f2fb4e0d16528016"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

TokenUsage 增加可选 measurement：provider-reported 或 estimated。缺失元数据保持未知，不从费用来源填默认值。既有 Session 记录仍有效，信封及存储版本不变。请求记账缓存版本3从事件重建版本1/2输入；准备审计缓存保持版本2。已发布代际编解码器与既有保留 V3 输入不变。

<a id="verification"></a>
## 验证

749 项相关源码/客户端测试通过，变更运行时可执行覆盖率100%。原生 headless 与 TypeScript SDK 场景刷新通过；Python SDK 八项用例通过，包括显式估算记账。仅移除构建产物中的记账口径会使 Python SDK 固定断言失败；恢复完全相同产物字节后通过。真实 Web 原生调用在启用/关闭记账时均展示报告/估算口径，独立于费用来源；旧记录仍不分类。保留 V3 输入不变，当前 V4 由真实写入器生成。最终文档汇总门禁记录于拥有者 Task；不声明真实提供方账号或计费验证。

<a id="dev-note"></a>
## 开发备注

无。
