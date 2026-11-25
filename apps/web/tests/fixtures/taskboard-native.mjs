/** Local model endpoints for exercising native product processes inside the Taskboard SDK. */
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { Context } from '@deepseek-ai/cordis'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const reports = [JSON.stringify({ summary: 'Native delivery', changes: ['Checked the task requirements'], knownIssues: [], unfinished: [], files: [],
  verification: [{ criterion: 'Synchronize the details', status: 'passed', evidence: 'Read the confirmed fixture requirements' }] }), null, 'invalid delivery']

function fileReport(access) {
  const written = access === 'write'
  return JSON.stringify({ summary: written ? 'Native edit delivered' : 'Native edit denied',
    changes: written ? ['Updated notes.txt'] : [], knownIssues: [], unfinished: written ? [] : ['Update notes.txt'],
    files: [], verification: [{ criterion: 'Update notes.txt', status: written ? 'passed' : 'failed',
      evidence: written ? 'The native tool wrote notes.txt' : 'The native tool could not write notes.txt' }] })
}

function codexFileCall(access) {
  const command = "printf '%s\\n' 'native edit' > notes.txt"
  const approval = access === 'deny' ? { sandbox_permissions: 'require_escalated', justification: 'Request approval for the fixture edit' } : {}
  return { kind: 'advertisedFunctionCall', choices: [
    { name: 'exec_command', arguments: { cmd: command, ...approval } },
    { name: 'shell_command', arguments: { command, ...approval } },
  ] }
}

/** Configure the actual Codex binary, or an explicitly requested signed-in Codely CLI, against loopback. */
export async function nativeFixture(executor, root, installed, fileAccess, workspace) {
  const overlay = join(root, 'native.yml')
  const adapter = executor === 'codex' ? 'subagent-codex' : 'subagent-acp'
  const name = installed ? createRequire(join(process.cwd(), 'package.json')).resolve('@deepseek-ai/dsh-' + adapter) : fileURLToPath(new URL('../../../../packages/subagent/' + adapter + '/lib/index.js', import.meta.url))
  let fixture, config
  try {
    if (executor === 'codex') {
      const { startResponsesFixture } = await import('../../../../packages/subagent/subagent-codex/tests/responses-fixture.ts')
      fixture = await startResponsesFixture(fileAccess
        ? [codexFileCall(fileAccess), { kind: 'complete', text: fileReport(fileAccess) }]
        : reports.map(text => text === null ? { kind: 'hold' } : { kind: 'complete', text }))
      const home = join(root, 'codex')
      await mkdir(home)
      await writeFile(join(home, 'config.toml'), [
        'model_provider = "fixture"', fileAccess === 'write' ? 'sandbox_mode = "workspace-write"' : 'sandbox_mode = "read-only"', 'check_for_update_on_startup = false',
        '[model_providers.fixture]', 'name = "Loopback"', 'base_url = ' + JSON.stringify(fixture.baseUrl),
        'env_key = "OPENAI_API_KEY"', 'wire_api = "responses"', 'requires_openai_auth = false', '[analytics]', 'enabled = false',
      ].join('\n'))
      config = { model: 'fixture-model', permissionMode: 'never', env: { HOME: root, CODEX_HOME: home, OPENAI_API_KEY: 'loopback-fixture',
        HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1', NO_PROXY: '127.0.0.1,localhost' } }
    } else {
      const requests = []
      const server = createServer(async (req, res) => {
        if (req.method === 'GET' && req.url === '/v1/models') {
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ object: 'list', data: [{ id: 'fixture-model', object: 'model' }] }))
          return
        }
        if (req.method !== 'POST' || req.url !== '/v1/chat/completions') { res.writeHead(404).end(); return }
        const chunks = []
        for await (const chunk of req) chunks.push(chunk)
        requests.push({ path: req.url, body: JSON.parse(Buffer.concat(chunks)) })
        const call = fileAccess && requests.length === 1
        const script = fileAccess ? [undefined, fileReport(fileAccess)] : reports
        const text = script[requests.length - 1]
        if (text === null) return
        if (!text && !call) { res.writeHead(400).end(); return }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' })
        const delta = call ? { role: 'assistant', tool_calls: [{ index: 0, id: 'edit-notes', type: 'function',
          function: { name: 'write_file', arguments: JSON.stringify({ file_path: join(await workspace, 'notes.txt'), content: 'native edit\n' }) } }] }
          : { role: 'assistant', content: text }
        for (const [part, finish] of [[delta, null], [{}, call ? 'tool_calls' : 'stop']]) {
          res.write('data: ' + JSON.stringify({ id: 'native', object: 'chat.completion.chunk', created: 1, model: 'fixture-model',
            choices: [{ index: 0, delta: part, finish_reason: finish }] }) + '\n\n')
        }
        res.end('data: [DONE]\n\n')
      })
      await once(server.listen(0, '127.0.0.1'), 'listening')
      fixture = { requests, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) } }
      config = { command: 'codely', permission: fileAccess === 'write' ? 'allow' : 'reject', args: ['--experimental-acp', '--no-upm', '--no-telemetry', '--no-auto-edit-memory',
        '--disable-next-speaker-check', '--no-agents', '--auth-type', 'openai', '--wire-api', 'chat',
        '--openai-base-url', `http://127.0.0.1:${server.address().port}/v1`, '--model', 'fixture-model', '--flash', 'fixture-model',
        '--approval-mode', fileAccess ? 'default' : 'plan', '--path-policy', 'strict'], env: { CUSTOM_AUTH: '1', HOME: process.env.HOME, OPENAI_API_KEY: 'loopback-fixture' } }
    }
    await writeFile(overlay, JSON.stringify([{ insert: [{ id: 'native-product', name, config: { ...config, providerName: executor } }] }]))
    return { overlay, close: fixture.close, async waitForHeldRequest() {
      const signal = AbortSignal.timeout(20_000)
      while (fixture.requests.length < 2) await delay(20, undefined, { signal })
    }, confirmFileResult() {
      assert.equal(fixture.requests.length, 2)
      const { body } = fixture.requests[1]
      const result = executor === 'codex' ? body.input.findLast(entry => entry.type === 'function_call_output')?.output
        : body.messages.findLast(entry => entry.role === 'tool')?.content
      assert.ok(result, 'expected the native tool result in the next model request')
      const text = typeof result === 'string' ? result : JSON.stringify(result)
      if (fileAccess === 'deny') assert.match(text, /denied|reject|cancel|approval policy|not allowed|permission/i)
      else assert.doesNotMatch(text, /denied|reject|cancel|error|failed/i)
    }, confirmRequests() {
      assert.deepEqual(fixture.requests.map(request => request.path), Array(3).fill(executor === 'codex' ? '/v1/responses' : '/v1/chat/completions'))
      assert.ok(fixture.requests.every(request => JSON.stringify(request.body).includes('Complete this task in the supplied workspace')))
    } }
  } catch (error) {
    await fixture?.close()
    throw error
  }
}

/** Read the real SDK inbox and turn outcome, with stable session and message identities. */
export async function nativeSession(root, id) {
  const ctx = new Context()
  try {
    await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions', id, 'sessions') })
    const reader = await ctx.sessionPersistence.open(id, 'read')
    try {
      const { events } = await reader.read(0)
      const header = { type: 'session', ...reader.header, id: '{{session:1}}', createdAt: 1, cwd: '{{cwd}}' }
      return [header, ...events.map(({ type, data }) => {
        if (type !== 'agent/inbox/spliced') return { type, data }
        return { type, data: { ...data, inserted: data.inserted.map(message => ({ ...message, id: '{{message:1}}' })) } }
      })]
    } finally { await reader.close() }
  } finally { await ctx.fiber.dispose() }
}
