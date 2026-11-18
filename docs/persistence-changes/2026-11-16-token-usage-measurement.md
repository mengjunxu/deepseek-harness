---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-16-token-usage-measurement

English | [中文](2026-11-16-token-usage-measurement.zh.md)

## Summary

Adds optional token-counter measurement to native usage samples and their accounting records.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

TokenUsage gains optional measurement: provider-reported or estimated. Absent metadata remains unknown; payment source never supplies a default. Existing Session records stay valid and the envelope/storage versions are unchanged. Request-accounting cache version3 rebuilds version1/2 input from events; preparation caches remain version2. Released generation codecs and existing retained V3 inputs are unchanged.

<a id="verification"></a>
## Verification

749 affected source/client tests pass, with changed runtime executable coverage100%. Native headless and TypeScript SDK scenarios refresh successfully; Python SDK passes eight cases, including explicit estimated accounting. Removing only built accounting measurement fails the fixed Python SDK oracle; restoring exact artifact bytes passes. Actual Web native calls disclose reported/estimated samples with and without accounting, independently of cost source; legacy records remain unclassified. Retained V3 inputs are unchanged and current V4 is produced by the real writer. Final aggregate documentation gates are recorded in the owning Task; no real provider account or billing claim.

<a id="dev-note"></a>
## Dev Note

None.
