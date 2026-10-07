/** Real dsh Web commands with keyless Session replay and independent filesystem checks. */
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser } from 'playwright'
import { expect, it } from 'vitest'
import { resolveExampleLaunch } from '@deepseek-ai/dsh-loader-smoke'
import { SESSION_FORMAT_VERSION } from '@deepseek-ai/dsh-session'
import {
  captureExpectedWorkspaceSnapshot, captureWorkspaceSnapshot, latestPersistedSessionPaths,
  normalizeSessionSnapshot, normalizeSessionSnapshots, redactSessionSnapshotIds, sessionFixtureName,
} from '@deepseek-ai/dsh-session-snapshot'
import { captureStableAria, compareOrRefreshGolden, normalizeWebSessionVolatiles, selectedSessionFixture, webSnapshotMode } from './scaffold.ts'
import { newEnglishPage, REPO_ROOT, saveFailureShot, writeComposerDraft } from './support.ts'

const scenario = fileURLToPath(new URL('../../../snapshots/web/mgsd-local/', import.meta.url))
const fixturePath = join(scenario, 'session.v4.jsonl')

function ready(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    const cleanup = (): void => {
      clearTimeout(timer)
      child.stdout?.off('data', received)
      child.stderr?.off('data', received)
      child.off('exit', exited)
      child.off('error', failed)
    }
    const failed = (error: Error): void => { cleanup(); reject(error) }
    const exited = (): void => { failed(new Error(`dsh exited before ready: ${output}`)) }
    const received = (chunk: Buffer): void => {
      output += chunk.toString()
      const match = /dsh web: (http:\/\/[^\s]+)/u.exec(output)
      if (match?.[1]) { cleanup(); resolve(match[1]) }
    }
    const timer = setTimeout(() => { failed(new Error(`dsh startup deadline: ${output}`)) }, 90000)
    child.stdout?.on('data', received)
    child.stderr?.on('data', received)
    child.once('exit', exited)
    child.once('error', failed)
  })
}

it('replays durable MGSD approval and execution through dsh web without a DSH model call', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-codely-browser-'))
  const workspace = join(root, 'workspace')
  const sessions = join(root, 'sessions')
  const probe = join(root, 'probe')
  let child: ChildProcess | undefined
  let browser: Browser | undefined
  let childClosed: Promise<unknown> | undefined
  try {
    await Promise.all([mkdir(sessions), mkdir(probe), mkdir(workspace)])
    const nodeConfig = join(root, 'node.json')
    await writeFile(nodeConfig, JSON.stringify({ nodeId: 'local', workspaceRoot: root, repos: { project: { path: workspace, defaultBaseRef: 'HEAD' } } }))
    const overlay = join(REPO_ROOT, 'apps/cli/config/examples/mgsd-local/cordis.patch.yml')
    const picker = join(REPO_ROOT, 'apps/web/tests/pin-browse-picker.overlay.yml')
    const launch = resolveExampleLaunch({
      srcBin: join(REPO_ROOT, 'apps/cli/src/bin.ts'),
      libBin: join(REPO_ROOT, 'apps/cli/lib/bin.js'),
      sourceImport: 'tsx/esm',
      tsconfigPath: join(REPO_ROOT, 'tsconfig.json'),
      configArgs: ['web', '--patch', overlay, '--patch', picker, '--patch', join(scenario, 'runtime.cordis.yml'), '--no-open', '--port', '0'],
    })
    child = spawn(launch.command, launch.args, {
      cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env, ...launch.env,
        DEEPSEEK_API_KEY: 'keyless-codely-browser',
        DSH_HOME: join(root, '.dsh'), DSH_AGENTS_HOME: join(root, '.agents'),
        DSH_CODELY_COMMAND: JSON.stringify([process.execPath, join(scenario, 'executor.mjs')]),
        DSH_CODELY_CHECKS: JSON.stringify([[process.execPath, join(scenario, 'check.mjs')]]),
        DSH_MGSD_NODE_CONFIG: nodeConfig, DSH_MGSD_DATABASE: join(root, 'tasks.sqlite'),
        DSH_CODELY_TEST_SESSIONS: sessions, DSH_CODELY_TEST_PROBE: probe,
        DSH_CODELY_TEST_DOCUMENTS: join(root, 'Documents'),
      },
    })
    childClosed = once(child, 'close')
    const url = await ready(child)
    const channel = process.env.DSH_TEST_BROWSER_CHANNEL
    browser = await chromium.launch(channel === undefined ? {} : { channel })
    const page = await newEnglishPage(browser)
    page.setDefaultTimeout(15000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await page.goto(url, { waitUntil: 'load' })
      await page.locator('[class*="frame"]').waitFor({ timeout: 30000 })
      await expect.poll(() => page.getByRole('button', { name: 'Choose workspace', exact: true }).textContent()).toBe('Default workspace')
      await page.getByRole('button', { name: 'Add workspace', exact: true }).click()
      const pickerDialog = page.getByRole('dialog', { name: 'Select Workspace Directory' })
      await pickerDialog.getByRole('button', { name: 'Edit path' }).click()
      const pathInput = pickerDialog.getByRole('textbox', { name: 'Edit path' })
      await pathInput.fill(workspace)
      await page.keyboard.press('Enter')
      await pathInput.waitFor({ state: 'detached' })
      await pickerDialog.getByRole('button', { name: 'Open', exact: true }).click()
      await pickerDialog.waitFor({ state: 'hidden' })
      await expect.poll(() => page.getByRole('button', { name: 'Choose workspace', exact: true }).textContent()).toBe('workspace')
      const mode = webSnapshotMode()
      const expected = await readFile(await selectedSessionFixture(fixturePath), 'utf8')
      const commands: string[] = expected.split('\n').filter(Boolean).flatMap((line) => {
        const event = JSON.parse(line) as { type?: string; data?: { name?: string; args?: string } }
        return event.type === 'command/run' ? [`/${event.data?.name}${event.data?.args}`] : []
      })
      expect(commands).toHaveLength(7)
      const input = page.locator('[data-composer-input]').first()
      const canonical = 'TASK-00000000-0000-4000-8000-000000000001'
      let actualId = ''
      for (const [commandIndex, recordedCommand] of commands.entries()) {
        const command = actualId ? recordedCommand.replaceAll(canonical, actualId) : recordedCommand
        await writeComposerDraft(page, input, command)
        await expect.poll(() => input.textContent()).toBe(command)
        await input.press('Enter')
        await expect.poll(() => input.textContent()).toBe('')
        if (command.startsWith('/mgsd create ')) {
          const created = page.getByText(/TASK-[0-9a-f-]{36}: planning/u).last()
          await created.waitFor()
          actualId = /TASK-[0-9a-f-]{36}/u.exec(await created.textContent() ?? '')![0]
        } else if (command.startsWith('/mgsd run ') && command.includes(actualId)) {
          if (commandIndex === 2) await page.getByText('Approve the current plan before execution', { exact: false }).last().waitFor()
          else {
            await expect.poll(() => existsSync(join(probe, 'mgsd-1.json'))).toBe(true)
            const outcome = JSON.parse(await readFile(join(probe, 'mgsd-1.json'), 'utf8')) as { status: string }
            expect(outcome.status).toBe('completed')
          }
        } else if (command.startsWith('/mgsd output ')) {
          await page.getByText(/Independent validation executed/u).last().click()
          await page.locator('pre').filter({ hasText: 'Validation 1 exit code: 0' }).last().waitFor()
        } else if (command.startsWith('/mgsd plan ')) await page.getByText(/: plan_ready;/u).last().waitFor()
        else if (command.startsWith('/mgsd approve ')) await page.getByText(/: approved;/u).last().waitFor()
        else await page.getByText(/: completed;/u).last().waitFor()
      }
      await page.reload({ waitUntil: 'load' })
      await page.getByText(/Independent validation executed/u).last().click()
      await page.locator('pre').filter({ hasText: 'Validation 1 exit code: 0' }).last().waitFor()
      await compareOrRefreshGolden(join(scenario, 'ui.expected.md'), (await captureStableAria(page, '[data-chat-flow]', workspace)).replaceAll(actualId, canonical), mode)
      expect(await readFile(join(probe, 'model-calls.txt'), 'utf8')).toBe('')
      expect(errors).toEqual([])
      await mkdir(join(REPO_ROOT, '.artifacts'), { recursive: true })
      await page.screenshot({ path: join(REPO_ROOT, '.artifacts/mgsd-local-browser.png'), fullPage: true })
      await browser.close()
      browser = undefined
      child.kill('SIGTERM')
      await childClosed
      const logs = latestPersistedSessionPaths((await readdir(sessions, { recursive: true })).map(path => join(sessions, path)))
      const recorded = await Promise.all(logs.map(path => readFile(path, 'utf8')))
      const withCommands = recorded.filter(log => log.includes('"command/run"'))
      expect(withCommands).toHaveLength(1)
      const raw = normalizeWebSessionVolatiles(withCommands[0]!, workspace).replaceAll(actualId, canonical)
      expect(raw).not.toContain('"request/header"')
      const normalized = redactSessionSnapshotIds([normalizeSessionSnapshot(raw, { sessionIds: [], cwd: workspace }, { identityMode: 'preserve' })])[0]!
      if (mode !== 'replay') await writeFile(join(scenario, sessionFixtureName(0, SESSION_FORMAT_VERSION)), normalized)
      else expect(normalizeSessionSnapshots([normalized], { sessionIds: [], cwd: workspace })[0])
        .toBe(normalizeSessionSnapshots([expected], { sessionIds: [], cwd: workspace })[0])
      expect(await captureWorkspaceSnapshot(workspace)).toEqual(await captureExpectedWorkspaceSnapshot(join(scenario, 'workspace.expected')))
    } catch (error) {
      await saveFailureShot(page, 'mgsd-local-browser-failure')
      throw error
    }
  } finally {
    await browser?.close()
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await childClosed
    await rm(root, { recursive: true, force: true })
  }
})
