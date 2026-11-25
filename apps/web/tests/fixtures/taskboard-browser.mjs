/** Drive Taskboard operations on the page served by the shipped dsh Web profile. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect } from 'playwright/test'

async function dismissSetup(page, includeNotice, hasCredential) {
  if (includeNotice) {
    const welcome = page.getByRole('dialog', { name: 'Internal Testing Notice' })
    await welcome.getByRole('button', { name: 'Continue' }).click()
    await welcome.waitFor({ state: 'detached' })
  }
  if (hasCredential) return
  const configure = page.getByRole('dialog', { name: 'Add an API key to get started' })
  await configure.getByRole('button', { name: 'Configure later' }).click()
  await configure.waitFor({ state: 'detached' })
}

async function withTaskboard(url, cookie, run, includeNotice = true, preparePage, hasCredential = false) {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
    const [name, ...parts] = cookie.split('=')
    const origin = new URL(url).origin
    await context.addCookies([{ name, value: parts.join('='), url: origin }])
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    if (preparePage) await preparePage(page)
    await page.goto(origin)
    const button = page.getByRole('button', { name: 'Taskboard', exact: true })
    try {
      await button.waitFor({ timeout: 12_000 })
      await dismissSetup(page, includeNotice, hasCredential)
      const activation = performance.now()
      await button.click()
      const result = await run(page, page.getByTestId('taskboard-page'), button, async (action) => {
        const narrow = await browser.newContext({ locale: 'zh-CN', colorScheme: 'dark', viewport: { width: 810, height: 900 } })
        try {
          await narrow.addCookies([{ name, value: parts.join('='), url: origin }])
          const localized = await narrow.newPage()
          localized.setDefaultTimeout(15_000)
          await localized.goto(origin)
          const configure = localized.getByRole('dialog', { name: '添加一个 API Key 开始使用' })
          await configure.getByRole('button', { name: '稍后配置' }).click()
          await configure.waitFor({ state: 'detached' })
          await localized.getByRole('button', { name: '任务工作台', exact: true }).click()
          await localized.locator('body[data-ds-dark-theme]').waitFor()
          await action(localized)
        } finally { await narrow.close() }
      }, activation)
      assert.deepEqual(errors, [])
      return result
    } catch (error) {
      throw new Error(`Browser Taskboard failed. Visible text: ${(await page.locator('body').innerText()).slice(0, 700)}. Errors: ${errors.join(' | ')}`,
        { cause: error })
    }
  } finally {
    await browser.close()
  }
}

/** Measure the route from selection or a committed mutation to a browser rendering opportunity. */
export async function measureTaskboardPage(url, cookie, changes) {
  const firstScreenMs = [], serviceToPageMs = []
  const painted = page => page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { resolve() }) })
  }))
  for (const [index, change] of changes.entries()) {
    await withTaskboard(url, cookie, async (page, board, _button, _narrow, activation) => {
      const backlog = board.getByRole('region', { name: 'Backlog', exact: true })
      const card = backlog.getByRole('button', { name: change.title })
      await card.waitFor()
      assert.equal(await backlog.getByRole('button').count(), 2_000 - index)
      await painted(page)
      firstScreenMs.push(Math.round(performance.now() - activation))
      await new Promise(resolve => setTimeout(resolve, change.delay))
      await change.commit()
      const committed = performance.now()
      await board.getByRole('region', { name: 'To do', exact: true }).getByRole('button', { name: change.title }).waitFor()
      await painted(page)
      serviceToPageMs.push(Math.round(performance.now() - committed))
    }, index === 0)
  }
  const p95 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]
  return { tasks: 2_000, firstScreenMs, firstScreenP95Ms: p95(firstScreenMs), serviceToPageMs, worstServiceToPageMs: Math.max(...serviceToPageMs) }
}

async function createTask(page, board, directory, title, description, { riskLevel, checkTrackedDiff, workflow, projectScript } = {}) {
  await board.getByRole('button', { name: 'New project' }).click()
  const project = page.getByRole('dialog', { name: 'New project', exact: true })
  await project.getByRole('textbox', { name: 'Project name' }).fill('Browser fixture')
  await project.getByRole('textbox', { name: 'Project folder' }).fill(directory)
  if (projectScript) {
    const custom = typeof projectScript === 'object'
    await project.getByLabel('Project validation script').selectOption(custom ? projectScript.manager : projectScript)
    if (custom) await project.getByLabel('package.json script name').fill(projectScript.name)
  }
  if (checkTrackedDiff) await project.getByRole('checkbox', { name: 'Check tracked Git changes before delivery' }).check()
  await project.getByRole('button', { name: 'Save' }).click()
  await board.getByRole('button', { name: 'Browser fixture', exact: true }).waitFor()
  return addTask(page, board, title, description, riskLevel, workflow)
}

async function addTask(page, board, title, description, riskLevel, workflow) {
  await board.getByRole('button', { name: 'New task' }).click()
  const task = page.getByRole('dialog', { name: 'New task', exact: true })
  if (workflow) {
    await task.getByLabel('Workflow').selectOption(workflow.template)
    const steps = task.getByLabel(workflow.template === 'task.milestone.v1' ? 'Stage goals (one per line)' : 'Optional steps (one per line)')
    if (workflow.steps) await steps.fill(workflow.steps.join('\n'))
    else assert.equal(await steps.count(), 0)
  }
  if (riskLevel) await task.getByLabel('Risk level').selectOption(riskLevel)
  await task.getByRole('textbox', { name: 'Title', exact: true }).fill(title)
  await task.getByRole('textbox', { name: 'Description' }).fill(description)
  await task.getByRole('textbox', { name: 'Acceptance criteria (one per line)' }).fill('Synchronize the details')
  await task.getByRole('button', { name: 'Save' }).click()
  const detail = board.getByRole('complementary', { name: title })
  await detail.getByText('Synchronize the details', { exact: true }).filter({ visible: true }).waitFor()
  await detail.getByRole('button', { name: 'Move to To do' }).click()
  await board.getByRole('region', { name: 'To do', exact: true }).getByRole('button', { name: title }).waitFor()
  return detail
}

/** Select a native adapter in the Run dialog, leaving the submitted delivery for human review. */
export function queueNativeRun(url, cookie, directory, executor) {
  return withTaskboard(url, cookie, async (page, board) => {
    const detail = await createTask(page, board, directory, 'Native delivery task', 'Read the confirmed fixture requirements')
    await detail.getByRole('button', { name: 'Start run' }).click()
    const start = page.getByRole('dialog', { name: 'Start run', exact: true })
    const choice = start.getByRole('button', { name: executor, exact: true })
    await choice.click()
    assert.equal(await choice.getAttribute('aria-pressed'), 'true')
    await start.getByRole('button', { name: 'Queue run' }).click()
    await start.waitFor({ state: 'detached' })
  })
}

/** Inspect the native submission’s file inventory and patch without recording a decision. */
export function inspectNativeFileReview(url, cookie, projectTitle, title, summary, patch, activity) {
  return withTaskboard(url, cookie, async (page, board) => {
    await board.getByRole('button', { name: projectTitle, exact: true }).click()
    await board.getByRole('region', { name: 'In review', exact: true }).getByRole('button', { name: title }).click()
    const detail = board.getByRole('complementary', { name: title })
    const history = detail.locator('details').filter({ has: page.getByText('Native tool activity', { exact: true }) })
    await history.locator('summary').click()
    const labels = { command: 'Command calls', fileChange: 'File change calls', otherTool: 'Other tool calls', read: 'Read calls',
      completed: 'Completion reports', failed: 'Failure reports', declined: 'Declined tool reports', allowed: 'Permissions allowed',
      denied: 'Permissions denied', cancelled: 'Approval requests cancelled' }
    for (const [kind, count] of Object.entries(activity)) {
      assert.equal(await history.getByText(labels[kind], { exact: true }).locator('+ dd').textContent(), String(count))
    }
    if (!Object.keys(activity).length) await history.getByText('No tool or permission events reported.').waitFor()
    await detail.getByRole('button', { name: new RegExp(summary) }).click()
    const review = page.getByRole('dialog', { name: 'Review delivery' })
    await review.getByText(patch ? 'The native tool wrote notes.txt' : 'The native tool could not write notes.txt', { exact: true }).waitFor()
    const file = review.getByRole('button', { name: 'notes.txt' })
    if (patch) {
      await file.click()
      assert.equal(await review.locator('pre').filter({ hasText: '+native edit' }).textContent(), patch)
    } else {
      assert.equal(await file.count(), 0)
    }
    await review.getByRole('button', { name: 'Return for changes' }).waitFor()
  })
}

/** Confirm one stage per Run, retry a returned stage and accept the final criteria. */
export function verifyMilestonePlan(url, cookie, directory, afterFirstAcceptance) {
  return withTaskboard(url, cookie, async (page, board) => {
    const workflow = { template: 'task.milestone.v1', steps: ['Prepare notes', 'Publish notes'] }
    const detail = await createTask(page, board, directory, 'Staged delivery', 'Deliver the notes in order', { workflow })
    for (const [index, stage] of [1, 1, 2].entries()) {
      await detail.getByRole('button', { name: 'Start run' }).click()
      const start = page.getByRole('dialog', { name: 'Start run', exact: true })
      const label = 'Stage ' + stage + '/2 · ' + workflow.steps[stage - 1]
      await start.getByText(label, { exact: true }).waitFor()
      await start.getByRole('button', { name: 'Queue run' }).click()
      const summary = 'Stage submission ' + (2 + index * 3)
      await detail.getByRole('button', { name: new RegExp(summary) }).click()
      const review = page.getByRole('dialog', { name: 'Review delivery' })
      await review.getByText(label, { exact: true }).waitFor()
      if (index === 0) {
        await review.getByRole('textbox').fill('Clarify the first stage')
        await review.getByRole('button', { name: 'Return for changes' }).click()
      } else {
        await review.getByRole('button', { name: stage === 1 ? 'Accept stage' : 'Accept delivery' }).click()
      }
      await review.waitFor({ state: 'detached' })
      await board.getByRole('region', { name: stage === 1 ? 'To do' : 'Done', exact: true })
        .getByRole('button', { name: 'Staged delivery', exact: true }).waitFor()
      if (index === 1) await afterFirstAcceptance()
    }
  })
}

/** Disconnect the visible board while another authenticated client commits task activity. */
export function verifyTaskboardReconnect(url, cookie, title, comment) {
  let active
  let disconnected = false
  let watchConnections = 0
  const resume = Promise.withResolvers()
  const preparePage = async (page) => {
    await page.routeWebSocket('**/api/remote.mux', async (client) => {
      if (disconnected) await resume.promise
      const server = client.connectToServer()
      active = { client, server }
      let watchId
      let observed = false
      client.onMessage((message) => {
        if (typeof message === 'string') {
          const frame = JSON.parse(message)
          if (frame.type === 'open' && frame.endpoint === 'taskboard/watchChanges') watchId = frame.streamId
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (!observed && typeof message === 'string') {
          const frame = JSON.parse(message)
          if (frame.type === 'item' && frame.streamId === watchId && frame.value === 'changed') {
            observed = true
            watchConnections++
          }
        }
        client.send(message)
      })
    })
    await page.route('**/api/taskboard/**', async (route) => {
      if (disconnected) await resume.promise
      await route.continue()
    })
  }
  return withTaskboard(url, cookie, async (page, board) => {
    await board.getByRole('button', { name: title, exact: true }).click()
    const detail = board.getByRole('complementary', { name: title })
    const commentRows = text => detail.getByRole('listitem').filter({ hasText: text })
    const before = 'Before the connection closed'
    const missed = 'Saved while the board was disconnected'
    const after = 'Saved after reconnection'
    await comment(before)
    await commentRows(before).waitFor()
    await expect.poll(() => watchConnections).toBeGreaterThan(0)
    const initialWatchConnections = watchConnections
    let navigations = 0
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++ })
    disconnected = true
    try {
      const loss = { code: 1012, reason: 'fixture transport loss' }
      await Promise.all([active.client.close(loss), active.server.close(loss)])
      await comment(missed, true)
      assert.equal(await commentRows(missed).count(), 0)
    } finally {
      disconnected = false
      resume.resolve()
    }
    await commentRows(missed).waitFor()
    await expect.poll(() => watchConnections, { timeout: 15_000 }).toBeGreaterThan(initialWatchConnections)
    await comment(after)
    await commentRows(after).waitFor()
    for (const text of [before, missed, after]) assert.equal(await commentRows(text).count(), 1)
    assert.equal(navigations, 0)
    return { comments: 3, missedCommentCopies: 1, pageNavigations: navigations }
  }, true, preparePage)
}

export function verifyTaskboardPage(url, cookie, directory) {
  return withTaskboard(url, cookie, async (page, board, taskboard, verifyNarrow) => {
    const title = 'Check browser task'
    const detail = await createTask(page, board, directory, title, 'Inspect the browser state')
    await detail.getByRole('button', { name: 'Edit task' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit task', exact: true })
    await dialog.getByRole('textbox', { name: 'Description' }).fill('Edited in the browser')
    await dialog.getByLabel('Risk level').selectOption('high')
    await dialog.getByLabel('Constraints', { exact: true }).fill('Keep the existing URL')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await detail.getByText('Edited in the browser', { exact: true }).filter({ visible: true }).waitFor()
    await detail.locator('p', { hasText: 'Risk level · High' }).filter({ visible: true }).waitFor()
    await detail.locator('p', { hasText: 'Keep the existing URL' }).filter({ visible: true }).waitFor()
    await detail.getByRole('textbox', { name: 'Comment' }).fill('Owner comment')
    await detail.getByRole('button', { name: 'Add comment' }).click()
    await detail.getByText(/Owner comment/).waitFor()
    const secondTitle = 'Reorder second task'
    const second = await addTask(page, board, secondTitle, 'Check keyboard ordering')
    const earlier = second.getByRole('button', { name: 'Move earlier' })
    await earlier.focus()
    await earlier.press('Enter')
    const firstCard = board.getByRole('region', { name: 'To do', exact: true }).getByRole('button').first()
    await firstCard.filter({ hasText: secondTitle }).waitFor()
    await board.getByRole('button', { name: 'List', exact: true }).click()
    await board.getByRole('textbox', { name: 'Search tasks' }).fill('does not match')
    await board.getByText('No tasks match these filters.').waitFor()
    await page.reload()
    await dismissSetup(page, false)
    await taskboard.click()
    await board.getByRole('button', { name: title, exact: true }).click()
    await detail.getByText('Edited in the browser', { exact: true }).filter({ visible: true }).waitFor()
    await detail.locator('p', { hasText: 'Risk level · High' }).filter({ visible: true }).waitFor()
    await detail.locator('p', { hasText: 'Keep the existing URL' }).filter({ visible: true }).waitFor()
    await detail.getByText(/Owner comment/).waitFor()
    const qa = process.env.DSH_TASKBOARD_QA_DIR
    if (qa) await page.screenshot({ path: join(qa, 'taskboard-en-light.png') })
    await verifyNarrow(async (localized) => {
      const localizedBoard = localized.getByTestId('taskboard-page')
      await localizedBoard.getByRole('heading', { name: '任务工作台', exact: true }).waitFor()
      await localizedBoard.getByRole('button', { name: '列表', exact: true }).click()
      await localizedBoard.getByRole('button', { name: new RegExp(title) }).click()
      await localizedBoard.getByRole('complementary', { name: title }).getByText('Edited in the browser', { exact: true })
        .filter({ visible: true }).waitFor()
      assert.equal(await localized.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false)
      if (qa) await localized.screenshot({ path: join(qa, 'taskboard-zh-dark.png') })
    })
    return { nativePanel: true, createdProjectAndTask: true, editedAndCommented: true, persistenceAfterReload: true,
      keyboardReorder: true, localizedNarrowDark: true }
  })
}

/** Download a real archive from the Taskboard's browser controls. */
export function downloadTaskboardBackup(url, cookie) {
  return withTaskboard(url, cookie, async (page, board) => {
    await board.getByRole('button', { name: 'Backup & restore' }).click()
    const panel = page.getByRole('dialog', { name: 'Backup & restore' })
    const downloading = page.waitForEvent('download')
    await panel.getByRole('button', { name: 'Download backup' }).click()
    const download = await downloading
    assert.equal(download.suggestedFilename(), 'taskboard-backup.json')
    return readFile(await download.path(), 'utf8')
  })
}

/** Upload a real archive and confirm the restored history from the browser controls. */
export function restoreTaskboardBackup(url, cookie, archive) {
  return withTaskboard(url, cookie, async (page, board) => {
    await board.getByRole('button', { name: 'Backup & restore' }).click()
    const panel = page.getByRole('dialog', { name: 'Backup & restore' })
    await panel.getByLabel('Backup file').setInputFiles({ name: 'taskboard-backup.json', mimeType: 'application/json', buffer: Buffer.from(archive) })
    await panel.getByRole('button', { name: 'Restore backup' }).click()
    await panel.getByRole('status').getByText(/Restored 2 projects and 3 tasks. Missing Session logs: 3. Canceled queued runs: 1./).waitFor()
    await panel.getByRole('button', { name: 'Close' }).click()
    await board.getByRole('button', { name: 'SDK review', exact: true }).click()
    await board.getByRole('region', { name: 'Done', exact: true }).getByRole('button', { name: 'Dispatch fixture' }).click()
    const detail = board.getByRole('complementary', { name: 'Dispatch fixture' })
    const dialog = page.getByRole('dialog', { name: 'Review delivery' })
    const decision = dialog.getByRole('region', { name: 'Human decision' })
    await detail.getByRole('button', { name: /Updated the notes · Delivery 1$/ }).click()
    await decision.getByRole('heading', { name: 'Returned delivery' }).waitFor()
    await decision.getByText('Document the final evidence after the requirements change').waitFor()
    assert.equal(await decision.getByText('Read the sealed diff manually').count(), 0)
    assert.equal(await dialog.getByRole('button', { name: 'Accept delivery' }).count(), 0)
    await dialog.getByRole('button', { name: 'Close' }).click()
    await detail.getByRole('button', { name: /Updated the notes · Delivery 2$/ }).click()
    await decision.getByRole('heading', { name: 'Accepted delivery' }).waitFor()
    await decision.getByText('Record a receipt').waitFor()
    await dialog.getByText('Model review was not requested.', { exact: true }).waitFor()
    await decision.getByText('Accepted the trailing space in the expected text fixture').waitFor()
    await decision.getByText('Read the sealed diff manually').waitFor()
    assert.ok(await decision.locator('time').getAttribute('datetime'))
    assert.equal(await decision.getByText('Document the final evidence after the requirements change').count(), 0)
    assert.equal(await dialog.getByRole('button', { name: 'Return for changes' }).count(), 0)
  })
}

export function verifyTaskboardRunPage(url, cookie, directory, noModelReview, coverageReview, customScript) {
  return withTaskboard(url, cookie, async (page, board) => {
    const title = 'Browser delivery task'
    const workflow = noModelReview ? { template: 'task.quick.v1' } : { template: 'task.standard.v1', steps: ['Read notes', 'Review changes'] }
    const projectScript = customScript ?? (noModelReview ? 'test' : 'build')
    const scriptLabel = customScript ? customScript.manager + ' run ' + customScript.name : 'npm run ' + projectScript
    const checkId = customScript ? 'project-script' : 'npm-' + projectScript
    const label = noModelReview ? 'Quick task · v1' : 'Standard task · v1'
    const detail = await createTask(page, board, directory, title, 'Run the browser delivery fixture', { riskLevel: 'low', checkTrackedDiff: true, workflow, projectScript })
    await detail.getByRole('button', { name: 'Start run' }).click()
    const start = page.getByRole('dialog', { name: 'Start run', exact: true })
    await start.getByText(directory, { exact: true }).waitFor()
    await start.locator('p', { hasText: 'Risk level · Low' }).waitFor()
    await start.locator('p', { hasText: label }).waitFor()
    await start.getByText('Project validation script · ' + scriptLabel).waitFor()
    if (workflow.steps) assert.deepEqual(await start.getByRole('list').filter({ hasText: 'Read notes' }).getByRole('listitem').allTextContents(), workflow.steps)
    await start.locator('input[type=file]').setInputFiles({ name: 'criteria.txt', mimeType: 'text/plain', buffer: Buffer.from('Keep the browser fixture working') })
    await start.getByText(/deepseek-official · deepseek-v4-pro/).waitFor()
    const [sent] = await Promise.all([
      page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/api/taskboard/startRun')),
      start.getByRole('button', { name: 'Queue run' }).click(),
    ])
    assert.deepEqual(sent.postDataJSON().payload.args.request.confirmedRoute, { provider: 'deepseek-official', model: 'deepseek-v4-pro' })
    await start.waitFor({ state: 'detached' })
    const inbox = detail.getByRole('region', { name: 'Needs your response' })
    await inbox.getByRole('checkbox', { name: 'Blue' }).check()
    await inbox.getByRole('button', { name: 'Send answer' }).click()
    await inbox.getByText('Fixture file write').waitFor()
    await inbox.getByRole('button', { name: 'Allow once' }).click()
    await detail.getByText('In review', { exact: true }).waitFor()
    await detail.getByText('deepseek-official · deepseek-v4-pro', { exact: true }).waitFor()
    await detail.getByRole('button', { name: 'Saved input' }).click()
    const saved = page.getByRole('dialog', { name: 'Saved input', exact: true })
    await saved.getByText('Run the browser delivery fixture').waitFor()
    await saved.locator('p', { hasText: 'Risk level · Low' }).waitFor()
    await saved.locator('p', { hasText: label }).waitFor()
    if (workflow.steps) assert.deepEqual(await saved.getByRole('list').filter({ hasText: 'Read notes' }).getByRole('listitem').allTextContents(), workflow.steps)
    await saved.getByText('Synchronize the details').waitFor()
    await saved.getByText('criteria.txt').click()
    await saved.getByText('Keep the browser fixture working').waitFor()
    await saved.getByText(directory, { exact: true }).waitFor()
    const specDownload = page.waitForEvent('download')
    await saved.getByRole('button', { name: 'Download task specification' }).click()
    const file = await specDownload
    assert.equal(file.suggestedFilename(), 'task-spec.json')
    const spec = JSON.parse(await readFile(await file.path(), 'utf8'))
    assert.deepEqual([spec.format, spec.version, spec.revision, spec.workspace.directory], ['dsh-task-spec', 1, 1, directory])
    assert.deepEqual(spec.projectScript, projectScript)
    assert.deepEqual(sent.postDataJSON().payload.args.request.confirmedScript, projectScript)
    assert.deepEqual(spec.input.workflow, workflow)
    assert.deepEqual(spec.input.materials, [{ reference: 'criteria.txt', text: 'Keep the browser fixture working' }])
    assert.deepEqual(spec.route, sent.postDataJSON().payload.args.request.confirmedRoute)
    assert.equal(spec.authorization.commandId, sent.postDataJSON().payload.args.request.commandId)
    assert.equal(spec.authorization.executor, 'dsh-sdk')
    assert.equal(spec.previousCheckpoint, null)
    await saved.getByText(spec.workspace.baseline, { exact: true }).waitFor()
    await saved.getByRole('button', { name: 'Close' }).click()
    await detail.getByRole('button', { name: /Updated the notes/ }).click()
    const review = page.getByRole('dialog', { name: 'Review delivery' })
    const check = review.locator('section').filter({ has: page.getByRole('heading', { name: 'Tracked changes · git diff --check' }) })
    await check.getByText('Passed', { exact: true }).waitFor()
    await check.getByText('Exit code 0', { exact: true }).waitFor()
    await review.getByText('Model review was not requested.', { exact: true }).waitFor()
    const downloading = page.waitForEvent('download')
    await review.getByRole('button', { name: 'Download review summary' }).click()
    const downloaded = await downloading
    assert.equal(downloaded.suggestedFilename(), 'taskboard-review.json')
    const summary = JSON.parse(await readFile(await downloaded.path(), 'utf8'))
    assert.equal(summary.format, 'dsh-taskboard-review')
    if (customScript) assert.ok(!JSON.stringify(summary).includes(customScript.name))
    assert.equal(summary.projectChecks[0].status, 'passed')
    const scriptCheck = summary.projectChecks.find(result => result.check === checkId)
    assert.deepEqual(scriptCheck, { check: checkId, status: noModelReview ? 'passed' : 'failed', exitCode: noModelReview ? 0 : 17, reason: null })
    const scriptSection = review.locator('section').filter({ has: page.getByRole('heading', { name: scriptLabel }) })
    await scriptSection.getByText('Exit code ' + String(scriptCheck.exitCode), { exact: true }).waitFor()
    assert.doesNotMatch(JSON.stringify(summary), /notes\.txt|Synchronize the details|reviewed browser work/)
    assert.equal(await review.getByRole('region', { name: 'Human decision' }).count(), 0)
    if (coverageReview) {
      const request = review.getByRole('button', { name: 'Request model review' })
      await request.click()
      await review.getByText(/openai · gpt-5.4-mini · Review failed/).waitFor()
      await request.click()
      await review.getByText('The project build exited with 17. Check the unverified criterion.', { exact: true }).waitFor()
      await detail.getByText('In review', { exact: true }).waitFor()
      assert.equal(await review.getByRole('region', { name: 'Human decision' }).count(), 0)
      assert.equal(await request.count(), 0)
    }
    await review.getByRole('button', { name: 'notes.txt' }).click()
    await review.getByText('+reviewed browser work', { exact: false }).waitFor()
    const accept = review.getByRole('button', { name: 'Accept delivery' })
    const waiver = review.getByRole('textbox', { name: 'Synchronize the details' })
    if (noModelReview) {
      await review.getByText('Read and updated notes.txt', { exact: true }).waitFor()
      assert.equal(await waiver.count(), 0)
      assert.equal(await accept.isEnabled(), true)
    } else {
      assert.equal(await accept.isEnabled(), false)
      await waiver.fill('Verified the file content')
      assert.equal(await accept.isEnabled(), false)
      await review.getByRole('textbox', { name: 'Return feedback or reason for accepting this check' }).fill('Reviewed the failing build result')
    }
    await accept.click()
    await review.waitFor({ state: 'detached' })
    await detail.getByText('Done', { exact: true }).waitFor()
    assert.equal(await readFile(join(directory, 'notes.txt'), 'utf8'), 'reviewed browser work\n')
    if (noModelReview) {
      await detail.getByRole('button', { name: /Updated the notes/ }).click()
      await review.getByText('Model review was not requested.', { exact: true }).waitFor()
      await review.getByRole('region', { name: 'Human decision' }).getByRole('heading', { name: 'Accepted delivery' }).waitFor()
      return { trackedCheckPassed: true, modelReviewRequested: false, acceptedByOperator: true }
    }
    if (coverageReview) return { attempts: 2, restoredAssessment: true, humanAcceptance: true }
    const qa = process.env.DSH_TASKBOARD_QA_DIR
    if (qa) await page.screenshot({ path: join(qa, 'taskboard-human-accepted.png') })
    return { startedFromBrowser: true, answeredAndApproved: true, diffAndWaiver: true, humanAcceptance: true }
  }, true, undefined, coverageReview)
}

/** Return a reviewed delivery, approve one repair and inspect the replacement before accepting. */
export function verifyReviewedRepair(url, cookie, feedback, checkReturned) {
  return withTaskboard(url, cookie, async (page, board) => {
    await board.getByRole('button', { name: 'Browser delivery task', exact: true }).click()
    const detail = board.getByRole('complementary', { name: 'Browser delivery task' })
    await detail.getByRole('button', { name: /Updated the notes/ }).click()
    const review = page.getByRole('dialog', { name: 'Review delivery' })
    const draft = review.getByRole('button', { name: 'Draft return feedback from this assessment' })
    await draft.click()
    const editor = review.getByRole('textbox', { name: 'Review feedback' })
    assert.match(await editor.inputValue(), /build exited with 17/)
    await review.getByRole('button', { name: 'Discard return draft' }).click()
    await draft.click()
    await editor.fill(feedback)
    assert.equal(await review.getByRole('button', { name: 'Accept delivery' }).isEnabled(), false)
    await review.getByRole('button', { name: 'Return for changes' }).click()
    await review.waitFor({ state: 'detached' })
    await detail.getByText('To do', { exact: true }).waitFor()
    await checkReturned()
    await detail.getByRole('button', { name: 'Start run' }).click()
    const start = page.getByRole('dialog', { name: 'Start run' })
    await start.getByRole('button', { name: 'Original folder' }).click()
    await start.getByRole('button', { name: 'Queue run' }).click()
    await start.waitFor({ state: 'detached' })
    await detail.getByRole('region', { name: 'Needs your response' }).getByRole('button', { name: 'Allow once' }).click()
    await detail.getByRole('button', { name: /Corrected the notes/ }).click()
    const check = review.locator('section').filter({ has: page.getByRole('heading', { name: 'npm run build' }) })
    await check.getByText('Exit code 0').waitFor()
    await review.getByText('Model review was not requested.', { exact: true }).waitFor()
    await review.getByRole('button', { name: 'notes.txt' }).click()
    await review.getByText('+corrected browser work', { exact: false }).waitFor()
    assert.equal(await review.getByRole('region', { name: 'Human decision' }).count(), 0)
    await review.getByRole('button', { name: 'Accept delivery' }).click()
    await detail.getByText('Done', { exact: true }).waitFor()
  }, true, undefined, true)
}

/** Choose a fresh Session in the original directory after the restored Session cannot resume. */
export function startFreshAfterRestore(url, cookie, previous, afterRejectedResume) {
  return withTaskboard(url, cookie, async (page, board) => {
    await board.getByRole('button', { name: 'Queued after delivery', exact: true }).click()
    await board.getByRole('region', { name: 'Blocked', exact: true }).getByRole('button', { name: 'Dispatch fixture' }).click()
    const detail = board.getByRole('complementary', { name: 'Dispatch fixture' })
    await detail.getByRole('button', { name: 'Move to To do' }).click()
    await detail.getByRole('button', { name: 'Start run' }).click()
    const start = page.getByRole('dialog', { name: 'Start run' })
    await start.getByRole('button', { name: 'Continue previous session' }).click()
    const checkPosition = async (dialog) => {
      await dialog.getByText('Previous run checkpoint', { exact: true }).click()
      await dialog.getByText(previous.runId, { exact: true }).waitFor()
      await dialog.getByText(previous.sessionId, { exact: true }).waitFor()
      await dialog.getByText(previous.receipt, { exact: true }).waitFor()
      await dialog.getByText(`#${previous.lastEvent.seq} · ${previous.lastEvent.type}`, { exact: true }).waitFor()
    }
    await checkPosition(start)
    await start.getByText('To continue this Session, restore its original files to the configured Session folder.').waitFor()
    await start.getByRole('button', { name: 'Queue run' }).click()
    await page.getByText(/the backup did not include the prior Session/i).waitFor()
    await afterRejectedResume()
    await start.getByRole('button', { name: 'Original folder' }).click()
    await start.getByText('A new Session will start with the current task and the materials you select here.').waitFor()
    await start.locator('input[type=file]').setInputFiles({
      name: 'restart.txt', mimeType: 'text/plain', buffer: Buffer.from('Only for the new Session'),
    })
    await start.getByRole('button', { name: 'Queue run' }).click()
    await start.waitFor({ state: 'detached' })
    await detail.getByRole('button', { name: 'Saved input' }).first().click()
    const saved = page.getByRole('dialog', { name: 'Saved input' })
    await saved.getByText('restart.txt', { exact: true }).waitFor()
    await checkPosition(saved)
    await saved.getByText('Start authorization', { exact: true }).click()
    await saved.getByText('DSH SDK', { exact: true }).waitFor()
    await saved.getByText('Confirmed by the operator', { exact: true }).waitFor()
    await saved.getByText('Queue one run', { exact: true }).waitFor()
  })
}

/** Link the dependent card and authorize its single isolated Run from the operator panel. */
export function authorizeDependentRun(url, cookie, parentId) {
  return withTaskboard(url, cookie, async (page, board) => {
    await board.getByRole('button', { name: 'Dependent card', exact: true }).click()
    const detail = board.getByRole('complementary', { name: 'Dependent card' })
    await detail.getByText('Task relationships', { exact: true }).click()
    await detail.getByRole('button', { name: 'Edit relationships' }).click()
    const relations = page.getByRole('dialog', { name: 'Task relationships' })
    await relations.getByLabel('Parent task').selectOption(parentId)
    await relations.getByLabel('Prerequisites').selectOption([parentId])
    await relations.getByRole('button', { name: 'Save' }).click()
    await relations.waitFor({ state: 'detached' })
    await detail.getByText(/Prerequisites · Dispatch fixture/).waitFor()
    await detail.getByRole('button', { name: 'Start run' }).click()
    const dialog = page.getByRole('dialog', { name: 'Start run' })
    await dialog.getByRole('button', { name: 'New worktree' }).click()
    await dialog.getByRole('checkbox', { name: /Authorize one automatic run/ }).check()
    await dialog.getByRole('button', { name: 'Queue run' }).click()
    await dialog.waitFor({ state: 'detached' })
    await detail.getByText('One automatic run authorized', { exact: true }).waitFor()
  })
}

/** Issue the first project membership in the native operator panel. */
export function issueTeamMembership(url, cookie) {
  return withTaskboard(url, cookie, async (page, board) => {
    await board.getByRole('button', { name: 'Team access' }).click()
    const panel = page.getByRole('dialog', { name: 'Team access' })
    await panel.getByLabel('Account name').fill('Lin')
    await panel.getByRole('button', { name: 'Create account' }).click()
    const key = await panel.getByLabel('New member key (shown once)').inputValue()
    const selector = panel.getByRole('combobox', { name: 'Lin', exact: true })
    await selector.waitFor()
    const account = key.split('.')[0]
    await panel.getByText(account, { exact: true }).waitFor()
    const readRole = async credential => {
      const response = await fetch(new URL('/taskboard-team-api', url), { headers: { authorization: 'Bearer ' + credential } })
      if (!response.ok) { await response.body?.cancel(); return response.status }
      return (await response.json()).projects[0]?.role ?? null
    }
    const waitForRole = async role => {
      const deadline = performance.now() + 12_000
      while (await readRole(key) !== role) {
        assert.ok(performance.now() < deadline, 'operator role change did not reach the member')
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    await selector.selectOption('editor')
    await waitForRole('editor')
    await selector.selectOption('')
    await waitForRole(null)
    await selector.selectOption('viewer')
    await waitForRole('viewer')
    await panel.getByRole('button', { name: 'Replace key' }).click()
    const issued = panel.getByLabel('New member key (shown once)')
    const deadline = performance.now() + 12_000
    while (await issued.inputValue() === key) {
      assert.ok(performance.now() < deadline, 'operator key replacement did not display a new credential')
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const replacement = await issued.inputValue()
    assert.equal(await readRole(key), 401)
    assert.equal(await readRole(replacement), 'viewer')
    return replacement
  })
}

/** Use a fresh browser context without an operator cookie for a member's read or write. */
export async function visitTeamBoard(url, key, projectId, editor) {
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ locale: 'en-US' })
    const page = await context.newPage()
    page.setDefaultTimeout(12_000)
    await page.goto(new URL('./taskboard-team.html', url).href)
    await page.getByLabel('Member key').fill(key)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await page.getByLabel('Projects').selectOption(projectId)
    const task = page.getByRole('article').filter({ hasText: 'Dispatch fixture' })
    await task.getByRole('heading', { name: 'Dispatch fixture' }).waitFor()
    if (editor) {
      await task.getByLabel('Add comment').fill('Reviewed by Lin')
      await task.getByRole('button', { name: 'Add comment' }).click()
      await task.getByText('Lin · Reviewed by Lin').waitFor()
      await task.locator('summary').click()
      await task.getByRole('textbox', { name: 'Goal', exact: true }).fill('Team edit accepted')
      await task.getByLabel('Risk level').selectOption('medium')
      await task.getByLabel('Constraints').fill('Preserve the build scripts')
      await task.getByRole('button', { name: 'Save requirements' }).click()
      await task.getByRole('paragraph').filter({ hasText: /^Team edit accepted$/ }).waitFor()
    } else {
      assert.equal(await task.getByLabel('Add comment').count(), 0)
      assert.equal(await task.locator('summary').count(), 0)
    }
    assert.equal((await context.cookies()).length, 0)
  } finally { await browser.close() }
}

/** Two independent editors read one revision and resolve a stale requirements change in their browsers. */
export async function editSharedRequirements(url, keys, projectId) {
  const browser = await chromium.launch()
  try {
    const editors = await Promise.all(keys.map(async key => {
      const context = await browser.newContext({ locale: 'en-US' })
      const page = await context.newPage()
      page.setDefaultTimeout(12_000)
      await page.goto(new URL('./taskboard-team.html', url).href)
      await page.getByLabel('Member key').fill(key)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.getByLabel('Projects').selectOption(projectId)
      const card = page.getByRole('article').filter({ hasText: 'Dispatch fixture' })
      await card.locator('summary').click()
      return { page, card }
    }))
    const [first, second] = editors
    await first.card.getByLabel('Workflow').selectOption('task.milestone.v1')
    await first.card.getByLabel('Stage goals (one per line)').fill('Read the goal\nCheck the result')
    await first.card.getByLabel('Workflow').selectOption('task.quick.v1')
    await first.card.getByLabel('Workflow').selectOption('task.milestone.v1')
    assert.equal(await first.card.getByLabel('Stage goals (one per line)').inputValue(), 'Read the goal\nCheck the result')
    await first.card.getByRole('textbox', { name: 'Goal', exact: true }).fill('First editor revision')
    await second.card.getByRole('textbox', { name: 'Goal', exact: true }).fill('Second editor revision')
    await first.card.getByRole('button', { name: 'Save requirements' }).click()
    await first.card.getByRole('paragraph').filter({ hasText: /^First editor revision$/ }).waitFor()
    await second.card.getByRole('button', { name: 'Save requirements' }).click()
    await second.page.getByRole('alert').filter({ hasText: 'Task changed' }).waitFor()
    assert.equal(await second.card.getByRole('textbox', { name: 'Goal', exact: true }).inputValue(), 'Second editor revision')
    await second.page.getByRole('button', { name: 'Refresh' }).click()
    await second.card.getByRole('paragraph').filter({ hasText: /^First editor revision$/ }).waitFor()
    await second.card.locator('summary').click()
    assert.equal(await second.card.getByLabel('Stage goals (one per line)').inputValue(), 'Read the goal\nCheck the result')
    await second.card.getByLabel('Workflow').selectOption('task.quick.v1')
    await second.card.getByRole('textbox', { name: 'Goal', exact: true }).fill('Both editors reviewed the goal')
    await second.card.getByRole('button', { name: 'Save requirements' }).click()
    await second.card.getByRole('paragraph').filter({ hasText: /^Both editors reviewed the goal$/ }).waitFor()
    await first.page.getByRole('button', { name: 'Refresh' }).click()
    await first.card.getByRole('paragraph').filter({ hasText: /^Both editors reviewed the goal$/ }).waitFor()
  } finally { await browser.close() }
}
