# Local request-budget verification

The tested implementation is identified by SHA-256 in completion-fingerprints.json. The branch is codely_bridge; all changes remain local and uncommitted. Later formatting of the activation test changes no tested behavior. No provider account or GUI request was made.

| Executed command / scope | Result | Evidence |
|---|---|---|
| Vitest app-boot + paid-route-policy + request-budget-policy owners with selected coverage | 5641 tests PASS, one intentional skip; initial coverage FAIL only for an unrelated-entry branch | activation-owners.log |
| Vitest activation/disposal and both policy owners with selected coverage | 65 tests PASS; new activation, disposal and budget implementation 100% statements, branches, functions and lines | activation-coverage.log |
| Vitest storage/LLM/budget affected owners with selected coverage | 154 tests PASS; selected changed implementations 100% | changed-owners.log |
| Built-profile invalid initial budget configuration, before the activation fix | FAIL as expected: native adapter entered without protection | invalid-startup-before.log |
| Vitest e2e shared-hosts.two-process.e2e.ts | Four PASS: finish, SIGTERM settlement, SIGKILL/restart charge, invalid initial configuration with custom id | activation-process.log |
| Two independent simultaneous runs of that e2e file | Four PASS in each process; isolated roots and shared database only within each case | host-overlap-a.log, host-overlap-b.log |
| Built guard disabled negative control | FAIL as expected for second adapter entry; restored artifact hash still matches the final build | host-negative-control.json |
| Provider service-disposer yield removed negative control | FAIL as expected for final consumer write; restored source | provider-drain-negative.json |
| pnpm run build | PASS, 347 Client artifacts | completion-build.log |
| tsc -b tsconfig.host.json; pnpm run typecheck:contracts-ready | PASS | completion-host-typecheck.log, completion-client-typecheck.log |
| pnpm run lint:contracts-ready | PASS after correcting new test formatting; the earlier two invocations failed that formatting | completion-lint.log |
| pnpm install --frozen-lockfile --ignore-scripts | PASS; only intended workspace importer changes retained | completion-frozen.log |
| Seven selected headless Session replays: budget reserved/execute, text-turn, paid approved/required, resume-required, structured-output | PASS | completion-snapshots.log |
| Retained V3 budget replay and Session corpus | Two V3 PASS, 15 corpus PASS; current V4 files restored byte-identically | retained-v3.json and prior step logs |
| pnpm run hygiene | 18 PASS, zero failures | completion-hygiene.log |
| pnpm run doc-sync | 39 PASS, three existing failures: legacy doc-typecheck, missing bilingual pairs, hardwrap | completion-doc-sync.log |
| Named pairing check for app-boot, both policy READMEs and launcher Note | Four pairs PASS | activation-pairing.log |
| Export JSDoc, workspace constraints, generated catalogs and doc graphs | PASS | Completion doc-sync and activation logs |

The final Plan paragraph only synchronizes status prose after the documented doc-sync run; it adds no code block or generated source. The known global documentation failures are not waived. Official balance, token/currency budgets, Session/Task limits, external executors and per-call consent UI remain unimplemented; QR-04 remains PARTIAL.
