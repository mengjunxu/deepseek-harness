---
schema_version: 1
task_id: dsh-p1-auth-route-separation
title: "QR-02: authentication and route policy composition"
status: DONE
priority: P1
created_at: "2026-11-11T23:42:46+08:00"
updated_at: "2026-11-11T23:42:46+08:00"
---

# Goal

Verify the existing separation between authentication, provider policy and external executors before adding configuration mechanisms.

## Scope

QR-02 first increment: real Loader composition regression for credential/policy independence, package usage documentation and source-backed Codex/Codely mode matrix. Full QR-02 remains open pending remaining integration evidence.

## Acceptance criteria

- [x] Credential selection changes without changing declared usage source.
- [x] Usage-source changes preserve credential selection; missing explicit credentials fail before network I/O.
- [x] Existing route names, executor configuration and unknown native-model support are documented from source.
- [x] Focused tests and documentation checks recorded; plan reflects actual scope.

## Constraints

User authorized continuation of P1. No external model calls, credential inspection, commit or push required. Existing Taskboard documents and user settings are unrelated.
