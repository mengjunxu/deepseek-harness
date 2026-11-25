---
description: "Use the native Web Taskboard for projects, requirements and task activity."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-taskboard

English | [中文](README.zh.md)

## Summary

The Web Taskboard lists projects and tasks in a native main panel. Use it to register a directory, edit requirements and acceptance criteria, or inspect a task’s activity.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="use-this-package"></a>
## Use this package

Open **Taskboard** from the Web sidebar. Add a project using an absolute directory or the directory picker. Switch between a board and list, search tasks and filter by state. Drag cards to reorder them or move eligible cards to **To do**. The start dialog shows the SDK provider and model. Choose Codex or Codely when the deployment offers it. Each native selection starts a fresh session and is recorded in the Run’s start authorization. If either changes before you queue the Run, reopen the dialog to confirm the updated settings. The Run history shows the saved selection. Choose **Saved input** on a current or previous Run to inspect its original instructions, feedback and file contents. Set **Risk level** when creating or editing a task. The start dialog and saved Run input show the level for that revision. Use **Constraints** when creating or editing a task to record limits on the work. The task detail shows current and previous constraints alongside the requirements history and comments. Expand **Previous run checkpoint** when starting another Run or reading its saved input to see the source Run, Session, requirements revision, input receipt and last observed event. In **Saved input**, open **Start authorization** to see the executor, route selection, authorized scope, time and command ID. Choose **Quick task · v1** to run directly, or **Standard task · v1** to enter optional steps in execution order. The start dialog and saved input show the workflow selected for that revision.

Expand **Native tool activity** on a current or previous Run to see counts reported by its executor. An empty summary means the adapter observed no tool or permission events. Runs without a saved summary omit this section.

Select **Milestone plan · v1** and enter one stage goal per line. Confirm the stage shown in **Start run**. **Accept stage** opens the next stage for a separate start. Returning a stage allows another attempt at its goal. Select **Accept delivery** on the final stage to complete the task.

**Download task specification** saves the selected Run’s requirements, file contents, execution folder, baseline commit and recorded authorization as JSON.

After restoring a backup, choose **Continue previous session** to use the original SDK Session files. To start a fresh Session, choose **Original folder** or **New worktree**, select the materials for this Run and confirm. The earlier Run stays in the task history.

Enable **Check tracked Git changes before delivery** when registering a project to see the Host check beside each delivery. If the check fails or cannot run, enter a reason before accepting. The delivery page shows whether the Host requested a model review. The human decision appears separately after submission.

When registering an npm project, choose its **Project validation script**. The start dialog shows the script. The SDK runs it on delivery submission. The review page shows its result and exit code when available. Enter a reason to accept a failed or unconfirmed check.

To validate a named package script, choose **Custom npm script** or **Custom pnpm script** when registering the project. Enter the script name from package.json and confirm the displayed command when starting the Run.

Select a **To do** task to confirm a folder and queue a Run. **Execution settings** shows the configured SDK route. The Run section shows progress, connection state and stop controls. **Needs your response** opens the task whose Run is awaiting an answer or tool approval.

Open **Task relationships** in a task’s detail to choose its parent and prerequisites. To run once after the prerequisites are accepted, select **New worktree**, check the single-run authorization and queue the Run. Cancel it from the Run section while it is waiting.

Open a delivery to inspect its verification evidence and file changes. A reviewed delivery shows the human decision and its time, feedback and waiver reasons. Accept a delivery after recording any required waiver reasons, or return it with feedback for the next Run. Dragging a reviewable task into **Done** opens its delivery review. Project checks show their status, observation time, and exit code or reason when available. Select **Download review summary** for a local JSON file containing evidence counts, reported risk and project check outcomes for that delivery. When the Host offers a review model, **Request model review** sends that summary to the displayed route. The delivery page shows each attempt and the returned assessment. The operator can still accept or return the delivery.

Select **Draft return feedback from this assessment** to edit the suggestion. **Return for changes** moves the task to To do. Use **Start run** to authorize one repair and review its new delivery.

Open **Backup & restore** to export the selected project or download a Taskboard backup once active Runs have exited. In an empty Taskboard, choose the backup file and select **Restore backup**. The result shows how many Session logs were omitted and how many waiting Runs were canceled.

Open **Team access** for the selected project, enter the account name and choose its initial role. Copy the issued key while the dialog is open. Members open **Open member sign-in** in their own browser session and paste the key. After an edit conflict, copy any draft you want to keep, refresh the task and reapply your change. Use the account’s role selector to grant access to another project or remove access to the selected one.

<a id="model-experience"></a>
## Model Experience

None, as the Taskboard panel displays records and sends operator commands to the [Taskboard controller](../../api/taskboard-controller/README.md).

#### KV Cache effect

The browser panel does not add model request content.

## Known Limitations and Deferred Work

- The execution settings show the deployment’s SDK route. Live model and permission checks take place at Run startup.

<a id="dev-note"></a>
### Dev Note

This package registers the existing sidebar and main slots. Its projection reads the Taskboard Remote API. No invariant companion is published because the client has no independent authoritative task state.
