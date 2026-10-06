---
description: "Configure and verify the opt-in local Codely command overlay, including independent validation and cancellation limits."
---

# Run local Codely tasks

English | [中文](codely-local.zh.md)

## Summary

The local overlay adds `/codely` commands to DSH. Codely executes the task in the session's project directory; DSH owns the subprocess, bounded output, cancellation, and separately configured validation commands. These commands do not submit a DSH model turn. Ordinary chat messages still use the selected DSH model.

## Table of Contents

- [Configure](#configure)
- [Commands](#commands)
- [Limits](#limits)
- [Verification](#verification)

<a id="configure"></a>
## Configure

Use a development checkout with dependencies installed, a working DSH Web build, and an authenticated local Codely installation. Work in a disposable project first. This integration does not provide filesystem or network confinement; Codely's `strict` path policy is not an operating-system sandbox.

The [overlay](../../../apps/cli/config/examples/codely-local/cordis.patch.yml) requires two environment variables containing JSON argv arrays. `DSH_CODELY_COMMAND` names the executable and its launch arguments. On Windows, use `node.exe` and Codely's JavaScript entry instead of `codely.cmd`, so prompts never pass through shell quoting. `DSH_CODELY_CHECKS` contains at least one independently run validation command. Choose trusted checks; an agent-editable check is not independent evidence of acceptance criteria.

Example PowerShell configuration for a standard npm user installation; confirm that the entry exists on your machine:

```powershell
$codelyEntry = Join-Path $env:APPDATA 'npm/node_modules/@codely/cli/bundle/gemini.js'
if (-not (Test-Path -LiteralPath $codelyEntry)) { throw 'Locate the installed Codely JavaScript entry first' }
$env:DSH_CODELY_COMMAND = ConvertTo-Json -Compress @((Get-Command node).Source, $codelyEntry)
$env:DSH_CODELY_CHECKS = '[["node","check.mjs"]]'
```

`check.mjs` belongs to the selected project; replace that argv with your real acceptance command. Commands execute without implicit shell parsing. Missing or empty command configuration fails plugin activation. Each Codely job requests quiet completion delivery, so its result stays in the Session inbox without opening a DSH model turn. Other job producers keep the controller's configured delivery behavior.

The Web entry is `node --import tsx/esm apps/cli/src/bin.ts web --patch apps/cli/config/examples/codely-local/cordis.patch.yml`. In a browser, select the target project, run a harmless task, inspect its status and output, and cancel a separate long-running task. The command result appears in Chat before a model turn. Codely completion remains quiet even when the selected preset wakes agents for other background jobs.

<a id="commands"></a>
## Commands

Select the target local project when creating the session. Commands use its recorded directory and reject a second active Codely job in the same real directory within this plugin instance.

| Command | Result |
|---|---|
| `/codely run <task>` | Start a background job and return its job id. |
| `/codely status` | Show this session's job statuses. |
| `/codely output <id>` | Show retained output; report discarded earlier output. |
| `/codely cancel <id>` | Request cancellation; inspect status until it settles. |

`completed` means Codely and every configured validation command exited 0, not that the task is semantically correct. A failed Codely process skips validation. A validation failure reports its own exit code. Cancellation or the overall deadline stops subsequent checks, including when it arrives during final cleanup. Both settle as `killed`, with `Cancelled` or `Timed out` in the detail; observed exit codes and signals remain in job output independently. Cleanup failure settles as `failed`, even after cancellation or timeout. The default deadline is 15 minutes; `timeoutMs`, `graceMs`, `maxBytes`, and `pollMs` are plugin configuration fields.

<a id="limits"></a>
## Limits

- Jobs and output are process-local; restarting DSH does not resume them. Command invocations and displayed command results use the existing session event log.
- Output is raw Codely stream JSON, not a dedicated tool card. Output and validation logs may contain project content; review before sharing.
- Codely uses `auto_edit`, `strict`, and `--no-upm`. Interactive approvals, continuation, remote dispatch, cross-process workspace locks, and durable task recovery are not implemented.
- Process cleanup uses DSH's selected subprocess provider. Its reported weaker-containment warning remains relevant; this integration does not strengthen that provider.

<a id="verification"></a>
## Verification

Run the focused checks from the repository root:

```powershell
node node_modules/vitest/vitest.mjs run apps/cli/tests/codely-local.spec.ts packages/jobs/tool-jobs/tests/tool-jobs.spec.ts packages/jobs/jobs-local/tests/jobs.spec.ts
node --import tsx/esm apps/cli/tests/fixtures/codely-local/live.ts
$env:DSH_SNAPSHOT = 'replay'
$env:DSH_EXAMPLE_MODE = 'lib'
$env:DSH_TEST_BROWSER_CHANNEL = 'msedge'
node node_modules/vitest/vitest.mjs run --config vitest.snapshot.config.ts apps/web/tests/codely-local.snapshot.ts scripts/session-snapshot-corpus.corpus.ts
```

The first command passes three Vitest files, including 13 deterministic lifecycle tests and two real Loader/process scenarios covering Unicode multiline argv, independent exit-23 failure, same-directory admission, cross-session access denial, a configured deadline, cancellation, and plugin-unload cleanup. The cancellation and unload scenarios wait for a parent/child readiness signal and verify that both processes have exited. Loader uses private configuration copies; the test verifies that the source configuration is unchanged. The second command requires `DSH_CODELY_COMMAND` and existing Codely authentication, uses a disposable directory, checks the generated file externally, and removes that directory after process teardown. The last command replays the recorded run/status/output/cancel flow without an API key and checks the rendered Chat rows, retained Session after reload, zero DSH model calls, and complete expected workspace. `DSH_EXAMPLE_MODE=lib` selects built Web artifacts for the snapshot lane. Set `DSH_TEST_BROWSER_CHANNEL` only when Playwright's bundled Chromium is unavailable and a compatible installed browser is present.

### Dev Note

2026-10-06 automated L1 evidence on Windows: all three focused Vitest cases passed, including 13 Node tests. Five new assertions failed before the reporting fix; all 13 then passed. Barrier-controlled tests cover cancellation and timeout during executor and final-validator cleanup, and cleanup false/rejection outcomes. The real Loader tests observed zero DSH model calls, timeout without validation, and both parent and child absent after cancellation/unload. Live Codely, browser acceptance, and recorded-session replay were not rerun in this slice.

Two independent concurrent runs of the focused Vitest command also passed all three cases each. The Host build passed; after correcting an arrow-function parentheses lint finding, `lint:contracts-ready` passed. The guide/checklist pairing and `git diff --check` passed. `doc-sync` finished with 40 passed / 2 failed: the existing architecture plan still lacks a bilingual pair and contains non-compiling TypeScript examples.

Local evidence from 2026-10-03/04 on Windows with Node v26.10.0: the real Codely smoke returned `completed`, its independent file-content check passed, and the DSH model-call count was 0. Web profile dump showed the plugin and `completionDelivery: quiet`. The dependency download completed, but repository postinstall failed because the existing submodule Git configuration has `core.worktree` in common config; no Git configuration was changed. Browser acceptance and recorded-session replay remain outstanding. These observations are test evidence, not broader compatibility or sandbox guarantees.

2026-10-07 L1 browser evidence on Windows: the rebuilt Web profile exercised `/codely run`, `status`, `output`, and `cancel` in Edge through the in-page directory picker. An isolated executor wrote `result.txt`; an independent check passed once and failed with exit 23 once; cancellation settled as `killed`. The command-only Chat remained visible after page reload, the job-local quiet-delivery option kept all three completions from opening a DSH model turn, and the complete workspace matched its independent expected files. The keyless recording contains ten command invocations and their displayed results; replay uses the built shipped Web profile. The browser scenario and screenshot are at `apps/web/tests/codely-local.snapshot.ts` and `.artifacts/codely-local-browser.png`.

2026-10-07 verification on Windows: the lifecycle command above passed three files and 147 tests, including 13 nested Node tests. The authenticated live Codely smoke returned `completed`, its independent check passed, and the observed DSH model-call count was zero. The keyless Web scenario plus the session corpus passed two files and four tests using installed Edge because bundled Chromium was unavailable. Host build and `lint:contracts-ready` passed after the browser-test lint fixes; `git diff --check` and all seven changed bilingual pairs passed. `test:docs` passed 19 gates and failed only the missing Chinese counterpart for the architecture plan. `doc-sync` passed 39 gates and reported three existing failures: that missing pair, the plan's non-compiling TypeScript examples, and stale `packages/extensions/tool-cordis/src/api-catalog.ts`. No changes were committed or pushed.
