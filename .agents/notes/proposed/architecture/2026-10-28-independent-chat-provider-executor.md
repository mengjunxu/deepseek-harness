# Agent Note: Independent chat routing and adaptive task execution

Status: proposed

English | [中文](2026-10-28-independent-chat-provider-executor.zh.md)

## Problem

A model route and an engineering executor have different capabilities, authorization and usage sources. Coupling them makes a chat Provider change alter execution semantics. The v5.1 default Planner/Reviewer chain also requires explicit planning and model review for simple work. Existing MGSD execution requires an approved plan and completes through review; nullable plan storage alone does not satisfy optional planning.

## Proposal

Adopt the `../../../../docs/myPlan/DSH_PRD_vNext_4_2026-10-27.md` incrementally. Keep Provider, Executor and Workflow selections independent. Register Web and SIWC as peer model routes; Web remains gated until its separate admission conditions are met. Preserve native-model integration and the external Codex/Codely loops, with capabilities verified per driver rather than forcing ACP on every driver.

Create a minimal TaskSpec only for execution. Make PlanRevision and model Review optional under versioned templates, Auto selection and user Override. Deterministic validation remains mandatory. Approval must bind the actual TaskSpec, authorized files/actions or explicit plan revision; omitting a plan must not widen permission. Record skipped review separately from passed model review. A Run retains its actual Executor and starting selection; later changes apply to a new Turn or Run.

Keep Session logs authoritative and map task semantics to existing MGSD facts, jobs and storage before adding missing fields. Add persistence transitions and replay evidence before changing MGSD execution paths. Keep a revocable, scoped Tool Bridge optional and independent of engineering execution. Prefer a DSH Tool Host; an active Codex Native Host requires its own PoC and otherwise reports unsupported. Quota policy must block unapproved paid or cross-source fallback and distinguish reported usage from estimates.

## Existing decisions

Retain [dynamic workflows](../../implemented/feature/2026-07-05-dynamic-workflows.md) and [native subagent backends](../../implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.md). They own script workflows and product-process lifecycle; this proposal adds product selection and task policy without superseding those decisions. The scoped supersession audit found no implemented note to archive. Developer collaboration WORKFLOW remains separate from runtime template policy.

## Alternatives considered

**Fixed Planner → Executor → Reviewer:** v5.1 uses this default, but vNext.4 requires direct chat and quick tasks without mandatory model planning or review. Retain explicit plans and review where risk or the user requires them.

**Web-centered reverse tools as the engineering path:** the input contrasts this with independent executors; making it mandatory would couple task availability to Web admission and an unverified active Codex Host. Keep it optional.

**A new Store and universal ACP adapter:** v5.1 suggests a new integration layout, but existing Session, MGSD and subagent owners already provide relevant mechanisms. Extend them and probe each driver instead of duplicating state or claiming unsupported resume.

## Acceptance criteria

The `../../../../docs/workflows/DSH_IMPLEMENTATION_PLAN.md` maps implementation and tests: direct chat creates no Task; quick tasks can finish with no Plan and skipped model review; complex work retains versioned plans, approvals and bounded fixes. SIWC/Web Mock × Codex/Codely are independently selectable. Changing selections cannot rewrite a running Run. Gated Web performs no real access. Unknown submission, cancellation, validation failure and pending tools cannot become success. Tests cover replay, migration, quota consent, scope rejection and restart before this proposal becomes implemented.

## Risks

MGSD plan approval and review completion are coupled today. Loosening them without versioned facts could invalidate historical replay or remove authorization. Web account admission, supported models and active Codex tools remain unverified external dependencies; reference code and its license do not grant account access. P0 changes documentation only and does not approve P1–P7 implementation.
