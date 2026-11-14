# Verification

Node 26.5.0 at /opt/homebrew/opt/node@26/bin/node. pnpm and Python subprocesses received that directory first on PATH. Fixed tested ref unavailable; final source fingerprints identify this working copy. No private credentials, real model requests, reset credits or purchases used.

- Before implementation: `node26 node_modules/vitest/vitest.mjs run packages/llm/llm/tests/provider-policy.spec.ts -t 'exact streaming|streaming for exact' --reporter=dot` FAIL 4 / 27 filtered. Unsupported and unknown exact models were admitted by Provider declaration alone.
- PASS 244 / 6 files: `node26 node_modules/vitest/vitest.mjs run packages/llm/llm/tests/provider-policy.spec.ts packages/llm/llm/tests/service.spec.ts packages/llm/llm-pi-ai/tests/config.spec.ts packages/llm/llm-pi-ai/tests/catalog.spec.ts packages/llm/llm-pi-ai/tests/loader-composition.spec.ts packages/core/agent-default-model/tests/intent-routing.spec.ts --testTimeout=30000 --reporter=dot`. Includes parser/write denial, modelOverrides and prepared/live config capture for tools and streaming.
- PASS `pnpm exec tsc -b packages/llm/llm/tsconfig.json packages/llm/llm-pi-ai/tsconfig.json --pretty false`.
- PASS `pnpm exec tsdown --filter @deepseek-ai/dsh-llm --filter @deepseek-ai/dsh-llm-pi-ai --env.DSH_BUILD_FACE host`.
- PASS refresh 1: `DSH_SNAPSHOT=refresh pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t model-streaming-required`.
- PASS replay 5: `pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t 'model-(vision|tools|streaming)-required|provider-policy-(configured|gated)'`.
- PASS TS SDK 4: `pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts -t intent-routing-`.
- PASS Python SDK 4: `PYTHONPATH=python/sdk/src /opt/anaconda3/bin/python -m pytest python/sdk/tests/test_intent_routing_snapshot.py`.
- PASS gen-cordis-catalog (119 computed / 3 written), gen-config-catalog (3 computed / 2 written), gen-persistence-catalog. Persistence JSON compared against committed data after removing source locations: identical; no new stored fields or persistence acknowledgement needed.
- PASS verify-type-equiv: 475 primary / 475 derivative blocks; named verify-translation-pairing write/check for 5 pairs (LLM/pi-ai README, LLM subsystem, config and persistence catalogs).
- PASS scope oxlint for changed LLM/pi-ai source and tests plus new fixture; git diff --check. No vendor change or new unknown cast.
- FAIL test:docs: 18 passed / 2 failed (translation pairing, markdown wrap).
- FAIL doc-sync: 36 passed / 6 failed (doc-typecheck, doc graphs, translation pairing, markdown wrap, client catalog, skill plugin package list). Same categories as previous task. No error names the new streamingSupport implementation/fixture; relevant freshness, links, JSDoc, type equivalence, persistence histories and budgets pass. Full raw outputs retained.

node26 denotes the absolute Node 26 path above. Earlier two-file unit pass is not added to final unique counts. No full unit/coverage/platform matrix/hygiene run. No loop or Session event type changes; both SDKs retain existing expected outputs. Authored V3 and newly generated V4 Session coexist; no committed generation overwritten. No current production composition begins requiring streaming automatically.

The recorded Session uses the shipped headless profile and production pi-ai metadata/configuration with Provider streaming declared supported and exact model unsupported. A logged tool occurrence receives UNSUPPORTED_MODEL_CAPABILITY before adapter dispatch. Outer model output is authored/replayed. Positive Loader requests use an owned loopback SSE fixture and observe content-block chunks before terminal finish; this validates the fixture path, not any real model's timing or streaming capability.
