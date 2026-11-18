/** Built dsh Hosts share one allowance across active transport and abrupt process loss. */
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, onTestFinished } from 'vitest'

const bin = fileURLToPath(new URL('../../../../apps/cli/lib/bin.js', import.meta.url))
const modelFixture = fileURLToPath(new URL('./fixtures/controlled-adapter.mjs', import.meta.url))
interface Peer {
  child: ChildProcess
  closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  output: () => string
}
async function receive(peer: Peer): Promise<unknown> {
  const abort = new AbortController()
  try {
    return await Promise.race([
      once(peer.child, 'message', { signal: abort.signal }).then((items: unknown[]) => items[0]),
      peer.closed.then((exit) => { throw new Error(`Host closed before its IPC barrier: ${JSON.stringify(exit)}\n${peer.output()}`) }),
    ])
  } finally { abort.abort() }
}

async function fixture(maxRequests = 1, policyId = 'request-budget-policy', maxRequestsPerSession?: number) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-shared-budget-hosts-')), peers: Peer[] = []
  onTestFinished(async () => {
    for (const peer of peers) {
      if (peer.child.exitCode === null && peer.child.signalCode === null) peer.child.kill('SIGKILL')
      await peer.closed
    }
    await rm(root, { recursive: true, force: true })
  })
  const path = join(root, 'budget.db'), patch = join(root, 'budget.yml')
  await writeFile(patch, [
    '- id: llm-deepseek', '  disabled: true', '- id: plugin-package-inventory-deepseek', '  disabled: true',
    '- id: session-title-llm', '  disabled: true',
    '- id: session-persistence-jsonl', '  config:', "    root: !!js dshHomePath('sessions')", '    compression: none',
    '- id: agent-default-model', '  config:', '    provider: budget-fixture', '    model: m',
    '- id: storage-domain', '  config:', '    backend: json', '    routes:', '      request_budget: sqlite',
    '- insert:', '    - id: storage-sqlite', "      name: '@deepseek-ai/dsh-storage-sqlite'", '      config:',
    `        path: ${JSON.stringify(path)}`,
    `    - id: ${policyId}`, "      name: '@deepseek-ai/dsh-request-budget-policy'", '      config:', '        budgets:',
    '          - id: shared', '            usageSource: local', `            maxRequests: ${maxRequests}`,
    ...maxRequestsPerSession === undefined ? [] : [`            maxRequestsPerSession: ${maxRequestsPerSession}`],
    '            routes:', '              - provider: budget-fixture', '                models: [m]',
    '    - id: controlled-local-model', `      name: ${JSON.stringify(modelFixture)}`, '',
  ].join('\n'))
  const launch = (label: string, sessionId?: string): Peer => {
    const env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: join(root, label), DSH_TELEMETRY_DISABLED: '1' }
    delete env.DEEPSEEK_API_KEY; delete env.TSX_TSCONFIG_PATH; delete env.NODE_OPTIONS
    const child = spawn(process.execPath, [bin, '--profile', 'headless', '--patch', patch,
      ...sessionId === undefined ? [] : ['--session-id', sessionId], 'Reply LOCAL_BUDGET_OK.'],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    let output = ''
    child.stdout!.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr!.on('data', (chunk: Buffer) => { output += chunk.toString() })
    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('close', (code, signal) => { resolve({ code, signal }) })
    })
    const peer = { child, closed, output: () => output }; peers.push(peer); return peer
  }
  return { launch, path, root }
}

it('shares a resumed Session cap across overlapping Hosts while global capacity remains available', { retry: 0 }, async () => {
  const { launch, path, root } = await fixture(5, 'request-budget-policy', 2)
  const seed = launch('seed')
  expect(await receive(seed)).toBe('ready')
  const seedSubmitted = receive(seed); seed.child.send('resolve')
  expect(await seedSubmitted).toBe('submitted')
  seed.child.send('finish')
  const seeded = await seed.closed
  expect(seeded.signal).toBeNull(); expect(seeded.code, seed.output()).toBe(0)
  const db = new DatabaseSync(path)
  let sessionId: string
  try {
    const row = db.prepare('SELECT value FROM u_request_budget_budgets WHERE key = ?').get('shared')
    const state = JSON.parse(String(row!.value)) as { requests: Record<string, { request: { sessionId: string } }> }
    sessionId = Object.values(state.requests)[0]!.request.sessionId
    expect(sessionId).toBeTruthy()
  } finally { db.close() }
  // Separate Session files let both processes resume the same identity without sharing a log writer.
  for (const label of ['first', 'second', 'restarted']) {
    await mkdir(join(root, label), { recursive: true })
    await cp(join(root, 'seed', 'sessions'), join(root, label, 'sessions'), { recursive: true })
  }
  const first = launch('first', sessionId), firstReady = receive(first)
  const second = launch('second', sessionId), secondReady = receive(second)
  expect(await Promise.all([firstReady, secondReady])).toEqual(['ready', 'ready'])
  const submitted = receive(first); first.child.send('resolve')
  expect(await submitted).toBe('submitted')
  const abort = new AbortController()
  const entered = once(second.child, 'message', { signal: abort.signal }).then(() => {
    throw new Error('A second Host exceeded the shared Session cap before exhausting its global budget')
  })
  second.child.send('resolve')
  try {
    const refused = await Promise.race([second.closed, entered])
    expect(refused.signal).toBeNull(); expect(refused.code, second.output()).toBe(1)
    expect(second.output()).toContain('LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED')
  } finally { abort.abort() }
  first.child.send('finish')
  const completed = await first.closed
  expect(completed.signal).toBeNull(); expect(completed.code, first.output()).toBe(0)
  const restarted = launch('restarted', sessionId)
  expect(await receive(restarted)).toBe('ready')
  restarted.child.send('resolve')
  const denied = await restarted.closed
  expect(denied.signal).toBeNull(); expect(denied.code, restarted.output()).toBe(1)
  expect(restarted.output()).toContain('LOCAL_SESSION_REQUEST_BUDGET_EXHAUSTED')
  const persisted = new DatabaseSync(path)
  try {
    const row = persisted.prepare('SELECT value FROM u_request_budget_budgets WHERE key = ?').get('shared')
    const state = JSON.parse(String(row!.value)) as { requests: Record<string, { state: string }> }
    expect(Object.values(state.requests).map(item => item.state)).toEqual(['settled', 'settled'])
  } finally { persisted.close() }
})

// Windows child.kill terminates the process instead of delivering a catchable POSIX SIGTERM.
for (const end of ['finish', 'cancel', 'crash'] as const) {
  it.skipIf(end === 'cancel' && process.platform === 'win32')(`prevents a second Host from spending the active slot after ${end}`, { retry: 0 }, async () => {
    const { launch, path } = await fixture()
    // Both Hosts pass pure admission and pause at model resolution before either reserves a slot.
    const first = launch('first'), firstReady = receive(first)
    expect(await firstReady).toBe('ready')
    const second = launch('second'), secondReady = receive(second)
    expect(await secondReady).toBe('ready')
    const submitted = receive(first)
    first.child.send('resolve')
    expect(await submitted).toBe('submitted')
    const unexpected = new AbortController()
    const extraDispatch = once(second.child, 'message', { signal: unexpected.signal }).then(() => {
      throw new Error('A second Host entered the adapter despite its exhausted shared allowance')
    })
    second.child.send('resolve')
    let denied: Awaited<Peer['closed']>
    try { denied = await Promise.race([second.closed, extraDispatch]) }
    finally { unexpected.abort() }
    expect(denied.signal).toBeNull()
    expect(denied.code, second.output()).toBe(1)
    expect(second.output()).toContain('LOCAL_REQUEST_BUDGET_EXHAUSTED')
    if (end === 'finish') {
      first.child.send('finish')
      const completed = await first.closed
      expect(completed.signal).toBeNull()
      expect(completed.code, first.output()).toBe(0)
      expect(first.output()).toContain('LOCAL_BUDGET_OK')
    } else if (end === 'cancel') {
      first.child.kill('SIGTERM')
      const cancelled = await first.closed
      expect(cancelled.signal).toBeNull()
      expect(cancelled.code, first.output()).toBe(0)
      expect(first.output()).not.toContain('LOCAL_REQUEST_BUDGET_UNAVAILABLE')
    } else {
      first.child.kill('SIGKILL')
      await first.closed
      const restarted = launch('restarted')
      expect(await receive(restarted)).toBe('ready')
      restarted.child.send('resolve')
      const refused = await restarted.closed
      expect(refused.signal).toBeNull()
      expect(refused.code, restarted.output()).toBe(1)
      expect(restarted.output()).toContain('LOCAL_REQUEST_BUDGET_EXHAUSTED')
    }
    const db = new DatabaseSync(path)
    try {
      const row = db.prepare('SELECT value FROM u_request_budget_budgets WHERE key = ?').get('shared')
      const state = JSON.parse(String(row!.value)) as { requests: Record<string, { state: string }> }
      expect(Object.values(state.requests).map(item => item.state), first.output()).toEqual([end === 'crash' ? 'committed' : 'settled'])
    } finally { db.close() }
  })
}


it('refuses inference when the configured request-budget policy cannot validate', { retry: 0 }, async () => {
  const { launch } = await fixture(-1, 'custom-budget-id'), peer = launch('invalid-policy')
  const unexpected = Promise.withResolvers<never>()
  const message = (value: unknown) => {
    if (value === 'ready') peer.child.send('resolve')
    if (value === 'submitted') unexpected.reject(new Error('Invalid budget configuration allowed native adapter IO'))
  }
  peer.child.on('message', message)
  try {
    const exit = await Promise.race([peer.closed, unexpected.promise])
    expect(exit.signal).toBeNull()
    expect(exit.code, peer.output()).toBe(1)
    expect(peer.output()).toContain('request-budget-policy')
  } finally { peer.child.off('message', message) }
})
