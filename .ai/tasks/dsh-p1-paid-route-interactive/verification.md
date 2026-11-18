# Verification

Tested source is local/uncommitted on codely_bridge; evidence/tested-files.json records SHA-256 and bytes. No commit, push or PR.

| Scope | Command/evidence | Result |
| --- | --- | --- |
| Failure-first | authorization-red.log and revocation-red.log | Expected failures: missing authorization phase and revoked preset escaping ask mode |
| Owners | Vitest LLM, guard policies, token-meter, loop, user-approval | PASS: 1,118 tests / 57 files; policy and dispatch-control executable coverage 100% |
| Retry | Real Agent loop first native RATE_LIMIT, second approval denied | PASS: two independent questions, one native call/reservation/settlement, failed Turn |
| Settings | Actual profile Settings update/rejection/persistence | PASS: invalid mode leaves file unchanged; ask mode without live Agent fails closed |
| Native Web/SQLite | New e2e on shipped confirmation/accounting overlays | PASS: allow and keyboard reject, initial waiting/rejected receipts empty, allow one settled receipt |
| UI | Actual Web screenshots at 420px light/dark | PASS: exact route/unknown charge and balance legible, actions visible |
| Session | New Web owner V4 refresh then final replay | PASS: existing approval audit pair and explicit loop-attempt settlement; retained V3 unchanged |
| SDK | Existing headless/TS SDK snapshot filters and Python intent-routing file | PASS: seven snapshot cases and seven Python cases |
| Build | Full build, Host final rebuild, Web build | PASS: 347 Client artifacts; correct Host/Client test ownership |
| Lint/publication | lint:contracts-ready and hygiene after coordinated Host build | PASS: full lint and 18/18 hygiene |
| Durable input | persistence-changes --check and corpus suite | PASS: unchanged 64 roots / 12 records; three corpus tests |
| Docs | doc-sync, type equivalence, repository references and four named pairs | doc-sync initially 37 PASS/5 FAIL; introduced type-copy/manifest and raw-commit reference failures fixed, both target checks PASS; remaining legacy typecheck, missing corpus pairs and hardwrap match prior Task debt |
| Model input | evidence/model-experience.json | Existing first-turn prompt/tool digests unchanged, zero added bytes/tokens |

No real paid provider call, official balance verification, GIF, PR/design review, exhaustive platform matrix or repository-wide coverage run. Existing user waiver for real API-key testing remains in effect.

The initial Web overlay omitted required storage-domain.backend when replacing its configuration; corrected without weakening readiness. The rejected path correctly leaves native replay unbound: it uses the existing call-free route-only fixture mode, which throws on unexpected streaming. Earlier empty-script binding failure remains in logs. The native permit recheck fixes the ask-mode revocation regression; checker defects remain thrown. The old conditional re-read of readonly AbortSignal after await was redundant with approval cancellation plus composed pre-reservation cancellation; the supported cancellation cases pass after removing it.
