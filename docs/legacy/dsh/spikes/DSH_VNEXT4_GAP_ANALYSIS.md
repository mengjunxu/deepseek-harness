# vNext.4 source audit

English | [中文](DSH_VNEXT4_GAP_ANALYSIS.zh.md)

## Scope and evidence

Reference audit dated 2026-10-28. P0 changes documents only. The initial tracked tree was clean on codely_bridge; docs/myPlan was untracked input. No fixed repository release was supplied. [Evidence](../../../../.ai/tasks/dsh-vnext4-audit/artifacts/audit-evidence.json) records source/input SHA-256 values and the executed 61-test baseline. Status describes product acceptance, not file existence.

## Capability matrix

| Feature | Status | Current evidence | Gap | Reuse / proposed change | Tests / work | Risk |
|---|---|---|---|---|---|---|
| FR-CP-01..06 | partial | `packages/client/ui-model-selection/src/client/catalog.ts; ModelCatalogDirectory.load; chatgpt-plan/src/index.ts; PlanAdapter` | Provider groups and SIWC catalog exist; gated Web, account/usage metadata and separate Executor selection are missing | Extend llm/modelCatalog/settings | VN4-01/02; T01/02/09/15; UAT-02/08/15 | Equal model names do not imply equal capabilities; changes affect subsequent Turns |
| FR-SIWC-01..04 | partial | `packages/experimental/chatgpt-plan/src/protocol.ts; authorize, refreshGrant, planPayload; src/index.ts; accessToken, PlanAdapter` | Login/refresh/catalog/disconnect exist; reasoning/vision are restricted; Loader, long-response and persistence acceptance remain | Retain opt-in Provider; P1-05 integration | P1-05 / QR-02; T03/13/14/15; UAT-01/11 | 19 focused SIWC tests passed; no account/model catalog acceptance |
| FR-WEB-01..05 | todo / blocked | Repository package/config discovery found no ChatGPT Web Provider | No independent Adapter, gated registration, Lease/Receipt or Manual entry; real automation is blocked | Use llm for Mock/Manual; keep Tool Bridge separate | VN4-01/06; T11/12/16/27/29; UAT-07/13/15 | MIT source availability does not authorize account automation |
| FR-EX-01..03 | partial | `packages/subagent/subagent-codex/src/run.ts; startCodexRun; wire.ts; CodexAppServerWire; apps/cli/config/examples/codely-local/run.mjs` | Codex uses one ephemeral thread/turn; Codely uses stream-json; no unified ExecutorRouter or verified Codely native-model | Reuse subagent/subprocess/jobs and retain DSH native-model | VN4-02/05; P1-07; T02/04/05/11/23; UAT-03/04/15 | Current Codex Adapter exposes neither native Session resume nor an active tool registry |
| FR-EX-04..06 | partial | `packages/experimental/mgsd-workflow/src/types.ts; TaskRequest, TaskRecord, TaskFact; core.ts; reserveExecution` | TaskRequest lacks general Session/Workflow/Executor/AC binding; jobId is not an immutable Run; handoff is incomplete | Extend facts/Job mapping with owner and migration review | VN4-03/05/08; P1-01..03/08; T04/05/10/30; UAT-09/14 | Nullable plan does not permit planless execution; retain approval/scope/idempotency |
| FR-EX-07..09 | partial | `mgsd-workflow/src/core.ts; project, review; codely-local/run.mjs` | Exit/check facts, review facts and bounded fixes exist; generic ValidationResult and optional ReviewPackage do not | Reuse validation facts/budgets; add reviewerPolicy | VN4-03/04; P1-10/11; T06/07/08/30; UAT-05/06 | Current executed state needs review to complete; new branches require replay/version validation |
| FR-TB-01..05 | todo / blocked | `packages/mcp/mcp-client/src/index.ts; packages/mcp/mcp-resources/src/index.ts; wire.ts` | Outbound clients/resources and app-server request handlers are not an inbound task Gateway or active Codex Tool Host | Optional Gateway after Task API/authorization; prefer DSH Host | VN4-10; P3-07/08; T18/21..24/27; UAT-12/13 | Codex Host needs a separate PoC; long Tunnel calls return task IDs |
| FR-MEM-01..04 | partial | `packages/core/session/src/index.ts; packages/session/session-persistence-jsonl/src/index.ts; packages/context; packages/compaction` | Logs/context/Fork exist; general Task/MemorySnapshot/ContextEpoch binding and cross-Provider acceptance do not | Keep Session authority; separate product Memory from .ai/MEMORY | VN4-07/08; P1-06, P2-01/02; T09/19/28; UAT-08/14 | Keep committed Session generations; Fork does not restore an official ChatGPT conversation |
| FR-MEM-05 | todo | `packages/ssh; packages/subagent; packages/experimental/agent-team/src/task-board.ts` | Remote execution and local team boards exist; no complete cross-device Registry/lease fencing | Reuse subprocess/SSH/Job | VN4-11; P3-01..06; T25/26; UAT-09/14 | Local controllers/team members are not cross-machine leases; do not copy secrets |
| FR-Q-01..03 | todo / partial | `packages/llm/llm/src/index.ts; packages/llm/llm-retry/src/index.ts` | Usage/retry exist; complete UsageSource, reservation/settlement and cross-source consent enforcement do not | QR-01..06 exclusively own metadata/budget/Ledger | VN4-01/07; QR-01..06; T15/20; UAT-10 | Local Web counts are not official balance; unknown balance does not authorize paid fallback |
| FR-RL-01..03 | partial | `subagent-codex/src/wire.ts; runTurn; chatgpt-plan/tests/provider.spec.ts; llm-retry` | Terminal/disconnect/cancellation handling exists; unified TurnAttempt/Receipt and optional Bridge fence acceptance do not | Extend logged/streamed events for accepted/unknown/tool facts | VN4-07; T14/17/18/30; UAT-11/16 | Do not replay every network failure; Provider completion and tool/Run success differ |
| FR-SEC-01 | partial | `packages/credentials/credentials-local/src/index.ts; credentials-local/README.md` | Private YAML, atomic updates and locking exist; OS Keychain/encryption are not established | Reuse credentials service; assess protected storage and redaction | VN4-09; T26; UAT-14 | Same-user tools can read secrets; no claim of encrypted isolation |
| FR-SEC-02..03 | partial / blocked | `packages/sandbox; packages/credentials/authorization; mgsd-workflow/src/core.ts; approve` | Sandbox/authorization/plan-digest approval exist; unified revocable caller/turn/workspace/expiry grants do not; Web admission unknown | Keep approvals, add TaskSpec approval without empty plans; Mock rejection tests first | VN4-03/06/09/10; T12/21/26/29/30; UAT-07/12/16 | Enforce authorized Workspace; model-supplied Turn IDs do not authenticate callers |
| Workflow / PRD §3, §9, D-01..08 | partial / todo | `packages/workflow/workflow/src/index.ts; mgsd-workflow/src/core.ts; project, approve` | Dynamic script Workflow exists; new templates/Override/ReviewPolicy are absent from UI | Add product template policy; retain dynamic service and developer WORKFLOW | VN4-03/04; T03..08; UAT-01/03..06 | Future automatic product workflow generation does not obsolete existing script workflows |

## Historical comparison

The current tree contains the V0–V2 handoff design and v2.1/CG0–CG5 plan. They retain Session authority, dual executors, bounded retries and future Workers. v2.1 still requires model Review in its simple-task flow and acceptance gate; these clauses are obsolete under vNext.4. Codely-only default is replaced by explicit independent Executor selection. QR-01..06 remain the sole quota-policy work owners.

Standalone vNext.1–3 source documents were not found by repository file discovery. Their Web-centered and mandatory Planner descriptions are attributed only to vNext.4 §0.1/§15, not independently audited quotations. TurnAttempt/Broker/ContextEpoch are retained target concepts, not evidence of implementation. The old handoff V0–V2 and product V0–V2 use different numbering and remain distinct.

## Decisions and next work

The [proposed ADR](../../../../.agents/notes/proposed/architecture/2026-10-28-independent-chat-provider-executor.md) records routing, optional planning/review and bridge policy. It does not supersede implemented script workflows or native Codex backend decisions. The `../../../workflows/DSH_IMPLEMENTATION_PLAN.md` §11 owns VN4 stages and test mapping; the `../../workflows/DSH_CHECKLIST.md` owns status. Recommend VN4-01/02 contract work after stage authorization. Real Web access, active Codex Native Host and missing historical originals remain explicitly unverified.

## v5.1 comparison

The user-designated `../../Generic_Agent_Harness_v5_1_CN_Technical_Design_and_Codex_Implementation_Plan.md` is the historical baseline for this audit. `../../../workflows/DSH_IMPLEMENTATION_PLAN.md` owns the merged disposition; [reference lock](CGW_REFERENCE_LOCK.md) owns external source review.

| v5.1 scope | Disposition / observed code | Follow-up |
|---|---|---|
| §1–5, §10–11: native/external modes, ACP, manifests | Keep modes; modify protocol requirement. Codex uses app-server and Codely example uses stream-json; universal ACP and Codely native-model support are not established | VN4-01/02/05; capabilities are supported/unsupported/unknown |
| §6/9: mandatory PLANNING/REVIEWING chain | Obsolete as a universal product requirement. MGSD currently enforces plan approval and review completion, so implementation remains partial | VN4-03/04; preserve authorization and historical replay |
| §7/8: Session and three-layer Memory | Keep ownership. Session logs and context exist; durable scoped MemorySnapshot and task-aware Checkpoint integration remain missing | VN4-08; no second Conversation store |
| §12/13: worktrees and GitHub nodes | Keep isolation and future coordination goal; cross-device Registry/leases/fencing remain todo | VN4-09/11; SSH and local boards are not distributed task recovery |
| §14: fixed role and budget ladder | Modify to explicit independent selection and consent; no silent paid/cross-source fallback | QR-01..06; VN4-01/07 |
| §15/16: new Core and ACP-first phases | Obsolete as fresh implementation instructions; map to existing owners and incremental P1–P7 work | Main plan §11; do not remove existing Agent integrations |

These are product requirement dispositions, not code changes. The existing dynamic-workflow and native-subagent ADRs remain active; the new ADR is proposed. No real Web access, global configuration change or P1–P7 implementation was performed.
