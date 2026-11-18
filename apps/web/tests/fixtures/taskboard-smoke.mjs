/** Boot the shipped Web profile twice against a private test home, using its ordinary browser session. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdir, mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = await mkdtemp(join(tmpdir(), 'web-taskboard-'))
const projectRoot = join(root, 'project')
const cli = fileURLToPath(new URL('../../../cli/lib/bin.js', import.meta.url))
const picker = fileURLToPath(new URL('../pin-browse-picker.overlay.yml', import.meta.url))
async function boot() {
  const child = spawn(process.execPath, [cli, '--profile', 'web', '--patch', picker, '--no-open', '--port', '0'], {
    cwd: projectRoot, env: { HOME: root, PATH: process.env.PATH, DSH_HOME: join(root, 'home'), DSH_AGENTS_HOME: join(root, 'agents'), DSH_TELEMETRY_DISABLED: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const exited = once(child, 'exit')
  const ready = Promise.withResolvers()
  let logs = ''
  const collect = data => {
    logs += data.toString()
    const url = logs.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/[^\s]*[?&]token=[a-zA-Z0-9_-]+/)?.[0]
    if (url) ready.resolve(url)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  const stop = async () => {
    child.stdin.end()
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await exited
  }
  const diagnostic = () => logs.replace(/([?&]token=)[^\s]+/g, '$1[redacted]').slice(-1500)
  const timer = setTimeout(() => ready.reject(Error('startup timeout ' + diagnostic())), 30000)
  try {
    const url = await Promise.race([ready.promise, exited.then(() => { throw Error('early exit ' + diagnostic()) })])
    const response = await fetch(url, { redirect: 'manual' })
    const cookie = response.headers.get('set-cookie')?.split(';', 1)[0]
    assert.ok(cookie, 'missing browser session')
    async function rpc(method, args) {
      const endpoint = 'taskboard/' + method
      const r = await fetch(new URL('/api/' + endpoint, url), { method: 'POST', headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload: { args } }) })
      const frame = await r.json()
      if (!frame.result?.ok) throw Error(method + ': ' + JSON.stringify(frame.result?.error))
      return frame.result.value
    }
    return { rpc, stop }
  } catch (error) {
    await stop()
    throw error
  } finally { clearTimeout(timer) }
}

await mkdir(projectRoot)
let server
try {
  server = await boot()
  const projectId = randomUUID(), taskId = randomUUID()
  await server.rpc('createProject', { request: { commandId: randomUUID(), expectedVersion: 0, project: { id: projectId, title: 'SDK review', root: projectRoot } } })
  const inspected = await server.rpc('inspectProject', { projectId })
  assert.equal(inspected.directory, await realpath(projectRoot))
  assert.equal(inspected.repository, null)
  const request = { commandId: randomUUID(), projectId, taskId, expectedVersion: 0,
    requirements: { title: 'Verify history', description: 'Keep revisions', acceptance: ['Review earlier versions'], priority: 'normal', labels: [] } }
  const created = await server.rpc('createTask', { request })
  assert.equal(created.version, 1)
  await server.rpc('editTask', { request: { ...request, commandId: randomUUID(), expectedVersion: 1, requirements: { ...request.requirements, description: 'New requirements' } } })
  await server.rpc('comment', { request: { commandId: randomUUID(), projectId, taskId, expectedVersion: 2, text: 'Operator comment' } })
  const before = await server.rpc('detail', { projectId, taskId })
  await assert.rejects(server.rpc('recheckRunStop', { projectId, taskId, runId: randomUUID() }), /unknown stop target/)
  assert.equal(before.activity.length, 3)
  assert.equal(before.revisions.length, 2)
  await server.stop()
  server = undefined
  const size = (await stat(join(root, 'home', 'taskboard', 'tasks.sqlite'))).size
  assert.ok(size > 0)
  server = await boot()
  assert.deepEqual(await server.rpc('detail', { projectId, taskId }), before)
  assert.deepEqual(await server.rpc('createTask', { request }), created)
  assert.equal((await server.rpc('listTasks', { projectId, includeArchived: false })).length, 1)
  console.log(JSON.stringify({ webProfile: true, browserSession: true, sqliteFile: true, restoredVersion: before.task.version,
    revisions: before.revisions.length, activity: before.activity.length, originalReceiptReplayed: true }, null, 2))
} finally {
  if (server) await server.stop()
  await rm(root, { recursive: true, force: true })
}
