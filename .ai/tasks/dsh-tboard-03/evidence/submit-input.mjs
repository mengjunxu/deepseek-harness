/** Verify a real SDK prompt whose Taskboard receipt write fails after the SDK accepts it. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const requireFromController = createRequire(new URL('../../../../packages/api/taskboard-controller/package.json', import.meta.url))
const load = name => import(pathToFileURL(requireFromController.resolve(name)).href)
const { Context } = await load('@deepseek-ai/cordis')
const { default: Board, createTaskRuntime } = await load('@deepseek-ai/dsh-api-taskboard-controller')
const root = await realpath(await mkdtemp(join(tmpdir(), 'taskboard-input-')))
const directory = join(root, 'project')
const home = join(root, 'sdk')
const sessionId = randomUUID()
const contexts = new Set()
let sdk
const requests = []
const model = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  requests.push(body)
  const frames = [
    { type: 'message_start', message: { id: 'receipt-fixture', model: 'deepseek-v4-pro', usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'Accepted' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(frames.map(frame => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''))
})

async function openBoard() {
  const ctx = new Context()
  contexts.add(ctx)
  await ctx.plugin((await load('@deepseek-ai/dsh-storage')).default)
  await ctx.plugin(await load('@deepseek-ai/dsh-storage-sqlite'), { path: join(root, 'taskboard.sqlite') })
  await ctx.plugin(await load('@deepseek-ai/dsh-storage-domain'), { backend: 'sqlite' })
  await ctx.plugin((await load('@deepseek-ai/dsh-session')).default)
  await ctx.plugin((await load('@deepseek-ai/dsh-subprocess-local')).default)
  await ctx.plugin(Board, { worktreeRoot: join(root, 'worktrees') })
  return { board: ctx.taskboardController, close: async () => { await ctx.fiber.dispose(); contexts.delete(ctx) } }
}

async function observedReceipt(events, ack) {
  const timeout = setTimeout(() => events.close(), 12_000)
  let receipt
  try {
    for await (const event of events) {
      if (event.method === 'session.event' && event.params.sessionId === sessionId
        && event.params.event.type === 'agent/inbox/spliced') {
        receipt ??= event.params.event.data.inserted?.find(input => input.id === ack)?.id
      }
      if (receipt && event.method === 'session.status' && event.params.sessionId === sessionId && event.params.status === 'idle') return receipt
    }
    throw Error('bound Session did not record the SDK receipt')
  } finally { clearTimeout(timeout) }
}

try {
  await mkdir(directory)
  await once(model.listen(0, '127.0.0.1'), 'listening')
  const first = await openBoard()
  const { board } = first
  const projectId = randomUUID(), taskId = randomUUID(), runId = randomUUID()
  const command = expectedVersion => ({ projectId, taskId, expectedVersion, commandId: randomUUID() })
  const description = 'Verify the taskboard input receipt against the bound Session.'
  await board.createProject({ project: { id: projectId, title: 'Input fixture', root: directory }, commandId: randomUUID(), expectedVersion: 0 })
  await board.createTask({ ...command(0), requirements: { title: 'Input receipt', description, acceptance: ['One input'], priority: 'normal', labels: [] } })
  await board.planTask(command(1))
  const plan = await board.planWorkspace(projectId, runId, await board.inspectProject(projectId))
  await board.executions.enqueue({ ...command(2), runId, runtimeId: randomUUID(), previousRun: null, mode: 'fresh',
    configurationRef: 'sdk', materials: [], feedback: [], workspace: { directory, branch: null, baseline: null },
    session: { sessionId, home, workspace: directory, provider: 'deepseek-official', compatibility: 'g0' } }, plan)
  const run = await board.executions.claimNext()
  assert.ok(run)
  const owner = { ...run.admission, generation: run.generation }
  const workspace = await board.prepareWorkspace(owner)
  sdk = createTaskRuntime({ cwd: workspace.directory, dshHome: home, provider: 'deepseek-official', model: 'deepseek-v4-pro',
    env: { PATH: process.env.PATH, DSH_TELEMETRY_DISABLED: '1', DEEPSEEK_API_KEY: 'local-fixture',
      DEEPSEEK_BASE_URL: `http://127.0.0.1:${model.address().port}` } })
  await sdk.start()
  const events = sdk.client.subscribeSessionTree(sessionId)
  let ack
  try {
    await assert.rejects(board.executions.submitInput(owner, async saved => {
      assert.equal(board.detail(projectId, taskId).runs[0].inputAttemptedAt, saved.inputAttemptedAt)
      ack = await sdk.client.prompt(saved.admission.session.sessionId, [{ type: 'text', text: saved.input.description }])
      await first.close()
      return ack
    }), /domain 'taskboard' is closed/)
    assert.ok(ack)
    const reopened = (await openBoard()).board
    const pending = reopened.detail(projectId, taskId).runs[0]
    assert.equal(pending.state, 'preparing')
    assert.equal(pending.receipt, null)
    assert.ok(pending.inputAttemptedAt)
    let replayCalls = 0
    const replay = async () => { replayCalls++; throw Error('replay tried to send input') }
    assert.equal(await reopened.executions.submitInput(owner, replay), null)
    const recovered = await observedReceipt(events, ack)
    assert.equal(recovered, ack)
    await reopened.executions.started(owner, recovered)
    assert.equal(await reopened.executions.submitInput(owner, replay), ack)
    assert.equal(reopened.detail(projectId, taskId).runs[0].receipt, ack)
    assert.equal(replayCalls, 0)
    assert.equal(requests.length, 1)
    assert.ok(requests[0].includes(description))
    console.log(JSON.stringify({ recordedBeforeSend: true, sdkAccepted: true, receiptWriteClosed: true,
      unconfirmedAfterReopen: true, recoveredFromSession: true, replayCalls, modelRequests: requests.length }, null, 2))
  } finally { events.close() }
} finally {
  try { await sdk?.close() } finally {
    try { await Promise.all([...contexts].map(ctx => ctx.fiber.dispose())) } finally {
      if (model.listening) { model.closeAllConnections(); await new Promise(resolve => model.close(resolve)) }
      await rm(root, { recursive: true, force: true })
    }
  }
}
