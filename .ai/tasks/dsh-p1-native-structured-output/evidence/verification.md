# Verification

The source fingerprint file identifies the tested local changes; no new commit or push was made.

- PASS `pnpm exec vitest run` with the ten LLM, pi-ai, routing, replay and loop invariant owner files named in `dsh-structured-final-tests.log`: 380 tests.
- PASS `pnpm exec vitest run scripts/gen-workflow-guest.spec.ts packages/test-support/llm-replay/tests/llm-replay.spec.ts --reporter=dot`: 151 tests.
- PASS `pnpm exec vitest run packages/workflow/workflow-ptc/tests/guest.spec.ts --reporter=dot`: 38 tests.
- PASS focused coverage of both new response-format modules: 50 tests, 100% statements/branches/functions/lines.
- PASS `pnpm run test:snapshot:refresh -t model-structured-output`: 2 selected cases; authored V3 and generated V4 remain separate.
- PASS `pnpm run test:snapshot -t 'model-structured-output|intent-routing-(chat|plan|review|execute)'`: 6 selected cases.
- PASS `PYTHONPATH=python/sdk/src /opt/anaconda3/bin/python -m pytest python/sdk/tests/test_intent_routing_snapshot.py -q`: 5 tests, Node 26 on PATH.
- PASS `pnpm exec tsc -b tsconfig.host.json tsconfig.client.json --pretty false`.
- PASS `pnpm run lint:contracts-ready` after coordinated build from doc-sync.
- PASS type equivalence, nine named pairing checks, persistence verification, links, budgets and `git diff --check`.
- FAIL `pnpm run doc-sync`: 39 passed/3 failed; legacy code blocks, existing missing bilingual pairs and legacy hard wraps. No exemption added.
- FAIL `pnpm run test:docs`: 18 passed/2 failed; existing pairing/wrap baseline.
- NOT_RUN real provider/API/account calls and GUI/GIF: native protocol acceptance uses loopback and keyless recorded sessions; no product GUI changed.

An early refresh passed a standalone `--`, disabling filtering. The run was interrupted; only its ten new untracked V4 outputs were removed, listed in `unintended-refresh-files.txt`. No committed historical generation changed. The corrected command selected exactly two cases.
