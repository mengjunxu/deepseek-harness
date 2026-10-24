# DeepSeek Harness — Codely Context

DeepSeek Harness (`dsh`) is DeepSeek AI's open-source agent harness: an all-plugin [Cordis](docs/cordis-primer.md) application where the model adapter, tool registry, session log, and agent loop are replaceable plugins composed from profiles and bundles. TypeScript, ESM-only, pnpm-workspace monorepo, MIT. Shipped as Web UI (`dsh web`, default port 3080), Electron desktop, one-shot headless, SDK JSON-RPC, and ACP profiles. Requires Node `^22.19.0 || >=24` and pnpm `11.7.0` (Corepack).

**[AGENTS.md](AGENTS.md) is the canonical agent instruction file** — commands, conventions, testing and PR policy. Read it before any code change; `CLAUDE.md` symlinks it. This file only maps the repository and caches traps that are not visible at a glance. Where the two disagree, AGENTS.md wins.

## Shared Agent Development Instructions

Codex 和 Codely 共同遵循 [AGENTS.md 的共享入口规则](AGENTS.md#shared-agent-development-instructions)与 [.ai/WORKFLOW.md](.ai/WORKFLOW.md) 的完整规范，使用相同的架构决策、共享 Memory 和任务记录。普通问答按需加载；开发前读取 WORKFLOW、识别或创建 Task、核对 Task / Plan / Checkpoint 和 Git 状态并确认单写入者；架构与 Memory 按相关索引加载，交接与完成按 WORKFLOW 更新记录。

详细规则和知识使用 `.ai/` 及其引用的现有文档；不在两个入口重复维护，也不新建平行规则体系。

## Read-first pointers

- [docs/architecture.md](docs/architecture.md) — read before changing anything under `packages/`: Cordis model, profiles/bundles, core packages, event domains.
- [docs/development.md](docs/development.md) — setup, the Host/Client tsconfig aggregate layout, environment variables, daily workflow, TODO-marker semantics (`FIXME`/`TODO`/`XXX`).
- [docs/testing.md](docs/testing.md) — test policy and which change requires which snapshot. `test:coverage` (per-file 100% on `packages/*/*/src`) is the CI coverage gate, not `test`.
- [docs/cordis-primer.md](docs/cordis-primer.md) — plugins, reversible effects, waterfall `next()` semantics, typed events; read when Cordis is unfamiliar.
- [docs/defensive-patterns.md](docs/defensive-patterns.md) — read before lifecycle, concurrency, subprocess, or teardown work.
- [docs/session-format-status.md](docs/session-format-status.md) and [docs/cookbook/reviewing-persistence-type-changes.md](docs/cookbook/reviewing-persistence-type-changes.md) — read before touching released session data or persistence types.
- [packages/README.md](packages/README.md) and [packages/AGENTS.md](packages/AGENTS.md) — package-group map and package-level rules (runtime invariants, package manifests).
- [.agents/skills/](.agents/skills/) — task-matched workflows: `dsh-pre-push-checks` (selecting outgoing checks), `dsh-code-review` (reviewing a PR), `dsh-doc` (any docs work), `dsh-prose-standard` (prose decisions), `dsh-client-ui-ux` (GUI behavior in `packages/client`), `dsh-ci-test-reliability` (nondeterministic tests), `dsh-trim-cot-leakage` (reasoning-transcript prose), `record-browser-gif` (GUI-change PR GIFs), `dsh-merging-stacked-prs` (stacked PRs), `dsh-archive-agent-notes` (Agent Notes lifecycle).
- [.agents/notes/](.agents/notes/README.md) — durable decision rationale for implemented work. Archived notes are frozen; never treat them as current authority.
- [docs/AGENTS.md](docs/AGENTS.md) — bilingual documentation conventions, word budgets, `*.i18n.yaml` pairing records.

## Layout

`packages/<group>/<pkg>` holds the ~55 `@deepseek-ai/dsh-*` workspaces (core, llm, shell, session, sdk, host, client, experimental, …; full group map in [AGENTS.md](AGENTS.md#repository-layout)). Other roots: `apps/` (`cli` launcher, `web` frontend, `desktop` + `desktop-host` Electron), `vendor/` (pinned Cordis source, rescoped), `native/system` (Node addon), `python/` (Python SDK), `docs/`, `scripts/` (gates and generators), `website/` (VitePress projection), `snapshots/` (keyless recorded sessions), `benchmarks/` (performance gates), `.agents/` (notes and skills).

## Commands

Survival set — the full inventory lives in [package.json](package.json) and [AGENTS.md](AGENTS.md#commands); `make help` mirrors the application commands.

```sh
pnpm install          # also installs Lefthook hooks (postinstall)
pnpm run typecheck    # setup is complete when this passes; builds the Host lib first (see traps)
pnpm run build        # tsc + tsdown + Web/desktop bundles; needed before artifact-consuming checks
pnpm run test         # unit tests (builds native/system first); pnpm run test:coverage is the CI gate
pnpm run test:e2e     # real-API tests; self-skip without DEEPSEEK_API_KEY
pnpm run lint         # oxlint (builds Host lib first); lint:fix to auto-fix
pnpm run test:snapshot  # keyless recorded-session replay; filter with -t <name>
pnpm run doc-sync     # documentation gates after docs changes; test:docs is the quick variant
pnpm run dev:web      # build, serve (port 3080), rebuild client bundles on edits; start:web skips build
pnpm run dev:desktop  # build then launch Desktop; start:desktop skips build
pnpm dsh --profile headless "task"  # one-shot agent from source; needs DEEPSEEK_API_KEY
pnpm run check:all    # full local gate set (opt-in; not required per push)
```

## Traps

Cached because they are not visible from the command surface; AGENTS.md owns the full rules.

- **Every public quality gate builds first.** `typecheck`, `lint`, `doc-typecheck`, and `test` run a Host-lib/native build step before their own phase. The long first run is expected, not an error. Generated Host-for-Client remote declarations are produced by that pre-step; internal `*:contracts-ready` scripts assume it already ran.
- **ESM-only, tsx source launch.** The `dsh` CLI runs from source through tsx's ESM-only hook (`node --import tsx/esm`); any module it reaches must stay ESM — CJS-only exports break it. Config subprocesses run built `lib/` under plain Node instead.
- **Two tsconfig aggregates, never one program.** Host and Client declaration-merge cordis `Context` under the same keys, so one program containing both reports collisions. A repo-wide script seeds `tsconfig.host.json` or `tsconfig.client.json`, never the root solution; a new package registers in exactly one aggregate ([layout](docs/development.md#typescript-project-layout)).
- **Only `dsh` profiles launch Node applications.** Package bins, demos, and SDK argv escapes are not launchers; `verify-application-entrypoints` rejects them.
- **Pre-stable APIs and frozen session generations.** Update every consumer of a changed public API. Committed session-format generations are never moved, overwritten, or deleted; SQLite moves forward on monotonic `SCHEMA_VERSION`.
- **Snapshots follow visibility.** A non-trivial model-visible or product-user-visible change updates a keyless recorded-session snapshot; agent-loop, session-lifecycle, or `SessionEventMap` changes update the TypeScript and Python SDK expected outputs in the same PR (`pnpm run test` covers neither).
- **Match checks to the changed surface.** Run the smallest focused tests/gates that cover the diff (see the `dsh-pre-push-checks` skill); never default to the full suite — CI owns exhaustive coverage and the platform matrix.
- **Registrations are effects; unions end in `assertNever`; waterfall listeners must call `next()`; no new `as unknown` casts; cross-boundary ids are branded.** Details and the rest of the conventions list live in [AGENTS.md](AGENTS.md#conventions).
- **Client UI copy is locale-owned.** Product text goes through typed dictionaries and `t`; `verify-client-ui-i18n` rejects hardcoded copy.
- **Prose is checkable.** No metaphors; prefer exact terms over `boundary`/`shape`; one physical line per paragraph; files end with exactly one trailing newline; docs accompany every code change.
- **Secrets.** Real-API work reads `DEEPSEEK_API_KEY` (optional `DEEPSEEK_BASE_URL`) from the environment or a gitignored root `.env`. Never commit credentials. Windows packaging/signing has extra required reading in [apps/desktop/README.md](apps/desktop/README.md).
- **Web browser automation and GIF recording.** Launch with `pnpm dsh web --patch apps/web/tests/pin-browse-picker.overlay.yml` to use the in-page directory picker.
- **Git.** Pre-push hook runs the full typecheck; rewrites use `--force-with-lease` and abort on remote movement; PRs carry one `kind/*` plus all material `area/*` labels and a native Issue Type.
- **Windows development.** Work natively or in WSL 2, never mix the two filesystems for checkout and dependencies; `check:windows-wine` runs only when diagnosing a known Windows failure.

## Codely Structured Memories

### User

### Feedback

### Project
- [2026-10-09 15:53:07] MGSD planning docs (docs/MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan.md and _v2.md) are intentionally Chinese-only planning artifacts: no .i18n.yaml pairing and not in scripts/doc-budgets.manifest.json; full doc-sync pairing/TS-sample failures for them are pre-existing and documented in MGSD_Implementation_Checklist. When editing them, keep the doc's own style and keep verify-md-links, verify-md-wrap (one physical line per paragraph) and git diff --check green — e.g. use blank-line-separated blockquote lines instead of trailing double spaces, and don't translate the docs to "fix" pairing.
- [2026-10-22 17:20:04] This macOS deepseek-harness checkout now has node_modules installed (as of 2026-10-22) and bash still has no `pnpm` on PATH, so use `corepack pnpm`. Doc and source gates run directly: `corepack pnpm exec tsx scripts/verify-md-links.ts`, `verify-md-wrap.ts`, `verify-translation-pairing.ts <pair...> [--write]`, `verify-doc-budgets.ts`; `corepack pnpm run typecheck` and `corepack pnpm exec vitest run <paths>` work without a full rebuild. Note the machine's Node v22.18.0 is below the declared `^22.19.0 || >=24` engine range even though commands succeed.
- [2026-10-22 17:20:04] DSH v2 implementation status (docs/workflows/DSH_IMPLEMENTATION_PLAN.md + DSH_CHECKLIST.md): P0-01 baseline and P0-02 mock gateway are DONE via docs/dsh/spikes/repository-baseline.md; P0-03 provider matrix is BLOCKED for real accounts because this environment has no OPENAI_API_KEY and no ChatGPT subscription login, so only mock-backed verification (packages/llm/llm-pi-ai/tests/openai-route-matrix.spec.ts) exists. SIWC is not implemented; pi-ai's openai-codex route is a Codex subscription transport, not SIWC. Next task is P0-04.

### Reference

- [2026-10-09 15:53:04] - MGSD continuation: read [the implementation checklist and handoff](docs/MGSD_Implementation_Checklist.zh.md) for current status, verified results and the next local milestone; the V2 plan doc docs/MGSD_Distributed_Agent_Harness_Architecture_and_Execution_Plan_v2.md (v2.1, 2026-10-09) is the V2 architecture/order source — two stages (Stage 1 local DSH closure incl. DSH integration before Phase 4, then Stage 2 GitHub remote), prompts in §39–43, acceptance lists §36.1/36.2. Complete local DSH acceptance before remote dispatch.
