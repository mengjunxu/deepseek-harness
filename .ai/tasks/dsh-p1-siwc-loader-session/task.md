---
schema_version: 1
task_id: dsh-p1-siwc-loader-session
title: "Verify SIWC Loader persistence and recorded Sessions"
status: DONE
priority: P1
created_at: "2026-11-15T13:58:21+08:00"
updated_at: "2026-11-15T13:42:27+08:00"
---

# Goal

Verify the opt-in SIWC provider through real Loader composition, persisted credential restart and a shipped-profile recorded Session without consuming a real account.

## Scope

Own new SIWC tests/fixtures, their required development dependencies, owner README verification links and P1-05 evidence. Reuse the existing provider, credentials, authorization and Session owners. Keep live authorization/long-response/GIF acceptance separate and PARTIAL. Preserve all earlier uncommitted work, including publication hygiene waiting for the exact required human review. Codex is the sole writer; the long-lived Codely desktop binary is not a task writer. No provider-network access, account actions, commit, push or PR. Check live weekly limits after every step; stop at remaining <=10%.

## Acceptance criteria

- [x] Loader opt-in, persisted-account restart, invalid configuration and adapter disposal are observed through public owners.
- [x] A Session JSONL drives keyless SIWC Responses transport and matches the persisted output through the shipped headless profile.
- [x] New fixtures restore globals, dispose contexts and use private roots; negative controls reject their intended regressions.
- [x] Focused tests, artifact/source checks and paired owner documentation have accurate evidence; real-account acceptance stays pending.
