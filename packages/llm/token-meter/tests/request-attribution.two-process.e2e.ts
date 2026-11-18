/** Built headless Hosts retain durable attempt identity across a persisted Session restart. */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'
import { z } from 'zod'
import { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'

const bin = fileURLToPath(new URL('../../../../apps/cli/lib/bin.js', import.meta.url))
const model = fileURLToPath(new URL('./fixtures/accounted-local-model.mjs', import.meta.url))
const seq = z.number().int().nonnegative().transform(SessionSeq)
const notice = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('step'), sessionId: z.string().transform(SessionId), seq, turn: z.number().int().positive() }),
  z.object({ kind: z.literal('accounting'), sessionId: z.string().transform(SessionId), record: z.object({
    provider: z.literal('accounted-local'), model: z.literal('m'), usageSource: z.literal('local'), outcome: z.literal('completed'),
    loopAttempt: z.object({ stepStartSeq: seq, attempt: z.number().int().positive() }),
  }) }),
])

it('keeps attempt one distinct across two built Hosts resuming the same Session', { retry: 0 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-accounting-restart-'))
  const peers: { child: ChildProcess; closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }> }[] = []
  onTestFinished(async () => {
    for (const peer of peers) {
      if (peer.child.exitCode === null && peer.child.signalCode === null) peer.child.kill('SIGKILL')
      await peer.closed
    }
    await rm(root, { recursive: true, force: true })
  })
  const home = join(root, 'home'), patch = join(root, 'accounting.json')
  let sessionId: SessionId | undefined
  await writeFile(patch, JSON.stringify([
    { id: 'llm-deepseek', disabled: true }, { id: 'plugin-package-inventory-deepseek', disabled: true },
    { id: 'session-title-llm', disabled: true },
    { id: 'session-persistence-jsonl', config: { root: join(home, 'sessions'), compression: 'none' } },
    { id: 'agent-default-model', config: { provider: 'accounted-local', model: 'm' } },
    { insert: [{ id: 'request-accounting', name: '@deepseek-ai/dsh-token-meter/request-records' },
      { id: 'accounted-local-model', name: model }] },
  ]))
  let previousStep: SessionSeq | undefined
  for (const turn of [1, 2]) {
    const env: NodeJS.ProcessEnv = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
    delete env.DEEPSEEK_API_KEY; delete env.TSX_TSCONFIG_PATH; delete env.NODE_OPTIONS
    const child = spawn(process.execPath, [bin, '--profile', 'headless', '--patch', patch,
      ...sessionId === undefined ? [] : ['--session-id', sessionId], 'Reply ATTEMPT_LINK_OK.'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    const messages: unknown[] = []
    let output = ''
    child.on('message', (message) => { messages.push(message) })
    child.stdout!.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr!.on('data', (chunk: Buffer) => { output += chunk.toString() })
    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('close', (code, signal) => { resolve({ code, signal }) })
    })
    peers.push({ child, closed })
    const exit = await closed
    expect(exit, output).toEqual({ code: 0, signal: null })
    expect(output).toContain('ATTEMPT_LINK_OK')
    const rows = messages.map(message => notice.parse(message))
    expect(rows).toHaveLength(2)
    const step = rows.find(row => row.kind === 'step'), accounting = rows.find(row => row.kind === 'accounting')
    if (!step || !accounting) throw new Error('Expected one step and one accounting observation')
    sessionId ??= step.sessionId
    expect(step.sessionId).toBe(sessionId); expect(accounting.sessionId).toBe(sessionId)
    expect(step.turn).toBe(turn)
    expect(accounting.record.loopAttempt).toEqual({ stepStartSeq: step.seq, attempt: 1 })
    if (previousStep !== undefined) expect(step.seq).toBeGreaterThan(previousStep)
    previousStep = step.seq
  }
})
