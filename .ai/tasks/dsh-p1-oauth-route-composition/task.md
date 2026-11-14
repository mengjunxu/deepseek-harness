---
schema_version: 1
task_id: dsh-p1-oauth-route-composition
title: "QR-02 OAuth credential composition"
status: DONE
priority: P1
created_at: "2026-11-12T07:48:26+08:00"
updated_at: "2026-11-12T07:48:26+08:00"
---

# Goal

Complete QR-02 configuration-separation evidence with stored OAuth credentials through the existing Loader composition.

## Acceptance criteria

- [x] Stored OAuth account replacement changes the next request without changing Provider policy.
- [x] Explicit Key reference overrides stored OAuth; a missing named Key fails without falling back to OAuth.
- [x] Removing stored OAuth refuses unauthenticated requests before model I/O; fees remain declared/unknown rather than inferred from auth.
- [x] Confirm independent executor configuration and supported/unknown mode evidence; update parent checklist only within QR-02 scope.
- [x] Focused checks use a supported Node runtime and evidence records limitations.

## Scope

Fake OAuth grants, temporary credential store, real Loader and pi-ai auth derivation, loopback completion transport. No real login, token refresh or native Codex endpoint claim. P1-05 owns real Provider lifecycle acceptance; P1-07/VN4-02 own common Run and selector integration. No private account data, external model calls, commit or push.
