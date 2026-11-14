# Verification

Runtime /opt/homebrew/opt/node@26/bin/node v26.5.0; pnpm/Python subprocesses received this directory first on PATH. Stable tested ref unavailable; final source fingerprints retained. All model traffic used replay or private loopback fixtures; no private credentials or real provider account accessed.

- Before implementation: focused provider-policy exact-tool tests FAIL 4 (23 filtered), proving that Provider support admitted unknown/unsupported exact models. Raw output before-fix.log.
- PASS 232 / 6 files: `node26 node_modules/vitest/vitest.mjs run packages/llm/llm/tests/provider-policy.spec.ts packages/llm/llm/tests/service.spec.ts packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm-pi-ai/tests/catalog.spec.ts packages/llm/llm-pi-ai/tests/loader-composition.spec.ts packages/core/agent-default-model/tests/intent-routing.spec.ts --testTimeout=30000 --reporter=dot`. Raw output focused-tests.log. Initial four-file pass not added to this unique count. After this suite only a long helper return was formatted; final lint passed.
- PASS: `pnpm exec tsc -b packages/llm/llm/tsconfig.json packages/llm/llm-pi-ai/tsconfig.json --pretty false` and `pnpm exec tsdown --filter @deepseek-ai/dsh-llm --filter @deepseek-ai/dsh-llm-pi-ai --env.DSH_BUILD_FACE host`.
- PASS refresh 1: `DSH_SNAPSHOT=refresh pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t model-tools-required`.
- PASS replay 4: `pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t 'model-(vision|tools)-required|provider-policy-(configured|gated)'`.
- PASS SDK 4: `pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts -t intent-routing-`.
- PASS Python SDK 4: `PYTHONPATH=python/sdk/src /opt/anaconda3/bin/python -m pytest python/sdk/tests/test_intent_routing_snapshot.py`.
- PASS catalog generation: gen-cordis-catalog (119 computed, 3 written), gen-config-catalog (3 computed, 2 written), gen-persistence-catalog. Source-location-stripped persistence-schema comparison against committed data PASS: no stored payload/type change. No generation bump or new persistence acknowledgement required.
- PASS `pnpm run verify-type-equiv`: 475 primary / 475 paired derivative blocks.
- PASS named verify-translation-pairing write/check for LLM and pi-ai READMEs, LLM subsystem, config catalog and persistence catalog (5 pairs).
- PASS final scope oxlint for changed llm/pi-ai sources/tests and intent-routing test; initial run caught one long test-helper line, corrected with no behavioral edit. No new unknown casts or vendor paths.
- PASS `git diff --check`.
- FAIL `pnpm run test:docs`: 18 passed / 2 failed (translation pairing, markdown wrap).
- FAIL `pnpm run doc-sync`: 36 passed / 6 failed (doc-typecheck, doc graphs, translation pairing, markdown wrap, client catalog, skill plugin package list). Same categories as previous tasks; doc graphs still reports missing chatgptPlan service classification. No failure references new toolSupport code or fixture. Relevant type equivalence, catalog freshness, links, JSDoc, persistence histories and budgets pass. Full output retained.

Only explicit tools requirements gain exact-model enforcement; calls omitting requirements retain their existing behavior. Generic streaming/structuredOutput/resume metadata, UI choices/fallback and budget consent remain outside this increment. No loop or Session event change; both SDKs replay existing expected outputs without rewrites. Authored V3 and new V4 rejection fixtures coexist; existing committed generations unchanged. No full coverage, full platform matrix, real API e2e, full repository unit suite or whole hygiene claim.
