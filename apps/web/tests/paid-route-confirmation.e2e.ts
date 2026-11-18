/** Real Web approval precedes native inference and atomic local request receipts. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { chromium, type Browser } from 'playwright'
import { expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-user-approval'
import { connectFreshWorkspace, newEnglishPage } from './support.ts'
import { launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold } from './scaffold.ts'

const DIR = fileURLToPath(new URL('../../../snapshots/web/paid-route-confirmation', import.meta.url))
const POLICY = fileURLToPath(new URL('../../cli/config/examples/paid-route-confirmation.yml', import.meta.url))
const ACCOUNTING = fileURLToPath(new URL('../../cli/config/examples/request-accounting.yml', import.meta.url))
const PROMPT = 'Reply CONSENT_ONCE_DONE.'

it.skipIf(webSnapshotMode() === 'record').each(['allow', 'reject'] as const)(
  'web e2e: one API-metered request confirmation (%s)', async (decision) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-paid-confirmation-'))
    let scaffold: WebScaffold | undefined, browser: Browser | undefined
    let primaryError: { value: unknown } | undefined
    try {
      const overlay = join(root, 'model.json'), override = join(root, 'replay.json'), database = join(root, 'budget.db')
      const noNative = join(root, 'no-native.jsonl')
      await writeFile(noNative, (await readFile(join(DIR, 'session.v3.jsonl'), 'utf8')).split('\n')[0]! + '\n')
      await writeFile(overlay, JSON.stringify([
        { id: 'agent-default-model', config: { provider: 'consent-fixture', model: 'm' } },
        { id: 'approval', config: { policy: 'ask' } },
        { id: 'permission', config: { defaultPreset: 'workspace-write' } },
        { id: 'storage-domain', config: { backend: 'json', routes: { taskboard: 'sqlite', request_budget: 'sqlite' } } },
        { id: 'taskboard-storage', config: { path: database } },
        { insert: [
          { id: 'request-budget-policy', name: '@deepseek-ai/dsh-request-budget-policy', config: { budgets: [{
            id: 'confirmation-period', usageSource: 'api_metered', maxRequests: 1, maxRequestsPerSession: 1,
            routes: [{ provider: 'consent-fixture', models: ['m'] }],
          }] } },
        ] },
      ]))
      await writeFile(override, JSON.stringify(decision === 'reject' ? [] : [{ kind: 'chunks', chunks: [
        { type: 'block-start', index: 0, blockType: 'text' },
        { type: 'block-end', index: 0, block: { type: 'text', text: 'CONSENT_ONCE_DONE' } },
        { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } },
        { type: 'finish', reason: { kind: 'stop' } },
      ] }]))
      scaffold = await launchWebScaffold({
        extraOverlayPath: [overlay, POLICY, ACCOUNTING],
        ...decision === 'allow'
          ? { replayFixture: join(DIR, 'session.v3.jsonl'), replayOverride: override, compareReplaySession: true }
          : { replayFixture: noNative, replayProvidersOnly: true },
        replayRetryPolicy: { mode: 'normal', maxRetries: 0 },
        replayProviders: [{ id: 'consent-fixture', policy: { usageSource: 'api_metered', capabilities: { tools: 'supported' } },
          models: [{ id: 'm', name: 'Consent Fixture', toolSupport: 'supported', contextWindow: 128_000 }] }],
      })
      const events: SessionEvent[] = []
      scaffold.ctx.on('session/event', (_session, event) => { events.push(event) })
      let dispatches = 0
      scaffold.ctx.on('llm/dispatch', async function* (_dispatch, next) { dispatches++; yield* next() })
      const receipts = (): Record<string, { state: string }> => {
        const db = new DatabaseSync(database)
        try {
          const row = db.prepare('SELECT value FROM u_request_budget_budgets WHERE key = ?').get('confirmation-period')
          return (JSON.parse(String(row!.value)) as { requests: Record<string, { state: string }> }).requests
        } finally { db.close() }
      }
      browser = await chromium.launch()
      const page = await newEnglishPage(browser), tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await page.waitForSelector('[class*="frame"]')
      await connectFreshWorkspace(page, scaffold.workspaceCwd, 'paid-route-confirmation')
      await page.locator('[data-composer-input][contenteditable="true"]').last().fill(PROMPT)
      const settled = scaffold.whenTurnSettled()
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      const panel = page.locator('[data-approval-key]')
      await panel.waitFor()
      expect(await panel.textContent()).toContain('Allow one API-metered request to "consent-fixture"/"m"?')
      expect(await panel.textContent()).toContain('official balance are unknown')
      expect(dispatches).toBe(0); expect(receipts()).toEqual({})
      expect(events.filter(e => e.type === 'llm/request-accounting')).toHaveLength(0)
      await page.setViewportSize({ width: 420, height: 800 })
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme })
        const box = await panel.getByRole('button', { name: 'Allow once', exact: true }).boundingBox()
        expect(box !== null && box.y >= 0 && box.y + box.height <= 800).toBe(true)
        if (process.env.DSH_PAID_CONSENT_SCREENSHOTS !== undefined) {
          await mkdir(process.env.DSH_PAID_CONSENT_SCREENSHOTS, { recursive: true })
          await page.screenshot({ path: join(process.env.DSH_PAID_CONSENT_SCREENSHOTS, `${decision}-${colorScheme}.png`) })
        }
      }
      if (decision === 'allow') await panel.getByRole('button', { name: 'Allow once', exact: true }).click()
      else { await panel.getByRole('group', { name: 'Approval details', exact: true }).focus(); await page.keyboard.press('Escape') }
      await settled
      await expect.poll(() => panel.count()).toBe(0)
      const asked = events.find(e => e.type === 'approval/asked'), decided = events.find(e => e.type === 'approval/decided')
      expect(asked?.data.toolName).toBe('llm')
      expect(asked?.data.reason).toContain('API-metered native inference "consent-fixture"/"m"; step/start')
      expect(decided?.data).toMatchObject({ id: asked?.data.id, outcome: decision === 'allow' ? 'allowed-once' : 'rejected' })
      expect(dispatches).toBe(decision === 'allow' ? 1 : 0)
      expect(Object.values(receipts()).map(receipt => receipt.state)).toEqual(decision === 'allow' ? ['settled'] : [])
      expect(events.filter(e => e.type === 'llm/request-accounting')).toHaveLength(decision === 'allow' ? 1 : 0)
      if (decision === 'allow') await page.getByText('CONSENT_ONCE_DONE', { exact: true }).waitFor()
      else expect(events.findLast(e => e.type === 'turn/end')?.data).toMatchObject({ reason: { kind: 'error' } })
      expect(tripwire.pageErrors).toEqual([]); expect(tripwire.warnings).toEqual([])
    } catch (error) { primaryError = { value: error }; throw error }
    finally {
      const failures: unknown[] = []
      await browser?.close().catch((error: unknown) => failures.push(error))
      await scaffold?.close().catch((error: unknown) => failures.push(error))
      await rm(root, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
      if (failures.length > 0) throw new AggregateError([...primaryError === undefined ? [] : [primaryError.value], ...failures], 'Paid consent browser cleanup failed')
    }
  },
)
