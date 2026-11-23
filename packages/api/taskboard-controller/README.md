---
description: "Authenticated Taskboard project and task commands in the Web Host."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-taskboard-controller

English | [中文](README.zh.md)

## Summary

The Web Host exposes project bindings, task requirements and activity through the authenticated `taskboard` Remote namespace. The shipped Web profile routes its authoritative storage domain to SQLite under the Harness home.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

### Enable local SDK dispatch

Use a macOS graphical login and the same DSH build for the Web Host and SDK. Create a local deployment patch with an absolute, private Session root. Read the key from the credential environment supplied to the Host.

```yaml
- id: taskboard-controller
  config:
    worktreeRoot: !!js dshHomePath('taskboard', 'worktrees')
    execution:
      reference: local-deepseek
      sessionRoot: /absolute/private/taskboard-sessions
      provider: deepseek-official
      model: deepseek-v4-pro
      dispatch: true
      env:
        DEEPSEEK_API_KEY: !!js process.env.DEEPSEEK_API_KEY
```

Start `dsh web --patch /absolute/path/taskboard.yml` and open the authenticated local page. Register a workspace and check **Execution settings** before starting a Run. The SDK checks its configured provider, model and permissions at startup. An inconclusive stop keeps the execution slot and working directory reserved. Set the controller’s `maxParallelRuns` (1–32, default 1) to run independent workspaces concurrently. Hosts sharing a database should use the same limit. Runs that share a Git checkout or have overlapping directories take turns.

### Use OpenAI for Taskboard Runs

Save this SDK patch as `/absolute/private/taskboard-openai-sdk.yml`. It uses the installed OpenAI catalog and resolves the key from the SDK environment.

```yaml
- id: llm-pi-ai
  config:
    providers:
      openai:
        apiKeyEnv: OPENAI_API_KEY
```

Save the following Web Host patch as `/absolute/private/taskboard-openai.yml`, replace both paths with local absolute paths and supply `OPENAI_API_KEY` to the Web Host. Start `dsh web --patch /absolute/private/taskboard-openai.yml` and confirm **openai · gpt-5.4-mini** in the Run dialog. This route requires only the OpenAI credential.

```yaml
- id: taskboard-controller
  config:
    worktreeRoot: !!js dshHomePath('taskboard', 'worktrees')
    execution:
      reference: local-openai
      sessionRoot: /absolute/private/taskboard-sessions
      provider: openai
      model: gpt-5.4-mini
      dispatch: true
      patches:
        - /absolute/private/taskboard-openai-sdk.yml
      env:
        OPENAI_API_KEY: !!js process.env.OPENAI_API_KEY
```

### Upgrade or roll back

Wait for active Runs to finish. Download a Taskboard backup, then stop all Web Hosts using the database. Copy the stopped instance’s `taskboard` directory under the Harness home, including SQLite sidecar files if present. Preserve the configured Session root, workspaces and deployment patches separately. Use a separate local instance to check the upgrade first. Restore the metadata archive into an empty Taskboard and place the original Session files under the configured Session root before continuing a Run. If a version is unsupported, keep both the database and the original Session files and reopen a compatible instance from the pre-upgrade copy.

To rehearse a local upgrade, build the previous and target revisions in separate checkouts. In the target checkout, run `node apps/web/tests/fixtures/taskboard-smoke.mjs --upgrade-from /absolute/previous/apps/cli/lib/bin.js`. The probe writes task revisions and a comment through the previous Web Host, stops it, then tests the upgrade and rollback on two private copies of the database directory.

### Request a validation coverage review

To enable **Request model review**, configure the provider on the Web Host. For OpenAI, apply the `llm-pi-ai` provider block above to the Web Host, supply its `OPENAI_API_KEY`, and add the following fields to the existing `taskboard-controller` configuration.

```yaml
review:
  provider: openai
  model: gpt-5.4-mini
  maxOutputTokens: 512
  timeoutMs: 30000
  maxAttempts: 2
```

The operator selects a delivery and confirms the displayed route. The reviewer receives the same JSON as **Download review summary**, with a request to assess validation coverage. Each attempt records its route, deadline, delivery fingerprint and outcome. The dedicated review Session preserves the exact model input. The model has no tools. A failed or unconfirmed attempt can be retried explicitly within the configured limit after its deadline or failure. Human acceptance, return and any waivers still require an operator decision.

Use a completed assessment to draft return feedback, then edit the text and return the delivery. Taskboard records the selected assessment ID with the human decision. Returning makes the task available for a new Run. The operator must confirm that Run before the executor receives the feedback.

### Project and task commands

Use `ctx.remote.taskboard.createProject` with an existing absolute directory, a project UUID, a command UUID and expected version zero. Create a task with its own UUID and expected version zero. Later writes supply the owning project, task, expected version and a fresh command UUID. Retrying the same command and payload returns its original receipt. A version conflict requires reloading the task before issuing a new command.

The optional `constraints` field on a task holds the operator’s instructions for execution. Omit it on edit to keep existing constraints or send empty text to clear them. Changing constraints creates a requirements revision. The optional `riskLevel` accepts `low`, `medium` or `high`. Omit it on edit to retain the level, or pass `null` to clear it. Changing the level creates a revision. The SDK input and `taskboard_read` use the revision saved when the Run was admitted. Select `task.quick.v1` for direct execution or `task.standard.v1` with an ordered `steps` array for an optional operator-written plan. Omit `workflow` on edit to retain it or send `null` to clear the selection. The Run input and `taskboard_read` retain the selected version and steps.

Read `runTaskSpec(projectId, taskId, runId)` for the versioned specification captured at admission, including the workspace baseline, route, operator authorization, previous checkpoint and original SDK input. A missing historical route, authorization or checkpoint is returned as `null`.

Read one Run’s saved SDK input with `runInput(projectId, taskId, runId)`. The result includes its original requirements, return feedback and selected material text, even after queue cancellation or metadata restore. Reading this record uses the Taskboard database and sends no input to the Session.

Read project cards with `listTasks` and revision snapshots and activity with `detail`. Use `reorderTask` to move a card before another card in its project, or to the end. Planning moves a backlog task to todo. Canceling and archiving retain its history, and explicit reopening returns a terminal task to todo. The Run’s `lastEvent` gives the greatest observed event position in its bound Session. After SDK disconnection, the Host marks the connection suspect and reads the stored Session to recover missed events when it finds the Run's input receipt. The Run and lease stay active until their own lifecycle settles. Read the Session log for event payloads.

For incremental reads, call the authenticated operator method `activityPage(projectId, taskId, cursor, limit)` with a null cursor and a positive integer limit. Each page returns activities in commit order, a cursor and `hasMore`. Save the cursor after processing the page. An empty page retains it so the same client can poll for later writes. The cursor remains valid after a Host restart when the task and the command at its saved position still match. An absent or out-of-project task returns null.

Use `pendingRunInteractions` to read a Run's open questions and approvals. Submit an answer through `answerRunInteraction` with the project, task, Run, request ID and matching kind. Approval accepts a one-time allowance, rejection or cancellation. The request becomes unavailable after an answer, withdrawal or disconnection. Run detail retains request IDs and their states. An answered record reflects the operator's submission. The Session records the tool result or policy decision.

Use `inspectProject` to display a registered project's canonical path, branch, commit and local changes. For continuation, `inspectPriorWorkspace` reads the latest inactive Run's directory. Original-directory execution rechecks the operator's selection after admission. Isolated execution creates a worktree at the pinned commit under the configured `worktreeRoot`.

Use `startRun` to queue the current task revision. Pass the provider and model shown to the operator in `confirmedRoute` to reject a change before admission. Clients that omit this field select the project’s configured route at admission. New Run histories and project handoffs record the selected provider and model. The default fresh mode accepts the result of `inspectProject` for original-directory execution, or `null` for isolation. Include the previous Run ID when retrying and supply the materials selected for this Run. For `mode: resume`, pass the previous Run and the result of `inspectPriorWorkspace`. The SDK must reopen its original Session with the saved directory and an empty inbox before accepting new input. Enable queue requests with the Host's `execution` configuration, which supplies the project configuration reference, absolute `sessionRoot`, provider and model. An equivalent replay returns the original receipt and Run ID even if the execution configuration has since been removed. Use `cancelQueuedRun` to cancel before the Run acquires the slot. New operator starts retain their command, admission time, expected task version, SDK executor and single-run queue scope. The Run detail and project handoff distinguish an explicitly confirmed route from one selected by deployment settings. A historical record without these facts omits the authorization.

Use `setRelations` to set a parent and prerequisites in the same project. The parent groups tasks. Every prerequisite must reach human acceptance before dispatch. An operator can pass `whenReady: true` to `startRun` to authorize one fresh, isolated Run of the selected requirements. Cancel a waiting authorization before editing its requirements or relationships. A failure, return or backup restore requires a new operator command to run again.

Use `stopRun` with the selected Run ID and current task version. A graceful request targets that Run's SDK child. After an unconfirmed stop, use `recheckRunStop` to observe the same child and tool-process scope without sending a signal, or issue an explicit force request through `stopRun`. The task detail reports the reason the lease remains held. The Host releases the lease only when it observes runtime exit and an empty owned tool-process scope. On macOS, the SDK starts in a separate launchd resource coalition. Before prompting, the Host records the coalition, launchd job, boot identity and its private ownership lock. A restarted Host can reobserve the saved scope once it acquires the original lock. An occupied or unverified scope keeps the directory locked. After the scope exits, the Host releases the lease and dispatches the next queued Run.

Use `deliveryDetail` to read the original criteria, verification evidence and code inventory. Use `deliveryDiff` with a path from that inventory while the workspace matches the sealed fingerprint. Git deliveries list changes against the Run’s pinned commit and include non-ignored untracked files. Outside Git, review covers the files declared in the delivery and displays their current contents. Binary files and files beyond `gitOutputMaxBytes` return a display status. Use `exportReviewPackage` to read validation coverage for that delivery. The versioned JSON contains its identifiers, sealed fingerprint, original risk level, criterion status counts, changed-file counts by status, project check outcomes and counts of reported issues and unfinished items. The package omits project text, filenames, directories, Session data and credential fields. Downloading the package reads the selected delivery. Human decisions are recorded separately.

Register an npm project with `projectScript: "test"` or `"build"`. A new start must send the same `confirmedScript`. On submission the SDK runs that package script in the admitted directory, under the Session’s file policy and the shell executor’s deadline. The Host reserves the script once per delivery and compares the pre-execution code fingerprint with the sealed fingerprint. An unconfirmed result or a changed fingerprint requires an acceptance reason. The delivery stores the exit status or failure reason; captured command output stays outside the handoff.

Projects registered with `checkTrackedDiff: true` run `git diff --check` on tracked changes from the confirmed baseline when the Host captures a delivery. The snapshot stores the outcome. An unavailable check, including a non-Git workspace, or a failed check requires an acceptance reason in the human review feedback. Untracked files remain visible in the inventory. Until an operator requests an assessment of a delivery sealed by the local SDK workflow, `deliveryDetail.modelReviewStatus` is `not-requested`. Earlier records without this field return `null`. The delivery detail and project handoff expose `validationResults` for the sealed fingerprint. Each result identifies the check and outcome. The Host records observation time and any exit code. A check outside Git or without a usable exit status includes the reason. Older deliveries carry only the outcome originally recorded.

Use `reviewDelivery` with the current task version and the exact delivery ID, delivery version, requirements revision and snapshot. Acceptance requires matching code and requirements, plus a reason for each failed or unexecuted check. Returning a delivery records feedback for the next Run and keeps the original records. Retrying a committed equivalent review returns its receipt.

Use `exportHandoff` to share one project's task revisions, Run summaries, selected materials, deliveries and reviews. Use `exportBackup` after active execution has settled to download a versioned archive with a SHA-256 checksum. The archive stores Taskboard records, including Session references. It omits credentials, workspace files, raw tool output and Session log files. When admitting another Run, the Host captures the predecessor’s Run ID, Session ID, revision, input receipt and last observed event in `previousCheckpoint`. The project handoff includes this reference and the new Run’s own Session ID. Historical Runs without a saved checkpoint omit it.

`restoreBackup` accepts an archive only in an empty database. Before writing, the Host checks the checksum, format version and record associations. Each Run must match the title, description and ordered acceptance criteria of the requirements revision recorded at admission. Restored deliveries must cover those criteria. An accepted delivery needs its recorded waivers for failed or unexecuted checks, and a returned delivery needs human feedback. Queued Runs become canceled history. A Run canceled before launch keeps its history across repeated restores and has no missing Session to recover. Restoration launches no SDK or interactions. To continue a restored Run, place the original compatible Session files in their configured location and confirm the workspace. The Host checks the prior input receipt and the last observed Session event, when recorded, at admission and again before launching a queued continuation. Restore a copy that contains that progress or explicitly start a fresh Session. Restore follows each task’s start records in order. A new Session and a continued Session must reference the last claimed Run, including after a queued start was canceled. A continuation must retain the original Session, checkout and recorded SDK configuration. The Host matches each human decision to its original command and checks each Run’s return feedback against the last decision recorded before admission.

Host adapters construct the exclusive client with `createTaskRuntime`. It launches the `sdk` profile in the confirmed directory and loads the Taskboard permission patch after the selected Host patches. The SDK handshake requires approval, permission presets, sandbox policy, a sandbox provider and Session persistence. The patch selects the Run home’s `sessions` directory for JSONL persistence. Use `execution.patches` for absolute profile overlay paths and `execution.requestTimeoutMs` to bound the input acknowledgement. New Runs record a digest of the explicitly selected SDK patch files in load order. The Host checks the files during launch preparation and before admitting a continuation of that Session. If a file changes, start a fresh Run to use the updated deployment. Earlier records without a digest retain their saved route and path checks.

Project members sign in at `taskboard-team.html` on the local Web Host. Viewers read granted projects, requirements and discussion. Editors may also revise requirements and comment. The Host checks the current project grant and task version in the same transaction as each write and records the member’s identity. Conflicting edits return HTTP 409. Run control, approvals, delivery review, backups and account management require the Host operator.

The operator can replace a member key, revoke one project grant, or disable the account across projects. The database retains grants across Host restarts. Business backups preserve attributed activity and omit accounts, grants and key verifiers. Issue new memberships on the restored Host.

<a id="understand-the-implementation"></a>
## Understand the implementation

[The task domain](src/domain.ts) validates project and task records when storage opens. The [controller](src/index.ts) commits each task mutation, activity entry and command receipt in one SQLite transaction. The Host adapter binds a Run to its task, immutable input, Session, workspace and lease generation. Confirmed runtime exit releases that generation. Human decisions preserve the delivery version, snapshot and any waiver reasons. Version counts committed actions. Revision identifies a requirements snapshot.

The [execution store](src/execution.ts) saves queued Runs in commit order and returns the original command receipt on replay. Each queued Run reserves its task and selected Session and stores the confirmed directory or pinned worktree plan. The Host assigns an available lease to the oldest queued Run with accepted prerequisites and an available workspace in one SQLite transaction. After a claim, `prepareWorkspace` uses the stored plan and checks the observed directory, branch, and baseline. A waiting Run with no saved plan needs cancellation and a new confirmed request. Canceling a waiting Run preserves its history and releases its task reservation and any fresh Session reservation. Existing databases without a queue record start with an empty queue.

With `execution.dispatch` enabled, the Host claims the queue on startup and after admission, human review, cancellation or stop. It checks the saved route and workspace before starting the SDK. The dispatcher records a failed preparation and releases the slot when it never started the Run process. After initialization, `submitInput` records the attempt and first possible Session event sequence before invoking `session/prompt`. When the original SDK reply is unavailable, the Host looks for the matching inbox message after that sequence in the bound Session. A restarted Host reads the persisted Session after verifying the old process scope has exited, and records the observed receipt and any ending for that input. A missing or incompatible log leaves unconfirmed input visible in the Run history. The launcher sends each saved input once, and a receipt that arrives after a confirmed stop goes into the original Run’s history. SDK processes receive a scrubbed parent environment plus the entries explicitly assigned in `execution.env`.

After the Run’s SDK turn ends, the Host shuts down the SDK and waits for its complete process scope to empty. For a successful turn with a submitted delivery, it then observes the workspace and commits the delivery, reviewable task state and lease release together. A finished Run without a delivery leaves its task blocked. Use `recheckRunStop` if the Host could not confirm shutdown during finalization.

`watchChanges` sends a notification on connection and after persisted Taskboard changes. Browsers refresh their selected view from the authenticated read methods. A reconnect reads the current state before listening for further changes.

<a id="model-experience"></a>
## Model Experience

### Task snapshot input

#### What the model sees

When dispatch is enabled, the SDK receives one user message through `session/prompt` containing the saved title, goal, optional constraints and risk level, acceptance criteria, return feedback and explicitly selected material text. The SDK logs it in the Run’s Session. The runtime advertises `ask_user_question`, `taskboard_read`, `taskboard_update` and `taskboard_submit_delivery`. The read tool returns the confirmed requirements and current task version. The update tool records progress, comments and blockers. The delivery tool submits evidence for each original criterion. The Host binds each invocation to its owning Run and replays duplicate writes by tool call identity. Human acceptance is an operator command.

#### Token effect

The user message consumes input tokens for its saved text and field names. The model request includes the four tool schemas.

#### KV Cache effect

The controller contributes no model request prefix.

## Known Limitations and Deferred Work

- The shipped Web profile leaves dispatch disabled. Automatic process-scope reconciliation requires a macOS graphical login and a Run launched with saved ownership evidence. Runs with an unverified scope keep their lease.

<a id="dev-note"></a>
### Dev Note

The task row contains its requirements snapshots and activity. The controller owns those records in one storage domain. No invariant companion is published because the controller reads its authoritative state directly from SQLite.
