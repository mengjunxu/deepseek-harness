/** Test-only model tripwire and out-of-band job settlement observation. */
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'mgsd-test-observer'
export const inject = ['llm', 'jobs']

/**
 * Observe jobs without submitting commands or adding Session events.
 * @param {object} ctx - Real profile services.
 */
export function apply(ctx) {
  const root = process.env.DSH_CODELY_TEST_PROBE
  const calls = join(root, 'model-calls.txt')
  writeFileSync(calls, '')
  ctx.on('llm/stream', () => {
    appendFileSync(calls, 'unexpected model call\n')
    throw new Error('Codely command unexpectedly requested a DSH model')
  }, { prepend: true })
  ctx.effect(() => ctx.jobs.events.subscribe({ owners: 'all' }, event => {
    if (event.type === 'settled') writeFileSync(join(root, `${event.job.id}.json`), JSON.stringify(event.job))
  }))
}
