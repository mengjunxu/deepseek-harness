---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-15-native-structured-output

English | [中文](2026-11-15-native-structured-output.zh.md)

## Summary

Adds an optional native strict JSON Schema response format to logged LLM call configuration.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing headers omit responseFormat and remain valid. New headers retain the complete schema alongside the selected route; format omission never claims validated JSON. Provider and exact-model admission remain explicit. No Session envelope or event grammar changes.

<a id="verification"></a>
## Verification

Structured-output, route and invariant tests passed; loopback native protocol and Loader/HMR tests passed. New headless and SDK keyless Session refresh cases passed; both response-format modules reached 100% coverage.

<a id="dev-note"></a>
## Dev Note

None.
