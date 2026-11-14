# Verification

Node 26.5.0 at /opt/homebrew/opt/node@26/bin/node, prepended to PATH for pnpm/Python subprocesses. Fixed tested ref is null; source-sha256.txt identifies the tested working copy. No commit, push, fetch, private credentials, real model request, quota reset or purchase.

## Product checks

- PASS 38 tests: `pnpm exec vitest run packages/core/agent/tests/model-selection.spec.ts packages/core/agent-default-model/tests/intent-routing.spec.ts packages/api/session-controller/tests/agent.host.spec.ts --reporter=dot` (selection-tests.log).
- PASS 80 tests: `pnpm exec vitest run packages/core/agent-default-model/tests/agent-default-model.spec.ts packages/core/agent-loop/tests/system-prompt-admission.spec.ts packages/context/session-reference/tests/session-reference.spec.ts packages/context/session-reference/tests/loader-composition.spec.ts --reporter=dot` (consumer-tests.log).
- PASS 16 intent/scope tests after fixing test typing: `pnpm exec vitest run packages/core/agent-default-model/tests/intent-routing.spec.ts packages/core/scope/tests/invariant.spec.ts --reporter=dot` (scope-tests.log). Thirteen intent cases overlap the 38 above; total unique focused cases = 121.
- PASS `pnpm exec tsc -b packages/core/agent/tsconfig.json packages/core/agent-default-model/tsconfig.json packages/api/session-controller/tsconfig.host.json --pretty false` (typecheck.log).
- PASS `pnpm exec tsc -b tsconfig.host.json --pretty false`, including test programs (host-typecheck.log).
- PASS target host build: `pnpm exec tsdown --filter @deepseek-ai/dsh-agent --filter @deepseek-ai/dsh-agent-default-model --env.DSH_BUILD_FACE host` (build.log). Later doc-typecheck also completes build:lib:host before historical document compilation fails.
- PASS refresh 1: `DSH_SNAPSHOT=refresh pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t entry-model-routing` (snapshot-refresh.log). Authored V3 and generated V4 coexist; no committed generation replaced. Scenario owns its model-specific prompt and shares the identical text-turn tool schemas.
- PASS headless replay 4: `pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/session/headless.snapshot.ts -t 'entry-model-routing|model-(vision|tools|streaming)-required'` (replay.log).
- PASS TypeScript SDK 4: `pnpm exec vitest run --config vitest.snapshot.config.ts snapshots/sdk/sdk.snapshot.ts -t 'intent-routing-(chat|plan|review|execute)'` (sdk-replay.log).
- PASS Python SDK 4: `PYTHONPATH=python/sdk/src /opt/anaconda3/bin/python -m pytest python/sdk/tests/test_intent_routing_snapshot.py` (python-sdk.log).

The headless Session exercises the shipped profile and real entry selection owner with replayed model output. Its prompt and request header both select deepseek-messages/deepseek-v4-pro. Unit/API cases cover pending selection, effort removal, asynchronous assembly, notices, owner disposal, two-Agent scope isolation, invalid config, and RATE_LIMIT/TRANSPORT without alternate routes. Scope invariant cases cover missing carriers globally and mismatched subjects for the new query.

## Documentation and static checks

- PASS gen-scoped-events, gen-cordis-catalog, gen-config-catalog and gen-persistence-catalog. New query has generated scope resolver and Cordis API reference. Persistence JSON is identical to committed schema after removing source locations; no durable event or format change.
- PASS type equivalence 480 primary and 480 derivative blocks (type-equiv.log).
- PASS named pairing write/check for Agent/default-model READMEs, core subsystem, config and persistence catalogs; 5 pairs consistent (pairing-check.log).
- PASS scoped repository Oxlint via `pnpm exec tsx scripts/run-oxlint.ts` over changed Agent/default-model/API/catalog-generator files; final invocation covers corrected intent/scope tests, model-selection source and scoped resolver (oxlint.log, oxlint-final.log).
- PASS `git diff --check`.
- FAIL `pnpm run test:docs`: 18 passed / 2 failed, existing translation-pairing and markdown-wrap categories (test-docs.log).
- FAIL first `pnpm run doc-sync`: 36 passed / 6 failed (doc-sync.log). Two task-owned test typing errors in its build were fixed, then host tsc and intent/scope cases passed. Cordis catalog, scoped events, type equivalence, JSDoc, persistence, links, budgets and website checks pass in that aggregate.
- FAIL affected-gate rerun `pnpm run doc-typecheck` after those fixes: build:lib:host passes, compilation errors only in five legacy planning/instruction documents (doc-typecheck.log). Full doc-sync was not repeated. Other recorded failures remain doc graphs (missing chatgptPlan service role), pairing, wrap, stale client catalog and stale skill package list. The graph generator cannot complete, so graph refresh remains unverified.

Intermediate corrections: the first new scope fixture disposed before asynchronous invariant companions mounted; awaiting the initial SystemPrompt plugin fixed the test lifecycle. An accidental ESLint command fails because this repository uses Oxlint (lint.log); no ESLint configuration added. Scope freshness initially rejected missing scope-dispatch JSDoc, then source documentation, resolver and exhaustive test inventory were updated.

## Limits

GUI browser/desktop selection flow and GIF NOT_RUN; no GUI change in this increment. Real Provider calls NOT_RUN. No default production composition enables entry routes automatically. Standalone SDK server has no installModelSelection owner and rejects entry mode; existing configured SDK routes retain their expected output. No new loop or durable Session type; QR-03 remains PARTIAL for structured-output/resume semantics, GUI acceptance, explicit fallback and complete policy checks. Paid-route consent and quota/budget ownership remain separate tasks. No Architecture, Memory, Workflow or Agent Note update required for this reuse of existing ownership.
