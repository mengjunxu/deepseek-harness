---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-23-taskboard-review-request

English | [中文](2026-11-23-taskboard-review-request.zh.md)

## Summary

Records the exact input to an operator-requested Taskboard validation coverage assessment in a dedicated Session.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing Sessions remain readable. Earlier readers reject dedicated review Sessions containing the new required event. The archive preserves the assessment and human decision separately.

<a id="verification"></a>
## Verification

The coverage-review Web probe reads each request through the JSONL backend and compares its route, instructions, redacted input and output limit with the observed provider request.

<a id="dev-note"></a>
## Dev Note

None.
