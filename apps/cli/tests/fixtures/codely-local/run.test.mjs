/** Deterministic executor/validator sequencing and cancellation ownership tests. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runLocalTask } from '../../../config/examples/codely-local/run.mjs'

function harness(outcomes, controller = new AbortController()) {
  const spawned = []
  const cleaned = []
  const output = []
  return {
    spawned, cleaned, output,
    run: () => runLocalTask({
      command: ['node', '/codely entry.js'], checks: [['node', 'check.mjs']],
      cwd: '/project', prompt: '中文 "quoted"\nsecond line & %PATH%',
      signal: controller.signal, graceMs: 3000, maxBytes: 1024, pollMs: 100,
      append: text => output.push(text),
      subprocess: { spawn(spec) {
        const index = spawned.length
        spawned.push(spec)
        const source = { readFrom: () => ({ text: '', nextOffset: 0, lossy: false }) }
        return {
          collected: { stdout: source, stderr: source },
          done: Promise.resolve().then(() => typeof outcomes[index] === 'function' ? outcomes[index]() : outcomes[index]),
          terminate: () => cleaned.push(index),
          waitForExit: async () => true,
        }
      } },
    }),
  }
}

test('passes a multiline Unicode prompt as one argv and validates after executor cleanup', async () => {
  const h = harness([{ exitCode: 0, signal: null }, { exitCode: 0, signal: null }])
  assert.equal((await h.run()).status, 'completed')
  assert.equal(h.spawned[0].argv.at(-1), '--prompt=中文 "quoted"\nsecond line & %PATH%')
  assert.deepEqual(h.spawned[1].argv, ['node', 'check.mjs'])
  assert.deepEqual(h.cleaned, [0, 1])
})

test('an executor exit 0 cannot hide validation exit 23', async () => {
  const h = harness([{ exitCode: 0, signal: null }, { exitCode: 23, signal: null }])
  assert.deepEqual(await h.run(), { status: 'failed', detail: 'Validation 1 exit code: 23; signal: null' })
})

test('an executor failure skips validation', async () => {
  const h = harness([{ exitCode: 1, signal: null }])
  assert.equal((await h.run()).status, 'failed')
  assert.equal(h.spawned.length, 1)
  assert.deepEqual(h.cleaned, [0])
})

test('cancellation that races an exit 0 skips validation and waits for cleanup', async () => {
  const controller = new AbortController()
  const h = harness([() => { controller.abort(); return { exitCode: 0, signal: null } }], controller)
  assert.equal((await h.run()).status, 'killed')
  assert.equal(h.spawned.length, 1)
  assert.deepEqual(h.cleaned, [0])
})

test('already cancelled work never spawns', async () => {
  const controller = new AbortController()
  controller.abort()
  const h = harness([], controller)
  assert.equal((await h.run()).status, 'killed')
  assert.equal(h.spawned.length, 0)
})

test('process failure still releases its managed range', async () => {
  const h = harness([() => { throw new Error('spawn failed') }])
  assert.equal((await h.run()).status, 'failed')
  assert.deepEqual(h.cleaned, [0])
  assert.match(h.output.join(''), /spawn failed/u)
})
