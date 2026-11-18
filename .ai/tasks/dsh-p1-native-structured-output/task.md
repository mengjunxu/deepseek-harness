---
schema_version: 1
task_id: dsh-p1-native-structured-output
title: "Native JSON Schema requests with recorded routing and output validation"
status: DONE
priority: P1
created_at: "2026-11-15T11:01:08+08:00"
updated_at: "2026-11-15T12:53:09+08:00"
---

# Goal

Make explicit structured output a usable, logged request option with native schema delivery and validated completion, instead of relying on capability declarations alone.

## Acceptance criteria

- [x] Provider-neutral JSON Schema response format is validated, immutable when prepared and retained in request headers/equality.
- [x] Intent routes carry the format; unsupported/unknown Provider or exact-model support rejects before streaming.
- [x] Existing pi-ai OpenAI-compatible protocols send the native strict JSON Schema payload, preserving ordinary requests and credential/config capture.
- [x] Invalid schemas and invalid or incomplete structured completions fail explicitly; tool-call continuation remains valid.
- [x] Unit, real Loader/loopback, shipped-profile keyless Session and both SDK regressions cover the feature.
- [x] Persistence changes are acknowledged under current format rules; owning docs/catalogs and parent Plan are updated.

## Scope

Extend existing LLM call configuration, adapter resolution and intent-routing consumer. Reuse pi-ai payload hooks and maintained JSON Schema validation; no new provider store or native executor resume promise. Default calls remain unformatted. No real API key/provider call, new GUI, paid fallback, PR, commit or push. Prior completed browser/graph changes remain uncommitted and owned separately. Codex is the only writer. Check real weekly usage each step and stop at remaining <=10%.
