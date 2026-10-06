/** Opt-in real Codely smoke; requires DSH_CODELY_COMMAND and existing local Codely authentication. */
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { boot, loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-commands'
import type {} from '@deepseek-ai/dsh-jobs-local'

const fixture = fileURLToPath(new URL('.', import.meta.url))
assert.ok(process.env.DSH_CODELY_COMMAND, 'Set DSH_CODELY_COMMAND to the Codely executable argv JSON')
process.env.DSH_CODELY_CHECKS = JSON.stringify([[process.execPath, join(fixture, 'live-check.mjs')]])
const cwd = await mkdtemp(join(tmpdir(), 'dsh-codely-live-'))
const overlay = fileURLToPath(new URL('../../../config/examples/codely-local/cordis.patch.yml', import.meta.url))
const configPath = join(cwd, 'cordis.yml')
let ctx: Awaited<ReturnType<typeof boot>> | undefined
try {
  await copyFile(join(fixture, 'cordis.yml'), configPath)
  ctx = await boot('codely-local-live', configPath, loadOverlayPatches('codely-local-live', overlay), undefined, import.meta.url)
  const { agent } = await ctx.agents.create({ sessionId: SessionId('codely-live'), meta: { cwd } })
  let modelCalls = 0
  ctx.on('llm/stream', (_options, next) => { modelCalls += 1; return next() })
  await ctx.commands.execute(agent, '/codely run Create local-smoke.txt in the current directory containing exactly DSH_CODELY_LOCAL_OK. Do not modify any other files. No shell commands are needed.', [], new AbortController().signal)
  const job = ctx.jobs.list(agent.id)[0]!
  const settled = await ctx.jobs.wait(job.id, 120000, agent.id)
  process.stdout.write(`${JSON.stringify({ status: settled.status, detail: settled.detail, modelCalls })}\n`)
  assert.equal(settled.status, 'completed')
  assert.equal((await readFile(join(cwd, 'local-smoke.txt'), 'utf8')).trim(), 'DSH_CODELY_LOCAL_OK')
  assert.equal(modelCalls, 0)
} finally {
  await ctx?.fiber.dispose()
  await rm(cwd, { recursive: true, force: true })
}
