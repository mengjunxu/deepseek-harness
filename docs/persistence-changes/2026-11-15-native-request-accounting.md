---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-15-native-request-accounting

English | [中文](2026-11-15-native-request-accounting.zh.md)

## Summary

Adds optional settled native-dispatch accounting and its bounded Session projection under token-meter/request-records.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing Sessions contain no accounting event and retain their behavior. New accounting records use the existing Session envelope and committed sequence identity. Readers without the required event type refuse these logs rather than dropping accounting data. The new projection begins at state version 1. No Session envelope grammar or physical storage schema changes; the opt-in plugin is absent from shipped defaults.

<a id="verification"></a>
## Verification

Focused recorder/projection and replay-helper coverage passes at 100%. Headless and TypeScript SDK native accounting cases refresh and replay successfully; Python SDK passes six cases and consumes the retained V3 input while receiving a new current accounting event. A built-artifact negative control omitting the accounting append fails the fixed one-record assertion and restores exact bytes. No provider account was called.

<a id="dev-note"></a>
## Dev Note

None.
