/** Real Loader workflow acceptance, with isolated storage and no model requests. */
import assert from 'node:assert/strict'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { execa } from 'execa'
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SessionId } from '@deepseek-ai/dsh-session'
import { MgsdWorkflow, parseNodeConfig } from '@deepseek-ai/dsh-experimental-mgsd-workflow'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-jobs-local'

const fixtures = fileURLToPath(new URL('../codely-local/', import.meta.url))
const root = await mkdtemp(join(tmpdir(), 'dsh-mgsd-loader-'))
const repository = join(root, 'primary')
const workspaces = join(root, 'workspaces')
const configPath = join(root, 'cordis.yml')
process.env.DSH_MGSD_NODE_CONFIG = join(root, 'node.json')
process.env.DSH_MGSD_DATABASE = join(root, 'tasks.sqlite')
process.env.DSH_CODELY_COMMAND = JSON.stringify([process.execPath, join(fixtures, 'executor.mjs')])
process.env.DSH_CODELY_CHECKS = JSON.stringify([[process.execPath, join(fixtures, 'check.mjs')]])
const gitBarrier = join(root, 'git-ready')
process.env.DSH_MGSD_GIT_COMMAND = JSON.stringify([process.execPath, fileURLToPath(new URL('./git.mjs', import.meta.url)), gitBarrier])
const overlay = fileURLToPath(new URL('../../../config/examples/mgsd-local/cordis.patch.yml', import.meta.url))
let ctx: Awaited<ReturnType<typeof boot>> | undefined
try {
  await mkdir(repository)
  await mkdir(workspaces)
  const git = async (...args: string[]) => (await execa('git', args, { cwd: repository })).stdout
  await git('init')
  await git('config', 'user.name', 'MGSD test')
  await git('config', 'user.email', 'mgsd@example.invalid')
  await writeFile(join(repository, 'primary.txt'), 'committed\n')
  await git('add', '.')
  await git('commit', '-m', 'fixture')
  await writeFile(join(repository, 'primary.txt'), 'dirty primary\n')
  await writeFile(join(repository, 'staged.txt'), 'staged\n')
  await git('add', 'staged.txt')
  const indexPath = join(repository, '.git', 'index')
  const primaryIndex = await readFile(indexPath)
  const primaryStatus = await git('--no-optional-locks', 'status', '--porcelain=v1')
  await copyFile(process.argv[2]!, configPath)
  await writeFile(process.env.DSH_MGSD_NODE_CONFIG, JSON.stringify({ nodeId: 'local', workspaceRoot: workspaces, repos: {
    project: { path: repository, defaultBaseRef: 'HEAD' }, broken: { path: repository, defaultBaseRef: 'refs/heads/missing' },
    cancel: { path: repository, defaultBaseRef: 'refs/heads/cancel-blocked' }, unload: { path: repository, defaultBaseRef: 'refs/heads/unload-blocked' },
  } }))
  ctx = await boot('mgsd-local-test', configPath, loadOverlayPatches('mgsd-local-test', overlay), undefined, import.meta.url)
  const app = ctx
  let modelCalls = 0
  ctx.on('llm/stream', (_options, next) => { modelCalls += 1; return next() })
  const { agent } = await ctx.agents.create({ sessionId: SessionId('mgsd-test'), meta: { cwd: repository } })
  const execute = async (input: string, expected: 'success' | 'error' = 'success') => {
    const result = (await app.commands.execute(agent, `/mgsd ${input}`, [], new AbortController().signal))?.result
    assert.equal(result?.kind, expected, result?.text)
    assert.equal(typeof result.text, 'string')
    assert.ok(result.text !== undefined)
    return result.text
  }
  const plan = { summary: 'Change source', allowedFiles: ['received.txt'], acceptanceCriteria: ['Configured check passes'], source: 'human' }
  const create = async (prompt: string, risk = 'standard') => {
    const text = await execute(`create ${JSON.stringify({ title: 'Task', prompt, repoAlias: 'project', risk, budget: { maxExecutionAttempts: 2, maxExpertCalls: 4, maxDurationMs: 60000 } })}`)
    const id = /TASK-[0-9a-f-]{36}/u.exec(text)?.[0]
    assert.ok(id)
    return id
  }
  const approve = async (id: string) => {
    await execute(`plan ${id} ${JSON.stringify(plan)}`)
    await execute(`approve ${id} 0`, 'error')
    await execute(`approve ${id} 1`)
  }
  const run = async (id: string) => {
    await execute(`run ${id}`)
    const job = app.jobs.list(agent.id).at(-1)!
    return app.jobs.wait(job.id, 20000, agent.id)
  }
  const blockedPreparation = async (phase: string) => {
    const command = execute(`create ${JSON.stringify({ title: `Blocked ${phase}`, prompt: 'must not execute', repoAlias: phase, risk: 'trivial', budget: { maxExecutionAttempts: 1, maxExpertCalls: 0, maxDurationMs: 60000 } })}`, 'error')
    const ready = AbortSignal.timeout(20000)
    while (!existsSync(`${gitBarrier}-${phase}`)) await delay(20, undefined, { signal: ready })
    const status = await execute('status')
    const preparing = status.split('\n').find(line => line.includes(': preparing;'))
    const id = preparing && /TASK-[0-9a-f-]{36}/u.exec(preparing)?.[0]
    assert.ok(id)
    return { id, command }
  }
  const cancelledPreparation = await blockedPreparation('cancel')
  assert.match(await execute(`cancel ${cancelledPreparation.id}`), /cancelled/u)
  await cancelledPreparation.command
  assert.equal(app.jobs.list(agent.id).length, 0)
  const id = await create('中文 "quotes"\nsecond line')
  await execute(`run ${id}`, 'error')
  await execute(`plan ${id} ${JSON.stringify({ ...plan, state: 'approved' })}`, 'error')
  await approve(id)
  assert.equal((await run(id)).status, 'completed')
  assert.match(await execute(`status ${id}`), /reviewing/u)
  assert.match(await execute(`output ${id}`), /Independent validation executed/u)
  assert.equal(await readFile(join(workspaces, id, 'worktree', 'received.txt'), 'utf8'), '中文 "quotes"\nsecond line')
  await execute(`review ${id} ${JSON.stringify({ passed: false, source: 'human', findings: 'Missing case' })}`)
  await execute(`fix ${id}`)
  assert.equal((await run(id)).status, 'completed')
  assert.match(await execute(`review ${id} ${JSON.stringify({ passed: false, source: 'human', findings: 'Still missing' })}`), /needs_human/u)
  await execute(`fix ${id}`, 'error')
  const trivial = await create('Simple', 'trivial')
  await approve(trivial)
  assert.equal((await run(trivial)).status, 'completed')
  assert.match(await execute(`status ${trivial}`), /completed/u)
  assert.equal(await readFile(join(workspaces, trivial, 'worktree', 'received.txt'), 'utf8'), 'Simple')
  assert.notEqual(id, trivial)
  const preparationFailure = await execute(`create ${JSON.stringify({ title: 'Bad ref', prompt: 'must not run', repoAlias: 'broken', risk: 'trivial', budget: { maxExecutionAttempts: 1, maxExpertCalls: 0, maxDurationMs: 60000 } })}`, 'error')
  const failedPreparationId = /TASK-[0-9a-f-]{36}/u.exec(preparationFailure)?.[0]
  assert.ok(failedPreparationId, preparationFailure)
  assert.match(await execute(`status ${failedPreparationId}`), /failed/u)
  await execute(`run ${failedPreparationId}`, 'error')
  assert.equal(app.jobs.list(agent.id).length, 3)
  const failed = await create('fail validation', 'trivial')
  await approve(failed)
  assert.equal((await run(failed)).status, 'failed')
  assert.match(await execute(`status ${failed}`), /failed/u)
  const hang = await create('hang')
  await approve(hang)
  await execute(`run ${hang}`)
  const pending = app.jobs.list(agent.id).at(-1)!
  const ready = AbortSignal.timeout(20000)
  while (!app.jobs.readAt(pending.id, 0, agent.id).chunks.some(chunk => chunk.text.includes('fixture ready'))) await delay(20, undefined, { signal: ready })
  assert.match(await execute(`replan ${hang} Scope expansion`), /needs_replan/u)
  assert.equal((await app.jobs.wait(pending.id, 20000, agent.id)).status, 'killed')
  await execute(`run ${hang}`, 'error')
  const foreign = await ctx.agents.create({ sessionId: SessionId('foreign'), meta: { cwd: repository } })
  assert.equal((await ctx.commands.execute(foreign.agent, `/mgsd status ${id}`, [], new AbortController().signal))?.result.kind, 'error')
  await execute(`plan ${hang} ${JSON.stringify(plan)}`)
  await execute(`approve ${hang} 2`)
  await execute(`run ${hang}`)
  const unloading = app.jobs.list(agent.id).at(-1)!
  const unloadReady = AbortSignal.timeout(20000)
  while (!app.jobs.readAt(unloading.id, 0, agent.id).chunks.some(chunk => chunk.text.includes('fixture ready'))) await delay(20, undefined, { signal: unloadReady })
  const preparingAtUnload = await blockedPreparation('unload')
  const entry = [...ctx.loader.entries()].find(row => row.options.id === 'mgsd-local')
  assert.ok(entry?.fiber)
  await entry.fiber.dispose()
  await preparingAtUnload.command
  assert.equal((await app.jobs.wait(unloading.id, 20000, agent.id)).status, 'killed')
  assert.equal(ctx.commands.find(agent, 'mgsd'), undefined)
  const node: unknown = JSON.parse(await readFile(process.env.DSH_MGSD_NODE_CONFIG, 'utf8'))
  const reopened = new MgsdWorkflow(process.env.DSH_MGSD_DATABASE, parseNodeConfig(node))
  try {
    assert.equal(reopened.list().find(task => task.request.id === hang)?.state, 'cancelled')
    assert.equal(reopened.list().find(task => task.request.id === preparingAtUnload.id)?.state, 'cancelled')
  }
  finally { reopened.close() }
  assert.equal(modelCalls, 0)
  assert.equal(await readFile(join(repository, 'primary.txt'), 'utf8'), 'dirty primary\n')
  assert.equal(await readFile(join(repository, 'staged.txt'), 'utf8'), 'staged\n')
  assert.deepEqual(await readFile(indexPath), primaryIndex)
  assert.equal(await git('--no-optional-locks', 'status', '--porcelain=v1'), primaryStatus)
  process.stdout.write('MGSD_LOCAL_SMOKE_OK\n')
} finally {
  await ctx?.fiber.dispose()
  await rm(root, { recursive: true, force: true })
}
