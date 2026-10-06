/** Real Loader, command registry, job registry, and managed-process smoke. */
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-jobs-local'

async function assertTreeStopped(path: string): Promise<void> {
  const pids: unknown = JSON.parse(await readFile(path, 'utf8'))
  assert.ok(Array.isArray(pids))
  for (const pid of pids) {
    assert.ok(typeof pid === 'number' && Number.isSafeInteger(pid) && pid > 0)
    const deadline = AbortSignal.timeout(20000)
    while (true) {
      try { process.kill(pid, 0) } catch (error) {
        assert.ok(error instanceof Error && 'code' in error && error.code === 'ESRCH')
        break
      }
      await delay(20, undefined, { signal: deadline })
    }
  }
}

const fixture = fileURLToPath(new URL('.', import.meta.url))
const cwd = await mkdtemp(join(tmpdir(), 'dsh-codely-project-'))
process.env.DSH_CODELY_COMMAND = JSON.stringify([process.execPath, join(fixture, 'executor.mjs')])
process.env.DSH_CODELY_CHECKS = JSON.stringify([[process.execPath, join(fixture, 'check.mjs')]])
const overlay = fileURLToPath(new URL('../../../config/examples/codely-local/cordis.patch.yml', import.meta.url))
// Loader persists fiber disposal into its config, so each process owns a copy.
const configPath = join(cwd, 'cordis.yml')
let ctx: Awaited<ReturnType<typeof boot>> | undefined
try {
  await copyFile(process.argv[2]!, configPath)
  const patches = loadOverlayPatches('codely-local-test', overlay)
  const timeoutScenario = process.argv[3] === 'deadline'
  if (timeoutScenario) patches.push({
    id: 'codely-local',
    config: {
      command: [process.execPath, join(fixture, 'executor.mjs')],
      checks: [[process.execPath, join(fixture, 'check.mjs')]],
      timeoutMs: 1,
    },
  })
  ctx = await boot('codely-local-test', configPath, patches, undefined, import.meta.url)
  const app = ctx
  let modelCalls = 0
  ctx.on('llm/stream', (_options, next) => { modelCalls += 1; return next() })
  assert.ok(ctx.get('commands'), 'commands must activate')
  const { agent } = await ctx.agents.create({ sessionId: SessionId('codely-test'), meta: { cwd } })
  const execute = (input: string) => app.commands.execute(agent, `/codely ${input}`, [], new AbortController().signal)
  if (timeoutScenario) {
    assert.equal((await execute('run hang'))?.result.kind, 'success')
    const job = ctx.jobs.list(agent.id)[0]!
    const outcome = await ctx.jobs.wait(job.id, 20000, agent.id)
    assert.equal(outcome.status, 'killed')
    assert.equal(outcome.detail, 'Timed out; validation is not certified')
    assert.ok(!ctx.jobs.readAt(job.id, 0, agent.id).chunks.some(chunk => chunk.text.includes('Independent validation executed')))
    assert.match((await execute('status'))?.result.text ?? '', /Timed out/u)
  } else {
    const prompt = '中文 "quotes"\nsecond line & %PATH%'
    assert.equal((await execute(`run ${prompt}`))?.result.kind, 'success')
    const first = ctx.jobs.list(agent.id)[0]!
    assert.equal((await ctx.jobs.wait(first.id, 20000, agent.id)).status, 'completed')
    assert.equal(await readFile(join(cwd, 'received.txt'), 'utf8'), prompt)
    assert.match((await execute(`output ${first.id}`))?.result.text ?? '', /Independent validation executed/u)

    await execute('run fail validation')
    const second = ctx.jobs.list(agent.id)[1]!
    const failed = await ctx.jobs.wait(second.id, 20000, agent.id)
    assert.equal(failed.status, 'failed')
    assert.match(failed.detail ?? '', /exit code: 23/u)

    await execute('run hang')
    const third = ctx.jobs.list(agent.id)[2]!
    const deadline = AbortSignal.timeout(20000)
    while (!ctx.jobs.readAt(third.id, 0, agent.id).chunks.some(chunk => chunk.text.includes('fixture ready'))) {
      await delay(20, undefined, { signal: deadline })
    }
    assert.equal((await execute('run another task'))?.result.kind, 'error')
    assert.equal((await execute(`cancel ${third.id}`))?.result.kind, 'success')
    assert.equal((await ctx.jobs.wait(third.id, 20000, agent.id)).status, 'killed')
    await assertTreeStopped(join(cwd, 'process-tree.json'))
    const foreign = await ctx.agents.create({ sessionId: SessionId('another-session'), meta: { cwd } })
    assert.equal((await ctx.commands.execute(foreign.agent, `/codely output ${first.id}`, [], new AbortController().signal))?.result.kind, 'error')
    await execute('run hang')
    const fourth = ctx.jobs.list(agent.id)[3]!
    const ready = AbortSignal.timeout(20000)
    while (!ctx.jobs.readAt(fourth.id, 0, agent.id).chunks.some(chunk => chunk.text.includes('fixture ready'))) {
      await delay(20, undefined, { signal: ready })
    }
    const entry = [...ctx.loader.entries()].find(row => row.options.id === 'codely-local')
    assert.ok(entry?.fiber)
    await entry.fiber.dispose()
    assert.equal(ctx.commands.find(agent, 'codely'), undefined)
    assert.equal((await ctx.jobs.wait(fourth.id, 20000, agent.id)).status, 'killed')
    await assertTreeStopped(join(cwd, 'process-tree.json'))
  }
  assert.equal(modelCalls, 0)
  process.stdout.write('CODELY_LOCAL_SMOKE_OK\n')
} finally {
  await ctx?.fiber.dispose()
  await rm(cwd, { recursive: true, force: true })
}
