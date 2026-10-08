/** Real Git repositories and independent processes; every test owns a private temporary root. */
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { test } from 'node:test'
import { inspectWorkspace, lockWorkspace, prepareWorkspace } from '../../../config/examples/mgsd-local/workspace.mjs'

const exec = promisify(execFile)
const moduleUrl = new URL('../../../config/examples/mgsd-local/workspace.mjs', import.meta.url).href

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mgsd-worktree-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const repo = join(root, 'primary & 中文')
  const workspaces = join(root, 'tasks')
  await mkdir(repo)
  await mkdir(workspaces)
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')))
  const git = async (cwd, args) => (await exec('git', args, { cwd, env })).stdout
  await git(repo, ['init'])
  await git(repo, ['config', 'core.autocrlf', 'false'])
  await git(repo, ['config', 'user.name', 'Test'])
  await git(repo, ['config', 'user.email', 'test@example.invalid'])
  await writeFile(join(repo, 'source.txt'), 'base\n')
  await git(repo, ['add', '.'])
  await git(repo, ['commit', '-m', 'base'])
  const node = { workspaceRoot: workspaces, repos: { project: { path: repo, defaultBaseRef: 'HEAD' } } }
  const request = () => ({ id: `TASK-${randomUUID()}`, repoAlias: 'project', baseRef: 'HEAD' })
  return { root, repo, node, request, git }
}

test('retains two isolated worktrees and pins the base despite later primary commits', async t => {
  const f = await fixture(t)
  const first = f.request()
  const second = f.request()
  const a = await prepareWorkspace(f.node, first, f.git)
  await writeFile(join(f.repo, 'source.txt'), 'next\n')
  await f.git(f.repo, ['add', '.'])
  await f.git(f.repo, ['commit', '-m', 'next'])
  const b = await prepareWorkspace(f.node, second, f.git)
  assert.notEqual(a.baseCommit, b.baseCommit)
  assert.notEqual(a.cwd, b.cwd)
  assert.equal(await readFile(join(a.cwd, 'source.txt'), 'utf8'), 'base\n')
  assert.equal(await readFile(join(b.cwd, 'source.txt'), 'utf8'), 'next\n')
  assert.deepEqual(await inspectWorkspace(f.node, first, f.git), a)
  assert.match(await f.git(f.repo, ['worktree', 'list', '--porcelain']), new RegExp(first.id))
  await assert.rejects(prepareWorkspace(f.node, first, f.git), /EEXIST/u)
})

test('does not overwrite branch collisions, invalid refs, or inside-repository roots', async t => {
  const f = await fixture(t)
  const request = f.request()
  await f.git(f.repo, ['branch', `agent/${request.id}`])
  await assert.rejects(prepareWorkspace(f.node, request, f.git))
  assert.match(await f.git(f.repo, ['branch', '--list', `agent/${request.id}`]), new RegExp(request.id))
  await assert.rejects(prepareWorkspace(f.node, { ...f.request(), baseRef: '--help' }, f.git))
  await assert.rejects(prepareWorkspace({ ...f.node, workspaceRoot: f.repo }, f.request(), f.git), /outside/u)
  await assert.rejects(prepareWorkspace(f.node, { ...f.request(), id: '../escape' }, f.git), /task id/u)
  await assert.rejects(prepareWorkspace(f.node, { ...f.request(), repoAlias: 'missing' }, f.git), /alias/u)
  await assert.rejects(inspectWorkspace(f.node, f.request(), f.git), /ENOENT/u)
})

test('rejects tampered identities and changed branches before execution', async t => {
  const f = await fixture(t)
  const request = f.request()
  const record = await prepareWorkspace(f.node, request, f.git)
  const path = join(f.node.workspaceRoot, request.id, 'workspace.json')
  await writeFile(path, JSON.stringify({ ...record, cwd: f.repo }))
  await assert.rejects(inspectWorkspace(f.node, request, f.git), /does not match/u)
  await writeFile(path, JSON.stringify(record))
  await f.git(record.cwd, ['checkout', '-b', 'wrong-branch'])
  await assert.rejects(inspectWorkspace(f.node, request, f.git), /branch changed/u)
})

test('excludes an independent process until owned execution has settled', async t => {
  const f = await fixture(t)
  const request = f.request()
  await prepareWorkspace(f.node, request, f.git)
  const release = lockWorkspace(f.node, request)
  const script = `import { lockWorkspace } from ${JSON.stringify(moduleUrl)}; const [node, request] = JSON.parse(process.argv[1]); try { lockWorkspace(node, request)(); console.log('acquired') } catch (error) { if (error.code !== 'EEXIST') throw error; console.log('blocked') }`
  const child = () => exec(process.execPath, ['--input-type=module', '-e', script, JSON.stringify([f.node, request])])
  assert.equal((await child()).stdout.trim(), 'blocked')
  release()
  assert.equal((await child()).stdout.trim(), 'acquired')
  const releaseAgain = lockWorkspace(f.node, request)
  await writeFile(join(f.node.workspaceRoot, request.id, 'execution.lock'), 'foreign owner')
  assert.throws(releaseAgain, /ownership changed/u)
})
