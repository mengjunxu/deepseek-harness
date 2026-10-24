# DSH repository baseline

English | [中文](repository-baseline.zh.md)

Baseline record for the DSH implementation plan, taken on 2026-10-22 from the `codely_bridge` branch of `deepseek-harness` at commit `ad79fcfb4f`. Every command below was executed in this checkout; results are the observed output, not estimates.

## Scope

This record establishes what the repository already provides before any P1 work starts. It names the real toolchain, maps each architecture capability named in the plan to the package that owns it today, and lists the gaps that P1 must fill. It does not restate the plan and does not claim any capability that was not exercised.

## Toolchain and layout

| Item | Observed value | Source |
|---|---|---|
| Repository | `deepseek-harness`, a Cordis-plugin TypeScript monorepo, ESM only | `package.json`, `docs/architecture.md` |
| Package manager | pnpm 11.7.0, reached through `corepack pnpm`; `pnpm` is not on `PATH` | `packageManager` field |
| Node | v22.18.0 on this machine, below the declared `^22.19.0 \|\| >=24.0.0` | `engines` field, `node --version` |
| Workspace packages | 316 packages with a `package.json` under `packages/<group>/<pkg>` | directory scan |
| Applications | `apps/cli`, `apps/web`, `apps/desktop`, `apps/desktop-host` | `apps/` |
| Runtime home | `DSH_HOME`, defaulting to `~/.dsh` | `packages/*/home-paths` |

The Node version on this machine is below the declared minimum, and the commands below still completed. Treat that as an environment deviation to fix before trusting CI-parity results, not as evidence that the supported range is wider than declared.

## Verified build and test baseline

```
corepack pnpm run typecheck
corepack pnpm exec vitest run packages/llm/llm-pi-ai/tests/convert.spec.ts
corepack pnpm exec vitest run packages/llm/llm-pi-ai/tests/openai-route-matrix.spec.ts
corepack pnpm exec vitest run packages/test-support/llm-mock-server/tests packages/llm/llm-retry/tests/transport-recovery.spec.ts
```

| Command | Result |
|---|---|
| `typecheck` | exit 0; Host and Client `tsc -b` aggregates completed |
| `convert.spec.ts` | 81 tests passed |
| `openai-route-matrix.spec.ts` | 4 tests passed |
| mock server and transport recovery | 78 tests passed across 3 files |

`corepack pnpm run typecheck` builds the Host lib before `tsc`, so the first run is long. The `test` script builds `native/system` before Vitest; the focused Vitest commands above were run directly because `native/system` is already built in this checkout.

## Git state at baseline

- Branch `codely_bridge`, tracking `origin/codely_bridge`.
- Modified: `.codely-cli/settings.json`, which is unrelated to this work.
- Untracked: `docs/workflows/DSH_IMPLEMENTATION_PLAN.md` and `docs/workflows/DSH_CHECKLIST.md`.
- No staged changes and no other writer active in this workspace.

## Capability mapping to the plan

| Plan capability | Current owner | Baseline status |
|---|---|---|
| Conversation Runtime | `packages/core/session`, `packages/session/*`, `packages/context/*` | Present as an event-sourced session store with JSONL persistence and turn projections |
| Model Gateway | `packages/llm/llm`, `packages/llm/llm-deepseek`, `packages/llm/llm-pi-ai`, `packages/llm/llm-retry` | Present; provider-neutral stream contract, two adapters, retry policy |
| Task Service and Orchestrator | `packages/jobs/*`, `packages/workflow/*`, `packages/experimental/mgsd-workflow` | Background-job registry and workflow engine exist; no TaskSpec state machine with the plan's transitions |
| Executor adapters | `packages/subagent/*`, `packages/acp/*` | Present for in-process, SDK, ACP, Claude Code, and Codex subagents; no `ExecutorAdapter` contract with `probe`/`observe` |
| Verification Service | Repository test suites only | No service that runs acceptance commands and records an AC matrix |
| Review Service | None | No structured ReviewPackage or ReviewDecision path |
| Memory | None | No scoped User/Project/Decision/Task memory store |
| Storage | `packages/storage/*`, `packages/session/session-persistence-jsonl` | SQLite and JSON KV backends plus JSONL session logs |
| UI | `apps/web`, `packages/client/*`, `packages/host/webserver` | Chat, sessions, jobs, plan mode, and settings pages exist |
| Executor authorization | `packages/guard/*`, `packages/sandbox/*`, `packages/credentials/*` | Policy and credential seams exist; the plan's task-level approval flow does not |

## Mock model gateway (P0-02)

`packages/test-support/llm-mock-server` already provides the gateway the plan assigns to P0-02. It serves a scriptable Messages-compatible HTTP/SSE endpoint over `/v1/messages` and consumes one scripted behavior per accepted request.

| Required P0-02 scenario | Behavior entries | Observed |
|---|---|---|
| Streaming text completion | `success`, `slow_success` | Covered; test asserts the captured request and completed stream |
| Tool call | `tool_call_success` | Covered; reasoning, tool-call, and max-token finishes share one case |
| Failure | `auth_error`, `rate_limit`, `server_error`, `quota_exceeded`, `context_overflow`, `invalid_request` | Covered; each returns a structured provider error |
| Interrupted stream | `stream_disconnect`, `partial_disconnect`, `connection_reset`, `stall`, `partial_eof` | Covered; close and stall behavior is asserted, and recovery is exercised in `llm-retry` |

The package publishes no installable binary; tests call `startMockLlmServer` directly or run `pnpm run mock:llm`. Its automated tests are the P0-02 evidence: 78 passing tests across the mock server suites and `packages/llm/llm-retry/tests/transport-recovery.spec.ts`.

## Gaps that P1 must fill

- `TaskSpec`, `WorkItem`, `ExecutionRun`, `ReviewDecision`, and their schema validation do not exist as domain types.
- No state machine owns task transitions, idempotency keys, or a transactional outbox.
- No daemon API separates UI lifetime from execution lifetime; the Web profile runs the host process itself.
- No verification record ties acceptance criteria to executed commands and exit codes.
- No review service packages a diff and an AC matrix for a reviewer model.
- No scoped memory store, decision index, or snapshot exists.

## Constraints for later work

- Documentation under `docs/**` is a bilingual pair with a `*.i18n.yaml` record; `verify-translation-pairing`, `verify-md-wrap`, and `verify-md-links` apply to these files.
- Public quality gates build before they check; see `AGENTS.md`.
- The repository is a Cordis-plugin application, so a new capability registers as a plugin with reversible effects instead of a standalone service process.

## Reproduction

Run the four commands in the verified build and test baseline section from the repository root. `corepack pnpm install` is required first on a clean machine; this checkout already has dependencies installed.
