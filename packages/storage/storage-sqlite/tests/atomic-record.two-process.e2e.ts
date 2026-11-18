/** Built storage API excludes another process's write transaction and recovers after its exit. */
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, onTestFinished } from 'vitest'

const holderFile = fileURLToPath(new URL('./fixtures/transaction-holder.ts', import.meta.url))
const ownerFile = fileURLToPath(new URL('./fixtures/atomic-owner.mjs', import.meta.url))

interface ChildExit {
  code: number | null
  signal: NodeJS.Signals | null
}

interface ProcessFixture {
  child: ChildProcess
  closed: Promise<ChildExit>
}

async function receive({ child, closed }: ProcessFixture): Promise<unknown> {
  const waiting = new AbortController()
  try {
    return await Promise.race([
      once(child, 'message', { signal: waiting.signal }).then((messages: unknown[]) => messages[0]),
      closed.then(({ code, signal }) => { throw new Error(`SQLite fixture closed before replying (${code}, ${signal})`) }),
    ])
  } finally { waiting.abort() }
}

async function command(peer: ProcessFixture, message: string): Promise<unknown> {
  const reply = receive(peer)
  peer.child.send(message)
  return reply
}

async function stop(peer: ProcessFixture): Promise<void> {
  peer.child.send('stop')
  const exit = await peer.closed
  expect(exit.signal).toBeNull()
  expect(exit.code).toBe(0)
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-sqlite-atomic-process-'))
  const children: ProcessFixture[] = []
  onTestFinished(async () => {
    for (const { child, closed } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await closed
    }
    await rm(root, { recursive: true, force: true })
  })
  const path = join(root, 'storage.db')
  const launch = (file: string): ProcessFixture => {
    const child = spawn(process.execPath, [file, path], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
    const closed = new Promise<ChildExit>((resolve) => {
      child.once('close', (code, signal) => { resolve({ code, signal }) })
    })
    const peer = { child, closed }
    children.push(peer)
    return peer
  }
  const owner = launch(ownerFile)
  expect(await receive(owner)).toBe('ready')
  const holder = launch(holderFile)
  expect(await receive(holder)).toBe('holding')
  return { path, owner, holder }
}

it('rejects another process before the callback and reads its committed result after exit', { retry: 0 }, async () => {
  const { path, owner, holder } = await fixture()
  const refusal = await command(owner, 'increment')
  expect(refusal).toMatchObject({ type: 'failure', callbackCalled: false })
  expect(refusal).toHaveProperty('message', expect.stringMatching(/locked|busy/))
  holder.child.send('commit')
  const exit = await holder.closed
  expect(exit.signal).toBeNull()
  expect(exit.code).toBe(0)
  expect(await command(owner, 'increment')).toEqual({ type: 'result', value: 10 })
  await stop(owner)
  expect(persisted(path)).toEqual({ value: '10' })
})

it('releases a killed writer and excludes its uncommitted value', { retry: 0 }, async () => {
  const { path, owner, holder } = await fixture()
  holder.child.kill('SIGKILL')
  await holder.closed
  expect(await command(owner, 'increment')).toEqual({ type: 'result', value: 6 })
  await stop(owner)
  expect(persisted(path)).toEqual({ value: '6' })
})

function persisted(path: string) {
  const external = new DatabaseSync(path)
  try {
    return external.prepare('SELECT value FROM u_atomic_budget_records WHERE key = ?').get('shared')
  } finally { external.close() }
}
