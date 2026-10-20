---
schema_version: 1
task_id: <task-id>
state: IN_PROGRESS
previous_agent: <agent-id-or-none>
next_agent: <agent-id-or-none>
branch: <branch-name>
base_commit: <commit-at-task-start>
tested_code_commit: <commit-tested-or-NOT_RUN>
updated_at: "<ISO-8601 timestamp with offset>"
---

# Handoff Checkpoint

## Status

<One sentence: current progress and remaining work.>

## Completed
- <Verified work and relevant files.>

## Remaining
- <Incomplete work or verification.>

## Git state

- Branch and HEAD:
- Working tree:
- Task-owned changes:
- Unrelated existing changes:
- Remote synchronization:
- Previous writer stopped:

## Verification evidence

- Command:
- Result: NOT_RUN | PASS | FAIL
- Tested code commit:
- Unrun checks and reason:

## Risks and decisions

- <Known issue or applicable decision.>

## Next actions

1. <First incomplete action.>
2. <Next action.>

## User decisions

- None, or list the decisions required from the user.
