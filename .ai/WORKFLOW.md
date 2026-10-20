# Shared Agent Workflow

This file defines the repository's manual Codex/Codely handoff process. Git owns code history, each task's `task.md` owns its scope and acceptance criteria, `plan.md` owns progress, and `handoff.md` owns the latest checkpoint. Confirmed design decisions remain in the active implemented Agent Notes under `.agents/notes/implemented/`.

## Start or resume a task

1. Read `AGENTS.md`, `CODELY.md` when using Codely, this file, the task's `task.md`, `plan.md`, and `handoff.md`, plus relevant architecture docs and active Agent Notes.
2. Check `git status --short --branch`, `git log -1 --oneline`, the task's declared branch and base, tracked diffs, untracked files, and remote synchronization when relevant.
3. Compare the checkpoint with the actual files, Git history, and recorded verification. Treat repository state as authoritative when it disagrees with prose; record the mismatch before continuing.
4. Confirm the previous writer has stopped and this task has one writer in this workspace. Mark the task `IN_PROGRESS`, record agent and time, and continue at the first incomplete, unblocked plan item.
5. If task ownership, user changes, an applicable decision, or the checkpoint cannot be established safely, stop the affected work and report the evidence needed to resolve it.

## Create and update task records

Use `.ai/templates/` for new task records. Choose an unused task identifier that follows a repository convention when one exists; do not assume example identifiers are reserved. Keep task goals and acceptance criteria in `task.md`, verifiable work items and validation in `plan.md`, the latest handoff snapshot in `handoff.md`, and only durable execution facts in `log.md`. If repository policy prohibits raw commit identifiers in maintained prose, name the branch/ref and the command the receiver must use to verify its current commit.

Update the plan when work advances. Record a verification result only after running that command, distinguish product-code verification from documentation-only changes, and name the exact code commit tested. `DONE` requires all acceptance criteria to have evidence. A handoff is `HANDOFF_READY` only after the outgoing writer has stopped.

## Hand off a task

1. Stop implementation and inspect the branch, HEAD, tracked diff, untracked files, and remote synchronization.
2. Identify task-owned changes. List unrelated existing modifications separately and never stage, commit, or describe them as part of this task.
3. Run relevant checks when useful. Record exact commands, outcomes, and tested code commit; use `NOT_RUN` with the reason otherwise.
4. Update `plan.md`, `handoff.md`, and `log.md` only with verified facts. Check the records for credentials and unnecessary private data.
5. Commit only task-owned files when repository policy permits. Push only when the user authorized it and a remote is configured. Otherwise state plainly that the changes remain local.
6. Set `HANDOFF_READY`, name the next agent, record the handoff time and actual Git state, and stop writing in the task workspace.

## Recover safely and resolve decisions

Do not reset, clean, force-push, overwrite user files, or resolve unrelated conflicts as part of a handoff. Preserve the workspace and report the exact risk. Before a cross-device handoff, require the task commit to be pushed and confirm the receiving device fetched the matching commit.

Treat active implemented Agent Notes and owning architecture documents as decision sources. Do not replace a confirmed decision through a task checkpoint or proposal. If current requirements conflict with a decision, record the conflict and ask the user to choose before changing the design.

## User authorization

Follow repository policy for commits. Obtain explicit user authorization before pushing or performing destructive Git operations, deleting or overwriting user-owned data, or making other irreversible external changes. A model's own checkpoint does not establish that an earlier agent stopped writing.

## Handoff prompts

**Handoff:** Follow `.ai/WORKFLOW.md` for the current task. Stop implementation, inspect Git and the task's changes, record verified progress and validation in its plan and checkpoint, separate unrelated work, state synchronization accurately, then stop writing.

**Resume:** Read the agent entry files, `.ai/WORKFLOW.md`, the current task records, and relevant decisions. Verify the checkpoint against Git and files, confirm the previous writer stopped, record yourself as the sole writer, then continue the first incomplete plan item. Preserve unrelated changes and report any conflict before changing a confirmed decision.
