# Execution log

P1 continuation authorized. QR-03 first exact-model increment uses existing inputModalities for vision; generic model metadata and other required capabilities are not fabricated.

Regression before implementation: focused exact-model cases failed because Provider support admitted unknown/text-only models (full output before-fix.log). Shared resolveCallWithInfo now rejects explicit vision without exact image modality using UNSUPPORTED_MODEL_CAPABILITY; Provider admission remains first, prepared calls retain normalized model facts.

PASS 115 tests / 2 files: `/opt/homebrew/opt/node@26/bin/node node_modules/vitest/vitest.mjs run packages/llm/llm/tests/provider-policy.spec.ts packages/llm/llm/tests/service.spec.ts --reporter=dot`. No extra fallback route or adapter stream invoked on model rejection. Snapshot uses a production pi-ai text-only model with Provider vision declared supported and a local probe tool occurrence.

Step 2: tsc -b llm and tsdown --filter @deepseek-ai/dsh-llm --env.DSH_BUILD_FACE host PASS. Snapshot refresh 1 and replay 3 PASS; V3 input and V4 output retained. First refresh failed because authored V3 message lost its tool-result wrapper; corrected fixture instead of normalizer, then passed. gen-cordis-catalog computed 119/wrote 3 expected artifacts. Named README pair and scope oxlint passed. Quota step boundary again 300-minute window UNKNOWN (only 10080 minutes/21% used returned).

2026-11-12T08:48:15+08:00: final gates 18/2 and 36/6, relevant checks PASS. Final quota: only 10080-minute window, 22% used; 300-minute remaining/reset UNKNOWN. Evidence saved; exact-vision task DONE, parent PARTIAL; write ownership released. No commit/push, architecture/memory/decision updates required.
