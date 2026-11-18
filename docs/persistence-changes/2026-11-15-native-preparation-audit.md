---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-15-native-preparation-audit

English | [中文](2026-11-15-native-preparation-audit.zh.md)

## Summary

Adds opt-in native preparation failure audits and a separate bounded Session projection.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing Sessions have no preparation-failure event. The new required event uses the existing Session envelope and committed sequence identity; builds without its event type refuse the log. Preparation audits neither increment dispatch counts nor alter token totals. Its projection begins at state version 1; the existing settlement projection and envelope grammar are unchanged.

<a id="verification"></a>
## Verification

The 639 affected owner tests pass, with 100% focused coverage of the executable preparation helper and recording/projection modules. Headless and TypeScript SDK cases produce one preparation audit and one later completed settlement, with fixed SDK protocol outputs. Python SDK passes seven cases; the new case consumes retained V3 and requires one preparation record. Omitting only the built audit append fails that fixed assertion, then exact artifact bytes are restored. No real provider account was called.

<a id="dev-note"></a>
## Dev Note

None.
