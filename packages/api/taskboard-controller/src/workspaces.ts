/** Canonical project inspection and worktree preparation before a Taskboard runtime starts. */
import { createHash } from 'node:crypto'
import { access, lstat, mkdir, open, readlink, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { SubprocessExecutableNotFoundError, type SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { GitRunner } from '@deepseek-ai/dsh-workspace-changes'
import type { TaskRunId, TaskboardProject, WorkspaceInspection } from './types.ts'

/** Git subprocess limits and the Host-owned parent of isolated worktrees. */
export interface WorkspaceConfig {
  worktreeRoot: string
  gitTimeoutMs: number
  gitOutputMaxBytes: number
}

/** A directory plan binds the eventual checkout to the selected baseline or prior inspection. */
export interface TaskWorkspacePlan {
  mode: 'isolated' | 'original' | 'continue'
  source: string
  checkout: string | null
  directory: string
  branch: string | null
  baseline: string | null
  confirmation: WorkspaceInspection | null
}

/** Follows canonical path components, preserving sibling directories with common name prefixes. */
function inside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep))
}

/** Resolve existing ancestors without creating directories in the user's project. */
async function canonicalDestination(path: string): Promise<string> {
  try { return await realpath(path) } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT') || path === dirname(path)) throw error
  }
  return join(await canonicalDestination(dirname(path)), basename(path))
}

async function hasGitMarker(root: string): Promise<boolean> {
  let directory = root
  for (;;) {
    try {
      await lstat(join(directory, '.git'))
      return true
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
    const parent = dirname(directory)
    if (parent === directory) return false
    directory = parent
  }
}

/** Record paths and contents without following untracked symlink targets. */
async function untrackedDigest(cwd: string, path: string): Promise<string> {
  const file = resolve(cwd, path)
  if (!inside(cwd, file) || !inside(cwd, await realpath(dirname(file)))) throw new Error('untracked path outside workspace')
  const info = await lstat(file)
  const hash = createHash('sha256').update(String(info.mode)).update('\0')
  if (info.isSymbolicLink()) hash.update(await readlink(file))
  else if (info.isFile()) {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
    try {
      const buffer = Buffer.alloc(64 * 1024)
      for (;;) {
        const { bytesRead } = await handle.read(buffer)
        if (!bytesRead) break
        hash.update(buffer.subarray(0, bytesRead))
      }
    } finally { await handle.close() }
  } else throw new Error('untracked entry cannot be fingerprinted')
  return hash.digest('hex')
}

/** Git operations run through the configured Host subprocess service. */
export class TaskWorkspaces {
  /**
   * @param subprocess - Host provider for Git commands.
   * @param config - deployment worktree directory and output/time limits.
   */
  constructor(private readonly subprocess: SubprocessRuntime, private readonly config: WorkspaceConfig) {
    if (!isAbsolute(config.worktreeRoot)) throw new Error('worktreeRoot must be absolute')
  }

  private async git(): Promise<GitRunner | null> {
    let executable: string
    try { executable = await this.subprocess.resolveExecutable('git') } catch (error) {
      if (error instanceof SubprocessExecutableNotFoundError) return null
      throw error
    }
    return new GitRunner(this.subprocess, executable, {
      timeoutMs: this.config.gitTimeoutMs, outputMaxBytes: this.config.gitOutputMaxBytes,
    })
  }

  private async read(git: GitRunner, cwd: string, args: string[], signal: AbortSignal): Promise<string> {
    const result = await git.run(args, { cwd, signal })
    if (result.exitCode !== 0 || result.truncated) throw new Error(`git ${args[0]} failed or exceeded the configured output limit`)
    return result.stdout
  }

  /**
   * Read the actual directory, branch, commit and worktree fingerprint without changing files or refs.
   * @param directory - absolute directory bound to a project or earlier Run.
   * @param signal - cancellation before launch.
   * @returns canonical confirmation facts; non-Git roots have no Git fingerprint.
   */
  async inspect(directory: string, signal: AbortSignal): Promise<WorkspaceInspection> {
    signal.throwIfAborted()
    if (!isAbsolute(directory)) throw new Error('workspace must be absolute')
    const cwd = await realpath(directory)
    if (!(await stat(cwd)).isDirectory()) throw new Error('workspace is not a directory')
    await access(cwd, constants.R_OK | constants.W_OK | constants.X_OK)
    const git = await this.git()
    const found = git && await git.run(['rev-parse', '--show-toplevel'], { cwd, signal })
    if (!git || !found || found.exitCode !== 0) {
      if (await hasGitMarker(cwd) || (found && !found.stderr.includes('not a git repository'))) throw new Error('cannot inspect Git repository')
      return { directory: cwd, repository: null, branch: null, head: null, dirty: null, fingerprint: null }
    }
    if (found.truncated) throw new Error('repository root truncated')
    const repository = await realpath(found.stdout.trimEnd())
    const read = (args: string[]) => this.read(git, cwd, args, signal)
    const head = (await read(['rev-parse', '--verify', 'HEAD^{commit}'])).trim()
    const branch = (await read(['branch', '--show-current'])).trimEnd() || null
    const status = await read(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.'])
    const hash = createHash('sha256').update(JSON.stringify([cwd, branch, head, status]))
    for (const args of [[], ['--cached']]) {
      const patch = await read(['diff', ...args, '--no-ext-diff', '--no-textconv', '--binary', '--', '.'])
      hash.update('\0').update(patch)
    }
    const paths = await read(['ls-files', '--others', '--exclude-standard', '-z', '--', '.'])
    for (const path of paths.split('\0').filter(Boolean)) {
      signal.throwIfAborted()
      hash.update('\0').update(path).update('\0').update(await untrackedDigest(cwd, path))
    }
    return { directory: cwd, repository, head, branch, dirty: status.length > 0, fingerprint: hash.digest('hex') }
  }

  private async confirmed(source: string, confirmation: WorkspaceInspection, signal: AbortSignal): Promise<WorkspaceInspection> {
    const now = await this.inspect(source, signal)
    if (now.directory !== confirmation.directory || now.repository !== confirmation.repository || now.branch !== confirmation.branch
      || now.dirty !== confirmation.dirty || now.head !== confirmation.head || now.fingerprint !== confirmation.fingerprint) {
      throw new Error('workspace changed; confirm it again')
    }
    return now
  }

  /**
   * Confirm an operator-selected existing workspace before using it serially.
   * @param source - project root or prior Run directory supplied by the Host.
   * @param confirmation - facts the operator actually saw.
   * @param mode - explicit original-directory choice or continuation of the prior Run.
   * @param signal - cancellation before launch.
   * @returns a plan that will repeat the check after acquiring the lease.
   */
  async existing(source: string, confirmation: WorkspaceInspection, mode: 'original' | 'continue',
    signal: AbortSignal): Promise<TaskWorkspacePlan> {
    const now = await this.confirmed(source, confirmation, signal)
    return { mode, source: now.directory, directory: now.directory, branch: now.branch,
      baseline: now.head, checkout: null, confirmation: now }
  }

  /**
   * Resolve an isolated worktree and pin its exact commit before the Run is admitted.
   * @param project - canonical project bound by the task service.
   * @param run - fresh SDK Run identity.
   * @param signal - cancellation before launch.
   * @returns a new-worktree plan; failing Git lookup or baseline resolution rejects the operation.
   */
  async isolated(project: TaskboardProject, run: TaskRunId, signal: AbortSignal): Promise<TaskWorkspacePlan> {
    const inspection = await this.inspect(project.root, signal)
    const git = await this.git()
    if (!inspection.repository || !git || !inspection.head) throw new Error('isolated execution requires a Git baseline')
    const ref = project.baselineBranch ?? inspection.head
    const baseline = (await this.read(git, project.root, ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}'], signal)).trim()
    if (inspection.directory !== project.root) throw new Error('registered project root moved')
    const parent = await canonicalDestination(this.config.worktreeRoot)
    if (inside(inspection.repository, parent)) throw new Error('worktree parent must be outside the source repository')
    const checkout = join(parent, run)
    if (dirname(checkout) !== parent) throw new Error('invalid run directory')
    return { mode: 'isolated', source: inspection.directory, checkout,
      directory: join(checkout, relative(inspection.repository, inspection.directory)),
      branch: 'dsh/taskboard/' + run, baseline, confirmation: null }
  }

  /**
   * Create an isolated checkout or revalidate an existing one after admission.
   * @param plan - Host plan bound by the caller to the active lease.
   * @param signal - abort prior to runtime launch.
   * @returns freshly observed facts for the SDK's working directory.
   */
  async materialize(plan: TaskWorkspacePlan, signal: AbortSignal): Promise<WorkspaceInspection> {
    if (plan.mode !== 'isolated') {
      if (!plan.confirmation) throw new Error('existing workspace needs confirmation')
      return this.confirmed(plan.source, plan.confirmation, signal)
    }
    const git = await this.git()
    if (!git || !plan.checkout || !plan.baseline || !plan.branch) throw new Error('incomplete isolated workspace plan')
    signal.throwIfAborted()
    const parent = dirname(plan.checkout)
    if (await canonicalDestination(this.config.worktreeRoot) !== parent) throw new Error('worktree parent changed')
    await mkdir(parent, { recursive: true, mode: 0o700 })
    if (await realpath(parent) !== parent) throw new Error('worktree parent changed')
    await mkdir(plan.checkout, { mode: 0o700 })
    await this.read(git, plan.source, ['worktree', 'add', '-b', plan.branch, '--', plan.checkout, plan.baseline], signal)
    const started = await this.inspect(plan.directory, signal)
    if (started.directory !== plan.directory || started.branch !== plan.branch || started.head !== plan.baseline) {
      throw new Error('created worktree does not match the selected directory, branch and baseline')
    }
    return started
  }
}
