/** Boot the shipped Web profile twice against a private test home, using its ordinary browser session. */
import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'
import { constants as zstdOptions, zstdCompressSync, zstdDecompressSync } from 'node:zlib'

const prDelivery = process.argv.includes('--pr-delivery')
const addReceipt = process.argv.includes('--pr-receipt')
const prInput = prDelivery ? process.argv[process.argv.indexOf('--pr-delivery') + 1] : null
const evidenceParent = process.env.TBOARD_EVIDENCE_PARENT
if (prDelivery) assert.ok(prInput && isAbsolute(prInput) && evidenceParent && isAbsolute(evidenceParent), 'supply source checkout and evidence parent')
const root = addReceipt ? await realpath(process.argv[process.argv.indexOf('--pr-receipt') + 1])
  : await mkdtemp(join(prDelivery ? evidenceParent : tmpdir(), 'web-taskboard-'))
const projectRoot = join(root, 'project')
const installedCliIndex = process.argv.indexOf('--installed-cli')
const cli = installedCliIndex === -1 ? fileURLToPath(new URL('../../../cli/lib/bin.js', import.meta.url)) : process.argv[installedCliIndex + 1]
assert.ok(cli && isAbsolute(cli), 'expected an absolute dsh CLI path')
const upgradeIndex = process.argv.indexOf('--upgrade-from')
const previousCli = upgradeIndex === -1 ? undefined : process.argv[upgradeIndex + 1]
if (upgradeIndex !== -1) assert.ok(previousCli && isAbsolute(previousCli), 'expected an absolute previous dsh CLI path')
const pickerSource = fileURLToPath(new URL('../pin-browse-picker.overlay.yml', import.meta.url))
const picker = installedCliIndex !== -1 || previousCli ? join(root, 'pin-browse-picker.overlay.yml') : pickerSource
const database = join(root, 'home', 'taskboard', 'tasks.sqlite')

const executionPatch = join(root, 'execution.yml')
const lostReceipt = process.argv.includes('--lost-sdk-ack')
const dispatchSession = new URL(lostReceipt ? '../../../../snapshots/sdk/taskboard-milestone/session.v4.jsonl'
  : '../../../../snapshots/sdk/taskboard-dispatch/session.v4.jsonl', import.meta.url)
const dispatch = process.argv.includes('--dispatch') || lostReceipt
const dispatchRelease = Promise.withResolvers()
const parallelCrash = process.argv.includes('--parallel-crash')
const parallel = parallelCrash || process.argv.includes('--parallel')
const bothModels = Promise.withResolvers()
const denied = process.argv.includes('--permission-failure')
const resume = process.argv.includes('--resume')
const hostCrashLostReceipt = process.argv.includes('--host-crash-lost-receipt')
const hostCrashBeforeReceipt = process.argv.includes('--host-crash-before-receipt')
const hostCrash = process.argv.includes('--host-crash') || hostCrashLostReceipt
const crashTaskGoal = 'Keep a detached process after the Host crashes'
const forceTimeout = process.argv.includes('--force-stop-timeout')
const scriptScope = process.argv.includes('--script-scope')
const macosScope = process.argv.includes('--macos-scope') || hostCrash || forceTimeout || scriptScope
const interactionProbe = process.argv.includes('--interactions')
const disconnectProbe = process.argv.includes('--disconnect-sdk')
const nativeExecutor = process.argv.includes('--native-codex') ? 'codex' : process.argv.includes('--native-codely') ? 'codely' : undefined
const nativeFileAccess = process.argv.includes('--native-file-write') ? 'write' : process.argv.includes('--native-file-deny') ? 'deny' : undefined
if (nativeFileAccess && !nativeExecutor) throw new Error('native file evidence requires a selected executor')
const nativeFileWorkspace = nativeFileAccess ? Promise.withResolvers() : undefined
let native
const milestoneProbe = process.argv.includes('--milestone-plan')
const taskToolsProbe = process.argv.includes('--task-tools')
const backupProbe = process.argv.includes('--backup')
const deliveryProbe = process.argv.includes('--delivery') || backupProbe
const reviewedNotes = backupProbe ? 'reviewed work \n' : 'reviewed work\n'
const browserProbe = process.argv.includes('--browser')
const customManager = process.argv.includes('--custom-pnpm') ? 'pnpm' : process.argv.includes('--custom-npm') ? 'npm' : undefined
const customScript = customManager && { manager: customManager, name: 'verify:notes' }
const noModelReview = process.argv.includes('--no-model-review') || customManager === 'pnpm'
const reviewedRepair = process.argv.includes('--reviewed-repair')
const repairFeedback = 'Correct the notes and verify the project build before resubmitting.'
const coverageReviewProbe = process.argv.includes('--coverage-review') || reviewedRepair
const reviewRequests = []
let pendingReviewArchive
const browserRunProbe = process.argv.includes('--browser-run') || Boolean(customScript) || noModelReview || coverageReviewProbe
const perfProbe = process.argv.includes('--performance')
const failedRetryProbe = process.argv.includes('--failed-retry')
const deploymentProbe = process.argv.includes('--deployment-config')
const sdkPatchChange = process.argv.includes('--sdk-patch-change')
const openaiDeployment = process.argv.includes('--openai-deployment') || sdkPatchChange
const openaiRequests = []
const faultMarker = join(root, 'failed-receipt')
const scopeToolPath = join(projectRoot, 'taskboard-scope-tool.mjs')

async function boot(enableStart = false, home = join(root, 'home'), env = {}, binary = cli) {
  const patches = enableStart ? ['--patch', executionPatch] : []
  const child = spawn(process.execPath, [binary, '--profile', 'web', '--patch', picker, ...patches, '--no-open', '--port', '0'], {
    cwd: projectRoot, env: { HOME: root, PATH: process.env.PATH, DSH_HOME: home, DSH_AGENTS_HOME: join(root, 'agents'), DSH_TELEMETRY_DISABLED: '1',
      ...(coverageReviewProbe && { TASKBOARD_REVIEW_TEST_KEY: 'review-fixture-key' }), ...env,
    },
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
      if (!frame.result?.ok) {
        const error = frame.result?.error
        throw Error(method + ': ' + JSON.stringify(error) + (error?.code === 'gateway/service-unavailable' ? '\n' + diagnostic() : ''))
      }
      return frame.result.value
    }
    const crash = async () => {
      assert.ok(child.kill('SIGKILL'))
      assert.deepEqual(await exited, [null, 'SIGKILL'])
    }
    return { rpc, stop, crash, url, cookie }
  } catch (error) {
    await stop()
    throw error
  } finally { clearTimeout(timer) }
}

async function pollRun(rpc, projectId, taskId, predicate) {
  const deadline = AbortSignal.timeout(15_000)
  while (true) {
    const { runs } = await rpc('detail', { projectId, taskId })
    const run = runs.at(-1)
    if (run && predicate(run)) return run
    await delay(20, undefined, { signal: deadline })
  }
}

async function createStartRequest(rpc, projectId, confirmation, description, title = 'Dispatch fixture', constraints, riskLevel, workflow) {
  const taskId = randomUUID()
  const requirements = { title, description, ...(constraints && { constraints }), ...(riskLevel && { riskLevel }), ...(workflow && { workflow }), acceptance: ['Record a receipt'], priority: 'normal', labels: [] }
  await rpc('createTask', { request: { commandId: randomUUID(), projectId, taskId, expectedVersion: 0, requirements } })
  await rpc('planTask', { request: { commandId: randomUUID(), projectId, taskId, expectedVersion: 1 } })
  return { commandId: randomUUID(), projectId, taskId, expectedVersion: 2, confirmation, previousRun: null, materials: [] }
}

async function verifyActivityCursor(projectId, confirmation) {
  const first = await createStartRequest(server.rpc, projectId, confirmation, 'Read task activity')
  const { taskId } = first
  const page = (cursor, limit) => server.rpc('activityPage', { projectId, taskId, cursor, limit })
  const initial = await page(null, 1)
  assert.deepEqual(initial.activity.map(entry => entry.action), ['created'])
  assert.equal(initial.hasMore, true)
  const comment = { projectId, taskId, commandId: randomUUID(), expectedVersion: first.expectedVersion, text: 'Between pages' }
  const written = await server.rpc('comment', { request: comment })
  assert.deepEqual(await server.rpc('comment', { request: comment }), written)
  const second = await page(initial.cursor, 2)
  assert.deepEqual(second.activity.map(entry => entry.action), ['planned', 'commented'])
  assert.equal(second.hasMore, false)
  const scope = { projectId, taskId }
  const detail = await server.rpc('detail', scope)
  assert.deepEqual([...initial.activity, ...second.activity], detail.activity)
  assert.ok(second.activity.every(entry => !Object.hasOwn(entry, 'fingerprint')))
  const empty = { activity: [], cursor: second.cursor, hasMore: false }
  assert.deepEqual(await page(second.cursor, 2), empty)
  await server.stop()
  server = await boot(true)
  assert.deepEqual(await page(initial.cursor, 2), second)
  assert.deepEqual(await page(second.cursor, 2), empty)
  const queued = await server.rpc('startRun', { request: { ...first, expectedVersion: written.version } })
  const delta = await page(second.cursor, 1)
  assert.deepEqual(delta.activity.map(entry => [entry.commandId, entry.runId, entry.action]), [[first.commandId, queued.runId, 'run-requested']])
  assert.equal(delta.hasMore, false)
  assert.equal(await server.rpc('activityPage', { ...scope, projectId: randomUUID(), cursor: null, limit: 1 }), null)
  const other = await createStartRequest(server.rpc, projectId, confirmation, 'Another history')
  await assert.rejects(server.rpc('activityPage', { projectId, taskId: other.taskId, cursor: initial.cursor, limit: 1 }), /cursor does not match/)
  for (const cursor of [{ ...second.cursor, position: 1 }, { ...second.cursor, commandId: randomUUID() }]) {
    await assert.rejects(page(cursor, 1), /cursor does not match/)
  }
  for (const limit of [0, -1, 1.5]) await assert.rejects(page(null, limit))
  const archive = await server.rpc('exportBackup', {})
  await server.stop()
  server = await boot(true, join(root, 'restored-cursor-home'))
  const restored = await server.rpc('restoreBackup', { archive })
  assert.equal(restored.canceledQueuedRuns, 1)
  const change = await page(delta.cursor, 1)
  assert.deepEqual(change.activity.map(entry => [entry.runId, entry.action]), [[queued.runId, 'run-canceled']])
  assert.deepEqual(await page(change.cursor, 1), { activity: [], cursor: change.cursor, hasMore: false })
  return { actions: detail.activity.length + delta.activity.length, restartedAtSavedCursor: true, restoredAtSavedCursor: true, runLinked: true }
}

async function waitForPidFile(file, signal) {
  for (;;) {
    try {
      const pid = Number(await readFile(join(projectRoot, file), 'utf8'))
      if (Number.isSafeInteger(pid) && pid > 1) return pid
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await delay(20, undefined, { signal })
  }
}

async function waitForFaultMarker(signal) {
  for (;;) {
    try {
      return await readFile(faultMarker, 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await delay(20, undefined, { signal })
  }
}

function processAlive(pid) {
  try { process.kill(pid, 0); return true } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

async function findSdkAncestor(pid) {
  const ps = promisify(execFile)
  while (pid > 1) {
    const { stdout } = await ps('/bin/ps', ['-p', String(pid), '-o', 'ppid=,args='])
    if (/ --profile sdk(?: |$)/.test(stdout.trim())) return pid
    pid = Number(stdout.trim().split(/\s+/, 1)[0])
  }
  throw new Error('fixture tool has no SDK ancestor')
}

function parallelEvidence(projectId, runs) {
  if (!process.argv.includes('--evidence')) return {}
  return { projectId, runs: runs.map(run => ({
    runId: run.runId, sessionId: run.sessionId, workspace: run.workspace, state: run.state, control: run.control,
    connection: run.connection, inputAttemptedAt: run.inputAttemptedAt, receipt: run.receipt, endReason: run.endReason,
  })) }
}

async function verifyParallelCrash(projectId) {
  const tasks = []
  for (const description of ['G3 first interrupted input', 'G3 second interrupted input', 'G3 waiting input']) {
    const task = await createStartRequest(server.rpc, projectId, null, description)
    await server.rpc('startRun', { request: task })
    tasks.push({ ...task, description })
  }
  await Promise.race([bothModels.promise, delay(15_000, undefined, { ref: false }).then(() => { throw Error('two SDKs did not reach the model') })])
  for (const task of tasks.slice(0, 2)) await pollRun(server.rpc, projectId, task.taskId, run => run.state === 'running' && run.receipt)
  const queued = await pollRun(server.rpc, projectId, tasks[2].taskId, run => run.state === 'queued')
  assert.equal(queued.inputAttemptedAt, null)
  await server.crash()
  server = undefined
  dispatchRelease.resolve()
  server = await boot(true)
  const runs = await Promise.all(tasks.map(task => pollRun(server.rpc, projectId, task.taskId,
    run => ['interrupted', 'finished', 'failed'].includes(run.state))))
  for (const [index, task] of tasks.entries()) {
    assert.ok(runs[index].receipt)
    assert.equal(modelRequests.filter(body => body.includes(task.description)).length, 1)
  }
  assert.equal(new Set(runs.map(run => run.sessionId)).size, 3)
  assert.equal(runs[2].state, 'finished')
  assert.equal(JSON.parse(await server.rpc('exportBackup', {})).payload.runs.length, 3)
  return { recoveredActiveScopes: 2, resumedQueue: true, distinctInputs: 3, duplicateInputs: 0, ...parallelEvidence(projectId, runs) }
}

async function verifyParallel(projectId, confirmation) {
  const rpc = server.rpc
  const start = request => rpc('startRun', { request })
  const detail = taskId => rpc('detail', { projectId, taskId })
  const parent = await createStartRequest(rpc, projectId, confirmation, 'G3 prerequisite evidence')
  const dependent = await createStartRequest(rpc, projectId, null, 'G3 authorized dependent', 'Dependent card')
  const peer = await createStartRequest(rpc, projectId, null, 'G3 independent session', 'Independent card')
  for (const [action, request] of [
    ['startRun', { ...dependent, whenReady: true }],
    ['setRelations', { commandId: randomUUID(), projectId, taskId: dependent.taskId, expectedVersion: 2,
      relations: { parent: parent.taskId, blockers: [parent.taskId] } }],
  ]) {
    const method = 'taskboard/' + action
    const response = await fetch(new URL('/api/' + method, server.url), { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: { request } } }) })
    assert.ok([401, 403].includes(response.status))
    await response.body?.cancel()
  }
  const { authorizeDependentRun } = await import('./taskboard-browser.mjs')
  await authorizeDependentRun(server.url, server.cookie, parent.taskId)
  const saved = await detail(dependent.taskId)
  assert.deepEqual(saved.task.relations, { parent: parent.taskId, blockers: [parent.taskId] })
  assert.deepEqual(saved.runs.map(run => [run.state, run.whenReady, run.inputAttemptedAt]), [['queued', true, null]])
  assert.equal(saved.runs[0].authorization.scope, 'when-ready-once')
  assert.equal(saved.runs[0].authorization.routeSelection, 'operator-confirmed')
  const linked = { ...dependent, confirmedRoute: saved.runs[0].route, commandId: saved.runs[0].runId, expectedVersion: 3, whenReady: true, mode: 'fresh' }
  assert.equal((await start(linked)).runId, saved.runs[0].runId)
  const nested = join(projectRoot, 'component')
  const alias = join(root, 'component-alias')
  await mkdir(nested)
  await symlink(nested, alias, 'dir')
  const aliasedProject = randomUUID()
  const registered = await rpc('createProject', { request: { commandId: randomUUID(), expectedVersion: 0,
    project: { id: aliasedProject, title: 'Shared checkout', root: alias } } })
  const nestedConfirmation = await rpc('inspectProject', { projectId: aliasedProject })
  assert.equal(registered.root, await realpath(nested))
  assert.equal(nestedConfirmation.repository, confirmation.repository)
  const conflict = await createStartRequest(rpc, aliasedProject, nestedConfirmation, 'Wait for the original checkout')
  const conflictDetail = () => rpc('detail', { projectId: aliasedProject, taskId: conflict.taskId })
  const one = await start(parent)
  await pollRun(rpc, projectId, parent.taskId, run => run.state === 'running' && run.receipt)
  const conflictReceipt = await start(conflict)
  const two = await start(peer)
  await Promise.race([bothModels.promise, delay(15_000, undefined, { ref: false }).then(() => { throw Error('two SDKs did not reach the model') })])
  const [a, b] = await Promise.all([parent, peer].map(task => pollRun(rpc, projectId, task.taskId, run => run.state === 'running')))
  assert.notEqual(a.sessionId, b.sessionId)
  assert.notEqual(a.workspace, b.workspace)
  assert.equal(modelRequests.length, 2)
  assert.equal((await detail(dependent.taskId)).runs[0].inputAttemptedAt, null)
  await rpc('stopRun', { request: { commandId: randomUUID(), projectId, taskId: peer.taskId,
    expectedVersion: (await detail(peer.taskId)).task.version, runId: two.runId, force: false } })
  await pollRun(rpc, projectId, peer.taskId, run => run.state === 'interrupted')
  assert.equal((await detail(parent.taskId)).runs[0].state, 'running')
  const [waiting] = (await conflictDetail()).runs
  assert.equal(waiting.state, 'queued')
  assert.equal(waiting.inputAttemptedAt, null)
  assert.equal(waiting.receipt, null)
  dispatchRelease.resolve()
  await pollRun(rpc, projectId, parent.taskId, run => run.state === 'finished')
  const { task, deliveries: [delivery] } = await detail(parent.taskId)
  assert.equal(task.status, 'in_review')
  assert.equal(delivery.runId, one.runId)
  const admitted = await pollRun(rpc, aliasedProject, conflict.taskId, run => run.state === 'finished')
  assert.equal(admitted.runId, conflictReceipt.runId)
  assert.equal(admitted.workspace, registered.root)
  assert.ok(admitted.receipt)
  assert.equal(modelRequests.filter(body => body.includes('Wait for the original checkout')).length, 1)
  assert.equal((await detail(dependent.taskId)).runs[0].state, 'queued')
  await rpc('reviewDelivery', { request: { commandId: randomUUID(), projectId, taskId: task.id, expectedVersion: task.version,
    deliveryId: delivery.id, revision: delivery.revision, deliveryVersion: delivery.version, snapshot: delivery.snapshot,
    verdict: 'accept', feedback: '', waivers: [] } })
  const claimed = await pollRun(rpc, projectId, dependent.taskId, run => run.state === 'finished')
  assert.ok(claimed.receipt)
  assert.equal(claimed.runId, saved.runs[0].runId)
  assert.equal(new Set([claimed.sessionId, a.sessionId, b.sessionId]).size, 3)
  const stoppedPeer = (await detail(peer.taskId)).runs[0]
  assert.equal(stoppedPeer.runId, two.runId)
  const backup = JSON.parse(await rpc('exportBackup', {}))
  assert.equal(backup.payload.runs.length, 4)
  await server.stop()
  server = await boot(true)
  const reopened = await server.rpc('detail', { projectId, taskId: dependent.taskId })
  assert.deepEqual(reopened.runs, [claimed])
  assert.deepEqual(reopened.task.relations, saved.task.relations)
  assert.equal(modelRequests.filter(body => body.includes('G3 authorized dependent')).length, 1)
  return { overlappingSdkRuns: 2, distinctSessions: new Set([claimed, a, b, admitted].map(run => run.sessionId)).size,
    aliasedWorkspaceWaited: true, authorizedClaims: 1, isolatedStop: true, anonymousWritesDenied: true, waitedForHumanAcceptance: true, restartPreservedHistory: true,
    ...parallelEvidence(projectId, [(await server.rpc('detail', { projectId, taskId: parent.taskId })).runs[0], stoppedPeer, claimed]),
    ...(process.argv.includes('--evidence') && { sharedCheckout: parallelEvidence(aliasedProject, [admitted]) }) }
}

function parallelTool(body) {
  if (!body.includes('G3 prerequisite evidence')) return
  const blocks = JSON.parse(body).messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
  if (blocks.some(block => block.name === 'taskboard_submit_delivery')) return
  const read = blocks.find(block => block.name === 'taskboard_read')
  if (!read) return { name: 'taskboard_read', input: {} }
  const { version, acceptance } = taskToolResult(body, read.id.slice('taskboard-'.length))
  return { name: 'taskboard_submit_delivery', input: { expected_version: version, summary: 'Prerequisite verified',
    files: [], changes: [], unfinished: [], knownIssues: [], verification: [{ criterion: acceptance[0], status: 'passed', evidence: 'Receipt observed' }] } }
}

async function verifyMacosScope(rpc, projectId, confirmation) {
  const first = await createStartRequest(rpc, projectId, confirmation, 'Keep the detached fixture member running')
  const next = await createStartRequest(rpc, projectId, confirmation, 'Start after the process scope is empty')
  if (scriptScope) { first.confirmedScript = 'test'; next.confirmedScript = 'test' }
  const deadline = AbortSignal.timeout(15_000)
  const firstRun = await rpc('startRun', { request: first })
  const nextRun = await rpc('startRun', { request: next })
  const member = await waitForPidFile('scope-member.pid', deadline)
  const sdk = await findSdkAncestor(await waitForPidFile('scope-tool.pid', deadline))
  await pollRun(rpc, projectId, first.taskId, run => run.receipt !== null)
  const { task } = await rpc('detail', { projectId, taskId: first.taskId })
  assert.ok(processAlive(sdk))
  assert.ok(processAlive(member))
  const stopping = rpc('stopRun', { request: {
    commandId: randomUUID(), projectId, taskId: first.taskId, runId: firstRun.runId, expectedVersion: task.version, force: false,
  } })
  let retainedAfterForce = false
  try {
    while (processAlive(sdk)) await delay(20, undefined, { signal: deadline })
    assert.ok(processAlive(member), 'the independently detached tool process must survive SDK root exit')
    const { runs: [blocked] } = await rpc('detail', { projectId, taskId: next.taskId })
    assert.equal(blocked.state, 'queued')
    assert.equal(blocked.inputAttemptedAt, null)
    const { runs: [held] } = await rpc('detail', { projectId, taskId: first.taskId })
    assert.equal(held.control, 'stop_requested')
    if (forceTimeout) {
      await stopping
      const pending = await rpc('detail', { projectId, taskId: first.taskId })
      assert.equal(pending.runs[0].stopFailure, 'deadline')
      await rpc('stopRun', { request: {
        commandId: randomUUID(), projectId, taskId: first.taskId, runId: firstRun.runId, expectedVersion: pending.task.version, force: true,
      } })
      const forced = await rpc('detail', { projectId, taskId: first.taskId })
      assert.equal(forced.runs[0].stopFailure, 'deadline')
      assert.equal(forced.runs[0].state, 'running')
      assert.ok(processAlive(member))
      const { runs: [stillQueued] } = await rpc('detail', { projectId, taskId: next.taskId })
      assert.equal(stillQueued.inputAttemptedAt, null)
      assert.equal(stillQueued.state, 'queued')
      const source = await readFile(scopeToolPath, 'utf8')
      assert.match(source, /Keep one tool descendant alive/)
      retainedAfterForce = true
    }
  } finally {
    await writeFile(join(projectRoot, 'scope-release'), '')
    await stopping
  }
  if (forceTimeout) {
    while (processAlive(member)) await delay(20, undefined, { signal: deadline })
    await rpc('recheckRunStop', { projectId, taskId: first.taskId, runId: firstRun.runId })
  }
  assert.equal(processAlive(member), false)
  const { runs: [stopped], deliveries } = await rpc('detail', { projectId, taskId: first.taskId })
  assert.deepEqual(deliveries, [])
  assert.equal(stopped.state, 'interrupted')
  assert.equal(stopped.stopFailure, null)
  const nextStarted = await pollRun(rpc, projectId, next.taskId, run => run.runId === nextRun.runId && run.receipt !== null)
  assert.ok(nextStarted.receipt)
  await pollRun(rpc, projectId, next.taskId, run => run.state === 'finished')
  return { sdkExitedFirst: true, detachedMemberHeldLease: true, ranNextAfterScopeExit: true,
    ...forceTimeout && { retainedAfterForce, workspacePreserved: true } }
}

async function verifyHostCrash(projectId, confirmation) {
  const { rpc } = server
  const first = await createStartRequest(rpc, projectId, confirmation, crashTaskGoal)
  const next = await createStartRequest(rpc, projectId, confirmation, 'Start once the old scope is empty')
  const admitted = await rpc('startRun', { request: first })
  const queued = await rpc('startRun', { request: next })
  const deadline = AbortSignal.timeout(25_000)
  const member = await waitForPidFile('scope-member.pid', deadline)
  const writer = await waitForPidFile('scope-tool.pid', deadline)
  const sdk = await findSdkAncestor(writer)
  const writes = () => readFile(join(projectRoot, 'scope-writes.log'), 'utf8')
  assert.equal(await writes(), writer + '\n')
  const receipt = hostCrashLostReceipt ? await waitForFaultMarker(deadline)
    : (await pollRun(rpc, projectId, first.taskId, run => run.receipt !== null)).receipt
  if (hostCrashLostReceipt) {
    const { runs: [preparing] } = await rpc('detail', { projectId, taskId: first.taskId })
    assert.ok(preparing.inputAttemptedAt)
    assert.equal(preparing.receipt, null)
  }
  await server.crash()
  server = await boot(true)
  try {
    while (processAlive(sdk)) await delay(20, undefined, { signal: deadline })
    await pollRun(server.rpc, projectId, first.taskId, run => run.connection === 'suspect')
    assert.ok(processAlive(member), 'detached process must still be alive after the Web Host and SDK exit')
    const replays = await Promise.all([first, next, next].map(request => server.rpc('startRun', { request })))
    assert.deepEqual(replays, [admitted, queued, queued])
    await assert.rejects(server.rpc('startRun', { request: { ...next, confirmation: null } }), /command identity reused with different input/)
    await assert.rejects(server.rpc('startRun', { request: { ...next, commandId: randomUUID() } }), /task version conflict/)
    const { runs: [waiting] } = await server.rpc('detail', { projectId, taskId: next.taskId })
    assert.equal(waiting.state, 'queued')
    assert.equal(waiting.inputAttemptedAt, null)
    assert.equal(modelRequests.length, 1)
  } finally {
    await writeFile(join(projectRoot, 'scope-release'), '')
  }
  const stopped = await pollRun(server.rpc, projectId, first.taskId, run => run.state === 'interrupted')
  assert.equal(stopped.receipt, receipt)
  assert.equal(processAlive(member), false)
  const started = await pollRun(server.rpc, projectId, next.taskId, run => run.runId === queued.runId && run.state === 'finished')
  assert.ok(started.receipt)
  for (const [request, admission] of [[first, admitted], [next, queued]]) {
    assert.deepEqual(await server.rpc('startRun', { request }), admission)
    const detail = await server.rpc('detail', { projectId, taskId: request.taskId })
    assert.deepEqual(detail.runs.map(run => run.runId), [admission.runId])
    assert.deepEqual(detail.activity.filter(entry => entry.action === 'run-requested').map(entry => entry.commandId), [request.commandId])
  }
  assert.equal(modelRequests.length, 2)
  assert.equal(await writes(), writer + '\n')
  return { hostCrashed: true, detachedMemberHeldLease: true, oldInputReplayed: false, ranNextAfterScopeExit: true,
    recoveredMissingReceipt: hostCrashLostReceipt, fileAppends: 1 }
}

async function verifyHostCrashBeforeReceipt(projectId, confirmation) {
  const { rpc } = server
  const start = await createStartRequest(rpc, projectId, confirmation, 'Use the exact same prompt text')
  const { taskId } = start
  const first = await rpc('startRun', { request: start })
  const original = await pollRun(rpc, projectId, taskId, run => run.state === 'finished')
  assert.ok(original.receipt)
  const { task } = await rpc('detail', { projectId, taskId })
  const planned = await rpc('planTask', { request: { commandId: randomUUID(), projectId, taskId, expectedVersion: task.version } })
  const directory = await rpc('inspectPriorWorkspace', { projectId, taskId, priorRun: first.runId })
  await writeFile(join(root, 'withhold-prompt'), '')
  const attempt = { ...start, commandId: randomUUID(), expectedVersion: planned.version, previousRun: first.runId, mode: 'resume', confirmation: directory }
  const second = await rpc('startRun', { request: attempt })
  assert.equal(await waitForFaultMarker(AbortSignal.timeout(15_000)), 'prompt withheld')
  const pending = await pollRun(rpc, projectId, taskId, run => run.runId === second.runId && run.inputAttemptedAt)
  assert.equal(pending.receipt, null)
  assert.equal(pending.sessionId, original.sessionId)
  await server.crash()
  server = await boot(true)
  const recovered = await pollRun(server.rpc, projectId, taskId, run => run.runId === second.runId && run.state === 'interrupted')
  assert.equal(recovered.receipt, null)
  assert.ok(recovered.inputAttemptedAt)
  assert.deepEqual(await server.rpc('startRun', { request: attempt }), second)
  assert.equal(modelRequests.length, 1)
  return { rejectedIdenticalOldInput: true, interruptedWithoutReceipt: true, originallyAcceptedInputs: 1 }
}

async function verifyInteractions(rpc, projectId, confirmation) {
  const start = await createStartRequest(rpc, projectId, confirmation, 'Ask a question and wait for file approvals')
  const { taskId } = start
  const { runId } = await rpc('startRun', { request: start })
  const target = { projectId, taskId, runId }
  const deadline = AbortSignal.timeout(15_000)
  const pending = () => rpc('pendingRunInteractions', target)
  const answer = reply => rpc('answerRunInteraction', { request: { ...target, ...reply } })
  const waitForRequest = async (kind, previousId) => {
    for (;;) {
      const request = (await pending()).find(item => item.kind === kind && item.requestId !== previousId)
      if (request) return request
      await delay(20, undefined, { signal: deadline })
    }
  }
  const question = await waitForRequest('question')
  assert.equal(question.questions[0].id, 'color')
  const choice = selected => ({ kind: 'question', requestId: question.requestId, result: { answers: [{ id: 'color', selected: [selected] }] } })
  await assert.rejects(answer(choice('Purple')), /answer must match each offered question/)
  await assert.rejects(answer({ kind: 'approval', requestId: question.requestId, outcome: 'allowed-once' }), /no longer pending/)
  await assert.rejects(answer({ ...choice('Blue'), taskId: randomUUID() }), /unknown interaction target/)
  await answer(choice('Blue'))
  const approval = await waitForRequest('approval')
  assert.equal(approval.toolName, 'write')
  assert.match(modelRequests[1], /Blue/)
  const allow = requestId => ({ kind: 'approval', requestId, outcome: 'allowed-once' })
  await answer(allow(approval.requestId))
  await assert.rejects(answer(allow(approval.requestId)), /no longer pending/)
  const rejected = await waitForRequest('approval', approval.requestId)
  assert.equal(await readFile(join(projectRoot, 'approval-allowed.txt'), 'utf8'), 'one scoped write')
  await answer({ kind: 'approval', requestId: rejected.requestId, outcome: 'rejected' })
  const cancelled = await waitForRequest('approval', rejected.requestId)
  const { task } = await rpc('detail', { projectId, taskId })
  await rpc('stopRun', { request: { ...target, commandId: randomUUID(), expectedVersion: task.version, force: false } })
  await assert.rejects(answer(allow(cancelled.requestId)), /no longer pending/)
  assert.deepEqual(await pending(), [])
  await assert.rejects(stat(join(projectRoot, 'approval-rejected.txt')), { code: 'ENOENT' })
  await assert.rejects(stat(join(projectRoot, 'approval-cancelled.txt')), { code: 'ENOENT' })
  assert.equal(modelRequests.length, 4)
  const stopped = await pollRun(rpc, projectId, taskId, run => run.interactions.some(item => item.requestId === cancelled.requestId && item.state === 'withdrawn'))
  assert.deepEqual(stopped.interactions.map(item => [item.kind, item.state]), [
    ['question', 'answered'], ['approval', 'answered'], ['approval', 'answered'], ['approval', 'withdrawn'],
  ])
  return { questionAnswered: true, oneWriteAllowed: true, secondWriteRejected: true, cancelledRequestFenced: true }
}

async function verifyDisconnect(rpc, projectId, confirmation) {
  const first = await createStartRequest(rpc, projectId, confirmation, 'Reconcile the committed Session after SDK disconnect')
  const next = await createStartRequest(rpc, projectId, confirmation, 'Wait for independent evidence of runtime exit')
  const firstRun = await rpc('startRun', { request: first })
  const nextRun = await rpc('startRun', { request: next })
  const recovered = await pollRun(rpc, projectId, first.taskId, run => run.connection === 'suspect' && run.lastEvent?.type === 'turn/end')
  assert.equal(recovered.state, 'running')
  assert.equal(recovered.control, 'normal')
  assert.ok(recovered.receipt)
  const { task: queuedTask, runs: [queued] } = await rpc('detail', { projectId, taskId: next.taskId })
  assert.equal(queued.state, 'queued')
  assert.equal(queued.inputAttemptedAt, null)
  assert.equal(modelRequests.length, 1)
  await rpc('cancelQueuedRun', { request: {
    commandId: randomUUID(), projectId, taskId: next.taskId, runId: nextRun.runId, expectedVersion: queuedTask.version,
  } })
  const { task } = await rpc('detail', { projectId, taskId: first.taskId })
  await rpc('stopRun', { request: {
    commandId: randomUUID(), projectId, taskId: first.taskId, runId: firstRun.runId, expectedVersion: task.version, force: false,
  } })
  await rpc('recheckRunStop', { projectId, taskId: first.taskId, runId: firstRun.runId })
  const { runs: [stopped] } = await rpc('detail', { projectId, taskId: first.taskId })
  assert.equal(stopped.state, process.platform === 'darwin' ? 'interrupted' : 'running')
  assert.equal(stopped.lastEvent?.seq, recovered.lastEvent.seq)
  return { committedEndingRecovered: true, disconnectHeldLease: true, inputSentOnce: true }
}

async function verifyTaskTools(rpc, projectId, confirmation) {
  const start = await createStartRequest(rpc, projectId, confirmation, 'Read and post progress to the current task', 'Dispatch fixture', 'Only inspect source files', 'medium')
  const other = await createStartRequest(rpc, projectId, confirmation, 'Leave a different task untouched')
  const { taskId } = start
  const { runId } = await rpc('startRun', { request: start })
  await pollRun(rpc, projectId, taskId, run => run.state === 'finished' || run.stopFailure !== null)
  const view = await rpc('detail', { projectId, taskId })
  const posts = view.activity.filter(item => item.action === 'run-progress')
  assert.equal(posts.length, 1)
  assert.equal(posts[0].comment, 'Source inspection finished')
  assert.equal(posts[0].runId, runId)
  assert.equal(posts[0].actor, 'runtime')
  const untouched = await rpc('detail', { projectId, taskId: other.taskId })
  assert.equal(untouched.activity.length, 2)
  assert.equal(untouched.task.status, 'todo')
  assert.equal(view.task.status, process.platform === 'darwin' ? 'blocked' : 'in_progress')
  const tools = JSON.parse(modelRequests[0]).tools.map(tool => tool.name)
  assert.deepEqual(tools.filter(name => name.startsWith('taskboard_')).sort(), ['taskboard_read', 'taskboard_submit_delivery', 'taskboard_update'])
  assert.match(modelRequests[2], /[Uu]nrecognized key/)
  assert.match(modelRequests[3], /task version conflict/)
  return { scopedRead: true, scopedProgress: true, extraScopeRejected: true, staleVersionRejected: true }
}

async function verifyDelivery(rpc, projectId, confirmation) {
  const start = await createStartRequest(rpc, projectId, confirmation, 'Submit evidence after updating notes.txt')
  const nextProjectId = randomUUID()
  const nextDirectory = join(root, 'next-project')
  await mkdir(nextDirectory)
  await rpc('createProject', { request: {
    commandId: randomUUID(), expectedVersion: 0, project: { id: nextProjectId, title: 'Queued after delivery', root: nextDirectory },
  } })
  const nextConfirmation = await rpc('inspectProject', { projectId: nextProjectId })
  const next = await createStartRequest(rpc, nextProjectId, nextConfirmation, 'Receive input after the delivery releases its lease')
  const { taskId } = start
  const { runId } = await rpc('startRun', { request: start })
  const nextRun = await rpc('startRun', { request: next })
  const sealed = await pollRun(rpc, projectId, taskId, run => run.state === 'finished')
  assert.equal(sealed.endReason, 'delivery sealed after runtime exit')
  assert.equal(sealed.connection, 'disconnected')
  const { task, deliveries, reviews, activity } = await rpc('detail', { projectId, taskId })
  assert.equal(task.status, 'in_review')
  assert.deepEqual(reviews, [])
  assert.equal(deliveries.length, 1)
  assert.equal(deliveries[0].runId, runId)
  assert.match(deliveries[0].snapshot, /^[a-f0-9]{64}$/)
  assert.equal(activity.filter(item => item.action === 'delivery-submitted').length, 1)
  assert.equal(await readFile(join(projectRoot, 'notes.txt'), 'utf8'), reviewedNotes)
  assert.match(modelRequests[4], /Too small: expected array/)
  const firstDelivery = deliveries[0]
  const identify = { projectId, taskId, deliveryId: firstDelivery.id }
  const readDelivery = () => rpc('deliveryDetail', identify)
  const readDiff = () => rpc('deliveryDiff', { ...identify, path: 'notes.txt' })
  const [evidence, diff] = await Promise.all([readDelivery(), readDiff()])
  assert.equal(evidence.code.gitDiffCheck, backupProbe ? 'failed' : 'passed')
  const [result] = evidence.validationResults
  assert.ok(Number.isFinite(Date.parse(result.observedAt)))
  assert.deepEqual(result, { check: 'git-diff-check', snapshot: firstDelivery.snapshot, status: backupProbe ? 'failed' : 'passed',
    exitCode: backupProbe ? 2 : 0, observedAt: evidence.code.gitDiffObservation.observedAt, reason: null })
  assert.equal(evidence.code.fingerprint, firstDelivery.snapshot)
  assert.equal(evidence.code.baseline, confirmation.head)
  assert.deepEqual(evidence.code.files, [{ path: 'notes.txt', status: 'modified' }])
  assert.deepEqual(evidence.verification, [{ criterion: 'Record a receipt', status: 'not-run', evidence: 'Fixture has no automated check' }])
  const reviewPackage = await rpc('exportReviewPackage', identify)
  assert.deepEqual(JSON.parse(reviewPackage), {
    format: 'dsh-taskboard-review', version: 1, deliveryId: firstDelivery.id, deliveryVersion: 1, revision: 1,
    snapshot: firstDelivery.snapshot, riskLevel: null, criteria: { passed: 0, failed: 0, 'not-run': 1, 'not-applicable': 0 },
    code: { scope: 'git', files: { added: 0, modified: 1, deleted: 0, untracked: 0, declared: 0 } },
    projectChecks: [{ check: 'git-diff-check', status: result.status, exitCode: result.exitCode, reason: null }],
    reportedIssues: evidence.knownIssues.length, reportedUnfinished: evidence.unfinished.length,
  })
  await assert.rejects(rpc('exportReviewPackage', { ...identify, taskId: next.taskId }), /unknown delivery target/)
  await assert.rejects(rpc('exportReviewPackage', { ...identify, projectId: nextProjectId }), /unknown delivery target/)
  assert.equal(diff.kind, 'patch')
  assert.match(diff.text, /\+reviewed work/)
  await assert.rejects(rpc('deliveryDiff', { ...identify, path: '../secrets' }), /outside the delivery snapshot/)
  await assert.rejects(rpc('deliveryDetail', { ...identify, taskId: next.taskId }), /unknown delivery target/)
  const decide = request => rpc('reviewDelivery', { request })
  const decision = {
    ...identify, commandId: randomUUID(), expectedVersion: task.version, revision: firstDelivery.revision,
    deliveryVersion: firstDelivery.version, snapshot: firstDelivery.snapshot, verdict: 'accept', feedback: '', waivers: [],
  }
  const waivers = [{ criterion: evidence.verification[0].criterion, reason: 'Read the sealed diff manually' }]
  await assert.rejects(decide(decision), /requires a human waiver/)
  await writeFile(join(projectRoot, 'notes.txt'), 'unsaved change after delivery\n')
  await assert.rejects(decide({ ...decision, waivers }), /requirements or code have changed/)
  await assert.rejects(readDiff(), /delivery workspace has changed/)
  await writeFile(join(projectRoot, 'notes.txt'), reviewedNotes)
  const revision = await rpc('editTask', { request: {
    commandId: randomUUID(), projectId, taskId, expectedVersion: task.version,
    requirements: { title: task.title, description: '  Verify the updated notes for release\n', constraints: 'Keep the notes filename', riskLevel: 'low',
      workflow: { template: 'task.standard.v1', steps: ['Inspect the sealed change', 'Record verification'] }, acceptance: task.acceptance,
      priority: task.priority, labels: task.labels },
  } })
  assert.equal((await readDelivery()).stale, true)
  await assert.rejects(decide({ ...decision, expectedVersion: revision.version, waivers }), /requirements or code have changed/)
  const feedback = 'Document the final evidence after the requirements change'
  const returned = await decide({ ...decision, expectedVersion: revision.version, verdict: 'return', feedback })
  const nextFinished = await pollRun(rpc, nextProjectId, next.taskId, run => run.runId === nextRun.runId && run.state === 'finished')
  assert.ok(nextFinished.receipt)
  assert.equal(nextFinished.endReason, 'execution ended without a delivery')
  const retry = await rpc('startRun', { request: {
    ...start, commandId: randomUUID(), expectedVersion: returned.version, previousRun: runId, confirmation: await rpc('inspectProject', { projectId }),
  } })
  await pollRun(rpc, projectId, taskId, run => run.runId === retry.runId && run.state === 'finished')
  assert.match(modelRequests[7], new RegExp(feedback))
  assert.match(modelRequests[7], /Keep the notes filename/)
  assert.deepEqual(taskToolResult(modelRequests[8], 8).workflow, { template: 'task.standard.v1', steps: ['Inspect the sealed change', 'Record verification'] })
  assert.equal(taskToolResult(modelRequests[8], 8).riskLevel, 'low')
  assert.equal(taskToolResult(modelRequests[8], 8).constraints, 'Keep the notes filename')
  const revised = await rpc('detail', { projectId, taskId })
  const updatedDelivery = revised.deliveries.at(-1)
  assert.equal(await rpc('exportReviewPackage', identify), reviewPackage)
  const laterPackage = JSON.parse(await rpc('exportReviewPackage', { ...identify, deliveryId: updatedDelivery.id }))
  assert.equal(laterPackage.riskLevel, 'low')
  assert.equal(laterPackage.revision, updatedDelivery.revision)
  assert.equal(revised.deliveries.length, 2)
  assert.equal(updatedDelivery.version, 2)
  assert.equal(updatedDelivery.revision, 2)
  assert.equal(updatedDelivery.runId, retry.runId)
  const finalDecision = { ...decision, commandId: randomUUID(), deliveryId: updatedDelivery.id, deliveryVersion: updatedDelivery.version,
    revision: updatedDelivery.revision, snapshot: updatedDelivery.snapshot, expectedVersion: revised.task.version, waivers }
  if (backupProbe) {
    await assert.rejects(decide(finalDecision), /unsuccessful project check requires a reason/)
    finalDecision.feedback = 'Accepted the trailing space in the expected text fixture'
  }
  const accepted = await decide(finalDecision)
  await writeFile(join(projectRoot, 'notes.txt'), 'changed after review\n')
  assert.deepEqual(await decide(finalDecision), accepted)
  const done = await rpc('detail', { projectId, taskId })
  assert.equal(done.task.status, 'done')
  assert.deepEqual(done.reviews.map(review => [review.verdict, review.deliveryId]), [['return', firstDelivery.id], ['accept', updatedDelivery.id]])
  return { invalidEvidenceRejected: true, deliverySealed: true, humanReviewRequired: true, queuedRunReceivedInput: true,
    staleCodeAndRequirementsRejected: true, feedbackReachedRetry: true, acceptedWithWaiver: true }
}

async function verifyDispatch(rpc, projectId, confirmation, modelRequests) {
  const first = await createStartRequest(rpc, projectId, confirmation, 'Send one saved task snapshot', 'Dispatch fixture', 'Preserve the existing API', 'high',
    { template: lostReceipt ? 'task.milestone.v1' : 'task.standard.v1', steps: ['Inspect the existing API', 'Verify the receipt'] })
  const next = await createStartRequest(rpc, projectId, confirmation, 'Keep the second Run in the queue')
  const [started, replay] = await Promise.all([
    rpc('startRun', { request: first }), rpc('startRun', { request: first }),
  ])
  assert.deepEqual(replay, started)
  const queued = await rpc('startRun', { request: next })
  const run = await pollRun(rpc, projectId, first.taskId, candidate => candidate.receipt !== null || candidate.launchFailure !== null)
  assert.equal(run.state, 'running', JSON.stringify(run))
  assert.ok(run.inputAttemptedAt)
  assert.ok(run.receipt)
  assert.equal(run.receipt, await readFile(faultMarker, 'utf8'))
  const second = await pollRun(rpc, projectId, next.taskId, () => true)
  assert.equal(second.state, 'queued')
  assert.equal(second.inputAttemptedAt, null)
  await rpc('cancelQueuedRun', { request: { commandId: randomUUID(), projectId, taskId: next.taskId, expectedVersion: queued.version, runId: queued.runId } })
  dispatchRelease.resolve()
  const deadline = AbortSignal.timeout(15_000)
  while (modelRequests.length === 0) await delay(20, undefined, { signal: deadline })
  assert.equal(modelRequests.length, 1)
  const recorded = (await readFile(dispatchSession, 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  const expectedInput = recorded.find(event => event.type === 'user/message' && event.data.source.kind === 'user').data.content[0].text
  const input = await rpc('runInput', { projectId, taskId: first.taskId, runId: started.runId })
  assert.deepEqual(input, JSON.parse(expectedInput))
  await assert.rejects(rpc('runInput', { projectId, taskId: next.taskId, runId: started.runId }), /unknown Run input/)
  await assert.rejects(rpc('runInput', { projectId: randomUUID(), taskId: first.taskId, runId: started.runId }), /unknown Run input/)
  const canceledInput = await rpc('runInput', { projectId, taskId: next.taskId, runId: queued.runId })
  assert.equal(canceledInput.description, 'Keep the second Run in the queue')
  const messages = JSON.parse(modelRequests[0]).messages
  assert.ok(messages.some(message => message.role === 'user' && (message.content === expectedInput ||
    (Array.isArray(message.content) && message.content.some(block => block.type === 'text' && block.text === expectedInput)))))
  assert.doesNotMatch(modelRequests[0], /Keep the second Run in the queue/)
  const progressed = await pollRun(rpc, projectId, first.taskId, candidate => candidate.lastEvent?.type === 'turn/end')
  assert.ok(progressed.lastEvent.seq >= 0)
  assert.ok(progressed.lastEvent.time > 0)
  const stopped = await pollRun(rpc, projectId, first.taskId, candidate => candidate.state === 'finished' || candidate.stopFailure !== null)
  const stopRetainedLease = process.platform !== 'darwin'
  assert.equal(stopped.stopFailure, stopRetainedLease ? 'scope-unknown' : null)
  assert.equal(stopped.state, stopRetainedLease ? 'running' : 'finished')
  return {
    sdkReceipt: true, receiptRecoveredFrom: lostReceipt ? 'session' : 'replied', modelRequests: 1,
    queueCanceled: true, stopRetainedLease, committedEventObserved: true,
  }
}

async function verifyResume(rpc, projectId, confirmation, modelRequests) {
  const original = await createStartRequest(rpc, projectId, confirmation, 'Original continuation context')
  const { taskId } = original
  const settle = async (runId) => {
    await pollRun(rpc, projectId, taskId, run => run.runId === runId && run.state === 'finished')
    return rpc('detail', { projectId, taskId })
  }
  const waitForRequests = async (count) => {
    const deadline = AbortSignal.timeout(15_000)
    while (modelRequests.length < count) await delay(20, undefined, { signal: deadline })
  }
  const first = await rpc('startRun', { request: original })
  const started = await pollRun(rpc, projectId, taskId, run => run.receipt !== null)
  await waitForRequests(1)
  const stopped = await settle(first.runId)
  assert.equal(stopped.runs[0].state, 'finished')
  const expectedVersion = stopped.task.version
  const planned = await rpc('planTask', { request: { commandId: randomUUID(), projectId, taskId, expectedVersion } })
  const directory = await rpc('inspectPriorWorkspace', { projectId, taskId, priorRun: first.runId })
  assert.equal(modelRequests.length, 1)
  const request = { ...original, commandId: randomUUID(), expectedVersion: planned.version, previousRun: first.runId,
    mode: 'resume', confirmation: directory, materials: [{ reference: 'selected', text: 'New continuation material' }],
  }
  const next = await rpc('startRun', { request })
  assert.notEqual(next.runId, first.runId)
  const continued = await pollRun(rpc, projectId, taskId, run => run.runId === next.runId && run.receipt !== null)
  assert.notEqual(continued.receipt, started.receipt)
  assert.equal(continued.sessionId, started.sessionId)
  assert.equal(continued.previousRun, first.runId)
  assert.deepEqual(continued.materialReferences, ['selected'])
  await waitForRequests(2)
  assert.equal(modelRequests.length, 2)
  assert.match(modelRequests[1], /New continuation material/)
  const final = await settle(next.runId)
  assert.deepEqual(final.runs.map(run => run.state), ['finished', 'finished'])
  assert.deepEqual((await rpc('runInput', { projectId, taskId, runId: first.runId })).materials, [])
  assert.deepEqual((await rpc('runInput', { projectId, taskId, runId: next.runId })).materials, request.materials)

  const replanned = await rpc('planTask', { request: { commandId: randomUUID(), projectId, taskId, expectedVersion: final.task.version } })
  const fresh = await rpc('startRun', { request: { ...original, commandId: randomUUID(), expectedVersion: replanned.version, previousRun: next.runId,
    confirmation: null, materials: [{ reference: 'isolated', text: 'New isolated material' }],
  } })
  const isolated = await pollRun(rpc, projectId, taskId, run => run.runId === fresh.runId && run.receipt !== null)
  assert.notEqual(isolated.workspace, continued.workspace)
  assert.notEqual(isolated.sessionId, continued.sessionId)
  assert.deepEqual(isolated.materialReferences, ['isolated'])
  await waitForRequests(3)
  assert.match(modelRequests[2], /New isolated material/)
  assert.doesNotMatch(modelRequests[2], /New continuation material/)

  const closed = await settle(fresh.runId)
  const lastPlan = await rpc('planTask', { request: { commandId: randomUUID(), projectId, taskId, expectedVersion: closed.task.version } })
  const priorDirectory = await rpc('inspectPriorWorkspace', { projectId, taskId, priorRun: fresh.runId })
  await rename(join(root, 'sessions', isolated.sessionId), join(root, 'missing-session-fixture'))
  const missing = await rpc('startRun', { request: { ...request, commandId: randomUUID(), expectedVersion: lastPlan.version,
    previousRun: fresh.runId, confirmation: priorDirectory, materials: [],
  } })
  const refused = await pollRun(rpc, projectId, taskId, run => run.runId === missing.runId && run.launchFailure !== null)
  assert.equal(refused.launchFailure, 'SDK Session restoration')
  assert.equal(refused.receipt, null)
  assert.equal(refused.inputAttemptedAt, null)
  assert.equal(modelRequests.length, 3)
  const history = await rpc('detail', { projectId, taskId })
  assert.deepEqual(history.runs.slice(0, 3).map(run => run.receipt), [started.receipt, continued.receipt, isolated.receipt])
  return { continuedOriginalSession: true, distinctRuns: true, modelRequests: 3, freshMaterialsOnly: true, missingSessionRejected: true }
}

function encodeBackup(document) {
  const { format, version, createdAt, domainVersion, payload } = document
  const sha256 = createHash('sha256').update(JSON.stringify([format, version, createdAt, domainVersion, payload])).digest('hex')
  return JSON.stringify({ ...document, sha256 })
}

async function verifyUpgrade(oldCli) {
  const projectId = randomUUID(), taskId = randomUUID()
  const command = expectedVersion => ({ projectId, taskId, commandId: randomUUID(), expectedVersion })
  await server.rpc('createProject', { request: { commandId: randomUUID(), expectedVersion: 0,
    project: { id: projectId, title: 'Upgrade rehearsal', root: projectRoot } } })
  const requirements = { title: 'Upgrade rehearsal', description: 'Original goal', acceptance: ['Keep prior revisions'], priority: 'normal', labels: [] }
  const create = { ...command(0), requirements }
  const created = await server.rpc('createTask', { request: create })
  const edit = { ...command(1), requirements: { ...requirements, description: 'Clarified goal' } }
  await server.rpc('editTask', { request: edit })
  await server.rpc('comment', { request: { ...command(2), text: 'Reviewed on the earlier build' } })
  const detail = () => server.rpc('detail', { projectId, taskId })
  const before = await detail()
  assert.equal(before.revisions.length, 2)
  assert.equal(before.activity.length, 3)
  await server.stop()
  server = undefined
  const checksum = async path => createHash('sha256').update(await readFile(path)).digest('hex')
  const original = await checksum(database)
  const source = join(root, 'home', 'taskboard')
  const upgraded = join(root, 'upgrade-home'), rollback = join(root, 'rollback-home')
  for (const home of [upgraded, rollback]) {
    await cp(source, join(home, 'taskboard'), { recursive: true, errorOnExist: true, force: false })
    assert.equal(await checksum(join(home, 'taskboard', 'tasks.sqlite')), original)
  }
  server = await boot(false, upgraded)
  const checkHistory = async () => {
    const current = await detail()
    assert.deepEqual(current.task, before.task)
    assert.deepEqual(current.revisions, before.revisions)
    assert.deepEqual(current.activity, before.activity)
    assert.deepEqual(await server.rpc('createTask', { request: create }), created)
  }
  await checkHistory()
  const update = { ...command(before.task.version), requirements: { ...edit.requirements, riskLevel: 'high' } }
  const changed = await server.rpc('editTask', { request: update })
  await server.stop()
  server = undefined
  server = await boot(false, upgraded)
  const after = await detail()
  assert.equal(after.task.riskLevel, 'high')
  assert.deepEqual(after.revisions.slice(0, 2), before.revisions)
  assert.equal(after.revisions.length, 3)
  assert.deepEqual(await server.rpc('editTask', { request: update }), changed)
  await server.stop()
  server = undefined
  server = await boot(false, rollback, {}, oldCli)
  await checkHistory()
  assert.equal(await checksum(database), original)
  return { oldRevisions: before.revisions.length, oldActivities: before.activity.length, upgradedRevisions: after.revisions.length,
    oldCommandReplayed: true, upgradedCommandReplayed: true, rollbackFromStoppedCopy: true, originalDatabaseUntouched: true }
}

async function writeSessionCopy(original, destination, sessionId, select) {
  const { Context } = await import('@deepseek-ai/cordis')
  const { default: JsonlSessionPersistence } = await import('@deepseek-ai/dsh-session-persistence-jsonl')
  const source = new Context()
  const target = new Context()
  try {
    await source.plugin(JsonlSessionPersistence, { root: join(original, 'sessions') })
    await target.plugin(JsonlSessionPersistence, { root: join(destination, 'sessions') })
    const reader = await source.sessionPersistence.open(sessionId, 'read')
    try {
      const { events } = await reader.read(0)
      const writer = await target.sessionPersistence.create(reader.header)
      try {
        await writer.append(select(structuredClone(events)))
      } finally {
        await writer.close()
      }
    } finally {
      await reader.close()
    }
  } finally {
    await Promise.all([source.fiber.dispose(), target.fiber.dispose()])
  }
}

async function verifyBackup(projectId, confirmation) {
  const { downloadTaskboardBackup, restoreTaskboardBackup, startFreshAfterRestore } = await import('./taskboard-browser.mjs')
  await verifyDelivery(server.rpc, projectId, confirmation)
  const requestsBeforeRestore = modelRequests.length
  await server.stop()
  await writeExecutionPatch(undefined)
  server = await boot(true)
  const inspected = await server.rpc('inspectProject', { projectId })
  const pending = await createStartRequest(server.rpc, projectId, inspected, 'Remain queued before backup')
  const queued = await server.rpc('startRun', { request: pending })
  const snapshot = await downloadTaskboardBackup(server.url, server.cookie)
  const document = JSON.parse(snapshot)
  assert.equal(document.version, 1)
  assert.equal(document.payload.includesSessions, false)
  assert.deepEqual(document.payload.queue, [queued.runId])
  assert.doesNotMatch(snapshot, /processScope|DEEPSEEK_API_KEY|local-fixture/)
  const handoff = JSON.parse(await server.rpc('exportHandoff', { projectId }))
  assert.equal(handoff.format, 'dsh-taskboard-handoff')
  assert.equal(handoff.reviews.length, 2)
  assert.equal(handoff.deliveries.length, 2)
  assert.equal(handoff.runs.length, 3)
  assert.doesNotMatch(JSON.stringify(handoff), /processScope|DEEPSEEK_API_KEY|local-fixture/)
  const reviewed = document.payload.tasks.find(record => record.task.status === 'done').task
  const reviewBefore = await server.rpc('detail', { projectId, taskId: reviewed.id })
  const readSpecs = runs => Promise.all(runs.map(run => server.rpc('runTaskSpec', { projectId, taskId: reviewed.id, runId: run.runId })))
  const specsBefore = await readSpecs(reviewBefore.runs)
  await assert.rejects(server.rpc('runTaskSpec', { projectId, taskId: pending.taskId, runId: specsBefore[0].runId }), /unknown Run input/)
  await assert.rejects(server.rpc('runTaskSpec', { projectId: randomUUID(), taskId: reviewed.id, runId: specsBefore[0].runId }), /unknown Run input/)
  for (const run of reviewBefore.runs) {
    assert.equal(run.authorization.routeSelection, 'deployment-default')
    assert.equal(run.authorization.commandId, run.runId)
    assert.deepEqual(handoff.runs.find(item => item.runId === run.runId).authorization, run.authorization)
  }
  await server.stop()
  await writeExecutionPatch(`http://127.0.0.1:${model.address().port}`)
  const targetHome = join(root, 'restored-home')
  server = await boot(true, targetHome)
  const restore = archive => server.rpc('restoreBackup', { archive })
  await assert.rejects(restore(snapshot.replace('Remain queued before backup', 'Corrupt one byte')), /checksum/)
  await assert.rejects(restore(JSON.stringify({ ...document, version: 9 })), /expected 1/i)
  const duplicate = structuredClone(document)
  duplicate.payload.tasks.push(duplicate.payload.tasks[0])
  await assert.rejects(restore(encodeBackup(duplicate)), /duplicate record IDs/)
  const changedInput = structuredClone(document)
  const oldRun = changedInput.payload.runs.find(run => run.admission.taskId === reviewed.id && run.taskRevision === 1)
  oldRun.input.description = reviewed.description.trim()
  await assert.rejects(restore(encodeBackup(changedInput)), /Run input does not match its requirements revision/)
  const lostConstraint = structuredClone(document)
  delete lostConstraint.payload.runs.find(run => run.admission.taskId === reviewed.id && run.taskRevision === 2).input.constraints
  await assert.rejects(restore(encodeBackup(lostConstraint)), /Run input does not match its requirements revision/)
  const wrongBaseline = structuredClone(document)
  wrongBaseline.payload.runs.find(run => run.admission.taskId === reviewed.id).admission.workspace.baseline = 'different baseline'
  await assert.rejects(restore(encodeBackup(wrongBaseline)), /Run workspace differs from its plan/)
  const wrongWorkflow = structuredClone(document)
  wrongWorkflow.payload.runs.find(run => run.admission.taskId === reviewed.id && run.taskRevision === 2).input.workflow.steps.reverse()
  await assert.rejects(restore(encodeBackup(wrongWorkflow)), /Run input does not match its requirements revision/)
  const wrongRisk = structuredClone(document)
  wrongRisk.payload.runs.find(run => run.admission.taskId === reviewed.id && run.taskRevision === 2).input.riskLevel = 'high'
  await assert.rejects(restore(encodeBackup(wrongRisk)), /Run input does not match its requirements revision/)
  const missingCheck = structuredClone(document)
  delete missingCheck.payload.deliveries[0].code.gitDiffCheck
  await assert.rejects(restore(encodeBackup(missingCheck)), /inconsistent project check evidence/)
  const wrongExit = structuredClone(document)
  wrongExit.payload.deliveries.find(item => item.code?.gitDiffCheck === 'failed').code.gitDiffObservation.exitCode = 0
  await assert.rejects(restore(encodeBackup(wrongExit)), /inconsistent project check evidence/)
  const missingReason = structuredClone(document)
  missingReason.payload.reviews.find(review => review.verdict === 'accept').feedback = ''
  await assert.rejects(restore(encodeBackup(missingReason)), /unsuccessful project check requires a reason/)
  const missingRevision = structuredClone(document)
  missingRevision.payload.runs.find(run => run.admission.runId === queued.runId).taskRevision++
  await assert.rejects(restore(encodeBackup(missingRevision)), /Run input does not match its requirements revision/)
  const wrongAdmission = structuredClone(document)
  const admission = wrongAdmission.payload.tasks.find(entry => entry.task.id === reviewed.id).activity
    .find(item => item.action === 'run-requested' && item.revision === 1)
  admission.revision = 2
  await assert.rejects(restore(encodeBackup(wrongAdmission)), /invalid Run metadata/)
  const wrongAuthorization = structuredClone(document)
  const recorded = wrongAuthorization.payload.runs.find(run => run.admission.authorization.routeSelection === 'deployment-default')
  recorded.admission.authorization.routeSelection = 'operator-confirmed'
  await assert.rejects(restore(encodeBackup(wrongAuthorization)), /inconsistent Run authorization/)
  const checkRunHistory = async (change) => {
    const copy = structuredClone(document)
    const task = copy.payload.tasks.find(entry => entry.task.id === reviewed.id)
    const [first, retry] = task.activity.filter(entry => entry.action === 'run-requested')
      .map(entry => copy.payload.runs.find(run => run.admission.runId === entry.runId))
    change(first, retry, task)
    await assert.rejects(restore(encodeBackup(copy)), /invalid Run history/)
  }
  await checkRunHistory((_first, retry) => { retry.admission.previousRun = null })
  await checkRunHistory((first, retry) => { first.admission.previousRun = retry.admission.runId })
  await checkRunHistory((_first, retry) => { retry.admission.mode = 'resume' })
  await checkRunHistory((first, retry) => { retry.admission.session = first.admission.session })
  await checkRunHistory((first, _retry, task) => { task.latestRun = first.admission.runId })
  const ambiguous = structuredClone(document)
  const history = ambiguous.payload.tasks.find(entry => entry.task.id === reviewed.id).revisions
  history.push(history[0])
  await assert.rejects(restore(encodeBackup(ambiguous)), /invalid requirements history/)
  const changedTask = structuredClone(document)
  changedTask.payload.tasks.find(entry => entry.task.id === reviewed.id).task.acceptance = ['Changed after review']
  await assert.rejects(restore(encodeBackup(changedTask)), /invalid requirements history/)
  const wrongEvidence = structuredClone(document)
  wrongEvidence.payload.deliveries[0].verification[0].criterion = 'Unrelated criterion'
  await assert.rejects(restore(encodeBackup(wrongEvidence)), /cover every original acceptance criterion/)
  const missingWaiver = structuredClone(document)
  missingWaiver.payload.reviews.find(review => review.verdict === 'accept').waivers = []
  await assert.rejects(restore(encodeBackup(missingWaiver)), /requires a human waiver/)
  const missingFeedback = structuredClone(document)
  missingFeedback.payload.reviews.find(review => review.verdict === 'return').feedback = ' '
  await assert.rejects(restore(encodeBackup(missingFeedback)), /returning a delivery requires feedback/)
  const checkReviewHistory = async change => {
    const copy = structuredClone(document)
    const history = copy.payload.tasks.find(entry => entry.task.id === reviewed.id)
    const decisions = history.activity.filter(entry => entry.action === 'accepted' || entry.action === 'returned')
    const returned = copy.payload.reviews.find(review => review.commandId === decisions[0].commandId)
    const retry = copy.payload.runs.find(run => run.admission.taskId === reviewed.id && run.taskRevision === 2)
    change({ history, decisions, returned, retry })
    await assert.rejects(restore(encodeBackup(copy)), /inconsistent review history/)
  }
  await checkReviewHistory(({ retry }) => { retry.input.reviewFeedback = 'Different retry instructions' })
  await checkReviewHistory(({ returned, retry }) => { returned.feedback = retry.input.reviewFeedback = 'Different decision and input' })
  await checkReviewHistory(({ decisions }) => { decisions[1].actor = 'runtime' })
  await checkReviewHistory(({ decisions, history }) => { history.activity.push(decisions[1]) })
  const missingAcceptance = structuredClone(document)
  missingAcceptance.payload.tasks.find(entry => entry.task.id === reviewed.id).lastReview = null
  await assert.rejects(restore(encodeBackup(missingAcceptance)), /completed task has no matching acceptance/)
  assert.deepEqual(await server.rpc('listProjects', {}), [])
  await restoreTaskboardBackup(server.url, server.cookie, snapshot)
  await assert.rejects(restore(snapshot), /empty Taskboard database/)
  const { runs: [canceled] } = await server.rpc('detail', { projectId, taskId: pending.taskId })
  assert.equal(canceled.state, 'canceled')
  assert.equal(canceled.inputAttemptedAt, null)
  assert.equal(canceled.receipt, null)
  assert.equal(modelRequests.length, requestsBeforeRestore)
  const detail = await server.rpc('detail', { projectId, taskId: reviewed.id })
  assert.deepEqual(detail.revisions, reviewBefore.revisions)
  const savedInputs = await Promise.all(detail.runs.map(run => server.rpc('runInput', { projectId, taskId: reviewed.id, runId: run.runId })))
  assert.deepEqual(await readSpecs(detail.runs), specsBefore)
  assert.deepEqual(specsBefore.map(spec => spec.input), savedInputs)
  assert.deepEqual(specsBefore.map(spec => [spec.revision, spec.taskId, spec.workspace.baseline]),
    detail.runs.map(run => [run.revision, reviewed.id, confirmation.head]))
  assert.equal(savedInputs[0].reviewFeedback, null)
  assert.equal(savedInputs[1].reviewFeedback, detail.reviews[0].feedback)
  assert.equal(savedInputs[0].riskLevel, undefined)
  assert.equal(savedInputs[1].riskLevel, 'low')
  assert.equal(savedInputs[0].workflow, undefined)
  assert.deepEqual(savedInputs[1].workflow, { template: 'task.standard.v1', steps: ['Inspect the sealed change', 'Record verification'] })
  assert.equal(savedInputs[0].constraints, undefined)
  assert.equal(savedInputs[1].constraints, 'Keep the notes filename')
  assert.equal(modelRequests.length, requestsBeforeRestore)
  assert.deepEqual(detail.reviews.map(review => {
    const delivery = detail.deliveries.find(item => item.id === review.deliveryId)
    const run = detail.runs.find(item => item.runId === delivery.runId)
    return [review.verdict, review.revision, delivery.revision, run.revision]
  }), [['return', 1, 1, 1], ['accept', 2, 2, 2]])
  assert.deepEqual(detail.task, reviewBefore.task)
  assert.deepEqual(detail.reviews, reviewBefore.reviews)
  assert.deepEqual(detail.deliveries, reviewBefore.deliveries)
  assert.deepEqual(detail.runs.map(run => run.sessionNotIncluded), [true, true])
  const fallbackTask = document.payload.tasks.find(record => record.task.status === 'blocked').task
  const id = { projectId: fallbackTask.projectId, taskId: fallbackTask.id }
  const { runs: [prior] } = await server.rpc('detail', id)
  const plan = await server.rpc('planTask', { request: { ...id, commandId: randomUUID(), expectedVersion: fallbackTask.version } })
  const directory = await server.rpc('inspectPriorWorkspace', { ...id, priorRun: prior.runId })
  const session = join(root, 'sessions', prior.sessionId)
  const savedSession = join(root, 'saved-original-session')
  await rename(session, savedSession)
  const request = { ...id, commandId: randomUUID(), expectedVersion: plan.version, previousRun: prior.runId,
    confirmation: directory, materials: [{ reference: 'prior.txt', text: 'Only in the recovered Session' }], mode: 'resume' }
  await assert.rejects(server.rpc('startRun', { request }), /backup did not include the prior Session/)
  assert.equal(modelRequests.length, requestsBeforeRestore)
  const savedRoot = join(savedSession, 'sessions')
  const projectDir = (await readdir(savedRoot, { withFileTypes: true })).find(entry => entry.isDirectory())
  assert.ok(projectDir, 'the original Run has a project directory in its Session store')
  const artifact = join(savedRoot, projectDir.name, prior.sessionId)
  const log = (await readdir(artifact)).find(name => /^session\.v\d+\.jsonl(?:\.zstd)?$/.test(name))
  assert.ok(log, 'the shipped SDK writes a versioned Session log')
  const compressed = log.endsWith('.zstd')
  const originalBytes = await readFile(join(artifact, log))
  const originalLog = (compressed ? zstdDecompressSync(originalBytes) : originalBytes).toString('utf8')
  const newline = originalLog.indexOf('\n')
  const header = JSON.parse(originalLog.slice(0, newline))
  const futureDir = join(session, 'sessions', projectDir.name, prior.sessionId)
  await mkdir(futureDir, { recursive: true })
  const futureLog = join(futureDir, log.replace(`v${header.version}`, `v${header.version + 1}`))
  const futureText = JSON.stringify({ ...header, version: header.version + 1 }) + originalLog.slice(newline)
  const futureBytes = compressed ? zstdCompressSync(futureText, { params: { [zstdOptions.ZSTD_c_checksumFlag]: 1 } }) : Buffer.from(futureText)
  await writeFile(futureLog, futureBytes)
  await assert.rejects(server.rpc('startRun', { request }), /newer harness|uses log format/i)
  assert.deepEqual(await readFile(futureLog), futureBytes)
  assert.deepEqual(await readFile(join(artifact, log)), originalBytes)
  assert.equal(modelRequests.length, requestsBeforeRestore)
  await rename(session, join(root, 'rejected-future-session'))
  await writeSessionCopy(savedSession, session, prior.sessionId, events => {
    const position = events.findIndex(event => event.seq === prior.lastEvent.seq)
    assert.ok(position > 0)
    return events.slice(0, position)
  })
  await assert.rejects(server.rpc('startRun', { request }), /recorded Session position/)
  await rename(session, join(root, 'earlier-session'))
  await writeSessionCopy(savedSession, session, prior.sessionId, events => {
    const input = events.filter(event => event.type === 'agent/inbox/spliced').flatMap(event => event.data.inserted)
      .find(message => message.id === prior.receipt)
    assert.ok(input)
    input.content[0].text = 'Other input in this copy'
    return events
  })
  await assert.rejects(server.rpc('startRun', { request }), /recorded input receipt/)
  assert.equal((await server.rpc('detail', id)).runs.length, 1)
  assert.equal(modelRequests.length, requestsBeforeRestore)
  await rename(session, join(root, 'rejected-old-session'))
  await rename(savedSession, session)
  const continued = await server.rpc('startRun', { request })
  const completed = await pollRun(server.rpc, id.projectId, id.taskId, run => run.runId === continued.runId && run.state === 'finished')
  assert.equal(completed.sessionId, prior.sessionId)
  assert.ok(completed.receipt && completed.receipt !== prior.receipt)
  assert.equal(modelRequests.length, requestsBeforeRestore + 1)
  await server.stop()
  server = await boot(true, targetHome)
  assert.equal((await server.rpc('detail', { projectId, taskId: reviewed.id })).task.status, 'done')
  const secondBackup = await server.rpc('exportBackup', {})
  await server.stop()
  const { Context } = await import('@deepseek-ai/cordis')
  const { default: JsonlSessionPersistence } = await import('@deepseek-ai/dsh-session-persistence-jsonl')
  const ctx = new Context()
  try {
    await ctx.plugin(JsonlSessionPersistence, { root: join(session, 'sessions') })
    const reader = await ctx.sessionPersistence.open(prior.sessionId, 'read')
    try {
      assert.equal(reader.header.cwd, prior.workspace)
      const { events } = await reader.read(0)
      const inputs = events.filter(event => event.type === 'agent/inbox/spliced' && event.data.target === 'next-turn')
        .flatMap(event => event.data.inserted.filter(message => message.source?.kind === 'user').map(message => message.id))
      assert.deepEqual(inputs, [prior.receipt, completed.receipt])
    } finally {
      await reader.close()
    }
  } finally {
    await ctx.fiber.dispose()
  }
  await rename(session, savedSession)
  server = await boot(true, join(root, 'second-restored-home'))
  assert.deepEqual(await server.rpc('listProjects', {}), [])
  const changedRoute = JSON.parse(secondBackup)
  changedRoute.payload.runs.find(run => run.admission.runId === continued.runId).admission.model = 'other-model'
  await assert.rejects(server.rpc('restoreBackup', { archive: encodeBackup(changedRoute) }), /invalid Run history/)
  const wrongPoint = JSON.parse(secondBackup)
  wrongPoint.payload.runs.find(run => run.admission.runId === continued.runId).previousCheckpoint.receipt = randomUUID()
  await assert.rejects(server.rpc('restoreBackup', { archive: encodeBackup(wrongPoint) }), /inconsistent Run checkpoint/)
  const counts = await server.rpc('restoreBackup', { archive: secondBackup })
  assert.equal(counts.canceledQueuedRuns, 0)
  assert.equal(counts.missingSessions, 3)
  const canceledHistory = await server.rpc('detail', { projectId, taskId: pending.taskId })
  assert.deepEqual(canceledHistory.runs, [canceled])
  const twiceRestored = await server.rpc('detail', id)
  assert.deepEqual(twiceRestored.runs, [{ ...prior, sessionNotIncluded: true }, { ...completed, sessionNotIncluded: true }])
  assert.equal(completed.previousRun, prior.runId)
  const acceptedHistory = await server.rpc('detail', { projectId, taskId: reviewed.id })
  assert.deepEqual(acceptedHistory.reviews, reviewBefore.reviews)
  assert.deepEqual(acceptedHistory.deliveries, reviewBefore.deliveries)
  assert.deepEqual(acceptedHistory.task, reviewBefore.task)
  await assert.rejects(stat(session), { code: 'ENOENT' })
  const legacy = JSON.parse(secondBackup)
  const olderDelivery = legacy.payload.deliveries[0]
  delete olderDelivery.modelReviewStatus
  delete olderDelivery.code.gitDiffObservation
  const olderRun = legacy.payload.runs.find(run => run.admission.runId === completed.runId)
  delete olderRun.admission.model
  delete olderRun.admission.authorization
  delete olderRun.previousCheckpoint
  const canceledRecord = legacy.payload.runs.find(run => run.admission.runId === canceled.runId)
  canceledRecord.sessionNotIncluded = true
  await server.stop()
  server = await boot(true, join(root, 'legacy-restored-home'))
  await server.rpc('restoreBackup', { archive: encodeBackup(legacy) })
  const olderEvidence = await server.rpc('deliveryDetail', { projectId: olderDelivery.projectId,
    taskId: olderDelivery.taskId, deliveryId: olderDelivery.id })
  assert.equal(olderEvidence.modelReviewStatus, null)
  const olderPackage = JSON.parse(await server.rpc('exportReviewPackage', { projectId: olderDelivery.projectId,
    taskId: olderDelivery.taskId, deliveryId: olderDelivery.id }))
  assert.equal(olderPackage.projectChecks[0].exitCode, null)
  assert.deepEqual(olderEvidence.validationResults, [{ check: 'git-diff-check', snapshot: olderDelivery.snapshot,
    status: olderDelivery.code.gitDiffCheck, exitCode: null, observedAt: null, reason: null }])
  assert.deepEqual((await server.rpc('detail', { projectId, taskId: pending.taskId })).runs, [canceled])
  const historical = await server.rpc('detail', id)
  const olderSpec = await server.rpc('runTaskSpec', { ...id, runId: completed.runId })
  assert.deepEqual([olderSpec.authorization, olderSpec.route, olderSpec.previousCheckpoint], [null, null, null])
  assert.equal(historical.runs.find(run => run.runId === completed.runId).previousCheckpoint, undefined)
  assert.equal(historical.runs.find(run => run.runId === completed.runId).authorization, undefined)
  assert.equal(historical.runs.find(run => run.runId === completed.runId).route, undefined)
  assert.ok(historical.runs.find(run => run.runId === prior.runId).route?.model)
  const corrected = JSON.parse(await server.rpc('exportBackup', {}))
  assert.equal(corrected.payload.runs.find(run => run.admission.runId === canceled.runId).sessionNotIncluded, undefined)
  assert.equal(modelRequests.length, requestsBeforeRestore + 1)
  await startFreshAfterRestore(server.url, server.cookie, completed, async () => {
    const unchanged = await server.rpc('detail', id)
    assert.deepEqual(unchanged.runs, historical.runs)
    assert.equal(modelRequests.length, requestsBeforeRestore + 1)
  })
  const fresh = await pollRun(server.rpc, id.projectId, id.taskId, run => run.previousRun === completed.runId && run.state === 'finished')
  assert.ok(fresh.receipt && fresh.receipt !== completed.receipt)
  assert.notEqual(fresh.sessionId, completed.sessionId)
  const freshInput = await server.rpc('runInput', { ...id, runId: fresh.runId })
  const previousCheckpoint = { runId: completed.runId, sessionId: completed.sessionId, revision: completed.revision,
    receipt: completed.receipt, lastEvent: completed.lastEvent }
  assert.deepEqual(fresh.previousCheckpoint, previousCheckpoint)
  assert.equal(fresh.authorization.routeSelection, 'operator-confirmed')
  assert.equal(fresh.authorization.scope, 'queue-once')
  assert.equal(fresh.authorization.executor, 'dsh-sdk')
  assert.ok(Number.isFinite(Date.parse(fresh.authorization.authorizedAt)))
  const handoffAfterRetry = JSON.parse(await server.rpc('exportHandoff', { projectId: id.projectId }))
  const entry = handoffAfterRetry.runs.find(run => run.runId === fresh.runId)
  assert.equal(entry.sessionId, fresh.sessionId)
  assert.deepEqual(entry.previousCheckpoint, previousCheckpoint)
  assert.deepEqual(entry.authorization, fresh.authorization)
  assert.deepEqual(freshInput.materials, [{ reference: 'restart.txt', text: 'Only for the new Session' }])
  assert.match(modelRequests.at(-1), /Only for the new Session/)
  assert.doesNotMatch(modelRequests.at(-1), /Only in the recovered Session/)
  assert.equal(modelRequests.length, requestsBeforeRestore + 2)
  await assert.rejects(stat(session), { code: 'ENOENT' })
  const finalHistory = await server.rpc('detail', id)
  assert.deepEqual(finalHistory.runs.slice(0, -1), historical.runs)
  await server.stop()
  await writeExecutionPatch(undefined)
  const savedBoard = join(root, 'second-restored-home')
  server = await boot(true, savedBoard)
  await rename(savedSession, session)
  const retryPlan = await server.rpc('planTask', { request: { ...id, commandId: randomUUID(), expectedVersion: twiceRestored.task.version } })
  const authorized = await server.rpc('startRun', { request: { ...request, commandId: randomUUID(), expectedVersion: retryPlan.version,
    previousRun: completed.runId, confirmation: await server.rpc('inspectPriorWorkspace', { ...id, priorRun: completed.runId }) } })
  await server.stop()
  await rename(session, savedSession)
  await rename(join(root, 'earlier-session'), session)
  await writeExecutionPatch(`http://127.0.0.1:${model.address().port}`)
  server = await boot(true, savedBoard)
  const refused = await pollRun(server.rpc, id.projectId, id.taskId, run => run.runId === authorized.runId && run.state === 'failed')
  assert.equal(refused.inputAttemptedAt, null)
  assert.equal(refused.receipt, null)
  assert.equal(modelRequests.length, requestsBeforeRestore + 2)
  return { archiveDownloaded: true, archiveUploaded: true, corruptIncompatibleAndConflictsRejected: true,
    reviewHistoryPreserved: true, missingSessionReported: true, queuedRunNotStarted: true,
    incompatibleSessionKept: true, compatibleSessionContinued: true,
    receiptsMatchedSession: true, secondRestorePreservedHistory: true, explicitFreshSession: true,
    queuedRestoreRechecked: true, staleSessionRejected: true, wrongInputRejected: true }
}

async function measureBoard(projectId) {
  const { measureTaskboardPage } = await import('./taskboard-browser.mjs')
  const phases = [0, 160, 320, 540, 780, 1_020, 40, 240, 480, 700, 930, 1_100]
  const changes = []
  for (let index = 0; index < 2_000; index++) {
    const taskId = randomUUID()
    const title = `Taskboard benchmark ${String(index).padStart(4, '0')}`
    const kind = ['report', 'documentation', 'feature', 'fix'][index % 4]
    const requirements = { title, description: `Update the ${kind} for module ${index % 17} and verify its migration path.`,
      acceptance: ['Run the package checks', 'Confirm the original data remains readable'],
      priority: ['normal', 'high', 'low'][index % 3], labels: [kind, `module-${index % 17}`],
    }
    await server.rpc('createTask', { request: { projectId, taskId, commandId: randomUUID(), expectedVersion: 0, requirements } })
    if (index < phases.length) {
      changes.push({ title, delay: phases[index], commit: () => server.rpc('planTask', {
        request: { projectId, taskId, commandId: randomUUID(), expectedVersion: 1 },
      }) })
    }
  }
  return measureTaskboardPage(server.url, server.cookie, changes)
}

async function verifySdkPatchChange(projectId, confirmation) {
  const start = await createStartRequest(server.rpc, projectId, confirmation, 'Keep the confirmed SDK deployment')
  const target = { projectId, taskId: start.taskId }
  const queued = await server.rpc('startRun', { request: start })
  await server.stop()
  server = undefined
  const sdkFile = join(root, 'openai-sdk.yml')
  const oldSdk = await readFile(sdkFile, 'utf8')
  await writeFile(sdkFile, oldSdk.replace('/v1', '/replacement/v1'))
  const offline = await readFile(executionPatch, 'utf8')
  await writeFile(executionPatch, offline.replace('dispatch: false', 'dispatch: true'))
  server = await boot(true, undefined, { OPENAI_API_KEY: 'taskboard-fixture-key' })
  const first = await pollRun(server.rpc, projectId, start.taskId, run => run.runId === queued.runId && ['finished', 'failed'].includes(run.state))
  assert.equal(first.state, 'failed')
  assert.equal(first.inputAttemptedAt, null)
  assert.equal(first.receipt, null)
  assert.equal(modelRequests.length, 0)
  assert.deepEqual(await server.rpc('startRun', { request: start }), queued)
  const retry = await server.rpc('detail', target)
  const planned = await server.rpc('planTask', { request: { ...target, commandId: randomUUID(), expectedVersion: retry.task.version } })
  const fresh = await server.rpc('startRun', { request: { ...start, commandId: randomUUID(), expectedVersion: planned.version, previousRun: first.runId } })
  const completed = await pollRun(server.rpc, projectId, start.taskId, run => run.runId === fresh.runId && run.state === 'finished')
  assert.ok(completed.receipt)
  assert.deepEqual(openaiRequests, [{ path: '/replacement/v1/responses', model: 'gpt-5.4-mini', fixtureCredential: true }])
  await writeFile(sdkFile, oldSdk)
  const current = await server.rpc('detail', target)
  const resumePlan = await server.rpc('planTask', { request: { ...target, commandId: randomUUID(), expectedVersion: current.task.version } })
  await assert.rejects(server.rpc('startRun', { request: { ...start, mode: 'resume', commandId: randomUUID(),
    expectedVersion: resumePlan.version, previousRun: completed.runId } }), /SDK patch contents changed/)
  assert.equal((await server.rpc('detail', target)).runs.length, 2)
  assert.equal(modelRequests.length, 1)
  const archive = await server.rpc('exportBackup', {})
  assert.doesNotMatch(archive, /taskboard-fixture-key|replacement\/v1/)
  const legacy = JSON.parse(archive)
  const digests = legacy.payload.runs.map(run => run.admission.sdkPatchDigest)
  assert.equal(new Set(digests).size, 2)
  for (const digest of digests) assert.match(digest, /^[a-f0-9]{64}$/)
  for (const run of legacy.payload.runs) delete run.admission.sdkPatchDigest
  await server.stop()
  server = undefined
  server = await boot(true, join(root, 'legacy-overlay-home'), { OPENAI_API_KEY: 'taskboard-fixture-key' })
  await server.rpc('restoreBackup', { archive: encodeBackup(legacy) })
  const restored = await server.rpc('detail', target)
  assert.deepEqual(restored.runs.map(run => [run.runId, run.state, run.receipt]),
    [first, completed].map(run => [run.runId, run.state, run.receipt]))
  assert.equal(modelRequests.length, 1)
  return { oldRunReceivedInput: false, oldReceiptReplayed: true, explicitlyRetriedRoute: true, changedPatchResumeRejected: true,
    legacyHistoryRestored: true }
}

async function verifyFailedRetry(rpc, projectId, confirmation) {
  const request = await createStartRequest(rpc, projectId, confirmation, 'Keep the failed Session and retry explicitly')
  const { taskId } = request
  const target = { projectId, taskId }
  const first = await rpc('startRun', { request })
  const failed = await pollRun(rpc, projectId, taskId, run => run.runId === first.runId && run.state === 'failed')
  assert.ok(failed.receipt)
  assert.equal(failed.endReason, 'SDK turn failed')
  const { task } = await rpc('detail', target)
  assert.equal(task.status, 'blocked')
  const plan = await rpc('planTask', { request: { ...target, commandId: randomUUID(), expectedVersion: task.version } })
  const retry = await rpc('startRun', { request: { ...request, commandId: randomUUID(), previousRun: first.runId, expectedVersion: plan.version } })
  const completed = await pollRun(rpc, projectId, taskId, run => run.runId === retry.runId && run.state === 'finished')
  assert.equal(completed.previousRun, first.runId)
  assert.equal(completed.priorSessionId, failed.sessionId)
  assert.notEqual(completed.sessionId, failed.sessionId)
  assert.equal(modelRequests.length, 2)
  const history = await rpc('detail', target)
  assert.deepEqual(history.runs[0], failed)
  return { failedInputRetained: true, freshRetryLinked: true, modelRequests: 2 }
}

async function verifyTeam(projectId) {
  const { issueTeamMembership, visitTeamBoard, editSharedRequirements } = await import('./taskboard-browser.mjs')
  const key = await issueTeamMembership(server.url, server.cookie)
  const id = key.split('.')[0]
  const member = async (credential, project, input, headers = {}) => {
    const url = new URL('/taskboard-team-api', server.url)
    if (project) url.searchParams.set('project', project)
    return fetch(url, { method: input ? 'POST' : 'GET',
      headers: { ...(credential && { authorization: 'Bearer ' + credential }), 'content-type': 'application/json', ...headers },
      ...(input && { body: JSON.stringify(input) }) })
  }
  const status = async (call, code) => {
    const response = await call
    assert.equal(response.status, code)
    await response.body?.cancel()
  }
  const other = randomUUID()
  await server.rpc('createProject', { request: { commandId: randomUUID(), expectedVersion: 0,
    project: { id: other, title: 'Restricted project', root: projectRoot } } })
  const start = await createStartRequest(server.rpc, projectId, null, 'Check member access')
  const outside = await createStartRequest(server.rpc, other, null, 'Confidential')
  const comment = { projectId, taskId: start.taskId, expectedVersion: 2, commandId: randomUUID(), action: 'commented', text: 'Signed comment' }
  const detail = () => server.rpc('detail', { projectId, taskId: start.taskId })
  const change = async (request) => {
    const account = (await server.rpc('projectMembers', { projectId })).find(row => row.id === id)
    await server.rpc('changeMember', { request: { id, expectedVersion: account.version, ...request } })
  }
  await status(member(null, projectId), 401)
  await status(member(null, projectId, undefined, { cookie: server.cookie }), 401)
  await status(member(key, projectId, undefined, { origin: 'https://different.invalid' }), 403)
  await status(member(key, other), 403)
  await status(member(key, 'invalid'), 400)
  await status(member(key, projectId, comment, { 'content-type': 'text/plain' }), 415)
  await status(member(key, projectId, { ...comment, text: 'a'.repeat(262144) }), 413)
  await status(fetch(new URL('/taskboard-team-api', server.url), { method: 'DELETE' }), 405)
  const available = await (await member(key)).json()
  assert.deepEqual(available.projects, [{ id: projectId, title: 'SDK review', role: 'viewer' }])
  assert.equal(JSON.stringify(available).includes('Restricted project'), false)
  await visitTeamBoard(server.url, key, projectId, false)
  await status(member(key, projectId, comment), 403)
  await change({ action: 'grant', projectId, role: 'editor' })
  await visitTeamBoard(server.url, key, projectId, true)
  const edited = await detail()
  assert.equal(edited.task.description, 'Team edit accepted')
  assert.equal(edited.task.riskLevel, 'medium')
  assert.equal(edited.task.constraints, 'Preserve the build scripts')
  assert.equal(edited.task.revision, 2)
  assert.ok(edited.activity.slice(-2).every(entry => entry.member.id === id && entry.member.name === 'Lin'))
  const secondId = randomUUID()
  const secondSecret = randomBytes(32).toString('hex')
  await server.rpc('createMember', { request: { id: secondId, name: 'Kai', projectId, role: 'editor',
    verifier: createHash('sha256').update(secondSecret).digest('hex') } })
  await editSharedRequirements(server.url, [key, secondId + '.' + secondSecret], projectId)
  const shared = await detail()
  assert.deepEqual(shared.activity.slice(-2).map(entry => [entry.actor, entry.member.id]), [['member', id], ['member', secondId]])
  assert.equal(shared.task.revision, edited.task.revision + 2)
  assert.deepEqual(shared.task.workflow, { template: 'task.quick.v1' })
  assert.deepEqual(shared.revisions.at(-2).workflow, { template: 'task.milestone.v1', steps: ['Read the goal', 'Check the result'] })
  assert.equal(shared.task.description, 'Both editors reviewed the goal')
  for (const workflow of [{ template: 'task.quick.v1', steps: ['Unexpected'] }, { template: 'task.standard.v2', steps: [] }, { template: 'task.milestone.v1', steps: [] }]) {
    const { title, description, acceptance, priority, labels } = shared.task
    await status(member(key, projectId, { projectId, taskId: start.taskId, expectedVersion: shared.task.version,
      commandId: randomUUID(), action: 'edited', requirements: { title, description, acceptance, priority, labels, workflow } }), 400)
  }
  const edit = { ...comment, expectedVersion: shared.task.version }
  await status(member(key, projectId, { ...edit, taskId: outside.taskId }), 409)
  await status(member(key, other, { ...edit, projectId: other, taskId: outside.taskId }), 403)
  await status(member(key, projectId, { ...edit, member: { id, name: 'Owner' } }), 400)
  await status(member(key, projectId, { ...edit, action: 'accepted' }), 400)
  const methods = ['startRun', 'answerRunInteraction', 'reviewDelivery', 'exportBackup', 'changeMember', 'projectMembers']
  for (const name of methods) {
    const method = 'taskboard/' + name
    await status(fetch(new URL('/api/' + method, server.url), { method: 'POST', headers: {
      authorization: 'Bearer ' + key, 'content-type': 'application/json',
    }, body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: {} } }) }), 401)
  }
  await status(member(key, projectId, edit), 200)
  await status(member(key, projectId, edit), 200)
  assert.equal((await detail()).activity.filter(entry => entry.commandId === edit.commandId).length, 1)
  await change({ action: 'grant', projectId, role: 'viewer' })
  await status(member(key, projectId, edit), 403)
  await change({ action: 'grant', projectId, role: null })
  await status(member(key, projectId), 403)
  await change({ action: 'grant', projectId: other, role: 'viewer' })
  const replacement = randomBytes(32).toString('hex')
  const verifier = createHash('sha256').update(replacement).digest('hex')
  await change({ action: 'rotate', verifier })
  await status(member(key, other), 401)
  const rotated = id + '.' + replacement
  await status(member(rotated, other), 200)
  const backup = await server.rpc('exportBackup', {})
  for (const excluded of [key, replacement, verifier, '"accounts"', '"verifier"']) assert.equal(backup.includes(excluded), false)
  await server.stop()
  server = await boot(true)
  await status(member(rotated, other), 200)
  await status(member(rotated, projectId), 403)
  await change({ action: 'disable' })
  await status(member(rotated, other), 401)
  assert.equal((await detail()).runs.length, 0)
  await server.stop()
  server = await boot(true, join(root, 'team-restored'))
  await server.rpc('restoreBackup', { archive: backup })
  assert.deepEqual(await server.rpc('projectMembers', { projectId }), [])
  await status(member(rotated, other), 401)
  await status(member(secondId + '.' + secondSecret, projectId), 401)
  const restored = await detail()
  assert.equal(restored.task.description, shared.task.description)
  assert.deepEqual(restored.activity.filter(entry => entry.action === 'edited').map(entry => entry.member.name), ['Lin', 'Lin', 'Kai'])
  if (process.argv.includes('--team-export')) {
    const path = process.argv[process.argv.indexOf('--team-export') + 1]
    assert.ok(path && !path.startsWith('--'), 'provide a new output path for the team backup')
    await writeFile(path, backup + '\n', { flag: 'wx', mode: 0o600 })
  }
  return { browserRoles: ['operator', 'viewer', 'editor'], deniedOperatorMethods: methods.length, scopedProjects: 2,
    concurrentEditors: 2, staleEditRejected: true, restoredAccounts: 0, attributedEdits: 4, replayedComments: 0, rotatedAndRevoked: true, restarted: true, backupExcludedCredentials: true }
}

/** Verify the source fixture's portable backup in this receiver's independently initialized Host. */
async function receiveTeamFixture(path) {
  const archive = await readFile(path, 'utf8')
  const checksum = createHash('sha256').update(archive).digest('hex')
  await server.rpc('restoreBackup', { archive })
  const projects = await server.rpc('listProjects', {})
  assert.equal(projects.length, 2)
  const { id: projectId } = projects.find(project => project.title === 'SDK review')
  for (const { id } of projects) assert.deepEqual(await server.rpc('projectMembers', { projectId: id }), [])
  const [task] = await server.rpc('listTasks', { projectId, includeArchived: true })
  assert.equal(task.description, 'Both editors reviewed the goal')
  const detail = await server.rpc('detail', { projectId, taskId: task.id })
  const edits = detail.activity.filter(activity => activity.actor === 'member' && activity.action === 'edited')
  assert.deepEqual(edits.map(edit => edit.member.name), ['Lin', 'Lin', 'Kai'])
  assert.equal(new Set(edits.map(edit => edit.member.id)).size, 2)
  assert.equal(detail.runs.length, 0)
  const id = randomUUID()
  const secret = randomBytes(32).toString('hex')
  await server.rpc('createMember', { request: { id, name: 'Receiver', projectId, role: 'viewer',
    verifier: createHash('sha256').update(secret).digest('hex') } })
  const url = new URL('/taskboard-team-api', server.url)
  url.searchParams.set('project', projectId)
  const headers = { authorization: 'Bearer ' + id + '.' + secret, 'content-type': 'application/json' }
  const response = await fetch(url, { headers })
  assert.equal(response.status, 200)
  const board = await response.json()
  assert.deepEqual(board.projects, [{ id: projectId, title: 'SDK review', role: 'viewer' }])
  assert.equal(board.tasks[0].task.description, task.description)
  const refused = await fetch(url, { method: 'POST', headers, body: JSON.stringify({
    action: 'commented', projectId, taskId: task.id, expectedVersion: task.version, commandId: randomUUID(), text: 'Read-only probe',
  }) })
  assert.equal(refused.status, 403)
  await refused.body?.cancel()
  return { archiveSha256: checksum, projects: projects.length, historicalEditors: 2, restoredAccounts: 0,
    receiverViewerRead: true, receiverViewerWriteDenied: true, startedRuns: detail.runs.length, platform: process.platform, arch: process.arch }
}

async function verifyDeployment(projectId) {
  assert.equal(new URL(server.url).hostname, '127.0.0.1')
  assert.deepEqual(await server.rpc('executionRoute', { projectId }), {
    state: 'configured', provider: 'deepseek-official', model: 'deepseek-v4-pro',
  })
  const method = 'taskboard/exportBackup'
  const response = await fetch(new URL('/api/' + method, server.url), {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args: {} } }),
  })
  assert.ok([401, 403].includes(response.status))
  await response.body?.cancel()
  assert.doesNotMatch(await server.rpc('exportBackup', {}), /deployment-fixture|DEEPSEEK_API_KEY/)
  return { documentedPatchLoaded: true, localOnly: true, backupRequiresAuthentication: true, credentialsExcluded: true }
}

let publishedCommit
if (prDelivery) {
  const git = (...args) => promisify(execFile)('git', args)
  await git('clone', '--quiet', '--no-hardlinks', '--', prInput, projectRoot)
  publishedCommit = (await git('-C', projectRoot, 'rev-parse', 'HEAD')).stdout.trim()
  const base = (await git('-C', projectRoot, 'merge-base', 'HEAD', 'origin/codely_bridge')).stdout.trim()
  assert.notEqual(base, publishedCommit)
  await git('-C', projectRoot, 'switch', '-c', 'delivery-capture', base)
} else if (!addReceipt) await mkdir(projectRoot)
let server
const modelRequests = []

function interactionTool(index) {
  if (index === 1) return { name: 'ask_user_question', input: { questions: [{
    id: 'color', header: 'Color', question: 'Choose a color', options: [{ label: 'Blue' }, { label: 'Green' }],
  }] } }
  const action = ['allowed', 'rejected', 'cancelled'][index - 2]
  if (action) return { name: 'write', input: { file_path: join(projectRoot, `approval-${action}.txt`), content: 'one scoped write' } }
}

function taskToolResult(body, index = 1) {
  const blocks = JSON.parse(body).messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
  const result = blocks.find(block => block.type === 'tool_result' && block.tool_use_id === `taskboard-${index}`)
  const value = typeof result.content === 'string' ? result.content : result.content[0].text
  return JSON.parse(value)
}

function scopedTaskTool(index, body) {
  if (index === 1) return { name: 'taskboard_read', input: {} }
  if (index > 4) return
  const { version, description, constraints, riskLevel } = taskToolResult(body)
  assert.equal(riskLevel, 'medium')
  assert.equal(constraints, 'Only inspect source files')
  assert.equal(description, 'Read and post progress to the current task')
  const input = { kind: 'progress', text: 'Source inspection finished', expected_version: index === 3 ? version - 1 : version }
  if (index === 2) input.task_id = randomUUID()
  return { name: 'taskboard_update', input }
}

function deliveryTool(index, body) {
  if (index === 1 || index === 8) return { name: 'taskboard_read', input: {} }
  if (index === 2) return { name: 'read', input: { file_path: join(projectRoot, 'notes.txt') } }
  if (index === 3) return { name: 'write', input: { file_path: join(projectRoot, 'notes.txt'), content: reviewedNotes } }
  if (index !== 4 && index !== 5 && index !== 9) return
  const { version, acceptance } = taskToolResult(body, index === 9 ? 8 : 1)
  return { name: 'taskboard_submit_delivery', input: {
    expected_version: version, summary: 'Updated the notes', changes: ['notes.txt'], unfinished: [], knownIssues: [], files: [],
    verification: index === 4 ? [] : [{ criterion: acceptance[0], status: 'not-run', evidence: 'Fixture has no automated check' }],
  } }
}

function milestoneTool(index, body) {
  if (index % 3 === 1) return { name: 'taskboard_read', input: {} }
  if (index % 3 !== 2) return
  const { version, milestone, workflow, acceptance } = taskToolResult(body, index - 1)
  const stage = index === 8 ? 2 : 1
  assert.equal(workflow.template, 'task.milestone.v1')
  assert.equal(milestone, stage)
  assert.deepEqual(acceptance, stage === 2 ? ['Publish notes', 'Synchronize the details'] : ['Prepare notes'])
  return { name: 'taskboard_submit_delivery', input: { expected_version: version, summary: 'Stage submission ' + index,
    changes: [], unfinished: [], knownIssues: [], files: [],
    verification: acceptance.map(criterion => ({ criterion, status: 'passed', evidence: 'Checked the staged fixture' })) } }
}

function browserRunTool(index, body) {
  if (reviewedRepair && index === 7) {
    assert.ok(body.includes(repairFeedback))
    return { name: 'read', input: { file_path: join(projectRoot, 'notes.txt') } }
  }
  if (reviewedRepair && index === 8) return { name: 'write', input: { file_path: join(projectRoot, 'notes.txt'), content: 'corrected browser work\n' } }
  if (reviewedRepair && index === 9) return { name: 'taskboard_read', input: {} }
  if (reviewedRepair && index === 10) {
    const { version, acceptance } = taskToolResult(body, 9)
    return { name: 'taskboard_submit_delivery', input: {
      expected_version: version, summary: 'Corrected the notes', changes: ['notes.txt'], files: [], unfinished: [], knownIssues: [],
      verification: [{ criterion: acceptance[0], status: 'passed', evidence: 'Corrected the content and submitted the project build' }],
    } }
  }
  if (index === 1) return interactionTool(index)
  if (index === 2) return { name: 'read', input: { file_path: join(projectRoot, 'notes.txt') } }
  if (index === 3) return { name: 'write', input: { file_path: join(projectRoot, 'notes.txt'), content: 'reviewed browser work\n' } }
  if (index === 4) return { name: 'taskboard_read', input: {} }
  if (index === 5) {
    const { version, acceptance, workflow } = taskToolResult(body, 4)
    assert.deepEqual(workflow, noModelReview ? { template: 'task.quick.v1' } : { template: 'task.standard.v1', steps: ['Read notes', 'Review changes'] })
    return { name: 'taskboard_submit_delivery', input: {
      expected_version: version, summary: 'Updated the notes', changes: ['notes.txt'], unfinished: [], knownIssues: [], files: [],
      verification: [{ criterion: acceptance[0], status: noModelReview ? 'passed' : 'not-run',
        evidence: noModelReview ? 'Read and updated notes.txt' : 'Fixture has no automated check' }],
    } }
  }
}

async function verifyPendingReview(body) {
  const { deliveryId } = JSON.parse(body.input.find(item => item.role === 'user').content[0].text)
  const [project] = await server.rpc('listProjects', {})
  const [task] = await server.rpc('listTasks', { projectId: project.id, includeArchived: false })
  const ids = { projectId: project.id, taskId: task.id, deliveryId }
  const { modelReviews: [attempt] } = await server.rpc('deliveryDetail', ids)
  assert.equal(attempt.state, 'requested')
  pendingReviewArchive = await server.rpc('exportBackup', {})
  const { commandId, snapshot, provider, model, language } = attempt
  const request = { ...ids, commandId, snapshot, provider, model, language }
  assert.deepEqual(await server.rpc('requestModelReview', { request }), attempt)
  await assert.rejects(server.rpc('requestModelReview', { request: { ...request, commandId: randomUUID() } }), /already requested/)
}

const model = createServer(async (request, response) => {
  let body = ''
  for await (const chunk of request) body += chunk
  const isReviewer = coverageReviewProbe && request.url === '/v1/responses'
  const requestIndex = isReviewer ? reviewRequests.push(JSON.parse(body)) : modelRequests.push(body)
  if (openaiDeployment || isReviewer) {
    if (isReviewer) {
      if (requestIndex === 1) await verifyPendingReview(JSON.parse(body))
      assert.equal(request.headers.authorization, 'Bearer review-fixture-key')
      assert.equal(JSON.parse(body).model, 'gpt-5.4-mini')
      assert.equal(JSON.parse(body).tools?.length ?? 0, 0)
      assert.doesNotMatch(body, /notes\.txt|criteria\.txt|Synchronize the details|reviewed browser work|web-taskboard-/)
    }
    openaiRequests.push({ path: request.url, model: JSON.parse(body).model,
      fixtureCredential: request.headers.authorization === 'Bearer taskboard-fixture-key' })
    if (!sdkPatchChange && requestIndex === 1) {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'Fixture credential rejected', type: 'invalid_request_error' } }))
      return
    }
    const text = isReviewer ? 'The project build exited with 17. Check the unverified criterion.' : 'Complete'
    const message = { type: 'message', id: 'msg_local', role: 'assistant', content: [{ type: 'output_text', text }] }
    const frames = [
      { type: 'response.created', response: { id: 'resp_local' } },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: message.id, role: message.role } },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text },
      { type: 'response.output_item.done', output_index: 0, item: message },
      { type: 'response.completed', response: { id: 'resp_local', status: 'completed', output: [message],
        usage: { input_tokens: 3, output_tokens: 1, total_tokens: 4 } } },
    ]
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    response.end(frames.map(frame => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''))
    return
  }
  if (parallel && requestIndex <= 2) {
    if (requestIndex === 2) bothModels.resolve()
    await dispatchRelease.promise
  }
  if (failedRetryProbe && modelRequests.length === 1) {
    response.writeHead(400, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { type: 'invalid_request_error', message: 'Deliberate fixture rejection' } }))
    return
  }
  if (dispatch) await dispatchRelease.promise
  const quoteShell = value => "'" + value.replaceAll("'", "'\\''") + "'"
  let prTool
  if (prDelivery && requestIndex === 1) {
    await promisify(execFile)('git', ['-C', projectRoot, 'merge', '--ff-only', publishedCommit])
    await promisify(execFile)(process.execPath, ['--test', 'scripts/taskboard/delivery-ci.test.mjs'], { cwd: projectRoot })
    prTool = { name: 'taskboard_read', input: {} }
  } else if (prDelivery && requestIndex === 2) {
    const { version, acceptance } = taskToolResult(body)
    prTool = { name: 'taskboard_submit_delivery', input: { expected_version: version, summary: 'Verify delivery commit and CI linkage',
      changes: ['GitHub Actions workflow, read-only receipt verifier and behavior tests'], files: [], unfinished: [],
      knownIssues: ['Hosted CI and human review are tracked independently'],
      verification: [{ criterion: acceptance[0], status: 'passed', evidence: 'node --test scripts/taskboard/delivery-ci.test.mjs passed on the delivered checkout' }] } }
  }
  const requestScopeTool = hostCrash ? JSON.stringify(JSON.parse(body).messages.at(-1)).includes(crashTaskGoal)
    : macosScope && requestIndex === 1
  let validationTool
  if (scriptScope && requestIndex === 1) validationTool = { name: 'taskboard_read', input: {} }
  if (scriptScope && requestIndex === 2) {
    const { version, acceptance } = taskToolResult(body)
    validationTool = { name: 'taskboard_submit_delivery', input: { expected_version: version, summary: 'Ready to validate',
      files: [], changes: [], unfinished: [], knownIssues: [],
      verification: [{ criterion: acceptance[0], status: 'passed', evidence: 'Reviewed the fixture' }] } }
  }
  const tool = milestoneProbe ? milestoneTool(requestIndex, body) : scriptScope ? validationTool : prDelivery ? prTool : parallel ? parallelTool(body) : browserRunProbe ? browserRunTool(modelRequests.length, body)
    : interactionProbe ? interactionTool(modelRequests.length) : taskToolsProbe ? scopedTaskTool(modelRequests.length, body)
    : deliveryProbe ? deliveryTool(modelRequests.length, body) : requestScopeTool ? {
    name: 'bash', input: { command: [process.execPath, scopeToolPath].map(quoteShell).join(' '), description: 'Keep the fixture child alive' },
  } : undefined
  const frames = [
    { type: 'message_start', message: { id: 'dispatch-fixture', model: 'deepseek-v4-pro', usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: tool
      ? { type: 'tool_use', id: `taskboard-${requestIndex}`, name: tool.name, input: {} } : { type: 'text', text: 'Accepted' } },
    ...tool ? [{ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } }] : [],
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.end(frames.map(frame => `event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''))
})
async function writeExecutionPatch(modelEndpoint, patches = [], testPlugin) {
  const overlay = [{
    id: 'taskboard-controller',
    config: { worktreeRoot: join(root, 'worktrees'), ...(parallel ? { maxParallelRuns: 2 } : {}), ...(forceTimeout ? { stopTimeoutMs: 1_200 } : {}), execution: {
      reference: 'fixture', sessionRoot: join(root, 'sessions'), provider: 'deepseek-official', model: 'deepseek-v4-pro',
      dispatch: modelEndpoint !== undefined,
      ...(native && { nativeExecutors: { [nativeExecutor]: native.overlay } }),
      patches,
      ...(lostReceipt ? { requestTimeoutMs: 1_000 } : {}),
      ...(modelEndpoint ? { env: { DEEPSEEK_API_KEY: 'local-fixture', DEEPSEEK_BASE_URL: modelEndpoint, DSH_TELEMETRY_DISABLED: '1' } } : {}),
    } },
  }]
  if (coverageReviewProbe) {
    overlay[0].config.review = { provider: 'openai', model: 'gpt-5.4-mini', maxAttempts: 2, timeoutMs: 15000, maxOutputTokens: 256 }
    overlay.push({ id: 'llm-pi-ai', config: { providers: { openai: {
      apiKeyEnv: 'TASKBOARD_REVIEW_TEST_KEY', baseURL: `http://127.0.0.1:${model.address().port}/v1`,
    } } } })
  }
  if (testPlugin) {
    const filename = testPlugin + '.mjs'
    await copyFile(new URL('./' + filename, import.meta.url), join(root, filename))
    overlay.push({ insert: [{
      id: testPlugin, name: './' + filename, config: { marker: faultMarker },
    }] })
  }
  await writeFile(executionPatch, JSON.stringify(overlay))
}

async function lossOfSdkReplyPatch() {
  const filename = 'taskboard-drop-sdk-ack.mjs'
  await copyFile(new URL('./' + filename, import.meta.url), join(root, filename))
  const patch = join(root, 'drop-sdk-ack.yml')
  await writeFile(patch, JSON.stringify([{ insert: [{
    id: 'taskboard-drop-sdk-ack', name: './' + filename, config: { marker: faultMarker },
  }] }]))
  return patch
}

async function withholdSdkPromptPatch() {
  const filename = 'taskboard-withhold-prompt.mjs'
  await copyFile(new URL('./' + filename, import.meta.url), join(root, filename))
  const patch = join(root, 'withhold-sdk-prompt.yml')
  await writeFile(patch, JSON.stringify([{ insert: [{
    id: 'taskboard-withhold-prompt', name: './' + filename, config: { arm: join(root, 'withhold-prompt'), marker: faultMarker },
  }] }]))
  return patch
}

async function interactionPatch() {
  const filename = 'taskboard-interaction-approval.mjs'
  await copyFile(new URL('./' + filename, import.meta.url), join(root, filename))
  const patch = join(root, 'interactions.yml')
  await writeFile(patch, JSON.stringify([{ insert: [
    { id: 'taskboard-interaction-approval', name: './' + filename },
  ] }]))
  return patch
}

async function disconnectPatch() {
  const filename = 'taskboard-disconnect-sdk.mjs'
  await copyFile(new URL('./' + filename, import.meta.url), join(root, filename))
  const patch = join(root, 'disconnect-sdk.yml')
  await writeFile(patch, JSON.stringify([{ insert: [{ id: 'taskboard-disconnect-sdk', name: './' + filename }] }]))
  return patch
}

async function verifyReviewRequests(attempts, expectedSummary) {
  const { Context } = await import('@deepseek-ai/cordis')
  const { default: JsonlSessionPersistence } = await import('@deepseek-ai/dsh-session-persistence-jsonl')
  const ctx = new Context()
  try {
    await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'home', 'sessions') })
    for (const [index, attempt] of attempts.entries()) {
      const reader = await ctx.sessionPersistence.open(attempt.sessionId, 'read')
      try {
        const { events } = await reader.read(0)
        assert.deepEqual(events.map(event => event.type), ['taskboard/review-request'])
        const { data } = events[0]
        if (index === 1) {
          const saved = structuredClone(data)
          const content = JSON.parse(saved.messages[0].content[0].text)
          saved.commandId = '{{command:1}}'
          saved.deliveryId = content.deliveryId = '{{delivery:1}}'
          saved.snapshot = content.snapshot = '{{snapshot:1}}'
          saved.messages[0].id = '{{message:1}}'
          saved.messages[0].content[0].text = JSON.stringify(content, null, 2)
          const header = { type: 'session', ...reader.header, id: '{{session:1}}', createdAt: 0 }
          const snapshot = [header, { type: events[0].type, data: saved }].map(item => JSON.stringify(item)).join('\n') + '\n'
          const fixture = new URL('../../../../snapshots/web/taskboard-coverage-review/session.v4.jsonl', import.meta.url)
          assert.equal(snapshot, await readFile(fixture, 'utf8'))
        }
        const body = reviewRequests[index]
        const input = body.input.find(item => item.role === 'user')
        assert.deepEqual(JSON.parse(input.content[0].text), JSON.parse(expectedSummary))
        assert.deepEqual(data.messages.map(message => message.content), [[{ type: 'text', text: input.content[0].text }]])
        assert.equal(body.instructions ?? body.input.find(item => item.role === 'developer')?.content, data.system)
        assert.deepEqual([data.commandId, data.deliveryId, data.snapshot, data.provider, data.model, data.intent, data.maxTokens],
          [attempt.commandId, attempt.deliveryId, attempt.snapshot, 'openai', body.model, 'review', body.max_output_tokens])
      } finally { await reader.close() }
    }
  } finally { await ctx.fiber.dispose() }
}

async function verifyRestoredScriptCheck() {
  const archive = await server.rpc('exportBackup', {})
  const document = JSON.parse(archive)
  const [delivery] = document.payload.deliveries
  const ids = { projectId: delivery.projectId, taskId: delivery.taskId, deliveryId: delivery.id }
  const before = await server.rpc('deliveryDetail', ids)
  if (coverageReviewProbe) {
    assert.deepEqual(before.modelReviews.map(attempt => attempt.state), ['failed', 'completed'])
    const attempt = before.modelReviews[1]
    const { commandId, snapshot, language, provider, model } = attempt
    const request = { ...ids, commandId, snapshot, language, provider, model }
    assert.deepEqual(await server.rpc('requestModelReview', { request }), attempt)
    await assert.rejects(server.rpc('requestModelReview', { request: { ...request, language: 'zh' } }), /identity reused/)
    await assert.rejects(server.rpc('requestModelReview', { request: { ...request, commandId: randomUUID(), model: 'unknown' } }), /route changed/)
    await assert.rejects(server.rpc('requestModelReview', { request: { ...request, commandId: randomUUID() } }), /limit reached/)
    assert.equal(reviewRequests.length, 2)
    const summary = await server.rpc('exportReviewPackage', ids)
    await verifyReviewRequests(before.modelReviews, summary)
  }
  const script = delivery.code.projectScriptCheck.script
  const differentScript = customScript ? { ...customScript, manager: customManager === 'pnpm' ? 'npm' : 'pnpm' } : script === 'build' ? 'test' : 'build'
  const command = await createStartRequest(server.rpc, ids.projectId, await server.rpc('inspectProject', { projectId: ids.projectId }), 'Verify script consent')
  await assert.rejects(server.rpc('startRun', { request: command }), /project script differs/)
  await assert.rejects(server.rpc('startRun', { request: { ...command, confirmedScript: differentScript } }), /project script differs/)
  assert.deepEqual((await server.rpc('detail', { projectId: ids.projectId, taskId: command.taskId })).runs, [])
  await server.stop()
  server = await boot(true, join(root, 'script-restored-home'))
  const restore = doc => server.rpc('restoreBackup', { archive: encodeBackup(doc) })
  if (coverageReviewProbe) {
    const altered = structuredClone(document)
    const attempts = altered.payload.tasks.find(entry => entry.task.id === ids.taskId).modelReviews
    attempts.push(attempts[0])
    await assert.rejects(restore(altered), /unbound model review/)
  }
  const changed = structuredClone(document)
  changed.payload.projects[0].project.projectScript = differentScript
  await assert.rejects(restore(changed), /inconsistent project script authorization/)
  const missing = structuredClone(document)
  delete missing.payload.deliveries[0].code.projectScriptCheck
  await assert.rejects(restore(missing), /inconsistent project script evidence/)
  assert.deepEqual(await server.rpc('listProjects', {}), [])
  await server.rpc('restoreBackup', { archive })
  assert.deepEqual(await server.rpc('deliveryDetail', ids), before)
  const { task, reviews } = await server.rpc('detail', { projectId: ids.projectId, taskId: ids.taskId })
  assert.equal(task.status, 'done')
  assert.equal(reviews.length, 1)
  assert.equal(reviews[0].verdict, 'accept')
}

async function verifyUnconfirmedReviewRecovery() {
  await server.stop()
  server = await boot(true, join(root, 'unconfirmed-review-home'))
  await server.rpc('restoreBackup', { archive: pendingReviewArchive })
  const [entry] = JSON.parse(pendingReviewArchive).payload.tasks
  const [saved] = entry.modelReviews
  const { projectId, taskId, deliveryId, commandId, snapshot, provider, model, language } = saved
  const ids = { projectId, taskId, deliveryId }
  const request = { ...ids, commandId, snapshot, provider, model, language }
  assert.equal((await server.rpc('deliveryDetail', ids)).modelReviewStatus, 'requested')
  assert.deepEqual(await server.rpc('requestModelReview', { request }), saved)
  assert.equal(reviewRequests.length, 2)
  await delay(Math.max(0, Date.parse(saved.expiresAt) - Date.now() + 1))
  const completed = await server.rpc('requestModelReview', { request: { ...request, commandId: randomUUID() } })
  assert.equal(completed.state, 'completed')
  const after = await server.rpc('deliveryDetail', ids)
  assert.deepEqual(after.modelReviews, [saved, completed])
  const task = await server.rpc('detail', { projectId, taskId })
  assert.equal(task.task.status, 'in_review')
  assert.equal(task.reviews.length, 0)
  assert.equal(reviewRequests.length, 3)
  if (reviewedRepair) {
    const identity = { projectId, taskId }
    const [original] = task.deliveries
    const decision = { ...ids, revision: original.revision, snapshot, expectedVersion: task.task.version, deliveryVersion: original.version,
      commandId: randomUUID(), verdict: 'return', waivers: [], feedback: repairFeedback }
    for (const assessmentId of [saved.commandId, randomUUID()]) {
      await assert.rejects(server.rpc('reviewDelivery', { request: { ...decision, assessmentId } }), /requires a completed assessment/)
    }
    const { verifyReviewedRepair } = await import('./taskboard-browser.mjs')
    await verifyReviewedRepair(server.url, server.cookie, repairFeedback, async () => {
      const returned = await server.rpc('detail', identity)
      assert.equal(returned.reviews[0].assessmentId, completed.commandId)
      assert.equal(returned.reviews[0].feedback, repairFeedback)
      assert.equal(returned.runs.length, 1)
      assert.equal(modelRequests.length, 6)
    })
    const accepted = await server.rpc('detail', identity)
    assert.deepEqual(accepted.reviews.map(item => item.verdict), ['return', 'accept'])
    assert.equal(accepted.deliveries.length, 2)
    assert.equal(accepted.runs[1].previousRun, accepted.runs[0].runId)
    const input = await server.rpc('runInput', { ...identity, runId: accepted.runs[1].runId })
    assert.equal(input.reviewFeedback, repairFeedback)
    assert.equal(accepted.task.status, 'done')
    assert.equal(reviewRequests.length, 3)
    const archive = await server.rpc('exportBackup', {})
    await server.stop()
    server = await boot(true, join(root, 'repair-history'))
    const invalid = JSON.parse(archive)
    invalid.payload.reviews.find(item => item.verdict === 'return').assessmentId = saved.commandId
    await assert.rejects(server.rpc('restoreBackup', { archive: encodeBackup(invalid) }), /requires a completed assessment/)
    await server.rpc('restoreBackup', { archive })
    assert.deepEqual((await server.rpc('detail', identity)).reviews, accepted.reviews)
  }
}

async function createProjectBaseline() {
  const globalConfig = join(root, 'git-global.cfg')
  await writeFile(globalConfig, '')
  const git = async (...args) => promisify(execFile)('git', args, {
    cwd: projectRoot, env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: globalConfig },
  })
  await git('init', '-b', 'main')
  if (deliveryProbe || browserRunProbe || nativeFileAccess) {
    await writeFile(join(projectRoot, 'notes.txt'), 'baseline\n')
    await git('add', 'notes.txt')
    if (browserRunProbe) {
      await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ private: true, scripts: { test: 'node check.mjs', build: 'node check.mjs build',
        ...(customScript && { [customScript.name]: noModelReview ? 'node check.mjs' : 'node check.mjs build' }) } }))
      await writeFile(join(projectRoot, 'check.mjs'), [
        "import { readFileSync } from 'node:fs'",
        "const contents = readFileSync('notes.txt', 'utf8').trim()",
        "process.exitCode = process.argv[2] === 'build' ? (contents === 'corrected browser work' ? 0 : 17) : (contents === 'reviewed browser work' ? 0 : 9)",
      ].join('\n'))
      await git('add', 'check.mjs', 'package.json')
    }
  }
  await git('-c', 'user.name=Taskboard fixture', '-c', 'user.email=fixture@localhost', 'commit', '--allow-empty', '--no-gpg-sign', '-m', 'Fixture baseline')
}

try {
  if (picker !== pickerSource) await copyFile(pickerSource, picker)
  if (parallel || resume || deliveryProbe || browserRunProbe || milestoneProbe || nativeExecutor) await createProjectBaseline()
  if (scriptScope) await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ private: true, scripts: { test: 'node taskboard-scope-tool.mjs' } }))
  if (macosScope) await copyFile(new URL('./taskboard-mac-scope-tool.mjs', import.meta.url), scopeToolPath)
  const sdkPatches = lostReceipt || hostCrashLostReceipt ? [await lossOfSdkReplyPatch()]
    : hostCrashBeforeReceipt ? [await withholdSdkPromptPatch()] : []
  if (parallel || denied || resume || macosScope || hostCrashBeforeReceipt || interactionProbe || disconnectProbe
    || nativeExecutor || milestoneProbe || taskToolsProbe || deliveryProbe || browserRunProbe || failedRetryProbe || prDelivery) {
    const invalid = join(root, 'invalid-approval.yml')
    if (denied) await writeFile(invalid, '- id: approval\n  config:\n    policy: invalid-test-policy\n')
    await once(model.listen(0, '127.0.0.1'), 'listening')
    const scopeFixture = resume && process.platform !== 'darwin' ? 'taskboard-text-only-scope' : undefined
    const patches = denied ? [invalid] : interactionProbe || browserRunProbe ? [await interactionPatch()] : disconnectProbe ? [await disconnectPatch()] : sdkPatches
    if (nativeExecutor) native = await (await import('./taskboard-native.mjs')).nativeFixture(nativeExecutor, root, installedCliIndex !== -1, nativeFileAccess, nativeFileWorkspace?.promise)
    await writeExecutionPatch(`http://127.0.0.1:${model.address().port}`, patches, scopeFixture)
  } else if (openaiDeployment) {
    await once(model.listen(0, '127.0.0.1'), 'listening')
    const readme = await readFile(new URL('../../../../packages/api/taskboard-controller/README.md', import.meta.url), 'utf8')
    const section = readme.split('### Use OpenAI for Taskboard Runs')[1].split('### ')[0]
    const patches = [...section.matchAll(/^```yaml\n([\s\S]+?)\n```/gm)].map(match => match[1])
    assert.equal(patches.length, 2)
    const sdkPatch = join(root, 'openai-sdk.yml')
    const keyReference = 'apiKeyEnv: OPENAI_API_KEY'
    assert.ok(patches[0].includes(keyReference))
    await writeFile(sdkPatch, patches[0].replace(keyReference, `${keyReference}\n        baseURL: http://127.0.0.1:${model.address().port}/v1`))
    const webPatch = patches[1].replace('/absolute/private/taskboard-sessions', JSON.stringify(join(root, 'sessions')))
      .replace('/absolute/private/taskboard-openai-sdk.yml', JSON.stringify(sdkPatch))
    await writeFile(executionPatch, sdkPatchChange ? webPatch.replace('dispatch: true', 'dispatch: false') : webPatch)
  } else if (deploymentProbe) {
    const readme = new URL('../../../../packages/api/taskboard-controller/README.md', import.meta.url)
    const yaml = (await readFile(readme, 'utf8')).match(/^```yaml\n([-] id: taskboard-controller[\s\S]+?)\n```/m)?.[1]
    assert.ok(yaml, 'deployment guide contains the actual Taskboard patch')
    await writeFile(executionPatch, yaml.replace('/absolute/private/taskboard-sessions', JSON.stringify(join(root, 'sessions'))) + '\n')
  } else {
    await writeExecutionPatch(undefined, sdkPatches)
  }
  const deploymentEnvironment = openaiDeployment ? { OPENAI_API_KEY: 'taskboard-fixture-key' }
    : deploymentProbe ? { DEEPSEEK_API_KEY: 'deployment-fixture' } : {}
  server = await boot(!previousCli, undefined, deploymentEnvironment, previousCli ?? cli)
  if (previousCli) {
    console.log(JSON.stringify(await verifyUpgrade(previousCli)))
  } else if (prDelivery) {
    const projectId = randomUUID(), taskId = randomUUID()
    await server.rpc('createProject', { request: { commandId: randomUUID(), expectedVersion: 0,
      project: { id: projectId, title: 'TBOARD-11 PR and CI', root: projectRoot } } })
    const confirmation = await server.rpc('inspectProject', { projectId })
    assert.equal(confirmation.dirty, false)
    await server.rpc('createTask', { request: { projectId, taskId, commandId: randomUUID(), expectedVersion: 0, requirements: {
      title: 'Verify commit and workflow evidence', description: 'Review the exact commit, hosted CI result and sealed delivery before accepting.',
      acceptance: ['The receipt verifier passes its behavior tests on the delivered commit'], labels: [], priority: 'normal',
    } } })
    await server.rpc('planTask', { request: { projectId, taskId, commandId: randomUUID(), expectedVersion: 1 } })
    await server.rpc('startRun', { request: { projectId, taskId, commandId: randomUUID(), expectedVersion: 2,
      confirmation, previousRun: null, materials: [] } })
    await pollRun(server.rpc, projectId, taskId, run => run.state === 'finished')
    const after = await server.rpc('detail', { projectId, taskId })
    assert.equal(after.task.status, 'in_review')
    assert.equal(after.reviews.length, 0)
    const deliveryId = after.deliveries[0].id
    const delivery = await server.rpc('deliveryDetail', { projectId, taskId, deliveryId })
    assert.equal(delivery.code.head, publishedCommit)
    assert.ok(delivery.code.files.some(file => file.path === 'scripts/taskboard/delivery-ci.mjs'))
    await writeFile(join(root, 'handoff.json'), await server.rpc('exportHandoff', { projectId }), { mode: 0o600 })
    await writeExecutionPatch(undefined)
    console.log(JSON.stringify({ root, projectId, taskId, deliveryId, commit: publishedCommit, snapshot: delivery.snapshot,
      taskStatus: after.task.status, reviews: after.reviews.length }))
  } else if (addReceipt) {
    const receipt = JSON.parse(await readFile(join(root, 'ci-receipt.json'), 'utf8'))
    const { projectId, taskId, deliveryId } = receipt
    const detail = await server.rpc('detail', { projectId, taskId })
    const delivery = await server.rpc('deliveryDetail', { projectId, taskId, deliveryId })
    assert.equal(delivery.code.head, receipt.commit)
    assert.equal(delivery.snapshot, receipt.snapshot)
    const text = ['Delivery ' + deliveryId, receipt.pullRequest,
      'https://github.com/' + receipt.repository + '/commit/' + receipt.commit,
      receipt.ci.workflow + ' (' + receipt.ci.conclusion + ')', receipt.ci.url].filter(Boolean).join(' · ')
    if (!detail.activity.some(entry => entry.comment === text)) {
      await server.rpc('comment', { request: { projectId, taskId, commandId: randomUUID(), expectedVersion: detail.task.version, text } })
    }
    const after = await server.rpc('detail', { projectId, taskId })
    assert.ok(after.activity.some(entry => entry.comment === text))
    assert.deepEqual(after.reviews, detail.reviews)
    assert.equal(after.task.status, detail.task.status)
    await writeFile(join(root, 'handoff.json'), await server.rpc('exportHandoff', { projectId }), { mode: 0o600 })
    console.log(JSON.stringify({ taskStatus: after.task.status, reviews: after.reviews.length, ciRecorded: true }))
  } else if (process.argv.includes('--team-import')) {
    const path = process.argv[process.argv.indexOf('--team-import') + 1]
    assert.ok(path && !path.startsWith('--'), 'provide the source team fixture backup')
    console.log(JSON.stringify(await receiveTeamFixture(path)))
  } else if (nativeFileAccess && nativeExecutor) {
    const projectId = randomUUID(), taskId = randomUUID()
    const ids = { projectId, taskId }
    const title = 'Native file evidence', projectTitle = 'Native file project'
    await server.rpc('createProject', { request: { commandId: randomUUID(), expectedVersion: 0,
      project: { id: projectId, title: projectTitle, root: projectRoot } } })
    await server.rpc('createTask', { request: { ...ids, commandId: randomUUID(), expectedVersion: 0, requirements: {
      title, description: 'Use the native file tool to replace notes.txt with the line native edit. Report the actual outcome.',
      acceptance: ['Update notes.txt'], priority: 'normal', labels: [],
    } } })
    await server.rpc('planTask', { request: { ...ids, commandId: randomUUID(), expectedVersion: 1 } })
    const { provider, model: configuredModel } = await server.rpc('executionRoute', { projectId })
    const { runId } = await server.rpc('startRun', { request: { ...ids, commandId: randomUUID(), expectedVersion: 2, confirmation: null,
      previousRun: null, materials: [], confirmedRoute: { provider, model: configuredModel }, nativeExecutor } })
    const spec = await server.rpc('runTaskSpec', { ...ids, runId })
    nativeFileWorkspace.resolve(spec.workspace.directory)
    const run = await pollRun(server.rpc, projectId, taskId, item => ['finished', 'failed', 'interrupted'].includes(item.state))
    assert.equal(run.state, 'finished', JSON.stringify(run.endReason))
    assert.equal(run.authorization.executor, nativeExecutor)
    native.confirmFileResult()
    const expectedActivity = nativeExecutor === 'codex'
      ? { write: { command: 1, completed: 1 }, deny: {} }
      : { write: { otherTool: 1, allowed: 1, completed: 1 }, deny: { otherTool: 1, denied: 1, failed: 1 } }
    assert.deepEqual(run.nativeActivity, expectedActivity[nativeFileAccess])
    const archive = JSON.parse(await server.rpc('exportBackup', {}))
    assert.deepEqual(archive.payload.runs.find(row => row.admission.runId === runId).nativeActivity, run.nativeActivity)
    const handoff = JSON.parse(await server.rpc('exportHandoff', { projectId }))
    assert.deepEqual(handoff.runs.find(row => row.runId === runId).nativeActivity, run.nativeActivity)
    await server.stop()
    server = await boot(true)
    const recovered = await server.rpc('detail', ids)
    assert.deepEqual(recovered.runs.find(row => row.runId === runId).nativeActivity, run.nativeActivity)
    const written = nativeFileAccess === 'write'
    assert.notEqual(await realpath(run.workspace), await realpath(projectRoot))
    assert.equal(await readFile(join(run.workspace, 'notes.txt'), 'utf8'), written ? 'native edit\n' : 'baseline\n')
    assert.equal(await readFile(join(projectRoot, 'notes.txt'), 'utf8'), 'baseline\n')
    const detail = await server.rpc('detail', ids)
    assert.equal(detail.task.status, 'in_review')
    assert.equal(detail.reviews.length, 0)
    assert.equal(detail.deliveries.length, 1)
    const [submission] = detail.deliveries
    assert.equal(submission.runId, runId)
    const target = { ...ids, deliveryId: submission.id }
    const delivery = await server.rpc('deliveryDetail', target)
    assert.equal(delivery.code.fingerprint, submission.snapshot)
    assert.equal(delivery.verification[0].status, written ? 'passed' : 'failed')
    assert.deepEqual(delivery.code.files, written ? [{ path: 'notes.txt', status: 'modified' }] : [])
    let patch
    if (written) {
      const diff = await server.rpc('deliveryDiff', { ...target, path: 'notes.txt' })
      assert.equal(diff.kind, 'patch')
      assert.match(diff.text, /-baseline\n\+native edit/)
      patch = diff.text
    }
    const { inspectNativeFileReview } = await import('./taskboard-browser.mjs')
    await inspectNativeFileReview(server.url, server.cookie, projectTitle, title, submission.summary, patch, run.nativeActivity)
    assert.equal((await server.rpc('detail', ids)).reviews.length, 0)
    assert.equal(modelRequests.length, 0)
    await server.stop()
    server = await boot(true, join(root, 'restored-native-file'))
    const foreign = structuredClone(archive)
    foreign.payload.runs[0].admission.authorization.executor = 'dsh-sdk'
    await assert.rejects(server.rpc('restoreBackup', { archive: encodeBackup(foreign) }), /invalid native activity owner/)
    await server.rpc('restoreBackup', { archive: JSON.stringify(archive) })
    const restored = await server.rpc('detail', ids)
    assert.deepEqual(restored.runs.find(row => row.runId === runId).nativeActivity, run.nativeActivity)
    assert.equal(restored.task.status, 'in_review')
    assert.deepEqual(restored.reviews, [])
    if (nativeExecutor === 'codex' && nativeFileAccess === 'deny') {
      delete archive.payload.runs[0].nativeActivity
      await server.stop()
      server = await boot(true, join(root, 'legacy-native-file'))
      await server.rpc('restoreBackup', { archive: encodeBackup(archive) })
      const legacy = await server.rpc('detail', ids)
      assert.equal(Object.hasOwn(legacy.runs[0], 'nativeActivity'), false)
      assert.equal(legacy.task.status, 'in_review')
    }
    console.log(JSON.stringify({ executor: nativeExecutor, fileAccess: nativeFileAccess, nativeActivity: run.nativeActivity, changedFiles: delivery.code.files.length, pendingHumanReview: true }))
  } else if (nativeExecutor) {
    const { queueNativeRun } = await import('./taskboard-browser.mjs')
    await queueNativeRun(server.url, server.cookie, await realpath(projectRoot), nativeExecutor === 'codex' ? 'Codex' : 'Codely')
    const [project] = await server.rpc('listProjects', {})
    const projectId = project.id
    const [task] = await server.rpc('listTasks', { projectId, includeArchived: false })
    const ids = { projectId, taskId: task.id }
    const settled = run => ['finished', 'interrupted', 'failed'].includes(run.state)
    await pollRun(server.rpc, projectId, task.id, settled)
    const detail = await server.rpc('detail', ids)
    const { nativeSession } = await import('./taskboard-native.mjs')
    const transcript = await nativeSession(root, detail.runs[0].sessionId)
    assert.equal(detail.runs[0].state, 'finished', JSON.stringify(transcript.at(-1)?.data))
    const recording = new URL('../../../../snapshots/sdk/taskboard-native-executor/session.v4.jsonl', import.meta.url)
    assert.deepEqual(transcript, (await readFile(recording, 'utf8')).trim().split('\n').map(line => JSON.parse(line)))
    assert.equal(detail.task.status, 'in_review')
    assert.equal(detail.reviews.length, 0)
    const { executor } = detail.runs[0].authorization
    assert.equal(executor, nativeExecutor)
    const confirmation = await server.rpc('inspectProject', { projectId })
    const next = await createStartRequest(server.rpc, projectId, confirmation, 'Malformed native report')
    const { provider, model: modelName } = await server.rpc('executionRoute', { projectId })
    const request = { ...next, confirmedRoute: { provider, model: modelName }, nativeExecutor }
    await assert.rejects(server.rpc('startRun', { request: { ...request, nativeExecutor: executor === 'codex' ? 'codely' : 'codex' } }), /unavailable/)
    await assert.rejects(server.rpc('startRun', { request: { ...request, mode: 'resume' } }), /fresh Run/)
    const held = await createStartRequest(server.rpc, projectId, confirmation, 'Wait until the operator stops this run')
    const heldIds = { projectId, taskId: held.taskId }
    const active = await server.rpc('startRun', { request: { ...held, nativeExecutor, confirmedRoute: request.confirmedRoute } })
    await native.waitForHeldRequest()
    const receipt = await server.rpc('startRun', { request })
    const waiting = await server.rpc('detail', { projectId, taskId: next.taskId })
    assert.equal(waiting.runs[0].state, 'queued')
    await assert.rejects(server.rpc('startRun', { request: { ...request, nativeExecutor: undefined } }), /different input/)
    const running = await server.rpc('detail', heldIds)
    await server.rpc('stopRun', { request: { ...heldIds, commandId: randomUUID(), expectedVersion: running.task.version, runId: active.runId, force: false } })
    await pollRun(server.rpc, projectId, held.taskId, run => run.state === 'interrupted')
    assert.deepEqual(await server.rpc('startRun', { request }), receipt)
    await pollRun(server.rpc, projectId, next.taskId, settled)
    const failed = await server.rpc('detail', { projectId, taskId: next.taskId })
    assert.equal(failed.runs[0].state, 'failed')
    assert.deepEqual(failed.runs[0].nativeActivity, {})
    assert.equal(failed.deliveries.length, 0)
    native.confirmRequests()
    assert.equal(modelRequests.length, 0)
    if (nativeExecutor === 'codely') {
      const overlay = JSON.parse(await readFile(native.overlay, 'utf8'))
      overlay[0].insert[0].config.cwd = root
      await writeFile(native.overlay, JSON.stringify(overlay))
      const redirected = await createStartRequest(server.rpc, projectId, confirmation, 'Refuse the ACP directory override')
      await server.rpc('startRun', { request: { ...redirected, nativeExecutor, confirmedRoute: request.confirmedRoute } })
      const rejected = await pollRun(server.rpc, projectId, redirected.taskId, settled)
      assert.equal(rejected.state, 'failed')
      const log = await nativeSession(root, rejected.sessionId)
      assert.match(log.at(-1).data.reason.error.message, /uses the Run workspace/)
      native.confirmRequests()
    }
    await writeFile(native.overlay, '[]\n')
    const missing = await createStartRequest(server.rpc, projectId, confirmation, 'Missing native adapter')
    await server.rpc('startRun', { request: { ...missing, nativeExecutor, confirmedRoute: request.confirmedRoute } })
    const unavailable = await pollRun(server.rpc, projectId, missing.taskId, settled)
    assert.equal(unavailable.state, 'failed')
    assert.equal(modelRequests.length, 0)
    const archive = await server.rpc('exportBackup', {})
    await server.stop()
    server = await boot(true, join(root, 'native-restored'))
    const tampered = JSON.parse(archive)
    tampered.payload.runs[0].admission.authorization.executor = executor === 'codex' ? 'codely' : 'codex'
    await assert.rejects(server.rpc('restoreBackup', { archive: encodeBackup(tampered) }), /inconsistent Run authorization/)
    await server.rpc('restoreBackup', { archive })
    const restored = await server.rpc('detail', ids)
    assert.equal(restored.task.status, 'in_review')
    assert.deepEqual(restored.runs[0].authorization, detail.runs[0].authorization)
    const continuation = { ...ids, previousRun: restored.runs[0].runId, expectedVersion: restored.task.version,
      mode: 'resume', confirmation, confirmedRoute: restored.runs[0].route, materials: [] }
    for (const selection of [{ nativeExecutor }, {}]) {
      await assert.rejects(server.rpc('startRun', { request: { ...continuation, ...selection, commandId: randomUUID() } }), /native executors require a fresh Run/)
    }
    assert.deepEqual(await server.rpc('detail', ids), restored)
    assert.equal(modelRequests.length, 0)
    native.confirmRequests()
    console.log(JSON.stringify({ executor, pendingHumanReview: true, invalidDeliveryRejected: true, stoppedAndContinuedQueue: true, missingAdapterRejected: true, restored: true, sdkModelRequests: 0 }))
  } else if (milestoneProbe) {
    const { verifyMilestonePlan } = await import('./taskboard-browser.mjs')
    let intermediate
    await verifyMilestonePlan(server.url, server.cookie, await realpath(projectRoot), async () => {
      intermediate = await server.rpc('exportBackup', {})
    })
    const [project] = await server.rpc('listProjects', {})
    const [task] = await server.rpc('listTasks', { projectId: project.id, includeArchived: false })
    const ids = { projectId: project.id, taskId: task.id }
    const before = await server.rpc('detail', ids)
    assert.equal(before.task.status, 'done')
    assert.deepEqual(before.reviews.map(review => review.verdict), ['return', 'accept', 'accept'])
    assert.equal(modelRequests.length, 9)
    const archive = await server.rpc('exportBackup', {})
    await server.stop()
    server = await boot(true)
    assert.deepEqual(await server.rpc('detail', ids), before)
    await server.stop()
    server = await boot(true, join(root, 'milestone-restored'))
    const tampered = JSON.parse(archive)
    const first = tampered.payload.runs.find(run => run.admission.runId === before.runs[0].runId)
    first.input.milestone = 2
    first.input.acceptance = ['Publish notes', 'Synchronize the details']
    const firstDelivery = tampered.payload.deliveries.find(delivery => delivery.runId === first.admission.runId)
    firstDelivery.verification = first.input.acceptance.map(criterion => ({ ...firstDelivery.verification[0], criterion }))
    await assert.rejects(server.rpc('restoreBackup', { archive: encodeBackup(tampered) }), /milestone differs from human acceptance history/)
    const premature = JSON.parse(intermediate)
    premature.payload.tasks[0].task.status = 'done'
    await assert.rejects(server.rpc('restoreBackup', { archive: encodeBackup(premature) }), /milestone acceptance/)
    await server.rpc('restoreBackup', { archive })
    assert.deepEqual(await server.rpc('detail', ids), { ...before, runs: before.runs.map(run => ({ ...run, sessionNotIncluded: true })) })
    const stages = []
    for (const { runId } of before.runs) {
      const input = await server.rpc('runInput', { ...ids, runId })
      stages.push(input.milestone)
    }
    assert.deepEqual(stages, [1, 1, 2])
    await server.rpc('reopenTask', { request: { ...ids, commandId: randomUUID(), expectedVersion: before.task.version } })
    assert.equal((await server.rpc('detail', ids)).nextMilestone, 1)
    await server.stop()
    server = await boot(true, join(root, 'intermediate-restored'))
    await server.rpc('restoreBackup', { archive: intermediate })
    const pending = await server.rpc('detail', ids)
    assert.equal(pending.nextMilestone, 2)
    assert.equal(pending.task.status, 'todo')
    const { title, description, priority, acceptance, labels, workflow } = pending.task
    await server.rpc('editTask', { request: { ...ids, expectedVersion: pending.task.version, commandId: randomUUID(),
      requirements: { title, priority, acceptance, labels, workflow, description: description + ' and cover the revised plan' } } })
    assert.equal((await server.rpc('detail', ids)).nextMilestone, 1)
    console.log(JSON.stringify({ stages, decisions: before.reviews.map(review => review.verdict), restored: true }))
  } else if (browserProbe || browserRunProbe) {
    const { verifyTaskboardPage, verifyTaskboardRunPage } = await import('./taskboard-browser.mjs')
    const verify = browserRunProbe ? verifyTaskboardRunPage : verifyTaskboardPage
    const result = await verify(server.url, server.cookie, await realpath(projectRoot), noModelReview, coverageReviewProbe, customScript)
    if (browserRunProbe) {
      await verifyRestoredScriptCheck()
      if (coverageReviewProbe) await verifyUnconfirmedReviewRecovery()
      assert.equal(modelRequests.length, reviewedRepair ? 11 : 6, 'all executor requests belong to explicitly started Runs')
    }
    console.log(JSON.stringify(reviewedRepair ? { returned: true, explicitRepairRuns: 1, buildExitCode: 0, operatorAccepted: true } : result))
  } else {
  const projectId = randomUUID(), taskId = randomUUID()
  await server.rpc('createProject', { request: { commandId: randomUUID(), expectedVersion: 0, project: { id: projectId, title: 'SDK review', root: projectRoot, ...(deliveryProbe && { checkTrackedDiff: true }), ...(scriptScope && { projectScript: 'test' }) } } })
  const inspected = await server.rpc('inspectProject', { projectId })
  assert.equal(inspected.directory, await realpath(projectRoot))
  assert.equal(inspected.repository, parallel || resume || deliveryProbe ? inspected.directory : null)
  if (process.argv.includes('--activity-cursor')) {
    console.log(JSON.stringify(await verifyActivityCursor(projectId, inspected)))
  } else if (parallel) {
    console.log(JSON.stringify(parallelCrash ? await verifyParallelCrash(projectId) : await verifyParallel(projectId, inspected)))
  } else if (process.argv.includes('--browser-reconnect')) {
    const { verifyTaskboardReconnect } = await import('./taskboard-browser.mjs')
    const title = 'Keep this task selected'
    const start = await createStartRequest(server.rpc, projectId, inspected, 'Read the persisted activity', title)
    let expectedVersion = start.expectedVersion
    const comment = async (text, replay = false) => {
      const request = { projectId, taskId: start.taskId, commandId: randomUUID(), expectedVersion, text }
      const receipt = await server.rpc('comment', { request })
      if (replay) assert.deepEqual(await server.rpc('comment', { request }), receipt)
      expectedVersion = receipt.version
    }
    console.log(JSON.stringify(await verifyTaskboardReconnect(server.url, server.cookie, title, comment)))
  } else if (hostCrash) {
    console.log(JSON.stringify(await verifyHostCrash(projectId, inspected)))
  } else if (hostCrashBeforeReceipt) {
    console.log(JSON.stringify(await verifyHostCrashBeforeReceipt(projectId, inspected)))
  } else if (perfProbe) {
    console.log(JSON.stringify(await measureBoard(projectId)))
  } else if (failedRetryProbe) {
    console.log(JSON.stringify(await verifyFailedRetry(server.rpc, projectId, inspected)))
  } else if (process.argv.includes('--team')) {
    console.log(JSON.stringify(await verifyTeam(projectId)))
  } else if (sdkPatchChange) {
    console.log(JSON.stringify(await verifySdkPatchChange(projectId, inspected)))
  } else if (openaiDeployment) {
    const route = await server.rpc('executionRoute', { projectId })
    assert.deepEqual(route, { state: 'configured', provider: 'openai', model: 'gpt-5.4-mini' })
    const result = await verifyFailedRetry(server.rpc, projectId, inspected)
    for (const observed of openaiRequests) assert.deepEqual(observed, { path: '/v1/responses', model: route.model, fixtureCredential: true })
    assert.equal(openaiRequests.length, 2)
    console.log(JSON.stringify({ ...result, provider: route.provider, model: route.model, endpoint: '/v1/responses' }))
  } else if (deploymentProbe) {
    console.log(JSON.stringify(await verifyDeployment(projectId)))
  } else if (macosScope) {
    console.log(JSON.stringify(await verifyMacosScope(server.rpc, projectId, inspected)))
  } else if (interactionProbe) {
    console.log(JSON.stringify(await verifyInteractions(server.rpc, projectId, inspected)))
  } else if (disconnectProbe) {
    console.log(JSON.stringify(await verifyDisconnect(server.rpc, projectId, inspected)))
  } else if (taskToolsProbe) {
    console.log(JSON.stringify(await verifyTaskTools(server.rpc, projectId, inspected)))
  } else if (backupProbe) {
    console.log(JSON.stringify(await verifyBackup(projectId, inspected)))
  } else if (deliveryProbe) {
    console.log(JSON.stringify(await verifyDelivery(server.rpc, projectId, inspected)))
  } else if (resume) {
    console.log(JSON.stringify(await verifyResume(server.rpc, projectId, inspected, modelRequests)))
  } else if (denied) {
    const request = await createStartRequest(server.rpc, projectId, inspected, 'Permission must activate before input')
    await server.rpc('startRun', { request })
    const rejected = await pollRun(server.rpc, projectId, request.taskId, run => run.launchFailure !== null)
    assert.equal(rejected.launchFailure, 'SDK permission handshake')
    assert.equal(rejected.connection, 'suspect')
    assert.equal(rejected.inputAttemptedAt, null)
    assert.equal(rejected.receipt, null)
    assert.equal(modelRequests.length, 0)
    assert.deepEqual(await server.rpc('startRun', { request }), { commandId: request.commandId, runId: request.commandId, version: 3, revision: 1 })
    console.log(JSON.stringify({ permissionBlockedInput: true, modelRequests: 0, leaseRetained: true }))
  } else if (dispatch) {
    const movedProject = randomUUID()
    const directory = join(root, 'before-move')
    await mkdir(directory)
    await server.rpc('createProject', { request: { commandId: randomUUID(), expectedVersion: 0, project: { id: movedProject, title: 'Changed directory', root: directory } } })
    const chosen = await server.rpc('inspectProject', { projectId: movedProject })
    const doomed = await createStartRequest(server.rpc, movedProject, chosen, 'Reject the moved directory')
    await server.rpc('startRun', { request: doomed })
    await server.stop()
    server = undefined
    await rename(directory, join(root, 'after-move'))
    await once(model.listen(0, '127.0.0.1'), 'listening')
    await writeExecutionPatch(`http://127.0.0.1:${model.address().port}`, sdkPatches, lostReceipt ? undefined : 'taskboard-receipt-write-fault')
    server = await boot(true)
    const rejected = await pollRun(server.rpc, movedProject, doomed.taskId, run => run.state === 'failed')
    assert.equal(rejected.inputAttemptedAt, null)
    assert.equal(rejected.receipt, null)
    assert.equal(modelRequests.length, 0)
    console.log(JSON.stringify({ ...await verifyDispatch(server.rpc, projectId, inspected, modelRequests), changedDirectorySkipped: true }))
  } else {
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
    const queueTaskId = randomUUID()
    const command = expectedVersion => ({ projectId, taskId: queueTaskId, expectedVersion, commandId: randomUUID() })
    await server.rpc('createTask', { request: { ...command(0), requirements: request.requirements } })
    await server.rpc('planTask', { request: command(1) })
    const route = await server.rpc('executionRoute', { projectId })
    const confirmedRoute = { provider: route.provider, model: route.model }
    const startRun = { ...command(2), previousRun: null, confirmation: inspected, materials: [], confirmedRoute }
    for (const stale of [{ ...confirmedRoute, model: 'previous-model' }, { ...confirmedRoute, provider: 'previous-provider' }]) {
      await assert.rejects(server.rpc('startRun', { request: { ...startRun, confirmedRoute: stale } }), /provider or model changed/)
    }
    const unchanged = await server.rpc('detail', { projectId, taskId: queueTaskId })
    assert.equal(unchanged.task.version, 2)
    assert.deepEqual(unchanged.runs, [])
    const [first, duplicate] = await Promise.all([
      server.rpc('startRun', { request: startRun }), server.rpc('startRun', { request: startRun }),
    ])
    assert.deepEqual(duplicate, first)
    await assert.rejects(server.rpc('startRun', { request: { ...startRun, materials: [{ reference: 'new', text: 'changed' }] } }), /command identity reused/)
    const cancel = { ...command(first.version), runId: first.runId }
    const canceled = await server.rpc('cancelQueuedRun', { request: cancel })
    assert.deepEqual(await server.rpc('cancelQueuedRun', { request: cancel }), canceled)
    const enqueue = { ...startRun, ...command(canceled.version), materials: [{ reference: 'chosen', text: 'confirmed' }] }
    const queued = await server.rpc('startRun', { request: enqueue })
    await server.stop()
    server = undefined
    assert.ok((await stat(database)).size > 0)
    server = await boot()
    assert.deepEqual(await server.rpc('startRun', { request: enqueue }), queued)
    await assert.rejects(server.rpc('startRun', { request: { ...enqueue, ...command(queued.version) } }), /execution configuration is unavailable/)
    assert.deepEqual(await server.rpc('detail', { projectId, taskId }), before)
    assert.deepEqual(await server.rpc('createTask', { request }), created)
    assert.equal((await server.rpc('listTasks', { projectId, includeArchived: false })).length, 2)
    const { runs } = await server.rpc('detail', { projectId, taskId: queueTaskId })
    assert.deepEqual(runs.map(({ runId, state, inputAttemptedAt, receipt }) => ({ runId, state, inputAttemptedAt, receipt })), [
      { runId: first.runId, state: 'canceled', inputAttemptedAt: null, receipt: null },
      { runId: queued.runId, state: 'queued', inputAttemptedAt: null, receipt: null },
    ])
    assert.deepEqual(runs.map(run => run.route), [confirmedRoute, confirmedRoute])
    const exported = JSON.parse(await server.rpc('exportHandoff', { projectId }))
    assert.deepEqual(exported.runs.map(run => run.route), [confirmedRoute, confirmedRoute])
    assert.deepEqual(runs[1].materialReferences, ['chosen'])
    const last = await server.rpc('cancelQueuedRun', { request: { ...command(queued.version), runId: queued.runId } })
    await server.stop()
    server = undefined
    await writeExecutionPatch(undefined)
    const replacement = JSON.parse(await readFile(executionPatch, 'utf8'))
    replacement[0].config.execution.model = 'replacement-model'
    await writeFile(executionPatch, JSON.stringify(replacement))
    server = await boot(true)
    const fresh = { ...startRun, ...command(last.version) }
    await assert.rejects(server.rpc('startRun', { request: fresh }), /provider or model changed/)
    assert.deepEqual(await server.rpc('startRun', { request: enqueue }), queued)
    const { provider, model } = await server.rpc('executionRoute', { projectId })
    assert.equal(model, 'replacement-model')
    await server.rpc('startRun', { request: { ...fresh, confirmedRoute: { provider, model } } })
    const switched = await server.rpc('detail', { projectId, taskId: queueTaskId })
    assert.deepEqual(switched.runs.map(run => run.route), [confirmedRoute, confirmedRoute, { provider, model }])
    console.log(JSON.stringify({ webProfile: true, browserSession: true, sqliteFile: true, restoredVersion: before.task.version,
      revisions: before.revisions.length, activity: before.activity.length, originalReceiptReplayed: true, queueHistoryRestored: true }, null, 2))
  }
  }
} finally {
  dispatchRelease.resolve()
  try { await server?.stop() } finally {
    await native?.close()
    if (model.listening) { model.closeAllConnections(); await new Promise(resolve => model.close(resolve)) }
    if (!prDelivery && !addReceipt) await rm(root, { recursive: true, force: true })
  }
}
