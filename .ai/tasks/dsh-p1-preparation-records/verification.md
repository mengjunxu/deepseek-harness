# Verification

Exact source/fixture fingerprints are in evidence/tested-files.json. All changes are local and uncommitted on codely_bridge, with prior tasks preserved.

| Surface | Executed check | Result |
| --- | --- | --- |
| Missing behavior | Original direct native policy-route refusal regression | FAIL_AS_EXPECTED: zero audits instead of one |
| Affected owners | Vitest LLM/token-meter, agent-loop request-error/contract regressions, paid-route/request-budget policy tests | PASS: 639 tests in 31 files; preparation helper and changed recording/projection modules have 100% focused coverage |
| Main-loop identity | Policy-bearing virtual-route regression | PASS: exact Session identity supplied before header admission; no native stream |
| Actual compositions | Headless and TypeScript SDK request-preparation-failed refresh and fixed protocol oracles | PASS: one preparation audit and one later completed native settlement; no dispatch/token total charged for preparation |
| Replay | Nine affected/adjacent headless/SDK cases; Session corpus | PASS: 9 + 3 tests |
| Python SDK | PYTHONPATH=python/sdk/src /opt/anaconda3/bin/python -m pytest python/sdk/tests/test_intent_routing_snapshot.py -q | PASS: seven cases; new case consumes unchanged retained V3 |
| Negative control | Disable only emitted preparation append, rerun real Python SDK case, restore exact bytes | FAIL_AS_EXPECTED: fixed audit count is zero instead of one; artifact SHA verified after restoration |
| Build/types | Full build, latest Host build and Host typecheck | PASS: 347 client artifacts; current Host emit/bundles cover new known event |
| Lint | Full lint and final changed SDK/regression-file lint | PASS |
| Published integration | pnpm run hygiene | PASS: 18/18 |
| Persistence | persistence-changes history and persistence-formats checks | PASS: 64 roots/11 history records, five complete historical references; no predecessor generation/codec changed |
| Bilingual/docs | Six named pair checks, doc budgets, full doc-sync | Named pairs and eight budgets PASS. Doc-sync initially 37 PASS/5 FAIL; introduced budget/index defects fixed and exact checks passed. Existing legacy doc typecheck, corpus pairing and hardwrap debts remain. |
| Model experience | Original first-turn prompt/tool bytes and new SDK prompt comparison | PASS: zero added baseline bytes/tokens |

The initial Python run overlapped doc-sync's Host rebuild and failed when the CLI was temporarily absent; serial rerun after the producer completed passed. SDK protocol ownership depends on existing wire-golden files, so both files were seeded only in the new untracked owner and refreshed before acceptance. A permanent expected final reply and fixed Python event assertions prevent treating an error or missing audit as success.

Real provider accounts, external executors, GUI/GIF, a complete ledger, full policy history, official balance and the exhaustive CI matrix are NOT_RUN/outside this slice. No commit, push or PR.
