---
description: "Persist local MGSD tasks and enforce explicit human approvals, resource budgets, and bounded review cycles."
kind: "package-library"
---

# @deepseek-ai/dsh-experimental-mgsd-workflow

English | [中文](README.zh.md)

## Summary

Callers can save local tasks, approve an exact plan revision, and retain execution and validation facts across restarts. A second failed review requires human intervention. The optional DSH adapter exposes these operations through human commands. This library does not start applications, invoke models, or confine filesystem access.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The [local MGSD guide](../../../docs/user/guide/mgsd-local.md) configures the source-checkout adapter. Library consumers import `MgsdWorkflow` and `parseNodeConfig` from the package entry; [public declarations](src/index.ts) define the branded DSH identifiers. The independent [Core](src/core.ts) accepts consumer identifier types and imports only Node modules and its local records.

Human requests select an existing repository alias, risk, and explicit attempt/expert-call/time budgets. The request snapshots its base ref and timestamp. Unknown JSON fields, unapproved execution, stale revisions, and illegal transitions fail. Budget exhaustion persists `needs_human`; elapsed time is measured from task creation, including planning.

An execution requires a revision-and-digest-matching human approval and at least one independent check. Completion requires ordered executor/check exit facts with code zero and successful managed cleanup. Trivial tasks then complete; standard/high-risk tasks require review. A failed first review permits one fix execution; a second failure stops at `needs_human`. High-risk plans and reviews require `source: expert`, supplied by a trusted caller.

Scope expansion revokes approval. An executing task first records cancellation intent and becomes `needs_replan` only after process settlement. Reopening incomplete active work records `interrupted`, revokes approval, and never respawns a job. `resume` requires a new plan and approval. Close storage only after awaiting owned processes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

SQLite stores immutable requests and append-only facts. Transactions validate the next projection before appending a fact. State is recomputed from those facts, not accepted from model output. A database PID/token lease refuses another live controller and fails closed on ambiguous process ownership. SQLite `user_version` is monotonic, currently 1; unknown versions fail without downgrade or fallback.

No invariant companion is published because state is derived from the sole durable fact sequence, with no independently maintained state projection. The parser and deterministic transition checks reject invalid durable records during every read. [Core tests](tests/workflow.spec.ts) own restart, corruption, approval, budget, and review semantics.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Local MGSD operations](../../../docs/user/guide/mgsd-local.md) — configuration and human commands.
- [Codely process adapter](../../../docs/user/guide/codely-local.md) — executable selection and independent checks.
- [Implementation checklist](../../../docs/MGSD_Implementation_Checklist.md) — local milestone dependencies.

-----

<a id="model-experience"></a>
## Model Experience

None, as local task persistence registers no model-facing context or tools.

#### KV Cache effect

The library does not change model requests or their cached prefixes.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- Synchronous SQLite operations and full fact replay suit small local task histories, not a distributed scheduler.
- The trusted adapter accepts human attestations of expert input; the library does not verify an actual expert invocation.
- Allowed-file lists are recorded, not enforced. Worktree isolation, executor envelopes, and OS confinement belong to their respective consumers.
- Durable facts survive restarts; process-local job output and process reattachment do not. PID reuse can conservatively block lease recovery.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
