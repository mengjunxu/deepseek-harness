# Session request-cap evidence

Fixed source/artifact identity: completion-fingerprints.json. All changes remain local on codely_bridge. No provider account, GUI, commit, push or PR.

| Executed check | Result | Evidence |
|---|---|---|
| Vitest config/store before implementation | 9 FAIL / 20 PASS at intended missing enforcement and validation | before.log |
| Vitest budget owners with selected implementation coverage | 51 PASS; 100% statements, branches, functions and lines | coverage-final.log |
| Actual Loader/Settings persistence and restart | Two cases PASS, included in the 51 owners | loader.log |
| Built dsh Hosts: global finish/SIGTERM/crash, invalid configuration, same-Session overlap/restart | Five PASS | process-step3.log |
| Session check disabled in built artifact | FAIL as expected for second native adapter entry; exact bytes restored and final build hash matches | negative-control.json, negative.log |
| Two independently overlapping process-test runs | Five PASS each | overlap-a.log, overlap-b.log |
| Headless keyless recorded Session replays | Eight PASS, including new Session-cap refusal and seven adjacent cases | replays.log |
| Retained V3 replay | One PASS; only proven-untracked V4 temporarily moved and restored byte-identically | retained-v3.json, retained-v3.log |
| Session snapshot corpus | Three PASS | corpus.log |
| pnpm run build | PASS; 347 Client artifacts and Host/Client typechecking | build.log |
| pnpm run lint:contracts-ready | PASS | lint.log |
| pnpm run hygiene | 18 PASS, zero failures | hygiene.log |
| pnpm run doc-sync | 38 PASS / four FAIL; config catalog stale after final JSDoc edit, regenerated and independently rechecked PASS | doc-sync.log, config-check.log |
| Named README bilingual pairing | PASS | pair-check.log |
| git diff --check | PASS | executed at final checkpoint |

Three remaining global documentation failures are the existing legacy example typecheck, missing bilingual pairs and hardwrap debt. No exemption was added. No manifest changed in this task, so the prior frozen-lockfile evidence remains applicable. The baseline prompt and tool schema bytes remain unchanged (model-experience.json).

Session caps apply to one immutable budget identity and an exact Session ID. Read-only capability preparation remains Session-independent. Missing identity is refused at atomic reservation before native dispatch, including prepared calls. Task/token/currency/external-executor limits and official balances are not implemented by this task. QR-04 remains PARTIAL.
