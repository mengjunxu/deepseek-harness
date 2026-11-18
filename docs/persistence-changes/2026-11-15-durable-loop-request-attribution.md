---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-15-durable-loop-request-attribution

English | [中文](2026-11-15-durable-loop-request-attribution.zh.md)

## Summary

Adds optional durable loop-attempt attribution to native settlement and preparation audit records.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Both existing event roots gain an optional loopAttempt reference. Existing records remain valid with absent/unknown attribution. New references use the enclosing Session, committed step/start sequence and step-local attempt ordinal; they do not reuse lifecycle-local live frame IDs. Both projection state versions advance to 2 and discard version-one caches for replay. Session envelope grammar and physical storage versions remain unchanged.

<a id="verification"></a>
## Verification

1096 affected owner tests in 61 files pass, with 100% focused executable coverage of preparation/recording/projection/invariant modules. Five accounting profile refreshes and nine affected replays pass. Python SDK passes seven cases using retained inputs and fixed attribution metadata. Two built headless Hosts resume the same persisted Session with distinct step references and attempt one; two independent copies also pass concurrently. Removing only the emitted settlement reference fails the real SDK fixed metadata oracle, then exact bytes are restored. No real provider account called; the SDK prompt API is not treated as a resume API.

<a id="dev-note"></a>
## Dev Note

None.
