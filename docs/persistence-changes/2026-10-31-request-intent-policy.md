---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-31-request-intent-policy

English | [中文](2026-10-31-request-intent-policy.zh.md)

## Summary

Adds optional intent and requiredCapabilities to the existing request/header call configuration.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-31-request-intent-policy
baseline: false
changes:
  - root: "event:request/header"
    previous: "2026-09-16-session-format-v4"
    after: "ef3ef7d100d899c74a7def5af245cabb12b0bcea65e49cd4e920bb9602643b60"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing records remain readable: absent intent is unclassified and absent requirements add no capability restrictions. The fields record model-hidden admission inputs; provider/model and the reconstructed model transcript retain their existing meaning. Older readers can project the explicit route and transcript while ignoring these fields, but do not implement the new policy checks; no downgrade execution guarantee is claimed. New durable readers reject unknown intent or capability values.

<a id="verification"></a>
## Verification

207 focused unit tests passed across LLM, Session and intent-routing owners. Four real SDK-profile Session replays cover chat, plan, review and execute; Python SDK projections cover the same four routes. Prepared-call and direct-stream tests reject unknown or unsupported capabilities and missing policy routes before adapter I/O.

<a id="dev-note"></a>
## Dev Note

None.
