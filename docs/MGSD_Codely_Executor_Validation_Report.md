# MGSD Codely Executor Validation Report

English | [中文](MGSD_Codely_Executor_Validation_Report.zh.md)

<a id="summary"></a>
## Summary

On 2026-09-28, this experiment validated the key behaviors of Codely CLI as a non-interactive executor for the MGSD harness on a Windows host. Codely completed unattended edits and Shell calls in a specified Git worktree, produced parseable `json` and `stream-json` output, and stopped the top-level process and the observed child process after Ctrl+C. The tested configuration does not meet the security requirements for remote execution: `--path-policy strict` does not constrain a Shell launched in `yolo` mode, and Codely's built-in sandbox could not start because the host had no Docker, Podman, or explicit `GEMINI_SANDBOX` command. Codely also exited 0 and marked the tool call successful after a child command exited 23.

This report records one local experiment and does not define DSH product behavior. Raw logs remain on the tested host at `F:\Agents\deepseek-harness\tmp\mgsd-codely-validation\logs`. Git ignores `tmp/`, so these logs are neither portable evidence nor files intended for commit.

<a id="table-of-contents"></a>
## Table of Contents

- [Environment](#environment)
- [Method](#method)
- [Results](#results)
- [Decision](#decision)
- [Required Executor Contract](#required-executor-contract)
- [Reproduction Commands](#reproduction-commands)
- [Dev Note](#dev-note)

-----

<a id="environment"></a>
## Environment

| Subject | Observed value |
|---|---|
| Operating system | Windows |
| Codely | `1.0.0-nightly.57` |
| Node.js | `v22.18.0` |
| Git | `2.42.0.windows.2` |
| Codely model setting | `codely-core` |
| Codely invocation | `codely.cmd` from the user's global NPM installation |
| Test repository | Disposable repository under the ignored `tmp/` tree |
| Isolation layout | One clean primary checkout and a fresh branch and worktree for each test |

The installed Node.js version was below this DSH checkout's required `^22.19.0 || >=24`. The Codely experiment ran, but DSH integration requires a supported Node.js version.

-----

<a id="method"></a>
## Method

The experiment initialized one disposable Git repository, committed a one-line `README.md`, and created a separate `agent/TASK-SPIKE-NNN-office-pc` worktree from the clean `main` branch for every test. Each call set the task worktree as its working directory and disabled Unity Package Manager startup with `--no-upm`.

Successful prompt transport used one command-line argument in the form `--prompt=<single-line prompt>`. Passing a multiline PowerShell value through `codely.cmd --prompt` did not deliver the complete task. Piping the task through stdin while also supplying `--prompt` produced a valid model response stating that no stdin instructions were available. The harness wrapper must therefore pass an argument array directly and test prompt-file or stdin support against the exact executable entry point before relying on either mechanism.

The tests covered a file edit with `auto_edit`, read-only Shell commands with `yolo`, a deterministic child exit code, `json` and `stream-json` output, Ctrl+C during a 120-second child command, a read outside the worktree with `--path-policy strict`, and the same read attempt with Codely's `--sandbox` option.

-----

<a id="results"></a>
## Results

| Test | Result | Observation |
|---|---|---|
| Clean worktree creation | Pass | Every task started from the same clean commit on its own branch and path. |
| Non-interactive edit | Pass with constraint | `auto_edit` created `result.txt`; the exact bytes were `TASK-SPIKE-003 OK` plus LF, Codely exited 0, and stdout was valid JSON. |
| Primary checkout protection | Pass for observed tasks | The primary checkout remained clean after every Codely call. |
| Unrequested runtime files | Fail | Completed calls created `.codely-cli/auto-saves/*.json` and `*.md` inside the task worktree. |
| Read-only Shell | Pass | Three requested Git commands ran without approval in `yolo` mode; the model reported the correct task branch and no business-file change. |
| Final JSON | Pass for syntax | `--output-format json` produced a JSON object with `response` and `stats` when the prompt was transported correctly. |
| Child failure propagation | Fail | `cmd /c exit 23` returned 23 inside the tool output, but Codely exited 0; final JSON counted the Shell tool call as successful. |
| Stream failure evidence | Partial | `stream-json` emitted a `tool_result` whose `status` was `success` and whose free-text `output` was `Command exited with code: 23`; the final `result` also had `status: success`. |
| Ctrl+C cancellation | Pass for observed task | After the long Shell call started, Ctrl+C ended Codely with exit 1. Three seconds later no new Node process or process containing the tested sleep command remained. |
| `strict` Shell path confinement | Fail | With `--path-policy strict --approval-mode yolo`, Shell successfully read an absolute-path sentinel outside the task worktree. |
| Built-in sandbox | Blocked | `--sandbox` exited 1 before model execution: `GEMINI_SANDBOX is true but failed to determine command for sandbox; install docker or podman or specify command in GEMINI_SANDBOX`. |
| Simple secret-term scan | Pass with limited scope | The saved test logs contained no match for common API-key, authorization, bearer, password, secret, or cookie field names. This scan does not certify arbitrary model output as safe to upload. |

The initial execution inside Codex's file sandbox failed before Codely startup because Codely writes under the user's `~/.codely-cli/tmp`. The real Codely tests therefore ran with approved host access so the CLI could read its local credentials, write its runtime data, and call its model service.

### File-edit evidence

The working call used `--approval-mode auto_edit --path-policy strict --output-format json --no-upm`. Codely invoked `write_file` once, returned exit 0, and produced the requested file with exact content. It also produced two untracked auto-save files, so the task's changed-file policy must exclude or relocate Codely runtime artifacts before it compares the engineering diff with the plan's allowed files.

### Failure evidence

For `cmd /c exit 23`, the stream contained a machine-readable JSON record, but the exit code remained embedded in its output string rather than a numeric field. Both the tool-result status and final-result status were `success`, and the Codely process returned 0. A harness must run authoritative build and test commands itself and record their executable, argument array, exit code, stdout, and stderr; it must not infer acceptance from Codely's process exit, prose, or tool statistics.

### Isolation evidence

The outside sentinel contained `MGSD_OUTSIDE_SENTINEL_7F3A`. A Codely Shell launched with `--path-policy strict --approval-mode yolo` read that value successfully through an absolute path. Git worktrees prevent ordinary branch and index overlap but do not restrict host filesystem access, and this Codely path policy did not restrict the Shell process in the tested configuration.

-----

<a id="decision"></a>
## Decision

The current Codely installation is suitable for a local executor prototype but is not approved for unattended remote engineering tasks. Do not register it behind a GitHub self-hosted runner with `yolo` until one of these protections is verified: Codely's sandbox with an installed and configured backend, an operating-system sandbox or restricted service account that cannot read the primary checkout and secrets, or a harness-owned command provider that exposes only an explicit executable-and-arguments allowlist.

The next implementation slice may build the local Task schema, worktree creation, Codely process wrapper, stream capture, cancellation, and harness-owned validation. It must leave GitHub dispatch disabled and treat security isolation as an unmet acceptance criterion.

The local prototype must use `auto_edit` when Shell is unnecessary. A task that needs unrestricted Shell must run only after the selected sandbox blocks the same outside-sentinel test while still permitting commands within the task worktree.

-----

<a id="required-executor-contract"></a>
## Required Executor Contract

The Codely wrapper must satisfy these requirements before distributed execution:

1. Spawn an executable plus an argument array with an explicit worktree `cwd`; do not concatenate one Shell command string.
2. Transport the complete prompt without multiline loss and preserve Unicode and Windows paths with spaces.
3. Capture stdout and stderr separately and save the exact Codely version and arguments used.
4. Parse each `stream-json` line as an event for audit only; do not equate its `success` status with engineering-task acceptance.
5. Run configured build and test commands outside the model loop and decide acceptance from their direct exit codes.
6. On timeout or cancellation, stop the complete process tree and verify no owned child remains.
7. Ignore or relocate `.codely-cli/auto-saves` before allowed-file and final-diff checks, while retaining any required audit artifact in node-local storage.
8. Keep raw prompts, model output, absolute paths, diffs, and auto-saves local in Restricted Mode.
9. Refuse `yolo` unless the selected runtime confinement passes an outside-read and outside-write sentinel test.
10. Never fall back from sandboxed execution to the primary checkout or an unrestricted process.

-----

<a id="reproduction-commands"></a>
## Reproduction Commands

The following pattern reproduced successful non-interactive editing. The prompt is a single argument; replace the text and paths only inside a disposable worktree.

```powershell
$prompt = '在当前工作区创建且只创建文件result.txt。不得修改工作区之外的文件。完成后结束。'
codely.cmd "--prompt=$prompt" `
  --approval-mode auto_edit `
  --path-policy strict `
  --output-format json `
  --no-upm
```

The following pattern exposed structured stream records. Its `status` fields did not represent the child process's exit code, so use it for audit rather than acceptance.

```powershell
$prompt = '在当前工作区仅执行一次Shell命令cmd /c exit 23。不得修改文件，不得重试。'
codely.cmd "--prompt=$prompt" `
  --approval-mode yolo `
  --path-policy strict `
  --output-format stream-json `
  --no-upm
```

The sandbox check used the same outside-read prompt plus `--sandbox`. On this host it failed before execution because no sandbox command could be resolved.

```powershell
codely.cmd "--prompt=$prompt" `
  --approval-mode yolo `
  --path-policy strict `
  --sandbox `
  --output-format stream-json `
  --no-upm
```

-----

<a id="dev-note"></a>
## Dev Note

This dated report records one installed nightly build on one Windows host. Re-run the matrix after a Codely upgrade, sandbox-backend installation, approval-mode change, or executor-wrapper change. Do not generalize these observations to other versions without repeating the commands.
