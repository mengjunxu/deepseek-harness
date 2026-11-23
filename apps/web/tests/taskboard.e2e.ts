/** Taskboard operator commands survive a restart of the real Web Host and authenticated RPC carrier. */
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it('reopens SQLite project, revision and queue history through the authenticated Web profile', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    webProfile: true, browserSession: true, sqliteFile: true, restoredVersion: 3,
    revisions: 2, activity: 3, originalReceiptReplayed: true, queueHistoryRestored: true,
  })
})

it('reads successive task activity pages after restart and catches up from the last empty poll', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--activity-cursor'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ actions: 4, restartedAtSavedCursor: true, restoredAtSavedCursor: true, runLinked: true })
})

it('claims the queue through the Web Host and dispatches one accepted input to its SDK', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--dispatch'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    sdkReceipt: true, receiptRecoveredFrom: 'replied', modelRequests: 1, queueCanceled: true,
    stopRetainedLease: process.platform !== 'darwin', changedDirectorySkipped: true, committedEventObserved: true,
  })
})

it('recovers a lost SDK acknowledgement from the real bound Session', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--lost-sdk-ack'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    sdkReceipt: true, receiptRecoveredFrom: 'session', modelRequests: 1, queueCanceled: true,
    stopRetainedLease: process.platform !== 'darwin', changedDirectorySkipped: true, committedEventObserved: true,
  })
})

it('holds the claimed lease and sends no input when SDK permission activation fails', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--permission-failure'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ permissionBlockedInput: true, modelRequests: 0, leaseRetained: true })
})

it.skipIf(process.platform !== 'darwin')('loads the documented OpenAI-only route and retries an SDK Run after a credential rejection', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--openai-deployment'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ failedInputRetained: true, freshRetryLinked: true, modelRequests: 2,
    provider: 'openai', model: 'gpt-5.4-mini', endpoint: '/v1/responses' })
})

it.skipIf(process.platform !== 'darwin')('rejects a changed SDK patch before sending queued input or resuming a Session', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--sdk-patch-change'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    oldRunReceivedInput: false, oldReceiptReplayed: true, explicitlyRetriedRoute: true, changedPatchResumeRejected: true,
    legacyHistoryRestored: true,
  })
})

it('loads the documented deployment patch and denies anonymous archive reads', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--deployment-config'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    documentedPatchLoaded: true, localOnly: true, backupRequiresAuthentication: true, credentialsExcluded: true,
  })
})

it('reopens the confirmed Session and uses a new Session when changing workspace', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--resume'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    continuedOriginalSession: true, distinctRuns: true, modelRequests: 3, freshMaterialsOnly: true, missingSessionRejected: true,
  })
})

it.skipIf(process.platform !== 'darwin')('keeps the SDK error and creates a linked Run on explicit retry', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--failed-retry'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ failedInputRetained: true, freshRetryLinked: true, modelRequests: 2 })
})

it.skipIf(process.platform !== 'darwin')('keeps the lease until a detached SDK tool member exits on macOS', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--macos-scope'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ sdkExitedFirst: true, detachedMemberHeldLease: true, ranNextAfterScopeExit: true })
})

it.skipIf(process.platform !== 'darwin')('holds the workspace until a stopped project validation script and its descendants exit', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--script-scope'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ sdkExitedFirst: true, detachedMemberHeldLease: true, ranNextAfterScopeExit: true })
})

it.skipIf(process.platform !== 'darwin')('retains the directory and queue when even forced SDK shutdown times out', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--force-stop-timeout'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    sdkExitedFirst: true, detachedMemberHeldLease: true, ranNextAfterScopeExit: true, retainedAfterForce: true, workspacePreserved: true,
  })
})

it.skipIf(process.platform !== 'darwin')('reconciles the original scope after a Web Host crash without replaying its input', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--host-crash'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    hostCrashed: true, detachedMemberHeldLease: true, oldInputReplayed: false, ranNextAfterScopeExit: true,
    recoveredMissingReceipt: false, fileAppends: 1,
  })
})

it.skipIf(process.platform !== 'darwin')('recovers the original input acknowledgement after losing the Web Host and SDK reply', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--host-crash-lost-receipt'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    hostCrashed: true, detachedMemberHeldLease: true, oldInputReplayed: false, ranNextAfterScopeExit: true,
    recoveredMissingReceipt: true, fileAppends: 1,
  })
})

it.skipIf(process.platform !== 'darwin')('does not confuse old identical input with a new unknown attempt in a resumed Session', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--host-crash-before-receipt'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ rejectedIdenticalOldInput: true, interruptedWithoutReceipt: true, originallyAcceptedInputs: 1 })
})

it.skipIf(process.platform !== 'darwin')('restores a checked backup through the Web UI without replaying queue entries', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--backup'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    archiveDownloaded: true, archiveUploaded: true, corruptIncompatibleAndConflictsRejected: true,
    reviewHistoryPreserved: true, missingSessionReported: true, queuedRunNotStarted: true,
    incompatibleSessionKept: true, compatibleSessionContinued: true, receiptsMatchedSession: true,
    secondRestorePreservedHistory: true, explicitFreshSession: true, queuedRestoreRechecked: true,
    staleSessionRejected: true, wrongInputRejected: true,
  })
})

it('answers a native SDK question and scopes each approval to its own request', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--interactions'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    questionAnswered: true, oneWriteAllowed: true, secondWriteRejected: true, cancelledRequestFenced: true,
  })
})

it('reconciles the committed Session after the SDK event stream disconnects', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--disconnect-sdk'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ committedEndingRecovered: true, disconnectHeldLease: true, inputSentOnce: true })
})

it('binds task tools to the live Run and rejects extra scope and stale writes', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--task-tools'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ scopedRead: true, scopedProgress: true, extraScopeRejected: true, staleVersionRejected: true })
})

it.skipIf(process.platform !== 'darwin')('seals, returns and accepts deliveries through the authenticated SDK dispatch path', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--delivery'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    invalidEvidenceRejected: true, deliverySealed: true, humanReviewRequired: true, queuedRunReceivedInput: true,
    staleCodeAndRequirementsRejected: true, feedbackReachedRetry: true, acceptedWithWaiver: true,
  })
})

it('recovers missed Taskboard activity in the selected task after a browser disconnect', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--browser-reconnect'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ comments: 3, missedCommentCopies: 1, pageNavigations: 0 })
})

it('opens the real Taskboard page and restores browser-authored requirements and comments', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--browser'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({
    nativePanel: true, createdProjectAndTask: true, editedAndCommented: true, persistenceAfterReload: true,
    keyboardReorder: true, localizedNarrowDark: true,
  })
})

it.skipIf(process.platform !== 'darwin')('shows a passed project check and records human acceptance without a model review', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--no-model-review'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ trackedCheckPassed: true, modelReviewRequested: false, acceptedByOperator: true })
})

it.skipIf(process.platform !== 'darwin')('requests a separate coverage assessment, retries explicitly and restores the human decision', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--coverage-review'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ attempts: 2, restoredAssessment: true, humanAcceptance: true })
})

it.skipIf(process.platform !== 'darwin')('returns an edited assessment and requires an explicit repair Run and final human acceptance', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--reviewed-repair'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ returned: true, explicitRepairRuns: 1, buildExitCode: 0, operatorAccepted: true })
})

it.skipIf(process.platform !== 'darwin')('runs an SDK task, handles native requests and accepts evidence in the browser', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--browser-run'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ startedFromBrowser: true, answeredAndApproved: true, diffAndWaiver: true, humanAcceptance: true })
})

it.skipIf(process.platform !== 'darwin')('runs independent SDKs and waits for human acceptance before claiming the authorized dependent once', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--parallel'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ overlappingSdkRuns: 2, distinctSessions: 4, aliasedWorkspaceWaited: true, authorizedClaims: 1,
    isolatedStop: true, anonymousWritesDenied: true, waitedForHumanAcceptance: true, restartPreservedHistory: true })
})

it.skipIf(process.platform !== 'darwin')('reconciles two active SDK process scopes and continues the waiting queue after a Web Host crash', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--parallel-crash'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ recoveredActiveScopes: 2, resumedQueue: true, distinctInputs: 3, duplicateInputs: 0 })
})

it('limits named team members to current project roles across browser writes, key replacement and restart', async () => {
  const probe = fileURLToPath(new URL('./fixtures/taskboard-smoke.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [probe, '--team'], { timeout: 100_000 })
  expect(JSON.parse(stdout)).toEqual({ browserRoles: ['operator', 'viewer', 'editor'], deniedOperatorMethods: 6, scopedProjects: 2,
    concurrentEditors: 2, staleEditRejected: true, restoredAccounts: 0, attributedEdits: 4, replayedComments: 0,
    rotatedAndRevoked: true, restarted: true, backupExcludedCredentials: true })
})
