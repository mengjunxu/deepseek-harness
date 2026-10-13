---
description: "Repair the shared core.worktree setting that prevents local Git hook installation in a submodule checkout."
---

# Cookbook: repairing Git worktree configuration

English | [中文](repairing-worktree-config.zh.md)

## Summary

Use this repair when dependency installation or push reports `cannot enable extensions.worktreeConfig while core.worktree is in the common config`. The scripts back up this checkout's Git configuration, move its source-directory setting to `config.worktree`, and reinstall Lefthook hooks when dependencies are present. They do not commit or push.

## Table of Contents

- [Run the repair](#run-the-repair)
- [Check the result](#check-the-result)
- [Failure and recovery](#failure-and-recovery)
- [Dev Note](#dev-note)

<a id="run-the-repair"></a>
## Run the repair

Use Git 2.26 or newer and a Node version supported by this repository. Run from the main checkout, with no additional linked worktrees registered. Stop other Git configuration edits or dependency installations first. The wrappers locate the repository relative to their own files, so they also work when invoked from another directory.

Windows, from the repository root:

```bat
scripts\repair-worktree-config.bat
```

macOS/Linux, from the repository root:

```sh
sh scripts/repair-worktree-config.sh
```

Both wrappers invoke `scripts/install-lefthook.mjs --repair-worktree-config`. This opt-in repair can run before dependencies are installed; if Lefthook is missing, it repairs Git configuration and prints instructions to install dependencies. Normal installation retains its existing refusal to migrate a shared `core.worktree` automatically.

<a id="check-the-result"></a>
## Check the result

When migration is needed, the output prints a backup directory named `dsh-worktree-config-backup-*` inside the common Git directory. It contains the original `config`, the original `config.worktree` if present, and a record of whether that file existed. The repair enables worktree-specific configuration and preserves the checkout path; dependency-backed hook installation prints `sync hooks`.

The source files and branches are unaffected. These settings and backups belong to Git's local management directory and are not committed. Repeating the repair after a successful migration does not create another migration backup. A subsequent push still runs the normal typecheck hook.

<a id="failure-and-recovery"></a>
## Failure and recovery

The repair refuses a linked checkout, registered additional worktrees, a conflicting existing worktree path, or unsafe/custom configuration rejected by the hook installer. Resolve the named conflict rather than deleting Git metadata. If configuration migration fails, the script restores the original files; if restoration fails, it reports the backup directory. If hook installation fails after migration succeeds, the repaired configuration and backups remain: resolve the hook diagnostic and rerun the repair.

For manual recovery, stop Git configuration writers and restore `config` from the printed backup directory. Restore its saved `config.worktree` too, or remove the newly created `config.worktree` only if the backup record says the original was absent. The scripts do not modify global Git settings.

<a id="dev-note"></a>
## Dev Note

The shell wrapper is exercised on POSIX and the batch wrapper on Windows by the platform-specific fixture in `scripts/install-lefthook.spec.ts`. Shared tests cover migration, backup contents, repeated runs, refusal with linked worktrees, and restoration after a rejected repository extension.
