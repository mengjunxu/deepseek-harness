/** Task worktrees retained outside the primary checkout; Git is supplied by the managed adapter. */
import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'

function samePath(a, b) {
  const normalize = path => process.platform === 'win32' ? path.toLowerCase() : path
  return normalize(a) === normalize(b)
}

function locations(node, request) {
  if (!/^TASK-[0-9a-f-]{36}$/u.test(request.id)) throw new Error('Invalid workspace task id')
  const repo = node.repos[request.repoAlias]
  if (!repo) throw new Error('Unknown workspace repository alias')
  const source = realpathSync(repo.path)
  const root = realpathSync(node.workspaceRoot)
  const rel = relative(source, root)
  if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) throw new Error('Workspace root must be outside the primary repository')
  const directory = join(root, request.id)
  return { source, directory, cwd: join(directory, 'worktree'), branch: `agent/${request.id}` }
}

function plainDirectory(path) {
  const stat = lstatSync(path)
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Workspace directory must not be a symlink')
}

/**
 * Exclusively prepare a task worktree at a resolved commit; failures retain evidence and never use the primary checkout.
 * @param {object} node - Validated node configuration with an external workspace root.
 * @param {object} request - Immutable task request.
 * @param {Function} git - Managed Git operation accepting cwd and argv; returns complete stdout or rejects.
 * @returns {Promise<object>} Durable workspace identity after successful Git preparation.
 */
export async function prepareWorkspace(node, request, git) {
  const paths = locations(node, request)
  const top = realpathSync((await git(paths.source, ['rev-parse', '--show-toplevel'])).trim())
  if (!samePath(top, paths.source)) throw new Error('Repository alias must select the Git top-level directory')
  // Exclusive mkdir also rejects another controller's unfinished preparation.
  mkdirSync(paths.directory, { mode: 0o700 })
  const baseCommit = (await git(paths.source, ['rev-parse', '--verify', '--end-of-options', `${request.baseRef}^{commit}`])).trim()
  if (!/^[0-9a-f]{40,64}$/u.test(baseCommit)) throw new Error('Git did not return a commit id')
  await git(paths.source, ['worktree', 'add', '-b', paths.branch, paths.cwd, baseCommit])
  const record = { version: 1, taskId: request.id, source: paths.source, cwd: paths.cwd, branch: paths.branch, baseCommit }
  writeFileSync(join(paths.directory, 'workspace.json'), `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 })
  return record
}

/**
 * Verify retained workspace identity before an execution; no missing-record fallback is provided.
 * @param {object} node - Validated node configuration.
 * @param {object} request - Immutable task request.
 * @param {Function} git - Managed Git operation.
 * @returns {Promise<object>} Validated retained workspace and pinned base commit.
 */
export async function inspectWorkspace(node, request, git) {
  const paths = locations(node, request)
  plainDirectory(paths.directory)
  plainDirectory(paths.cwd)
  const recordPath = join(paths.directory, 'workspace.json')
  const stat = lstatSync(recordPath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) throw new Error('Invalid workspace record file')
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  const keys = ['version', 'taskId', 'source', 'cwd', 'branch', 'baseCommit']
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key))
    || record.version !== 1 || record.taskId !== request.id || record.source !== paths.source
    || record.cwd !== paths.cwd || record.branch !== paths.branch || typeof record.baseCommit !== 'string'
    || !/^[0-9a-f]{40,64}$/u.test(record.baseCommit)) throw new Error('Workspace record does not match this task')
  const top = realpathSync((await git(paths.cwd, ['rev-parse', '--show-toplevel'])).trim())
  if (!samePath(top, realpathSync(paths.cwd))) throw new Error('Workspace is not a Git top-level directory')
  const common = async cwd => realpathSync((await git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim())
  if (!samePath(await common(paths.cwd), await common(paths.source))) throw new Error('Workspace belongs to another repository')
  if ((await git(paths.cwd, ['symbolic-ref', '--short', 'HEAD'])).trim() !== paths.branch) throw new Error('Workspace branch changed')
  await git(paths.cwd, ['merge-base', '--is-ancestor', record.baseCommit, 'HEAD'])
  return record
}

/**
 * Acquire cross-process ownership before inspecting or executing a retained worktree.
 * @param {object} node - Validated node configuration.
 * @param {object} request - Immutable task request.
 * @returns {Function} Release callback, called only after owned work has stopped; stale locks require manual inspection.
 */
export function lockWorkspace(node, request) {
  const { directory } = locations(node, request)
  plainDirectory(directory)
  const path = join(directory, 'execution.lock')
  const token = JSON.stringify({ pid: process.pid, token: randomUUID() })
  writeFileSync(path, token, { flag: 'wx', mode: 0o600 })
  return () => {
    if (readFileSync(path, 'utf8') !== token) throw new Error('Workspace ownership changed; lock retained')
    unlinkSync(path)
  }
}
