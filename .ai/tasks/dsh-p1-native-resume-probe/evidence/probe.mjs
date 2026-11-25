/** Exercise native process restart with fixture-only model responses on macOS. Run from this checkout with pnpm dependencies built. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { startResponsesFixture } from '../../../../packages/subagent/subagent-codex/tests/responses-fixture.ts'
import { createServer } from 'node:http'

const provider = createRequire(new URL('../../../../packages/subagent/subagent-codex/package.json', import.meta.url))
const { JsonRpcLineTransport, JsonRpcResponseError } = provider('@deepseek-ai/dsh-sdk-protocol')
const manifest = provider('@openai/codex/package.json')
const codexBin = provider.resolve('@openai/codex/package.json').replace(/package\.json$/, manifest.bin.codex)
const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-native-resume-')))
const cwd = join(root, 'workspace')
const env = { PATH: process.env.PATH, HOME: root, TMPDIR: tmpdir(), OPENAI_API_KEY: 'fixture-only',
  HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', NO_PROXY: '127.0.0.1,localhost' }

async function withPeer(command, args, environment, run) {
  const child = spawn(command, args, { cwd, env: environment, stdio: ['pipe', 'pipe', 'ignore'], detached: true })
  const closed = once(child, 'close')
  const wire = new JsonRpcLineTransport(child.stdout, child.stdin)
  const signal = AbortSignal.timeout(30000)
  child.stdin.on('error', () => wire.close())
  wire.start()
  try {
    return await run({ wire, signal, request: (method, params) => wire.request(method, params, signal) })
  } finally {
    child.stdin.end()
    try {
      if (!await Promise.race([closed.then(() => true), delay(1500, false, { ref: false })])) {
        try { process.kill(-child.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
        if (!await Promise.race([closed.then(() => true), delay(3000, false, { ref: false })])) {
          try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
        }
      }
      await closed
    } finally { wire.close() }
  }
}

async function rejected(call, messagePattern) {
  try { await call } catch (error) {
    assert.ok(error instanceof JsonRpcResponseError, 'expected an explicit product RPC error')
    assert.match(error.message, messagePattern)
    return error.code
  }
  assert.fail('the product unexpectedly accepted the request')
}

async function codexProbe() {
  const marker = 'Remember ' + randomUUID()
  const reply = 'First reply ' + randomUUID()
  const fixture = await startResponsesFixture([reply, 'Ephemeral reply', 'Resumed reply', 'Fresh reply'].map(text => ({ kind: 'complete', text })))
  const home = join(root, 'codex')
  const input = (text) => [{ type: 'text', text, text_elements: [] }]
  async function processRun(fn) {
    return withPeer(process.execPath, [codexBin, 'app-server', '--stdio'], { ...env, CODEX_HOME: home }, async peer => {
      await peer.request('initialize', { clientInfo: { name: 'resume-probe', version: '1' }, capabilities: { experimentalApi: false } })
      peer.wire.notify('initialized')
      return fn(peer)
    })
  }
  const start = async (peer, ephemeral) => {
    const { thread } = await peer.request('thread/start', { cwd, model: 'fixture-model', approvalPolicy: 'never', sandbox: 'read-only', ephemeral })
    assert.equal(thread.ephemeral, ephemeral)
    return thread.id
  }
  async function turn(peer, id, text) {
    const terminal = Promise.withResolvers()
    peer.wire.onNotification((method, params) => {
      if (method === 'turn/completed' && params.threadId === id) terminal.resolve(params.turn)
    })
    const { turn } = await peer.request('turn/start', { threadId: id, input: input(text) })
    const done = await Promise.race([terminal.promise, delay(30000, null, { ref: false })])
    assert.equal(done?.id, turn.id)
    assert.equal(done.status, 'completed')
    return turn.id
  }
  try {
    await mkdir(home)
    await writeFile(join(home, 'config.toml'), [
      'model_provider = "local"', 'check_for_update_on_startup = false', '[model_providers.local]', 'name = "Loopback"',
      'base_url = ' + JSON.stringify(fixture.baseUrl), 'env_key = "OPENAI_API_KEY"', 'wire_api = "responses"',
      'requires_openai_auth = false', '[analytics]', 'enabled = false',
    ].join('\n'))
    const first = await processRun(async peer => {
      const durable = await start(peer, false)
      const firstTurn = await turn(peer, durable, marker)
      const ephemeral = await start(peer, true)
      await turn(peer, ephemeral, 'Ephemeral control')
      return { durable, firstTurn, ephemeral }
    })
    const second = await processRun(async peer => {
      const resume = threadId => peer.request('thread/resume', { threadId, cwd, model: 'fixture-model', approvalPolicy: 'never', sandbox: 'read-only' })
      const ephemeralError = await rejected(resume(first.ephemeral), /not found|no rollout|does not exist|no saved/i)
      const unknownError = await rejected(resume(randomUUID()), /not found|no rollout|does not exist|no saved/i)
      const { thread } = await resume(first.durable)
      assert.equal(thread.id, first.durable)
      assert.equal(thread.ephemeral, false)
      assert.ok(thread.turns.some(entry => entry.id === first.firstTurn))
      const followup = 'Continue the previous conversation.'
      assert.notEqual(await turn(peer, thread.id, followup), first.firstTurn)
      const fresh = await start(peer, false)
      assert.notEqual(fresh, first.durable)
      await turn(peer, fresh, followup)
      return { ephemeralError, unknownError }
    })
    assert.equal(fixture.requests.length, 4)
    const messages = index => fixture.requests[index].body.input
    const contains = (items, role, text) => items.some(item => item.role === role && Array.isArray(item.content)
      && item.content.some(block => block.text === text))
    assert.ok(contains(messages(2), 'user', marker) && contains(messages(2), 'assistant', reply))
    assert.ok(!contains(messages(3), 'user', marker) && !contains(messages(3), 'assistant', reply))
    return { version: manifest.version, persistedThreadAndTurnRecovered: true, priorMessagesInResumedInputOnly: true, ...second, modelRequests: 4 }
  } finally { await fixture.close() }
}

async function codelyProbe() {
  const marker = 'First message ' + randomUUID()
  const reply = 'First reply ' + randomUUID()
  const followup = 'Continue the previous conversation.'
  const messages = []
  const server = createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ data: [{ id: 'fixture-model', object: 'model' }] }))
      return
    }
    if (req.method !== 'POST' || req.url !== '/v1/chat/completions') { res.writeHead(404).end(); return }
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    messages.push(JSON.parse(Buffer.concat(chunks)).messages)
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const content = messages.length === 1 ? reply : 'Fixture reply'
    for (const [delta, finish] of [[{ role: 'assistant', content }, null], [{}, 'stop']]) {
      res.write('data: ' + JSON.stringify({ id: 'fixture', model: 'fixture-model', object: 'chat.completion.chunk',
        choices: [{ index: 0, delta, finish_reason: finish }] }) + '\n\n')
    }
    res.end('data: [DONE]\n\n')
  })
  await once(server.listen(0, '127.0.0.1'), 'listening')
  const args = ['--experimental-acp', '--no-upm', '--no-telemetry', '--no-auto-edit-memory',
    '--disable-next-speaker-check', '--no-agents', '--auth-type', 'openai', '--wire-api', 'chat',
    '--openai-base-url', `http://127.0.0.1:${server.address().port}/v1`, '--model', 'fixture-model', '--flash', 'fixture-model',
    '--approval-mode', 'plan', '--path-policy', 'strict']
  const prompt = async (peer, sessionId, text) => {
    const result = await peer.request('session/prompt', { sessionId, prompt: [{ type: 'text', text }] })
    assert.equal(result.stopReason, 'end_turn')
  }
  try {
    const acp = fn => withPeer('codely', args, { ...env, HOME: process.env.HOME, CUSTOM_AUTH: '1' }, async peer => {
      const init = await peer.request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'resume-probe', version: '1' } })
      return fn(peer, init)
    })
    const first = await acp(async peer => {
      const { sessionId } = await peer.request('session/new', { cwd, mcpServers: [] })
      await prompt(peer, sessionId, marker)
      return sessionId
    })
    return await acp(async (peer, init) => {
      assert.equal(init.agentCapabilities.loadSession, false)
      assert.equal(init.agentCapabilities.sessionCapabilities?.resume, undefined)
      const params = { sessionId: first, cwd, mcpServers: [] }
      const methodCodes = {}
      for (const method of ['session/load', 'session/resume']) {
        methodCodes[method] = await rejected(peer.request(method, params), /not found|not implemented|not supported|unsupported/i)
      }
      const resume = resumeSessionId => peer.request('session/new', { cwd, mcpServers: [], _meta: { codely: { resumeSessionId } } })
      const histories = new Map()
      peer.wire.onNotification((method, event) => {
        if (method !== 'session/update' || event.update?.sessionUpdate !== 'replace_history') return
        const history = JSON.stringify(event.update)
        const empty = ['messages', 'feed', 'tools', 'tasks'].every(key =>
          Array.isArray(event.update[key]) && event.update[key].length === 0)
        histories.set(event.sessionId, { user: history.includes(marker), assistant: history.includes(reply), empty })
      })
      const resumed = await resume(first)
      assert.equal(resumed.sessionId, first)
      assert.deepEqual(histories.get(first), { user: true, assistant: true, empty: false })
      await prompt(peer, resumed.sessionId, followup)
      const missing = randomUUID()
      const unknown = await resume(missing)
      assert.equal(unknown.sessionId, missing)
      assert.deepEqual(histories.get(missing), { user: false, assistant: false, empty: true })
      await prompt(peer, unknown.sessionId, followup)
      const fresh = await peer.request('session/new', { cwd, mcpServers: [] })
      assert.notEqual(fresh.sessionId, first)
      await prompt(peer, fresh.sessionId, followup)
      const has = (index, role, text) => messages[index].some(row => row.role === role
        && (row.content === text || (Array.isArray(row.content) && row.content.some(part => part.text === text))))
      assert.equal(messages.length, 4)
      assert.ok(has(1, 'user', marker) && has(1, 'assistant', reply))
      for (const index of [2, 3]) assert.ok(!has(index, 'user', marker) && !has(index, 'assistant', reply))
      return { version: init.agentInfo.version, firstTurnCompleted: true, loadAdvertised: false,
        resumeAdvertised: false, methodCodes, vendorExtension: { existingIdMatched: true, priorUserAndAssistantInReplaceHistoryBeforePrompt: true,
          priorMessagesInResumedInputOnly: true, unknownIdEchoedWithEmptyHistory: true }, freshIdDistinct: true, modelRequests: messages.length }
    })
  } finally {
    const closed = once(server, 'close')
    server.close()
    server.closeAllConnections()
    await closed
  }
}

try {
  await mkdir(cwd)
  const codex = await codexProbe()
  const codely = await codelyProbe()
  console.log(JSON.stringify({ codex, codely }, null, 2))
} finally { await rm(root, { recursive: true, force: true }) }
