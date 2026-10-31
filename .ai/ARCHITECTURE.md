# Agent Workflow Architecture Notes

## Repository facts

- `AGENTS.md` is the canonical repository instruction file. `CODELY.md` directs Codely to it and records Codely-specific context.
- The DSH product is composed from Cordis plugins and profiles. Cross-agent Markdown records are a repository collaboration convention, not a new DSH runtime service.
- `docs/architecture.md` owns the product architecture overview. Read it before changing packages.
- Active implemented Agent Notes under `.agents/notes/implemented/` record shipped decisions and their rationale. There is no separate `ADR/` directory in this repository.
- Existing DSH task, session, workflow, and scheduled-task features have their own package owners. This V0 does not change those runtime features or make them authoritative for this handoff.

## Product planning lookup

- [DSH implementation plan](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md) sections 10–13 own the ChatGPT integration target, CG0–CG5 / V0–V2 and vNext.4 P1–P7 mapping, source reuse matrix and Decision Log. Provider Router, Quota Policy, Usage Ledger and inbound Task MCP are planned additions, not shipped architecture facts.
- P0 executor capability evidence and the implementation baseline live in [plan section 13](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md#13-p0-执行器能力与实施基线2026-10-30). Capability claims distinguish the pinned Codex provider, host CLI, native Codely and the DSH adapters; native resume remains outside their current promises.
- [vNext.4 audit](../docs/legacy/dsh/spikes/DSH_VNEXT4_GAP_ANALYSIS.zh.md) records source evidence and the v5.1 comparison; the [proposed ADR](../.agents/notes/proposed/architecture/2026-10-28-independent-chat-provider-executor.zh.md) covers independent Provider/Executor selection and optional planning/review. These are product targets, not shipped architecture.
- [Provider matrix](../docs/legacy/dsh/spikes/model-provider-matrix.md) distinguishes model routes, the experimental SIWC integration and external-agent execution; source and task evidence determine completion.
- Keep Session/Task state in its existing owner; Git/GitHub synchronizes code and shared instructions. Proposed interface names do not authorize parallel stores or a second Harness. Formal decisions continue through the existing Agent Notes process.

- Provider admission metadata and pi-ai policy configuration are implemented through the existing LLM registration and settings mechanisms; [plan section 14](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md#14-p1-当前实现范围) records the scope. The optional agent-default-model/intent-routing plugin now captures an explicit route per Turn, while the existing request header records intent and required Provider capabilities. Exact-model capability matching, quota accounting and independent selectors remain pending.

- [Plan section 15](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md#15-当前第一优先web-chatgpt-provider-可行性验证) owns the current user-directed Web ChatGPT Provider validation priority and reference. It supersedes the earlier P4/optional-research schedule; it is not evidence that a real Web route has passed verification.

## Decision lookup

Search the active implemented Agent Notes and the owning package or architecture documentation for decisions related to the task. Proposed and archived notes are not current shipped-decision authorities. If an applicable active decision is unclear, record the source and request resolution before changing the design.
