/** Exercise the built controller with two independent, initialized SDK processes, optionally with a single fixed test tool. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { createTaskRuntime } from '../../../../packages/api/taskboard-controller/lib/index.js'

const resolve = createRequire(new URL('../../../../packages/api/taskboard-controller/package.json', import.meta.url))
const load = name => import(pathToFileURL(resolve.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { default: Board } = await load('@deepseek-ai/dsh-api-taskboard-controller')
const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-stop-evidence-')))
const controlled = process.argv.includes('--controlled-tool')
let requests = 0
const model = createServer(async (req, res) => {
  for await (const _ of req) { /* Consume the local test prompt. */ }
  requests++
  const frames = [
    { type: 'message_start', message: { id: 'probe', model: 'deepseek-v4-pro', usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'sleep', name: 'bash', input: {} } },
    { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({
      command: 'echo $$ > child.pid; exec /bin/sleep 40', description: 'Wait for this test Run to stop',
    }) } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(frames.map(event => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n').join(''))
})
if (controlled) await new Promise(resolve => model.listen(0, '127.0.0.1', resolve))
function alive(pid) {
  try { process.kill(pid, 0); return true } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}
async function fixtureChild() {
  const deadline = Date.now() + 12_000
  while (Date.now() < deadline) {
    let value
    try { value = await readFile(join(root, 'child.pid'), 'utf8') } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const pid = Number(value)
    if (Number.isSafeInteger(pid) && pid > 0 && alive(pid)) return pid
    await delay(25)
  }
  throw Error('fixture tool failed to start')
}
const ctx = new Context()
const runtimes = ['target', 'peer'].map(label => createTaskRuntime({
  cwd: root, dshHome: join(root, label), provider: 'deepseek-official', model: 'deepseek-v4-pro',
  env: { HOME: root, PATH: process.env.PATH, DSH_TELEMETRY_DISABLED: '1', ...(controlled ? { DEEPSEEK_API_KEY: 'local-fixture',
    DEEPSEEK_BASE_URL: 'http://127.0.0.1:' + model.address().port } : {}) },
}))
try {
  await ctx.plugin((await load('@deepseek-ai/dsh-session')).default)
  await ctx.plugin((await load('@deepseek-ai/dsh-subprocess-local')).default)
  await ctx.plugin((await load('@deepseek-ai/dsh-storage')).default)
  await ctx.plugin(await load('@deepseek-ai/dsh-storage-sqlite'), { path: join(root, 'tasks.sqlite') })
  await ctx.plugin(await load('@deepseek-ai/dsh-storage-domain'), { backend: 'sqlite' })
  await ctx.plugin(Board, { worktreeRoot: join(root, 'worktrees') })
  const board = ctx.taskboardController
  const projectId = randomUUID(), taskId = randomUUID(), runId = randomUUID()
  const command = expectedVersion => ({ projectId, taskId, expectedVersion, commandId: randomUUID() })
  await board.createProject({ project: { id: projectId, title: 'Stop fixture', root }, commandId: randomUUID(), expectedVersion: 0 })
  await board.createTask({ ...command(0), requirements: { title: 'Stop target', description: 'Keep the peer', acceptance: ['peer lives'], priority: 'normal', labels: [] } })
  await board.planTask(command(1))
  const admitted = await board.executions.admit({ ...command(2), runId, previousRun: null, runtimeId: randomUUID(), mode: 'fresh',
    configurationRef: 'sdk', materials: [], feedback: [], workspace: { directory: root, branch: null, baseline: null },
    session: { sessionId: 'stop-fixture', home: join(root, 'target'), workspace: root, provider: 'deepseek-official', compatibility: 'G0' } })
  const owner = { ...admitted.admission, generation: admitted.generation }
  const [target, peer] = runtimes
  await Promise.all(runtimes.map(h => h.start()))
  if (controlled) {
    const messageId = await target.client.prompt('stop-fixture', [{ type: 'text', text: 'Start the fixture tool' }])
    await board.executions.started(owner, messageId)
    const pid = await fixtureChild()
    let canObserve = false
    await board.stops.attach(owner, target.client, async () => {
      if (!canObserve) return { state: 'unknown', source: 'fixture delayed scope observation' }
      return { state: alive(pid) ? 'occupied' : 'empty', source: 'fixed fixture: bash execs one sleep, no other tool calls' }
    })
    await board.stopRun({ ...command(4), runId, force: false })
    assert.equal(await target.client.waitForExit(1000), true)
    assert.equal(alive(pid), false)
    assert.equal((await board.executions.active(owner)).stopFailure, 'scope-unknown')
    canObserve = true
    await board.recheckRunStop(projectId, taskId, runId)
    assert.equal(await peer.client.waitForExit(20), false)
    assert.equal(requests, 1)
    await assert.rejects(board.executions.active(owner), /no longer owns/)
    const saved = board.detail(projectId, taskId).runs[0]
    assert.equal(saved.state, 'interrupted')
    assert.equal(saved.receipt, messageId)
    console.log(JSON.stringify({ fixedTool: '/bin/sleep', realSdkReceipt: true, localModelRequests: requests,
      targetRuntimeExited: true, fixtureChildExited: true, otherRuntimeAlive: true, releasedAfterRecheck: owner.generation }, null, 2))
  } else {
    await board.stops.attach(owner, target.client, async () => ({ state: 'unknown', source: 'no persistent OS scope available' }))
    const stop = { ...command(3), runId, force: false }
    await board.stopRun(stop)
    assert.equal(await target.client.waitForExit(1000), true)
    assert.equal(await peer.client.waitForExit(20), false)
    assert.equal((await board.executions.active(owner)).control, 'stop_requested')
    assert.equal(board.detail(projectId, taskId).runs[0].connection, 'suspect')
    await board.stopRun(stop)
    const force = { ...command(4), runId, force: true }
    await board.stopRun(force)
    await board.recheckRunStop(projectId, taskId, runId)
    assert.equal((await board.executions.active(owner)).stopFailure, 'scope-unknown')
    assert.equal((await board.executions.active(owner)).generation, admitted.generation)
    assert.equal(await peer.client.waitForExit(20), false)
    assert.deepEqual(board.detail(projectId, taskId).activity.slice(-2).map(r => r.action), ['stop-requested', 'force-requested'])
    console.log(JSON.stringify({ targetRuntimeExited: true, otherRuntimeAlive: true, fullScopeObserved: false,
      gracefulStopRetainedLease: true, explicitForceAndRecheckRetainedSameGeneration: true, replayAddedActions: 0, modelInputs: 0 }, null, 2))
  }
} finally {
  try { await Promise.all(runtimes.map(h => h.close())) } finally {
    if (controlled) { model.closeAllConnections(); await new Promise(resolve => model.close(resolve)) }
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
}
