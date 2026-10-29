# Shared Agent Memory

This file indexes stable repository facts for Codex and Codely. Task progress belongs in that task's records, and decision rationale belongs in the active Agent Notes.

- Canonical repository rules: [AGENTS.md](../AGENTS.md).
- Codely context and repository memory: [CODELY.md](../CODELY.md).
- Product architecture: [docs/architecture.md](../docs/architecture.md).
- Documentation rules: [docs/AGENTS.md](../docs/AGENTS.md).
- Confirmed shipped decisions: [`.agents/notes/implemented/`](../.agents/notes/implemented/); read the relevant note rather than copying its rationale here.
- DSH plan and task numbering: [implementation plan](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md) sections 10–11 map vNext.4 P1–P7 and CG0–CG5 to the retained P0–P4 / V0–V2 task IDs; the [plan Checklist](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md#12-有效-checklist-与任务证据) owns milestone status. Evidence owners: [baseline](tasks/dsh-p0-baseline/handoff.md), [independent SIWC probe](tasks/dsh-p0-siwc/handoff.md), [SIWC product integration](tasks/dsh-siwc-ui/handoff.md), and [plan audit](tasks/dsh-chatgpt-plan-update/handoff.md).
- Current task authority: the task's `task.md`, `plan.md`, and most recent `handoff.md`.

## ChatGPT integration facts

- Usage classification: SIWC uses Codex / ChatGPT Work usage, planned as `work_codex_shared`, not ordinary ChatGPT chat allowance. OAuth identity alone does not establish billing. Verification: [official OpenAI explanation](https://learn.chatgpt.com/docs/sign-in-with-chatgpt), checked 2026-10-26; restrictions and route mechanics belong to the [provider matrix](../docs/legacy/dsh/spikes/model-provider-matrix.md). Balance stays `unknown` unless actually available; this documented rule does not imply the quota-policy implementation exists.
- Model and executor roles: `llm-pi-ai` / opt-in `chatgpt-plan` supply models to the DSH loop; `subagent-codex` runs the native Codex app-server loop; Codely/MGSD local examples run external processes. Verification: source audit 2026-10-26, [reuse matrix and Decision Log](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md). A Codely native-model provider is a target requiring evidence, not something established by its CLI example.
- State ownership: Session JSONL, MGSD TaskFact/SQLite and existing jobs/workflow are reuse candidates for the product plan. `.ai/` holds developer collaboration records, not the runtime Task Store. A DSH context import/Fork neither restores an official ChatGPT Session nor synchronizes its Memory. See [workflow](WORKFLOW.md), [architecture](ARCHITECTURE.md) and the plan's ownership mapping.
- Entry direction: optional ChatGPT → DSH MCP/Tunnel is distinct from DSH → model inference. The vNext.4 plan targets a peer Web Provider with gated availability and `chatgpt_web_unofficial` usage, distinct from `chatgpt_regular`; real access remains unverified and requires separate admission. These are target constraints in the plan; an MCP client or resources package does not establish that the planned inbound gateway is implemented.
