@echo off
setlocal
pushd "%~dp0.." || exit /b 1
node scripts/install-lefthook.mjs --repair-worktree-config
set "repair_exit_code=%errorlevel%"
popd
exit /b %repair_exit_code%
