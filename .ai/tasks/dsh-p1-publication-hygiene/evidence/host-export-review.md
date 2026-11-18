# Host export review proposal

Status: explicitly approved by the user on 2026-11-15: “批准这个精确例外”. Applied only `@deepseek-ai/dsh-home-paths#defaultDshHome`; the integrated hygiene check now passes all 18 gates. The existing peer-required LLM parser classification is unchanged.

| Export | Proposed classification | Executed evidence |
|---|---|---|
| `@deepseek-ai/dsh-home-paths#defaultDshHome` | Exact duplicate-install-safe export | Two separately imported built module instances have different function identities and return the same primitive path matching the operating-system default. The function reads Node homedir and joins a fixed directory name; it installs no service and retains no mutable instance state. |
| `@deepseek-ai/dsh-llm#validateLlmRequestPolicy` | Peer-required export | An invalid policy throws its module's HarnessError; the other module copy does not recognize that class. Retaining one shared LLM instance preserves the identity-sensitive error contract without widening the safe list. |

The proposed production policy diff is in `host-export-proposal.patch`. The accepted implementation must also move the Session→LLM runtime edge into matching peer/development sections. `defaultDshHome` remains one exact allowed export; the other home-path helpers and the whole package do not gain an exception.

`duplicate-copy-probe.json` records the observed values after a target build of home-paths and LLM. No provider or application was started. The source rule at `scripts/package-dependency-policy.ts` forbids automated safe-list additions and requires explicit human review plus a prominent future PR heading. The heading and rationale are prepared in `pr-description.md`; no PR is created by this task.

Durable rationale is consolidated in the existing [published dependency faces decision](../../../../.agents/notes/implemented/process/2026-08-26-published-dependency-faces.md#exact-default-home-path-export). The note remains active because its dependency placement and identity rules constrain future export additions; no note was created, superseded, archived or deleted.

Current consumer: `packages/llm/llm/src/validation-admission.ts` uses the canonical default path to exclude the normal Harness home from isolated validation grants. The exception changes dependency classification only; it grants no model or payment permission.
