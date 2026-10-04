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

`check.mjs` belongs to the selected project; replace that argv with your real acceptance command. Commands execute without implicit shell parsing. Missing or empty command configuration fails plugin activation. The overlay sets job completion delivery to `quiet` for this composition, including other job producers, so completion does not wake a DSH model.

The Web entry is `node --import tsx/esm apps/cli/src/bin.ts web --patch apps/cli/config/examples/codely-local/cordis.patch.yml`. This checkout's verification covers Loader execution and Web configuration composition, not interactive browser operation; complete browser acceptance before relying on the Web entry for daily work.

<a id="commands"></a>
## Commands

Select the target local project when creating the session. Commands use its recorded directory and reject a second active Codely job in the same real directory within this plugin instance.

| Command | Result |
|---|---|
| `/codely run <task>` | Start a background job and return its job id. |
| `/codely status` | Show this session's job statuses. |
| `/codely output <id>` | Show retained output; report discarded earlier output. |
| `/codely cancel <id>` | Request cancellation; inspect status until it settles. |

`completed` means Codely and every configured validation command exited 0, not that the task is semantically correct. A failed Codely process skips validation. A validation failure reports its own exit code. Cancellation or the overall deadline stops subsequent checks. The default deadline is 15 minutes; `timeoutMs`, `graceMs`, `maxBytes`, and `pollMs` are plugin configuration fields.

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
node node_modules/vitest/vitest.mjs run apps/cli/tests/codely-local.spec.ts
node --import tsx/esm apps/cli/tests/fixtures/codely-local/live.ts
```

The first command runs six deterministic lifecycle tests plus a real Loader/process scenario covering Unicode multiline argv, independent exit-23 failure, same-directory admission, cross-session access denial, cancellation, and plugin-unload cleanup. The second requires `DSH_CODELY_COMMAND` and existing Codely authentication, uses a disposable directory, checks the generated file externally, and removes that directory after process teardown.

### Dev Note

Local evidence from 2026-10-03/04 on Windows with Node v26.10.0: the real Codely smoke returned `completed`, its independent file-content check passed, and the DSH model-call count was 0. Web profile dump showed the plugin and `completionDelivery: quiet`. The dependency download completed, but repository postinstall failed because the existing submodule Git configuration has `core.worktree` in common config; no Git configuration was changed. Browser acceptance and recorded-session replay remain outstanding. These observations are test evidence, not broader compatibility or sandbox guarantees.

Validation record: the focused suite passed both Vitest cases (including six nested Node tests); `lint` passed with its Host build; `docs:check` passed 151 tests, the website build, and fragment checks; this guide's pairing check passed. `test:docs` reported 18 passed / 2 failed, and the final `doc-sync` reported 39 passed / 3 failed. Remaining failures refer to the existing MGSD architecture plan: missing bilingual files, hard-wrapped paragraphs, and non-compiling TypeScript examples. Repository scripts used the installed pinned pnpm entry with `pnpm_config_verify_deps_before_run=false` to avoid repeating installation after the unrelated postinstall failure. No changes were committed or pushed.
