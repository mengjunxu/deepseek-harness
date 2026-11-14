# Verification

Node 26.5.0; pnpm commands ran with /opt/homebrew/opt/node@26/bin prepended to PATH. Fixed tested ref unavailable; source-sha256.txt identifies the tested source and final fixtures. No real model network calls or private credentials used.

| Command | Result |
|---|---|
| `node26 node_modules/vitest/vitest.mjs run packages/llm/llm/tests/provider-policy.spec.ts -t 'exact model|exact image' --reporter=dot` | Before fix: 3 FAIL, 1 PASS, 19 filtered; unsupported/unknown models wrongly admitted |
| `node26 node_modules/vitest/vitest.mjs run packages/llm/llm/tests/provider-policy.spec.ts packages/llm/llm/tests/service.spec.ts --reporter=dot` | PASS 115 / 2 files |
| `pnpm exec tsc -b packages/llm/llm/tsconfig.json --pretty false` | PASS |
| `pnpm exec tsdown --filter @deepseek-ai/dsh-llm --env.DSH_BUILD_FACE host` | PASS |
| `DSH_SNAPSHOT=refresh pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t model-vision-required` | PASS 1; new V4, authored V3 retained |
| `pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t 'model-vision-required|provider-policy-(configured|gated)'` | PASS 3 |
| `pnpm run gen-cordis-catalog` | PASS; 119 computed / 3 expected artifacts written |
| `pnpm run verify-translation-pairing --write packages/llm/llm/README.md` | PASS |
| `pnpm run verify-translation-pairing packages/llm/llm/README.md docs/subsystems/llm-streaming.md` | PASS 2 named pairs |
| `pnpm exec tsx scripts/run-oxlint.ts packages/llm/llm/src/index.ts packages/llm/llm/tests/provider-policy.spec.ts packages/llm/llm/tests/fixtures/model-vision-required.ts` | PASS |
| `pnpm run test:docs` | FAIL 18/2: translation pairing, markdown wrap |
| `pnpm run doc-sync` | FAIL 36/6: doc-typecheck, doc graphs, translation pairing, markdown wrap, client catalog, skill plugin package list |
| `git diff --check` | PASS |

node26 denotes /opt/homebrew/opt/node@26/bin/node. In Markdown table command filters, pipes are pattern alternatives. Full test and gate output in adjacent logs. First snapshot refresh failed because the new V3 fixture used a current-format tool result; corrected its wrapper, without changing parsers/normalizers, then refresh and replay passed. A documentation edit search initially missed the English paragraph; corrected the selection before final pairing/gates.

The full gate failures match predecessor categories and do not mention the changed source or fixture. Relevant catalog freshness, links, export JSDoc, type equivalence, README and budget gates pass. No full coverage/platform matrix, whole-repository unit suite, SDK output refresh or real provider e2e run. No Session types, loop or public signatures changed, so no persistence generation/type acknowledgement or dual-SDK expected output change is required.

Recorded scenario uses the real headless profile, pi-ai configured Provider metadata and exact model lookup; a tool occurrence requests vision and receives the logged UNSUPPORTED_MODEL_CAPABILITY. Its model transcript is authored/replayed, not a real upstream generation. The adapter stream is not reached; no request to the configured dummy endpoint is needed.
