---
schema_version: 1
task_id: dsh-p1-turn-usage-source
title: "Show captured usage source in completed Turn usage"
status: DONE
priority: P1
created_at: "2026-11-16T02:36:42.857550+00:00"
updated_at: "2026-11-16T03:53:02.081820+00:00"
---

# Goal

Show the captured request cost source beside each completed Turn's model routes, with explicit unknown when historical attribution is missing.

## Scope

Extend the existing token-meter Turn usage fold and existing UI Chat usage dialog. Join metadata only by explicit durable loopAttempt reference, preserve raw token totals and distinguish auxiliary/unlinked/duplicate evidence. Use existing Conversation Location data to deliver accounting events to the Turn consumer; do not infer identity from arrival time or current Provider discovery. Route all copy through locale dictionaries and reuse the existing dialog styles and dismissal/placement behavior. Verify actual Web profile/native model flow and Session-driven keyless evidence. This is a bounded QR-06/05 slice, not a complete ledger, official balance, billing-authority classification, consent UI or fallback policy. No real account calls, commit/push/PR.

## Acceptance criteria

- [x] Failure-first tests expose missing source data and user-facing disclosure.
- [x] Successful/retried attempts use explicit captured source; legacy, conflicting or missing evidence stays unknown without changing token totals.
- [x] Existing Conversation and Turn usage consumers expose metadata with no copied transcript or Provider-directory lookup.
- [x] Localized dialog preserves layout, keyboard/outside dismissal and light/dark rendering.
- [x] Source/client tests, actual native Web flow, relevant Session snapshots, docs and fixed-source checkpoint are recorded.

## Constraints

Codex sole workspace writer on codely_bridge; all earlier completed Tasks and local changes preserved, no subagents. Check 10080-minute Codex quota at each step and before expensive stages. At <=10% stop new work, save HANDOFF_READY and release ownership. Artifact producers finish before built consumers. Apply dsh-client-ui-ux, prose/doc and CI reliability guidance; no PR is being published.
