/** Turn usage discloses persisted route sources and leaves unrecorded sources unknown. */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { expect, it } from 'vitest'
import type { ReplayEntry } from '@deepseek-ai/dsh-llm-replay'
import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import { connectFreshWorkspace, newEnglishPage } from './support.ts'
import { launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/turn-usage-source', import.meta.url))
const ACCOUNTING = fileURLToPath(new URL('../../cli/config/examples/request-accounting.yml', import.meta.url))

function response(text: string, measurement: NonNullable<TokenUsage['measurement']>): ReplayEntry {
  return { kind: 'chunks', chunks: [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-end', index: 0, block: { type: 'text', text } },
    { type: 'usage', usage: { measurement, inputTokens: 10, outputTokens: 3, totalTokens: 13, cacheReadTokens: 0, cacheWriteTokens: 0 } },
    { type: 'finish', reason: { kind: 'stop' } },
  ] }
}

async function choose(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Select model/ }).click()
  await page.getByRole('menuitem', { name: /^Model/ }).click()
  await page.getByRole('menuitemradio', { name, exact: true }).click()
}

it.skipIf(webSnapshotMode() === 'record').each([true, false])(
  'web e2e: Turn cost sources use accounting evidence (%s)', async (recording) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-turn-source-'))
    let scaffold: WebScaffold | undefined, browser: Browser | undefined
    let primaryError: { value: unknown } | undefined
    try {
      const overlay = join(root, 'model.json'), override = join(root, 'replay.json')
      await writeFile(overlay, JSON.stringify([{ id: 'agent-default-model', config: { provider: 'source-local', model: 'm' } }]))
      await writeFile(override, JSON.stringify([
        response('SOURCE_LOCAL_DONE', 'provider-reported'), response('SOURCE_API_DONE', 'estimated'),
      ]))
      scaffold = await launchWebScaffold({
        extraOverlayPath: recording ? [overlay, ACCOUNTING] : overlay,
        replayFixture: recording ? join(DIR, 'session.v3.jsonl') : join(root, 'override-only.jsonl'),
        replayOverride: override, compareReplaySession: recording,
        replayRetryPolicy: { mode: 'normal', maxRetries: 0 },
        replayProviders: [
          { id: 'source-local', policy: { usageSource: 'local', capabilities: { tools: 'supported' } },
            models: [{ id: 'm', name: 'Source Local', toolSupport: 'supported', contextWindow: 128_000 }] },
          { id: 'source-api', policy: { usageSource: 'api_metered', capabilities: { tools: 'supported' } },
            models: [{ id: 'm', name: 'Source API', toolSupport: 'supported', contextWindow: 128_000 }] },
        ],
      })
      browser = await chromium.launch()
      const page = await newEnglishPage(browser), consoleCheck = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await page.waitForSelector('[class*="frame"]')
      await connectFreshWorkspace(page, scaffold.workspaceCwd, 'turn-usage-source')
      for (const [name, marker] of [['Source Local', 'SOURCE_LOCAL_DONE'], ['Source API', 'SOURCE_API_DONE']] as const) {
        await choose(page, name)
        await page.locator('[data-composer-input][contenteditable="true"]').last().fill(`Reply ${marker}.`)
        const settled = scaffold.whenTurnSettled()
        await page.getByRole('button', { name: 'Send message', exact: true }).click()
        await settled
        await page.getByText(marker, { exact: true }).waitFor()
      }
      const pills = page.getByRole('button', { name: 'Usage 13 tok', exact: true })
      await expect.poll(() => pills.count()).toBe(2)
      await pills.first().click()
      const dialog = page.getByRole('dialog', { name: 'Turn usage', exact: true })
      await dialog.waitFor()
      const sources = dialog.locator('[data-turn-usage-source]')
      expect(await sources.textContent()).toContain(recording ? 'Local' : 'Unknown')
      expect(await sources.textContent()).not.toContain('API metered')
      expect(await dialog.locator('[data-turn-usage-measurement]').textContent()).toBe('Reported by provider')
      await page.keyboard.press('Escape')
      await expect.poll(() => dialog.count()).toBe(0)
      await pills.last().click()
      await dialog.waitFor()
      expect(await sources.textContent()).toContain(recording ? 'API metered' : 'Unknown')
      expect(await dialog.locator('[data-turn-usage-measurement]').textContent()).toBe('Estimated')
      await page.keyboard.press('Escape')
      await page.setViewportSize({ width: 420, height: 800 })
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme })
        for (const index of [0, 1]) {
          await pills.nth(index).click()
          await dialog.waitFor()
          await expect.poll(async () => {
            const box = await dialog.boundingBox()
            return box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= 420 && box.y + box.height <= 800
          }).toBe(true)
          if (process.env.DSH_USAGE_SOURCE_SCREENSHOTS !== undefined) {
            await mkdir(process.env.DSH_USAGE_SOURCE_SCREENSHOTS, { recursive: true })
            await page.screenshot({
              path: join(process.env.DSH_USAGE_SOURCE_SCREENSHOTS, `${recording}-${index}-${colorScheme}.png`),
            })
          }
          await page.mouse.click(5, 5)
          await expect.poll(() => dialog.count()).toBe(0)
        }
      }
      expect(consoleCheck.pageErrors).toEqual([])
      expect(consoleCheck.warnings).toEqual([])
    } catch (error) { primaryError = { value: error }; throw error }
    finally {
      const failures: unknown[] = []
      await browser?.close().catch((error: unknown) => failures.push(error))
      await scaffold?.close().catch((error: unknown) => failures.push(error))
      await rm(root, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
      if (failures.length > 0) {
        throw new AggregateError([...primaryError === undefined ? [] : [primaryError.value], ...failures],
          'Turn source browser cleanup failed')
      }
    }
  },
)
