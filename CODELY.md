# DeepSeek Harness — Codely Context

DeepSeek Harness (`dsh`) is DeepSeek AI's open-source agent harness: an all-plugin [Cordis](docs/cordis-primer.md) application where the model adapter, tool registry, session log, and agent loop are replaceable plugins composed from profiles and bundles. TypeScript, ESM-only, pnpm-workspace monorepo, MIT. Shipped as Web UI (`dsh web`, default port 3080), Electron desktop, one-shot headless, SDK JSON-RPC, and ACP profiles. Requires Node `^22.19.0 || >=24` and pnpm `11.7.0` (Corepack).

**[AGENTS.md](AGENTS.md) is the canonical agent instruction file** — commands, conventions, testing and PR policy. Read it before any code change; `CLAUDE.md` symlinks it. This file only maps the repository and caches traps that are not visible at a glance. Where the two disagree, AGENTS.md wins.

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

### Reference

- MGSD continuation: read [the implementation checklist and handoff](docs/MGSD_Implementation_Checklist.zh.md) for the uncommitted local Codely prototype, verified results, original Phase mapping, and the next local milestone. Complete local DSH acceptance before remote dispatch.
