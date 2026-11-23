/** Canonical project inspection and worktree preparation before a Taskboard runtime starts. */
import { createHash } from 'node:crypto'
import { access, lstat, mkdir, open, readlink, realpath, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { SubprocessExecutableNotFoundError, type SubprocessRuntime } from '@deepseek-ai/dsh-subprocess'
import { GitRunner } from '@deepseek-ai/dsh-workspace-changes'
import { gitCheckStatus } from './execution-domain.ts'
import type { DeliveryCodeSnapshot, DeliveryFile, DeliveryFileDiff, TaskRunId, TaskboardProject, WorkspaceInspection } from './types.ts'

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
async function localEntry(cwd: string, path: string) {
  const file = resolve(cwd, path)
  if (!path || isAbsolute(path) || relative(cwd, file).split(sep).join('/') !== path
    || !inside(cwd, file) || !inside(cwd, await realpath(dirname(file)))) throw new Error('file path outside workspace')
  return { file, info: await lstat(file) }
}

async function untrackedDigest(cwd: string, path: string, signal: AbortSignal): Promise<string> {
  const { file, info } = await localEntry(cwd, path)
  const hash = createHash('sha256').update(String(info.mode)).update('\0')
  if (info.isSymbolicLink()) hash.update(await readlink(file))
  else if (info.isFile()) {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      if (!(await handle.stat()).isFile()) throw new Error('workspace file changed during fingerprinting')
      const buffer = Buffer.alloc(64 * 1024)
      for (;;) {
        signal.throwIfAborted()
        const { bytesRead } = await handle.read(buffer)
        if (!bytesRead) break
        hash.update(buffer.subarray(0, bytesRead))
      }
    } finally { await handle.close() }
  } else throw new Error('untracked entry cannot be fingerprinted')
  return hash.digest('hex')
}

function parseReviewChanges(names: string): DeliveryFile[] {
  const parts = names.split('\0')
  if (parts.pop() !== '' || parts.length % 2 !== 0) throw new Error('invalid Git change listing')
  const statuses = { A: 'added', D: 'deleted', M: 'modified', T: 'modified' } as const
  const files: DeliveryFile[] = []
  for (let i = 0; i < parts.length; i += 2) {
    const [code, path] = parts.slice(i, i + 2)
    if (!path || (code !== 'A' && code !== 'D' && code !== 'M' && code !== 'T')) throw new Error('unsupported Git change status')
    files.push({ path, status: statuses[code] })
  }
  return files
}

function diffArguments(baseline: string, path: string, detail: string): string[] {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(baseline)) throw new Error('invalid delivery baseline')
  return ['--literal-pathspecs', 'diff', detail, '--relative', '--no-renames', '--no-ext-diff', '--no-textconv', '--no-color',
    '--ignore-submodules=none', '-z', baseline, '--', path]
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
    return this.observe(directory, signal, false)
  }

  private async observe(directory: string, signal: AbortSignal, forDelivery: boolean): Promise<WorkspaceInspection> {
    signal.throwIfAborted()
    if (!isAbsolute(directory)) throw new Error('workspace must be absolute')
    const cwd = await realpath(directory)
    if (!(await stat(cwd)).isDirectory()) throw new Error('workspace is not a directory')
    await access(cwd, constants.R_OK | constants.X_OK | (forDelivery ? 0 : constants.W_OK))
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
    if (forDelivery) {
      const staged = await read(['diff', '--cached', '--raw', '--no-abbrev', '--no-renames', '--no-ext-diff', '--no-textconv', '-z', '--', '.'])
      const unstaged = await read(['diff', '--name-status', '--no-renames', '--no-ext-diff', '--no-textconv', '--relative', '-z', '--', '.'])
      hash.update('\0').update(staged).update('\0').update(unstaged)
      for (const { path, status } of unstaged ? parseReviewChanges(unstaged) : []) {
        if (status !== 'deleted') hash.update('\0').update(path).update('\0').update(await untrackedDigest(cwd, path, signal))
      }
    } else {
      for (const args of [[], ['--cached']]) {
        const patch = await read(['diff', ...args, '--no-ext-diff', '--no-textconv', '--binary', '--', '.'])
        hash.update('\0').update(patch)
      }
    }
    const paths = await read(['ls-files', '--others', '--exclude-standard', '-z', '--', '.'])
    for (const path of paths.split('\0').filter(Boolean)) {
      signal.throwIfAborted()
      hash.update('\0').update(path).update('\0').update(await untrackedDigest(cwd, path, signal))
    }
    return { directory: cwd, repository, head, branch, dirty: status.length > 0, fingerprint: hash.digest('hex') }
  }

  /**
   * Capture the changes covered by a Delivery with its independently observed code fingerprint.
   * @param directory - workspace owned by the original Run.
   * @param baseline - confirmed Git commit at Run admission, or null outside Git.
   * @param declaredPaths - explicitly reported workspace-relative files for non-Git evidence.
   * @param signal - cancellation during observation.
   * @param checkTrackedDiff - run the project’s tracked diff check during capture.
   * @returns the observed Git identities, file list, fingerprint and any project check result.
   */
  async captureDelivery(
    directory: string, baseline: string | null, declaredPaths: readonly string[], signal: AbortSignal, checkTrackedDiff = false,
  ): Promise<DeliveryCodeSnapshot> {
    const seen = await this.observe(directory, signal, true)
    if (seen.directory !== directory || (baseline === null) !== (seen.repository === null)) throw new Error('delivery workspace scope changed')
    const hash = createHash('sha256').update(JSON.stringify([seen.directory, baseline, seen.fingerprint]))
    const files: DeliveryFile[] = []
    let checkExit: number | null = null
    if (baseline) {
      const git = await this.git()
      if (!git) throw new Error('delivery Git executable unavailable')
      if (checkTrackedDiff) {
        try {
          const result = await git.run(diffArguments(baseline, '.', '--check'), { cwd: directory, signal })
          checkExit = result.exitCode
        } catch (error) {
          // A failed Git invocation leaves the check unexecuted. Host shutdown cancels the entire capture.
          if (signal.aborted) throw error
        }
      }
      const names = await this.read(git, directory, diffArguments(baseline, '.', '--name-status'), signal)
      const paths = new Map((names ? parseReviewChanges(names) : []).map(file => [file.path, file]))
      const untracked = await this.read(git, directory, ['ls-files', '--others', '--exclude-standard', '-z', '--', '.'], signal)
      for (const path of untracked.split('\0').filter(Boolean)) paths.set(path, { status: 'untracked', path })
      files.push(...paths.values())
    } else {
      const paths = [...new Set(declaredPaths)].sort()
      const fileDigests = async () => {
        const digests: string[] = []
        for (const path of paths) digests.push(await untrackedDigest(directory, path, signal))
        return JSON.stringify(digests)
      }
      const observed = await fileDigests()
      if (observed !== await fileDigests()) throw new Error('declared files changed during capture')
      hash.update(JSON.stringify(paths)).update(observed)
      for (const path of paths) files.push({ status: 'declared', path })
    }
    const checked = await this.observe(directory, signal, true)
    if (checked.directory !== seen.directory || checked.repository !== seen.repository || checked.fingerprint !== seen.fingerprint) {
      throw new Error('workspace changed during delivery capture')
    }
    files.sort((a, b) => a.path < b.path ? -1 : a.path === b.path ? 0 : 1)
    return { scope: baseline === null ? 'declared-files' : 'git', baseline, head: seen.head, fingerprint: hash.digest('hex'), files,
      ...checkTrackedDiff && { gitDiffCheck: gitCheckStatus(checkExit),
        gitDiffObservation: { observedAt: new Date().toISOString(), exitCode: checkExit } } }
  }

  /**
   * Read a path in a saved Delivery after checking that its workspace still matches.
   * @param directory - workspace bound to the Delivery's Run.
   * @param saved - sealed code snapshot with its list of reviewable files.
   * @param path - exact workspace-relative path from that list.
   * @param signal - cancellation during observation or read.
   * @returns a Git patch, the contents of an added file, or a display status.
   */
  async readDeliveryFile(directory: string, saved: DeliveryCodeSnapshot, path: string, signal: AbortSignal): Promise<DeliveryFileDiff> {
    const record = saved.files.find(file => file.path === path)
    if (!record) throw new Error('file outside the delivery snapshot')
    const declared = saved.scope === 'declared-files' ? saved.files.map(file => file.path) : []
    const confirm = async () => {
      const current = await this.captureDelivery(directory, saved.baseline, declared, signal)
      if (current.fingerprint !== saved.fingerprint) throw new Error('delivery workspace has changed')
    }
    await confirm()
    const result = saved.baseline && record.status !== 'untracked' ? await this.gitDeliveryPatch(directory, saved.baseline, path, signal)
      : await this.localDeliveryFile(directory, path, signal)
    await confirm()
    return result
  }

  private async gitDeliveryPatch(directory: string, baseline: string, path: string, signal: AbortSignal): Promise<DeliveryFileDiff> {
    const git = await this.git()
    if (!git) throw new Error('delivery Git executable unavailable')
    const stats = await this.read(git, directory, diffArguments(baseline, path, '--numstat'), signal)
    if (stats.startsWith('-\t-\t')) return { kind: 'binary' }
    const patch = await git.run(diffArguments(baseline, path, '--patch'), { cwd: directory, signal })
    if (patch.exitCode !== 0) throw new Error('git diff failed')
    return patch.truncated ? { kind: 'oversized' } : { kind: 'patch', text: patch.stdout }
  }

  private async localDeliveryFile(directory: string, path: string, signal: AbortSignal): Promise<DeliveryFileDiff> {
    const { file, info } = await localEntry(directory, path)
    if (info.isSymbolicLink()) return { kind: 'symlink' }
    if (!info.isFile()) throw new Error('delivery entry is not a regular file')
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const metadata = await handle.stat()
      if (!metadata.isFile()) throw new Error('delivery file changed during read')
      const { size } = metadata
      if (size > this.config.gitOutputMaxBytes) return { kind: 'oversized' }
      const buffer = Buffer.alloc(size + 1)
      let count = 0
      while (count < buffer.length) {
        signal.throwIfAborted()
        const { bytesRead } = await handle.read(buffer, count)
        if (!bytesRead) break
        count += bytesRead
      }
      if (count !== size) throw new Error('delivery file changed during read')
      const bytes = buffer.subarray(0, count)
      if (bytes.includes(0)) return { kind: 'binary' }
      try {
        return { kind: 'file', text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
      } catch (error) {
        if (!(error instanceof TypeError)) throw error
        return { kind: 'binary' }
      }
    } finally {
      await handle.close()
    }
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
