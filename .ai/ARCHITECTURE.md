# Agent Workflow Architecture Notes

## Repository facts

- `AGENTS.md` is the canonical repository instruction file. `CODELY.md` directs Codely to it and records Codely-specific context.
- The DSH product is composed from Cordis plugins and profiles. Cross-agent Markdown records are a repository collaboration convention, not a new DSH runtime service.
- `docs/architecture.md` owns the product architecture overview. Read it before changing packages.
- Active implemented Agent Notes under `.agents/notes/implemented/` record shipped decisions and their rationale. There is no separate `ADR/` directory in this repository.
- Existing DSH task, session, workflow, and scheduled-task features have their own package owners. This V0 does not change those runtime features or make them authoritative for this handoff.

## Product planning lookup

- [DSH implementation plan](../docs/workflows/DSH_IMPLEMENTATION_PLAN.md) section 10 owns the ChatGPT integration target, CG0–CG5 / V0–V2 mapping, source reuse matrix and Decision Log. Provider Router, Quota Policy, Usage Ledger and inbound Task MCP are planned additions, not shipped architecture facts.
- [Provider matrix](../docs/dsh/spikes/model-provider-matrix.md) distinguishes model routes, the experimental SIWC integration and external-agent execution; source and task evidence determine completion.
- Keep Session/Task state in its existing owner; Git/GitHub synchronizes code and shared instructions. Proposed interface names do not authorize parallel stores or a second Harness. Formal decisions continue through the existing Agent Notes process.

## Decision lookup

Search the active implemented Agent Notes and the owning package or architecture documentation for decisions related to the task. Proposed and archived notes are not current shipped-decision authorities. If an applicable active decision is unclear, record the source and request resolution before changing the design.
