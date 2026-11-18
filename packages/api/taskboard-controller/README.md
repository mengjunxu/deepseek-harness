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

Use `ctx.remote.taskboard.createProject` with an existing absolute directory, a project UUID, a command UUID and expected version zero. Create a task with its own UUID and expected version zero. Later writes supply the owning project, task, expected version and a fresh command UUID. Retrying the same command and payload returns its original receipt. A version conflict requires reloading the task before issuing a new command.

Read project cards with `listTasks` and revision snapshots and activity with `detail`. Use `reorderTask` to move a card before another card in its project, or to the end. Planning moves a backlog task to todo. Canceling and archiving retain its history, and explicit reopening returns a terminal task to todo.

Use `inspectProject` to display a registered project's canonical path, branch, commit and local changes. For continuation, `inspectPriorWorkspace` reads the latest inactive Run's directory. Original-directory execution rechecks the operator's selection after admission. Isolated execution creates a worktree at the pinned commit under the configured `worktreeRoot`.

Use `stopRun` with the selected Run ID and current task version. A graceful request targets that Run's SDK child. An explicit force request becomes available after an unconfirmed stop. The task detail includes the control state, connection state and the observation that prevented release. The Host retains the lease until it observes runtime exit and an empty owned tool-process scope.

Host adapters construct the exclusive client with `createTaskRuntime`. It launches the `sdk` profile in the confirmed directory and loads the Taskboard permission patch after the selected Host patches. The SDK handshake requires the native approval, permission preset, sandbox policy and sandbox provider services.

<a id="understand-the-implementation"></a>
## Understand the implementation

[The task domain](src/domain.ts) validates project and task records when storage opens. The [controller](src/index.ts) commits each task mutation, activity entry and command receipt in one SQLite transaction. The Host adapter binds a Run to its task, immutable input, Session, workspace and lease generation. Confirmed runtime exit releases that generation. Human decisions preserve the delivery version, snapshot and any waiver reasons. Version counts committed actions. Revision identifies a requirements snapshot.

<a id="model-experience"></a>
## Model Experience

None, as task commands and activity are stored in the Web Host business database.

#### KV Cache effect

The controller contributes no model request prefix.

## Known Limitations and Deferred Work

- This package currently exposes task editing and history through the Web API. Run dispatch and the user-facing delivery review require an execution adapter and a current code snapshot. The Host-only record operations accept facts from those owners.

<a id="dev-note"></a>
### Dev Note

The task row contains its requirements snapshots and activity. The controller owns those records in one storage domain. No invariant companion is published because the controller reads its authoritative state directly from SQLite.
