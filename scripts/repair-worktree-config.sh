#!/bin/sh
# Resolve the repository from this script, independent of the caller's directory.
set -eu
repair_script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$repair_script_dir/.."
exec node scripts/install-lefthook.mjs --repair-worktree-config
