// Reproduce the approved worktree change with real SDK sessions and a local model endpoint.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { DeepSeekHarness } from '../../../../packages/sdk/client/lib/index.js'

const root = await realpath(await mkdtemp(join(tmpdir(), 'tboard-directory-')))
const main = join(root, 'project')
const next = join(root, 'worktree')
const dshHome = join(root, 'runtime-data')
const selected = 'material-selected-43a6'
const excluded = 'material-unselected-71cc'
const calls = []
const instances = []
const model = createServer(async (req, res) => {
  let body = ''
  for await (const chunk of req) body += chunk
  const messages = JSON.parse(body).messages
  calls.push(messages)
  const tool = !messages.some(m => Array.isArray(m.content) && m.content.some(c => c.type === 'tool_result'))
  const block = tool ? { type: 'tool_use', id: 'workspace', name: 'bash', input: {} } : { type: 'text', text: 'recorded' }
  const frames = [
    { type: 'message_start', message: { id: 'g0-directory', model: 'deepseek-v4-pro', usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: block },
    ...(tool ? [{ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify({
      command: 'pwd -P && git branch --show-current && git rev-parse HEAD', description: 'Read active worktree location and branch',
    }) } }] : []),
    { type: 'content_block_stop', index: 0 }, { type: 'message_delta', delta: { stop_reason: tool ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ]
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  res.end(frames.map(e => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n').join(''))
})
function runtime(cwd, home = dshHome) {
  const instance = new DeepSeekHarness({ cwd, processCwd: cwd, dshHome: home, profile: 'sdk',
    provider: 'deepseek-official', model: 'deepseek-v4-pro', env: { HOME: root, PATH: process.env.PATH,
      DEEPSEEK_API_KEY: 'local-fixture', DSH_TELEMETRY_DISABLED: '1', DEEPSEEK_BASE_URL: 'http://127.0.0.1:' + model.address().port } })
  instances.push(instance)
  return instance
}
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
async function sessionFile(id) {
  const paths = await readdir(dshHome, { recursive: true })
  const files = paths.filter(path => path.split('/').includes(id) && path.endsWith('.jsonl.zstd'))
  assert.equal(files.length, 1)
  return join(dshHome, files[0])
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
async function run(cwd, id, prompt) {
  const harness = runtime(cwd)
  const before = calls.length
  const result = await harness.run(prompt, { sessionId: id })
  assert.equal(result.finalResponse, 'recorded')
  assert.equal(calls.length, before + 2)
  const output = calls.at(-1).flatMap(m => Array.isArray(m.content) ? m.content : []).filter(c => c.type === 'tool_result')
  const actual = JSON.stringify(output)
  const branch = git(cwd, 'branch', '--show-current')
  const commit = git(cwd, 'rev-parse', 'HEAD')
  for (const expected of [cwd, branch, commit]) assert.ok(actual.includes(expected), 'tool output missing ' + expected)
  await harness.close()
  const file = await sessionFile(id)
  const header = JSON.parse(execFileSync('zstd', ['-dc', file], { encoding: 'utf8' }).split('\n')[0])
  assert.equal(header.cwd, cwd)
  assert.equal(header.id, id)
  return { workspace: basename(cwd), branch, commit, sessionId: id }
}
try {
  await new Promise(resolve => model.listen(0, '127.0.0.1', resolve))
  await mkdir(main)
  git(main, 'init', '-q', '-b', 'baseline')
  git(main, '-c', 'user.name=G0', '-c', 'user.email=g0@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-q', '--allow-empty', '-m', 'baseline')
  git(main, 'worktree', 'add', '-q', '-b', 'review-changes', next, 'HEAD')
  const first = { taskId: 'task-dir', runId: 'run-original', ...await run(main, 'g0-dir-original', [selected, excluded].join('\n')) }
  const originalFile = await sessionFile(first.sessionId)
  const originalHash = digest(await readFile(originalFile))
  const material = [{ id: 'chosen-note', text: selected }, { id: 'other-note', text: excluded }]
  const selectedIds = ['chosen-note']
  const inherited = material.filter(m => selectedIds.includes(m.id))
  const second = { taskId: first.taskId, runId: 'run-next', previousRun: first.runId, previousSession: first.sessionId,
    inheritedMaterials: selectedIds, ...await run(next, 'g0-dir-next', ['inspect new workspace', ...inherited.map(m => m.text)].join('\n')) }
  assert.notEqual(first.sessionId, second.sessionId)
  assert.equal(first.commit, second.commit)
  assert.notEqual(first.branch, second.branch)
  for (const call of calls.slice(2)) {
    assert.ok(JSON.stringify(call).includes(selected))
    assert.ok(!JSON.stringify(call).includes(excluded))
  }
  assert.equal(digest(await readFile(originalFile)), originalHash)
  const backup = join(root, 'backup')
  await mkdir(backup)
  await writeFile(join(backup, 'run-refs.json'), JSON.stringify([first, second]))
  await cp(dshHome, join(backup, 'home'), { recursive: true })
  const restoredHome = join(root, 'restored-home')
  await cp(join(backup, 'home'), restoredHome, { recursive: true })
  const refs = JSON.parse(await readFile(join(backup, 'run-refs.json'), 'utf8'))
  assert.deepEqual(refs, [first, second])
  const before = calls.length
  for (const ref of refs) {
    const h = runtime(join(root, ref.workspace), restoredHome)
    assert.equal((await h.resumeSession(ref.sessionId)).id, ref.sessionId)
    await h.close()
  }
  assert.equal(calls.length, before)
  console.log(JSON.stringify({ runs: refs, actualToolDirectoriesAndBranchesVerified: true, onlySelectedMaterialVisible: true,
    originalLogUnchanged: true, offlineBackupRestoredBothSessions: true, modelCallsDuringRestore: calls.length - before }, null, 2))
} finally {
  await Promise.allSettled(instances.map(h => h.close()))
  model.closeAllConnections()
  await new Promise(resolve => model.close(resolve))
  await rm(root, { recursive: true, force: true })
}
