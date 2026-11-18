---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-15-native-preparation-audit

[English](2026-11-15-native-preparation-audit.md) | 中文

## 概述

增加可选的原生准备失败审计及独立的有界 Session 投影。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-15-native-preparation-audit
baseline: false
changes:
  - root: "event:llm/preparation-failed"
    previous: null
    after: "5f0222b5897c22d0623be37d688bc30a5011f30230e2c2d2f0d240a70dae86f3"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

既有 Session 没有准备失败事件。新增必读事件沿用 Session 信封和已提交序号身份；不认识该事件类型的构建会拒绝日志。准备审计不增加分发次数或 token 总量。新投影从状态版本 1 开始；既有结算投影与信封语法不变。

<a id="verification"></a>
## 验证

639 项相关拥有者测试通过，准备辅助模块与记录／投影模块的聚焦覆盖率达到 100%。Headless 与 TypeScript SDK 场景产生一条准备审计及一条后续成功结算，并有固定 SDK 协议输出。Python SDK 七项测试通过；新增场景读取保留的 V3 输入并要求一条准备记录。仅移除构建产物的审计追加会触发该固定断言失败，随后恢复完全相同的产物。没有调用真实提供方账户。

<a id="dev-note"></a>
## 开发备注

无。
