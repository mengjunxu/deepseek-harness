/** Confirm a malformed native approval policy blocks the built SDK profile before the first input. */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTaskRuntime } from '../../../../packages/api/taskboard-controller/lib/index.js'

const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-taskboard-permission-')))
const cwd = join(root, 'work')
await mkdir(cwd)
const patch = join(root, 'invalid-approval.patch.yml')
await writeFile(patch, '- id: approval\n  config:\n    policy: invalid-test-policy\n')
let requests = 0
const model = createServer((_req, res) => { requests++; res.writeHead(400); res.end() })
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve))
const sdk = createTaskRuntime({ cwd, patches: [patch], dshHome: join(root, 'home'),
  model: 'deepseek-v4-pro', provider: 'deepseek-official', initializeTimeoutMs: 3000,
  env: { HOME: root, PATH: process.env.PATH, DSH_TELEMETRY_DISABLED: '1', DEEPSEEK_API_KEY: 'local-fixture',
    DEEPSEEK_BASE_URL: 'http://127.0.0.1:' + model.address().port } })
try {
  const first = sdk.client
  await assert.rejects(sdk.run('Create the acceptance fixture', { sessionId: 'permission-invalid' }), error => {
    assert.match(error.message, /approval|invalid-test-policy/i)
    return true
  })
  assert.equal(await first.waitForExit(1000), true)
  assert.equal(requests, 0)
  assert.deepEqual(await readdir(cwd), [])
  console.log(JSON.stringify({ policy: 'invalid-test-policy', sdkRejected: true, approvalDiagnostic: true,
    targetRuntimeExited: true, modelRequests: requests, workDirectoryWrites: 0 }, null, 2))
} finally {
  try { await sdk.close() } finally {
    model.closeAllConnections()
    await new Promise(resolve => model.close(resolve))
    await rm(root, { recursive: true, force: true })
  }
}
