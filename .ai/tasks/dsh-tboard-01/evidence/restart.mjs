// G0 crash fixture. The SQLite ledger belongs to the fixture service, separate from Harness Session files.
import assert from 'node:assert/strict'
import { execFileSync, fork } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'
import { DeepSeekHarness } from '../../../../packages/sdk/client/lib/index.js'

const taskId = 'task-g0'
const taskRuns = ['run-first', 'run-after-review']
function openLedger(root) {
  return new DatabaseSync(join(root, 'workbench.sqlite'))
}

async function receiptsForRun(root, run) {
  // One Session per Run in this fixture. Only a unique matching durable user input can recover a receipt.
  const dir = join(root, run.runId, 'home', 'sessions')
  const inputs = []
  for (const path of await readdir(dir, { recursive: true })) {
    if (!path.endsWith('.jsonl.zstd')) continue
    const events = execFileSync('zstd', ['-dc', join(dir, path)], { encoding: 'utf8' }).trim().split('\n').map(line => JSON.parse(line))
    if (!events.some(e => e.type === 'session' && e.id === run.sessionId)) continue
    for (const event of events.filter(e => e.type === 'agent/inbox/spliced')) {
      for (const input of event.data.inserted ?? []) {
        if (input.source?.kind === 'user' && input.content.some(block => block.type === 'text' && block.text === run.input)) inputs.push(input.id)
      }
    }
  }
  return inputs
}

async function service(root, runId, endpoint, interrupt) {
  const db = openLedger(root)
  const run = db.prepare('SELECT * FROM run WHERE taskId = ? AND runId = ?').get(taskId, runId)
  const claimed = db.prepare("UPDATE run SET state = 'sending' WHERE runId = ? AND state = 'ready'").run(runId)
  if (claimed.changes === 0) {
    if (run.state === 'sending') {
      const receipts = await receiptsForRun(root, run)
      if (receipts.length === 1) db.prepare("UPDATE run SET state = 'input-confirmed', receipt = ? WHERE runId = ? AND state = 'sending'").run(receipts[0], runId)
    }
    db.close()
    return
  }
  const cwd = join(root, runId, 'work')
  await mkdir(cwd, { recursive: true })
  const harness = new DeepSeekHarness({ profile: 'sdk', cwd, processCwd: cwd, dshHome: join(root, runId, 'home'),
    provider: 'deepseek-official', model: 'deepseek-v4-pro', env: { PATH: process.env.PATH, HOME: root,
      DEEPSEEK_BASE_URL: endpoint, DEEPSEEK_API_KEY: 'local-fixture', DSH_TELEMETRY_DISABLED: '1' } })
  try {
    const result = await harness.run(run.input, { sessionId: run.sessionId })
    assert.equal(result.finalResponse, 'accepted')
    const input = result.events.find(e => e.type === 'agent/inbox/spliced').data.inserted[0]
    if (interrupt) {
      process.send({ observedReceipt: input.id })
      // Parent kills only this fixture service while its SDK child and business DB are still open.
      await once(process, 'message')
      throw Error('service should have been interrupted')
    }
    db.prepare("UPDATE run SET state = 'input-confirmed', receipt = ? WHERE runId = ?").run(input.id, runId)
  } finally {
    await harness.close()
    db.close()
  }
}

async function verify() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'tboard-restart-')))
  const requests = []
  const model = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const messages = JSON.stringify(JSON.parse(body).messages)
    requests.push(taskRuns.filter(id => messages.includes('input-' + id)))
    const frames = [
      { type: 'message_start', message: { id: 'test', model: 'deepseek-v4-pro', usage: { input_tokens: 1, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'accepted' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
      { type: 'message_stop' },
    ]
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.end(frames.map(e => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''))
  })
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve))
  const endpoint = 'http://127.0.0.1:' + model.address().port
  const db = openLedger(root)
  const workers = new Set()
  function launch(runId, interrupt = false) {
    const worker = fork(new URL(import.meta.url), ['service', root, runId, endpoint, interrupt ? 'interrupt' : 'normal'], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    workers.add(worker)
    worker.once('exit', () => workers.delete(worker))
    return worker
  }
  const signal = AbortSignal.timeout(45_000)
  async function complete(runId) {
    assert.deepEqual(await once(launch(runId), 'exit', { signal }), [0, null])
  }
  try {
    db.exec('CREATE TABLE run (runId TEXT PRIMARY KEY, taskId TEXT NOT NULL, sessionId TEXT UNIQUE NOT NULL, input TEXT NOT NULL, state TEXT NOT NULL, receipt TEXT)')
    const insert = db.prepare("INSERT INTO run VALUES (?, ?, ?, ?, 'ready', NULL)")
    insert.run(taskRuns[0], taskId, 'session-' + taskRuns[0], 'input-' + taskRuns[0])
    await complete(taskRuns[0])
    insert.run(taskRuns[1], taskId, 'session-' + taskRuns[1], 'input-' + taskRuns[1])
    const child = launch(taskRuns[1], true)
    const exited = once(child, 'exit', { signal })
    const [ack] = await once(child, 'message', { signal })
    child.kill('SIGKILL')
    assert.deepEqual(await exited, [null, 'SIGKILL'])
    const before = db.prepare('SELECT * FROM run WHERE runId = ?').get(taskRuns[1])
    assert.equal(before.state, 'sending')
    assert.equal(before.receipt, null)
    // The runtime quiesces on service stdin EOF; wait for the persisted input to become visible.
    let found = []
    while (!signal.aborted && found.length === 0) {
      found = await receiptsForRun(root, before)
      if (found.length === 0) await delay(100)
    }
    assert.deepEqual(found, [ack.observedReceipt])
    await complete(taskRuns[1])
    await complete(taskRuns[1])
    const rows = db.prepare('SELECT * FROM run WHERE taskId = ? ORDER BY rowid').all(taskId)
    assert.deepEqual(rows.map(r => r.runId), taskRuns)
    assert.ok(rows.every(r => r.receipt && r.state === 'input-confirmed'))
    assert.equal(rows[1].receipt, ack.observedReceipt)
    assert.deepEqual(requests, taskRuns.map(id => [id]))
    console.log(JSON.stringify({ taskId, runs: rows.map(({ runId, sessionId, state }) => ({ runId, sessionId, state })), serviceKilledBeforeReceiptCommit: true, receiptRecoveredFromSession: true, repeatedRecoveryIssuedPrompts: 0, observedModelCalls: requests.length }, null, 2))
  } finally {
    for (const worker of workers) worker.kill('SIGKILL')
    db.close()
    model.closeAllConnections()
    await new Promise(resolve => model.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
}

if (process.argv[2] === 'service') {
  await service(process.argv[3], process.argv[4], process.argv[5], process.argv[6] === 'interrupt')
} else {
  await verify()
}
