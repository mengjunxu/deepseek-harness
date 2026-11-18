# Verification

The uncommitted source/fixture hashes are in evidence/tested-files.json. Prior Tasks and their local changes are preserved on codely_bridge.

| Surface | Executed evidence | Result |
| --- | --- | --- |
| Missing behavior | Actual loop preparation-refusal regression | FAIL_AS_EXPECTED: missing durable loopAttempt |
| Source owners | Core loop, LLM, token-meter, Session title and admission/budget owner tests | PASS: 1096 tests/61 files; focused helper/recording/projection/invariant executable coverage 100% |
| Invariants | Missing/wrong-step/wrong-ordinal/mutable reference paths | PASS: each invalid owned relationship rejected |
| Retry/concurrency/legacy | Ordinals 1/2/3, interleaved auxiliary settlement, mutation, old caches | PASS; auxiliary/old records do not acquire inferred attribution; version-one caches rebuild to version 2 |
| Persistent owner resume | Real JSONL persistence reopened by a fresh runtime | PASS: new committed step identity with attempt one |
| Built Host resume | Dedicated keyless two-process headless test | PASS; supported --session-id resumes a launcher-created identity; two independently running copies also PASS concurrently |
| Actual profiles | Five accounting refreshes; nine affected/adjacent replays | PASS; retry retains one step reference with attempts 1/2 |
| Python SDK | Seven real sdk-profile cases with fixed metadata and retained inputs | PASS; public prompt API is not used as a resume API |
| Negative control | Omit only emitted settlement reference, run actual Python SDK accounting case, restore bytes | FAIL_AS_EXPECTED: successful request fails fixed attribution metadata comparison; artifact SHA restored |
| Build/types/lint | Full build, Host typecheck, coordinated repository lint, scoped new process fixture lint | PASS; 347 client artifacts |
| Publication integration | Stable post-build hygiene | PASS: 18/18 |
| Durable type history | Successor acknowledgement and five historical-format references | PASS: 64 roots/12 history records; two optional property additions, same-version; no released codec/generation changed |
| Documentation | Six named pairs, source type equivalence, doc-sync | Named pairs and 483 type blocks/483 paired derivatives PASS. Doc-sync initially 37 PASS/5 FAIL; introduced type-equivalence and historical-index defects fixed with exact rechecks. Existing legacy doc typecheck, missing corpus pairing and hardwrap debts remain. |
| Corpus/model input | Session corpus and original prompt/tool byte comparisons | PASS: three corpus tests; zero added baseline bytes/tokens |

The proposed SDK restart test was removed after it correctly exposed that session_prompt creates Sessions. Restart acceptance uses the supported headless profile instead of private SDK argv. The first headless test incorrectly supplied a nonexistent Session identity; its final form lets the launcher mint one and then restores it. All child lifecycles settle before temporary roots are deleted, and the fixture drains queued IPC observations before application disposal.

Official measurement classification, full policy history, Task/Run and external-executor linkage, outer refusal/crash coverage, GUI/GIF and the exhaustive CI matrix remain outside this slice. No real account call, commit, push or PR.
