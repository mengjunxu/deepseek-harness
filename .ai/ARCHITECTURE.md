# Agent Workflow Architecture Notes

## Repository facts

- `AGENTS.md` is the canonical repository instruction file. `CODELY.md` directs Codely to it and records Codely-specific context.
- The DSH product is composed from Cordis plugins and profiles. Cross-agent Markdown records are a repository collaboration convention, not a new DSH runtime service.
- `docs/architecture.md` owns the product architecture overview. Read it before changing packages.
- Active implemented Agent Notes under `.agents/notes/implemented/` record shipped decisions and their rationale. There is no separate `ADR/` directory in this repository.
- Existing DSH task, session, workflow, and scheduled-task features have their own package owners. This V0 does not change those runtime features or make them authoritative for this handoff.

## Product planning lookup

- Product requirements come only from [the current main PRD](../docs/myPlan/DSH_PRD_vNext_4_2026-10-27.md) and [the Taskboard PRD](../docs/myPlan/DeepSeek_Harness_Taskboard_PRD_v0.1.md). The user confirmed this scope on 2026-11-16. Historical plans, proposed records and existing business examples do not add requirements.
- [The implementation plan](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md) derives tasks and progress from those two PRDs. Its retained IDs are tracking labels; implementation candidates are not completed product capabilities.
- The [approved Taskboard entry](tasks/dsh-tboard-00/decision.md) uses the existing DSH Web Host and authentication. The task service owns the business database; each Run uses a separate SDK runtime. A [change of working directory](tasks/dsh-tboard-01/directory.md) starts a new Session, retains predecessor references and carries only operator-selected materials. Task business records and Harness Session model/tool facts have distinct owners and references; no legacy task library is a mandatory base.
- [Plan section 13](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md#13-p0-执行器能力与实施基线2026-10-30) indexes historical executor probes only. They do not establish a current SDK/runtime matrix or Taskboard G0 acceptance.

- Provider admission metadata and pi-ai policy configuration are implemented through the existing LLM registration and settings mechanisms; [plan section 14](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md#14-p1-当前实现范围) records the scope. The optional agent-default-model/intent-routing plugin now captures an explicit route per Turn, while the existing request header records intent and required Provider capabilities. Exact-model vision/tool/streaming/native-schema admission is implemented through the LLM model resolver; native response schemas travel in the request header and completed output is validated ([owning reference](../packages/llm/llm/README.md#request-strict-json-schema-output)). The optional [paid-route policy](../packages/guard/paid-route-policy/README.md) checks exact API-metered presets against captured registration metadata and live grants; opt-in one-request approval runs before reservation with final permission rechecks. Native executor resume, quota accounting and independent selectors remain pending.

- [Plan section 15](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md#15-当前第一优先web-chatgpt-provider-可行性验证) owns the current user-directed Web ChatGPT Provider validation priority and reference. It supersedes the earlier P4/optional-research schedule; it is not evidence that a real Web route has passed verification.

- Storage domains expose atomic `KvTable.modify` through SQLite’s optional backend record operation; ordinary reads and `update` retain Host-local cached semantics. See the [storage reference](../docs/subsystems/storage.md) and [atomic-storage evidence](tasks/dsh-p1-budget-atomic-storage/handoff.md). The optional [request-budget-policy](../packages/guard/request-budget-policy/README.md) consumes the atomic primitive through registered LLM dispatch to enforce local request allowances and explicit execute reserves; it does not infer official balances.

## Decision lookup

Search the active implemented Agent Notes and the owning package or architecture documentation for decisions related to the task. Proposed and archived notes are not current shipped-decision authorities. If an applicable active decision is unclear, record the source and request resolution before changing the design.

- Optional native accounting reuses token-meter and the existing Session/projection owners: [request-records](../packages/llm/token-meter/README.md#request-records) captures settled dispatch route/source/outcome and raw adapter counters, with separate native preparation-failure audits and explicit durable loop-attempt references. It is not a complete Usage Ledger, official balance query or authorization service; [bounded verification](tasks/dsh-p1-usage-records/handoff.md) states the remaining coverage.
