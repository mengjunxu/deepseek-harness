---
schema_version: 1
task_id: dsh-p1-turn-usage-source
state: DONE
previous_agent: Codex
next_agent: none
branch: codely_bridge
base_commit: null
tested_code_commit: null
updated_at: "2026-11-16T03:53:02.081820+00:00"
---

# Checkpoint

Completed the bounded QR-06 Turn cost-source disclosure. Turn usage joins only unique native accounting by explicit durable step/attempt reference. Unknown remains explicit for absent/duplicate/mismatched evidence; raw sample arithmetic is unchanged. A Step Location data definition feeds the existing Turn consumer without transcript rows or discovery queries. Chat re-exports the token-meter data types instead of duplicating them. The existing localized dialog shows route/source rows and retains an accessible trigger name when mobile CSS hides its label.

## Verification

See verification.md and evidence/tested-files.json. PASS: 797 owner tests/49 files, focused executable coverage 100%; source/client typecheck, final full build/347 client artifacts and Web build, full lint, hygiene 18/18. Actual Web composition/native replay cases (recording enabled/disabled) refresh and replay PASS; earlier Turn source stays fixed after selecting a different model. Light/dark 420px screenshots reviewed, Escape/outside dismissal and narrow trigger tested. Corpus three and persistence history (64 roots/12 records unchanged) PASS. Three named bilingual pairs PASS; doc-sync 39 PASS/3 existing debts (legacy typecheck, missing corpus pairing, hardwrap). No model prompt/tool bytes added.

The new Web V3 input is authored for this scenario and V4 is actual writer output; no committed generation or historical codec edited. The initial wrong compiler face emitted 28 ignored source siblings; backed up, verified and removed only those generated files, then corrected Host include/Client exclusion. Final build/lint pass; tracked sources untouched by cleanup. All diagnostic console output removed and primary test failures retained with cleanup defects.

## Experience and remaining scope

Use pnpm dsh web --patch apps/cli/config/examples/request-accounting.yml, finish a native request and open its usage row in detailed mode. Sources rely on captured Provider declarations; old/missing evidence stays unknown. User guide and owner docs describe this scope. QR-06 is now PARTIAL, not complete: per-call consent/budget UI, full fallback evidence, official balances and real-account/GIF acceptance remain open. Screenshots and replay use controlled keyless models; no real billing claim.

Next: audit the next dependency-ready consent/policy slice using existing interaction/feedback owners; do not add a parallel approval store or assume SDK prompt resumes Sessions. Memory records the verified source join; no shared Workflow change required. Codex remains sole workspace writer while continuing the Plan, no subagents. All prior/current modifications are local/uncommitted/unpushed on codely_bridge, no PR. This completed Task does not release workspace ownership.

## Quota

Live get_usage_limits 2026-11-16T03:49:21.389Z: Codex 10080-minute window used 66%, remaining 34%, reset Unix 1794907980. Query before next task/expensive step. At <=10% stop new work, save HANDOFF_READY and release ownership.
