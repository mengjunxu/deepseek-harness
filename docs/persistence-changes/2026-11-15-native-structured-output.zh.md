---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-15-native-structured-output

[English](2026-11-15-native-structured-output.md) | 中文

## 概述

在记录的 LLM 调用配置中添加可选的原生严格 JSON Schema 响应格式。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-15-native-structured-output
baseline: false
changes:
  - root: "event:request/header"
    previous: "2026-10-31-request-intent-policy"
    after: "9c77c0ece5894113463c16c19154291fbb4a4609bccc09546c25b29ea993d753"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有请求头省略 responseFormat，仍然有效。新请求头记录完整 schema 与所选路线；省略格式不代表输出已经过 JSON 校验。Provider 与精确模型准入仍须显式声明。Session 信封和事件语法没有变化。

<a id="verification"></a>
## 验证

结构化输出、路由和不变量测试通过；原生协议回环及 Loader/HMR 测试通过。新增 headless 和 SDK 无密钥 Session 刷新场景通过；两个响应格式模块覆盖率达到 100%。

<a id="dev-note"></a>
## 开发备注

无。
