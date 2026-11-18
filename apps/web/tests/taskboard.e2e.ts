/** Taskboard operator commands survive a restart of the real Web Host and authenticated RPC carrier. */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it('reopens SQLite project and revision history through the authenticated Web profile', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    webProfile: true, browserSession: true, sqliteFile: true, restoredVersion: 3,
    revisions: 2, activity: 3, originalReceiptReplayed: true,
  })
})
