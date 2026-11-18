# Verification

The source and fixtures are identified by evidence/tested-files.json. Changes remain uncommitted on codely_bridge; earlier tasks are preserved. No real provider account, GUI or publication was exercised.

| Surface | Executed check | Result |
| --- | --- | --- |
| Source behavior | Vitest token-meter and llm-replay owners, seven files, focused V8 coverage | PASS: 291 tests; new executable record modules and changed replay helper have 100% statements/branches/functions/lines |
| Native profiles | Snapshot replay for headless request-accounting, request-accounting-retry and SDK request-accounting | PASS: three current cases; retry records error/zero-usage then completed/12-input/3-output |
| Adjacent profiles | Earlier affected/adjacent headless and SDK replay selection | PASS: eight cases before final metadata-capture fix; the three accounting owners were rerun after that fix |
| Python SDK | PYTHONPATH=python/sdk/src /opt/anaconda3/bin/python -m pytest python/sdk/tests/test_intent_routing_snapshot.py -q | PASS: six cases; accounting consumes retained V3 and requires exactly one current event |
| Negative control | Remove only emitted accounting append, run real SDK/Python accounting case, restore exact bytes in finally | FAIL_AS_EXPECTED: completed request has zero records instead of one; restored artifact SHA verified |
| Corpus | pnpm run test:snapshot scripts/session-snapshot-corpus.corpus.ts | PASS: three tests |
| Types and emit | Host typecheck; full build; after final optional-entry change, node tsc -b packages/llm/token-meter | PASS; full build emitted 347 client artifacts before final entry-only fix; scoped emit and actual native replays cover the final entry |
| Lint | Full lint, then scoped token-meter lint after final entry-only change | PASS |
| Published integration | pnpm run hygiene | PASS: 18/18 after source subpath alias fix |
| Persistence | persistence-changes history check; persistence-formats check | PASS: 63 roots/10 history records; all five v0-v4 references |
| Docs | doc-sync, then exact failed-surface rechecks | Initial 37 PASS/5 FAIL; introduced anchor and historical-index defects fixed, full links and five-format checks PASS. Three existing debts remain: legacy doc typecheck, corpus pairing gaps, hardwrap. No exceptions added. |
| Bilingual owners | verify-translation-pairing.ts on four changed owner pairs | PASS |
| Baseline model experience | Existing first-turn prompt/tool schema byte comparison | PASS: zero added bytes/tokens; event is not model-surface input |

No historical codec or committed Session generation was changed. Empty-response retry refresh runs the real migration from retained V3; header-only version editing was rejected and its invalid new draft retained as task evidence. The default plugin remains unchanged; recording is opt-in. No full repository unit/coverage matrix, real API calls, UI/GIF or push was run for this slice.
