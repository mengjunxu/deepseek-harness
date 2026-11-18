/** Browser model selections reach entry intent routes on the next Turn. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { ToolCallId, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { ReplayEntry } from '@deepseek-ai/dsh-llm-replay'
import { launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const OVERLAY = fileURLToPath(new URL('./entry-intent-routing.overlay.yml', import.meta.url))
const FIRST = { provider: 'entry-alpha', model: 'alpha', reasoningEffort: 'high' }
const SECOND = { provider: 'entry-beta', model: 'beta' }

function textResponse(text: string): ReplayEntry {
  return { kind: 'chunks', chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] }
}

function toolResponse(): ReplayEntry {
  const id = ToolCallId('entry-route-tool')
  const args = JSON.stringify({ command: 'printf ENTRY_TOOL_OK', description: 'Print the routing fixture marker' })
  const chunks: StreamChunk[] = [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 0, id, name: 'bash', argumentsDelta: args },
    { type: 'block-end', index: 0, block: { type: 'tool-call', id, name: 'bash', arguments: args } },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
  return { kind: 'chunks', chunks }
}

async function chooseModel(page: Page, name: string): Promise<void> {
  const trigger = page.getByRole('button', { name: /Select model/ })
  await trigger.click()
  await page.getByRole('menuitem', { name: /^Model/ }).click()
  await page.getByRole('menuitemradio', { name, exact: true }).click()
  await expect.poll(() => trigger.getAttribute('title')).toContain(name)
}

function notices(request: GenerateOptions): string[] {
  return request.messages.flatMap(message => message.role === 'user' && message.source?.kind === 'model-selection'
    ? message.content.flatMap(block => block.type === 'text' ? [block.text] : [])
    : [])
}

describe.skipIf(webSnapshotMode() === 'record').each(['RATE_LIMIT', 'QUOTA', 'TRANSPORT'])(
  'web e2e: entry-selected intent routes (%s)', (failureCode) => {
    let scaffold: WebScaffold
    let browser: Browser
    let page: Page
    let replayDir: string
    let session: Session | undefined
    let tripwire: ReturnType<typeof watchConsole>
    const requests: GenerateOptions[] = []
    const events: SessionEvent[] = []
    const entered = Promise.withResolvers<undefined>()
    const release = Promise.withResolvers<undefined>()

    beforeAll(async () => {
      replayDir = await mkdtemp(join(tmpdir(), 'dsh-entry-intent-replay-'))
      const replayOverride = join(replayDir, 'replay.override.json')
      await writeFile(replayOverride, JSON.stringify([
        toolResponse(), textResponse('ENTRY_FIRST_DONE'), textResponse('ENTRY_SECOND_DONE'),
        { kind: 'throw', chunks: failureCode === 'TRANSPORT' ? [
          { type: 'block-start', index: 0, blockType: 'text' },
          { type: 'text-delta', index: 0, text: 'ENTRY_INTERRUPTED' },
        ] : [], message: 'Fixture route failed', code: failureCode },
        textResponse('ENTRY_RECOVERED'),
      ]))
      scaffold = await launchWebScaffold({
        extraOverlayPath: OVERLAY,
        replayFixture: join(replayDir, 'override-only.jsonl'),
        replayOverride,
        replayRetryPolicy: { mode: 'normal', maxRetries: 0 },
        replayProviders: [
          { id: 'deepseek-official', models: [{ id: 'deepseek-v4-flash', name: 'DeepSeek-V4-Flash', contextWindow: 128_000 }] },
          { id: FIRST.provider, models: [{ id: FIRST.model, name: 'Entry Alpha', contextWindow: 128_000, reasoningEfforts: ['high'] }] },
          { id: SECOND.provider, models: [{ id: SECOND.model, name: 'Entry Beta', contextWindow: 128_000 }] },
        ],
      })
      scaffold.ctx.on('session/event', (_session, event: SessionEvent) => { events.push(event) })
      scaffold.ctx.on('agent/request', async ({ agent, turn, step }, next) => {
        if (turn === 1 && step === 1) {
          session = agent.session
          entered.resolve(undefined)
          await release.promise
        }
        return next()
      })
      scaffold.ctx.on('llm/stream', (options, next) => {
        requests.push(options)
        return next()
      })
      browser = await chromium.launch()
      page = await newEnglishPage(browser)
      tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      await connectFreshWorkspace(page, scaffold.workspaceCwd, 'entry-intent-e2e')
    })

    afterAll(async () => {
      release.resolve(undefined)
      const failures: unknown[] = []
      await browser?.close().catch((error: unknown) => failures.push(error))
      await scaffold?.close().catch((error: unknown) => failures.push(error))
      if (replayDir !== undefined) {
        await rm(replayDir, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
      }
      if (failures.length > 0) throw new AggregateError(failures, 'entry intent browser cleanup failed')
    })

    it('keeps Turn routes fixed and recovers from failure only after manual model selection', async () => {
      onTestFailed(() => saveFailureShot(page, 'web-e2e-entry-intent-routing'))
      await chooseModel(page, 'Entry Alpha')
      const trigger = page.getByRole('button', { name: /Select model/ })
      await trigger.click()
      await page.getByRole('menuitem', { name: /^Effort/ }).click()
      await page.getByRole('menuitemradio', { name: /^high$/i }).click()
      await expect.poll(() => scaffold.ctx.agentDefaultModel.currentSelection()).toMatchObject(FIRST)

      const composer = page.locator('[data-composer-input][contenteditable="true"]').last()
      await composer.fill('Run the fixture tool, then finish the first turn.')
      const firstSettled = scaffold.whenTurnSettled()
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      await entered.promise
      expect(requests).toHaveLength(0)
      await chooseModel(page, 'Entry Beta')
      await expect.poll(() => session === undefined ? undefined
        : scaffold.ctx.sessionProjections.stateOf(session, 'modelSelection')?.pending).toMatchObject(SECOND)
      release.resolve(undefined)
      await firstSettled
      await page.getByText('ENTRY_FIRST_DONE', { exact: true }).waitFor()

      expect(requests).toHaveLength(2)
      for (const request of requests) {
        expect(request).toMatchObject({ ...FIRST, intent: 'plan', requiredCapabilities: [] })
        expect(notices(request)).toEqual([])
      }
      const results = events.filter(event => event.type === 'tool/result').map(event => event.data.message)
      expect(results).toHaveLength(1)
      expect(results[0]).toMatchObject({ isError: false })
      const toolText = results.flatMap(result => result.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('')
      expect(toolText).toContain('ENTRY_TOOL_OK')

      await composer.fill('Finish the next turn with the pending selection.')
      const secondSettled = scaffold.whenTurnSettled()
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      await secondSettled
      await page.getByText('ENTRY_SECOND_DONE', { exact: true }).waitFor()
      expect(requests).toHaveLength(3)
      const second = requests[2]!
      expect(second).toMatchObject({ ...SECOND, intent: 'plan', requiredCapabilities: [] })
      expect(second).not.toHaveProperty('reasoningEffort')
      expect(notices(second)).toEqual([
        '[model changed: assistant turns above this point were generated by entry-alpha/alpha; the session continues with entry-beta/beta]',
      ])
      const headers = events.filter(event => event.type === 'request/header')
      expect(headers.map(event => event.data.header.config)).toMatchObject([
        { ...FIRST, intent: 'plan', requiredCapabilities: [] },
        { ...SECOND, intent: 'plan', requiredCapabilities: [] },
      ])
      await composer.fill('Make the next request on the current route.')
      const failedSettled = scaffold.whenTurnSettled()
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      await failedSettled
      await page.getByRole('status').filter({ hasText: failureCode }).waitFor()
      expect(requests).toHaveLength(4)
      expect(requests[3]).toMatchObject(SECOND)
      expect(events.filter(event => event.type === 'turn/end').at(-1)?.data.reason).toMatchObject({ kind: 'error' })

      await chooseModel(page, 'Entry Alpha')
      await composer.fill('Continue using the model I explicitly selected.')
      const recoveredSettled = scaffold.whenTurnSettled()
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      await recoveredSettled
      await page.getByText('ENTRY_RECOVERED', { exact: true }).waitFor()
      expect(requests).toHaveLength(5)
      const recovered = requests[4]!
      expect(recovered).toMatchObject({ provider: FIRST.provider, model: FIRST.model, intent: 'plan', requiredCapabilities: [] })
      expect(recovered).not.toHaveProperty('reasoningEffort')
      const retainedText = recovered.messages.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('')
      expect(retainedText).not.toContain('ENTRY_INTERRUPTED')
      expect(notices(recovered).at(-1)).toBe(
        '[model changed: assistant turns above this point were generated by entry-beta/beta; the session continues with entry-alpha/alpha]',
      )
      expect(events.filter(event => event.type === 'turn/end').map(event => event.data.reason.kind))
        .toEqual(['completed', 'completed', 'error', 'completed'])
      expect(tripwire.pageErrors).toEqual([])
    })
  })
