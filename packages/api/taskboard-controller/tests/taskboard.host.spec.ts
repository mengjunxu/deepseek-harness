import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import SessionStore, { SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import Storage from '@deepseek-ai/dsh-storage'
import * as Sqlite from '@deepseek-ai/dsh-storage-sqlite'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import TaskboardController from '../src/index.ts'
import { runCriteria } from '../src/milestones.ts'
import { projectScript, workflow } from '../src/member-board.ts'
import { nativeActivity, validationResults, verifyReviewEvidence, type RunAdmission, type TaskRun } from '../src/execution-domain.ts'
import type { ScopeObservation } from '../src/stop.ts'
import type { CommandId, ProjectId, ProjectScript, TaskId, TaskRequirements, TaskRunId } from '../src/types.ts'
import { RunInteractions } from '../src/interactions.ts'
import { TaskWorkspaces } from '../src/workspaces.ts'

const commandId = () => brandString<CommandId>(randomUUID())
const fields: TaskRequirements = { title: 'Review export', description: 'Keep the source history', acceptance: ['Old revisions remain readable'], priority: 'normal', labels: [] }

async function fixture(stopTimeoutMs = 10_000, maxParallelRuns = 1, projectScript?: ProjectScript) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'dsh-taskboard-')))
  const contexts = new Set<Context>()
  onTestFinished(async () => {
    for (const ctx of contexts) await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  })
  async function open() {
    const ctx = new Context()
    contexts.add(ctx)
    await ctx.plugin(Storage)
    await ctx.plugin(Sqlite, { path: join(root, 'workbench.db') })
    await ctx.plugin(StorageDomain, { backend: 'sqlite' })
    await ctx.plugin(SessionStore)
    await ctx.plugin(LocalSubprocessRuntime)
    await ctx.plugin(TaskboardController, { worktreeRoot: join(root, 'worktrees'), stopTimeoutMs, maxParallelRuns })
    return { service: ctx.taskboardController, close: async () => { await ctx.fiber.dispose(); contexts.delete(ctx) } }
  }
  const { service, close } = await open()
  const projectId = brandString<ProjectId>(randomUUID())
  const taskId = brandString<TaskId>(randomUUID())
  const project = { commandId: commandId(), expectedVersion: 0 as const, project: { id: projectId, title: 'First', root, ...(projectScript && { projectScript }) } }
  await service.createProject(project)
  const create = { taskId, projectId, expectedVersion: 0, commandId: commandId(), requirements: fields }
  return { root, open, service, close, project, create }
}

it('notifies an active Taskboard stream after a commit and ends a waiting subscription on abort', async () => {
  const { service, create } = await fixture()
  const controller = new AbortController()
  const updates = service.watchChanges(controller.signal)[Symbol.asyncIterator]()
  try {
    expect(await updates.next()).toEqual({ done: false, value: 'changed' })
    const changed = updates.next()
    await service.createTask(create)
    expect(await changed).toEqual({ done: false, value: 'changed' })
    expect(service.detail(create.projectId, create.taskId)?.task.title).toBe(create.requirements.title)
  } finally {
    controller.abort()
    expect(await updates.next()).toMatchObject({ done: true })
  }
})

async function admissionFor(f: Awaited<ReturnType<typeof fixture>>, sessionId: string): Promise<RunAdmission> {
  const { projectId } = f.create
  const taskId = brandString<TaskId>(randomUUID())
  const command = { projectId, taskId }
  await f.service.createTask({ ...f.create, ...command, commandId: commandId() })
  await f.service.planTask({ ...command, expectedVersion: 1, commandId: commandId() })
  return { ...command, expectedVersion: 2, commandId: commandId(), runId: brandString<TaskRunId>(randomUUID()),
    runtimeId: randomUUID(), previousRun: null, mode: 'fresh', configurationRef: 'sdk', materials: [], feedback: [],
    workspace: { directory: f.root, branch: null, baseline: null },
    session: { sessionId, workspace: f.root, home: f.root, provider: 'deepseek-official', compatibility: 'g0' } }
}

it('reopens queued starts in commit order and assigns the oldest Run to one Host', async () => {
  const f = await fixture()
  const first = await admissionFor(f, 'queued-first')
  const second = await admissionFor(f, 'queued-second')
  const other = await admissionFor(f, 'outside-queue')
  const confirmation = await f.service.inspectProject(first.projectId)
  const plan = await f.service.planWorkspace(first.projectId, first.runId, confirmation)
  const receipt = await f.service.executions.enqueue(first, plan)
  expect(await f.service.executions.enqueue(first, plan)).toEqual(receipt)
  await expect(f.service.executions.enqueue({ ...first, feedback: ['changed'] }, plan)).rejects.toThrow('command identity reused')
  const changed = { ...plan, confirmation: { ...confirmation, fingerprint: 'a'.repeat(64) } }
  await expect(f.service.executions.enqueue(first, changed)).rejects.toThrow('command identity reused')
  await expect(f.service.executions.enqueue({ ...first, expectedVersion: receipt.version, commandId: commandId() }, plan))
    .rejects.toThrow('slot is occupied')
  await expect(f.service.stopRun({ expectedVersion: receipt.version, commandId: commandId(), force: false,
    projectId: first.projectId, taskId: first.taskId, runId: first.runId })).rejects.toThrow('unknown stop target')
  await f.service.executions.enqueue(second, plan)
  const { taskId, projectId } = first
  await f.service.editTask({ taskId, projectId, commandId: commandId(), expectedVersion: receipt.version,
    requirements: { ...fields, description: 'Edited after queuing' } })
  expect(f.service.detail(projectId, taskId)?.runs[0]).toMatchObject({ state: 'queued', revision: 1, receipt: null })
  await f.close()

  const a = (await f.open()).service.executions
  const b = (await f.open()).service.executions
  const winners = (await Promise.all([a.claimNext(), b.claimNext()])).filter(run => run !== null)
  expect(winners).toHaveLength(1)
  const [claimed] = winners
  if (!claimed) throw new Error('the queue head was not claimed')
  expect(claimed).toMatchObject({ state: 'preparing', generation: 1, admission: { runId: first.runId },
    taskRevision: 1, input: { description: fields.description } })
  const owner = { ...claimed.admission, generation: claimed.generation }
  expect(await b.enqueue(first, plan)).toEqual(receipt)
  expect(await b.claimNext()).toBeNull()
  await a.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor' }, 'interrupted', 'stopped')
  await expect(a.admit(other)).rejects.toThrow('slot is occupied')
  expect(await b.claimNext()).toMatchObject({ generation: 2, admission: { runId: second.runId } })
  expect(await a.claimNext()).toBeNull()
})

it('cancels a queued Run without releasing a live lease or losing the last Session', async () => {
  const f = await fixture()
  const prior = await admissionFor(f, 'resumable')
  const run = await f.service.executions.admit(prior)
  const owner = { ...run.admission, generation: run.generation }
  await f.service.executions.started(owner, 'prior input')
  await f.service.executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor' }, 'interrupted', 'stopped')
  const { projectId, taskId } = prior
  const ready = await f.service.planTask({ projectId, taskId, commandId: commandId(), expectedVersion: 5 })
  const peer = await f.service.executions.admit(await admissionFor(f, 'peer'))
  const resume: RunAdmission = { ...prior, runId: brandString<TaskRunId>(randomUUID()), commandId: commandId(), runtimeId: randomUUID(),
    previousRun: prior.runId, expectedVersion: ready.version, mode: 'resume' }
  const confirmation = await f.service.inspectPriorWorkspace(projectId, taskId, prior.runId)
  const plan = await f.service.planContinuation(projectId, taskId, prior.runId, confirmation)
  const queued = await f.service.executions.enqueue(resume, plan)
  const cancel = { projectId, taskId, expectedVersion: queued.version, commandId: commandId() }
  await expect(f.service.executions.cancelQueued({ ...cancel, expectedVersion: ready.version }, resume.runId)).rejects.toThrow('version conflict')
  const canceled = await f.service.executions.cancelQueued(cancel, resume.runId)
  expect(await f.service.executions.cancelQueued(cancel, resume.runId)).toEqual(canceled)
  expect(await f.service.executions.enqueue(resume, plan)).toEqual(queued)
  expect(f.service.detail(projectId, taskId)?.runs[1]).toMatchObject({ runId: resume.runId, state: 'canceled', receipt: null })
  const peerOwner = { ...peer.admission, generation: peer.generation }
  expect(await f.service.executions.active(peerOwner)).toEqual(peer)
  const retry = { ...resume, expectedVersion: canceled.version, runId: brandString<TaskRunId>(randomUUID()),
    commandId: commandId(), runtimeId: randomUUID() }
  const accepted = await f.service.executions.enqueue(retry, plan)
  await f.service.executions.exited(peerOwner, { runtimeId: peerOwner.runtimeId, source: 'test supervisor' }, 'interrupted', 'stopped')
  expect(await f.service.executions.claimNext()).toMatchObject({ admission: { runId: retry.runId, previousRun: prior.runId } })
  const stop = { projectId, taskId, commandId: commandId(), expectedVersion: accepted.version }
  await expect(f.service.executions.cancelQueued(stop, retry.runId)).rejects.toThrow('not queued for this task')
})

it('refuses a replaced workspace after reopening a queued Run', async () => {
  const f = await fixture()
  const directory = join(f.root, 'selected')
  const moved = join(f.root, 'moved')
  await mkdir(directory)
  const projectId = brandString<ProjectId>(randomUUID())
  await f.service.createProject({ ...f.project, commandId: commandId(), project: { id: projectId, title: 'Selected', root: directory } })
  const taskId = f.create.taskId
  const command = (expectedVersion: number) => ({ projectId, taskId, expectedVersion, commandId: commandId() })
  await f.service.createTask({ ...command(0), requirements: fields })
  await f.service.planTask(command(1))
  const runId = brandString<TaskRunId>(randomUUID())
  const confirmation = await f.service.inspectProject(projectId)
  const plan = await f.service.planWorkspace(projectId, runId, confirmation)
  const input: RunAdmission = { ...command(2), runId, previousRun: null, runtimeId: randomUUID(), mode: 'fresh',
    configurationRef: 'sdk', materials: [], feedback: [], workspace: { directory, baseline: null, branch: null },
    session: { sessionId: 'workspace-confirmation', workspace: directory, home: f.root, provider: 'deepseek-official', compatibility: 'g0' } }
  await expect(f.service.executions.enqueue(input, { ...plan, source: moved })).rejects.toThrow('does not match')
  await f.service.executions.enqueue(input, plan)
  await f.close()
  await rename(directory, moved)
  await symlink(moved, directory, 'junction')

  const { service } = await f.open()
  const run = await service.executions.claimNext()
  if (!run) throw new Error('the queued Run was not claimed')
  const owner = { ...run.admission, generation: run.generation }
  await expect(service.prepareWorkspace(owner)).rejects.toThrow('confirm it again')
  const replacement = { ...plan, source: moved, confirmation: { ...confirmation, directory: moved } }
  await expect(service.prepareWorkspace(owner, replacement)).rejects.toThrow('confirm it again')
  expect(await service.executions.active(owner)).toMatchObject({ state: 'preparing', receipt: null, workspacePlan: plan })
})

it('grants one input attempt across Hosts and returns the committed SDK receipt on replay', async () => {
  const f = await fixture()
  const input = await admissionFor(f, 'input-attempt')
  const { projectId, taskId, runId } = input
  const plan = await f.service.planWorkspace(projectId, runId, await f.service.inspectProject(projectId))
  await f.service.executions.enqueue(input, plan)
  const run = await f.service.executions.claimNext()
  if (!run) throw new Error('the Run was not claimed')
  const owner = { ...run.admission, generation: run.generation }
  await f.service.prepareWorkspace(owner)
  await expect(f.service.executions.started(owner, 'premature receipt')).rejects.toThrow('attempt was not recorded')

  const { service: peer } = await f.open()
  const invoked = Promise.withResolvers<undefined>()
  const sdkReply = Promise.withResolvers<string>()
  const prompt = vi.fn(async (_run: TaskRun) => { invoked.resolve(undefined); return sdkReply.promise })
  await expect(peer.executions.submitInput({ ...owner, generation: owner.generation + 1 }, prompt)).rejects.toThrow('no longer owns')
  const sending = f.service.executions.submitInput(owner, prompt)
  await invoked.promise
  try {
    expect(await peer.executions.submitInput(owner, prompt)).toBeNull()
    const run = f.service.detail(projectId, taskId)?.runs[0]
    expect(run).toMatchObject({ state: 'preparing', receipt: null })
    expect(typeof run?.inputAttemptedAt).toBe('string')
  } finally {
    sdkReply.resolve('accepted input')
    await sending
  }
  expect(await sending).toBe('accepted input')
  await expect(peer.executions.started(owner, 'different receipt')).rejects.toThrow('unexpected SDK receipt')
  await peer.executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor' }, 'finished', 'completed')
  expect(await f.service.executions.submitInput(owner, prompt)).toBe('accepted input')
  expect(prompt).toHaveBeenCalledTimes(1)
  expect(prompt.mock.calls[0]?.[0].input.description).toBe(fields.description)
})

it('records an in-flight input receipt after stopping its Run without changing the next lease', async () => {
  const f = await fixture()
  const first = await admissionFor(f, 'receipt-in-flight')
  const second = await admissionFor(f, 'next-after-stop')
  const { executions } = f.service
  const claimed = await executions.admit(first)
  const owner = { ...first, generation: claimed.generation }
  const ready = Promise.withResolvers<undefined>()
  const reply = Promise.withResolvers<string>()
  const prompt = vi.fn(() => { ready.resolve(undefined); return reply.promise })
  const submitted = executions.submitInput(owner, prompt)
  await ready.promise
  await executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor' }, 'interrupted', 'stopped')
  const next = await executions.admit(second)
  expect(await executions.submitInput(owner, prompt)).toBeNull()
  reply.resolve('late SDK receipt')
  await expect(submitted).resolves.toBe('late SDK receipt')
  expect(await executions.submitInput(owner, prompt)).toBe('late SDK receipt')
  expect(prompt).toHaveBeenCalledTimes(1)
  const detail = f.service.detail(first.projectId, first.taskId)
  expect(detail?.runs[0]).toMatchObject({ state: 'interrupted', receipt: 'late SDK receipt' })
  expect(detail?.activity.at(-1)?.action).toBe('run-receipt-reconciled')
  expect(await executions.active({ ...second, generation: next.generation })).toEqual(next)
})

it('keeps the greatest bound Session position through duplicate events, stream loss, and restart', async () => {
  const f = await fixture()
  const request = await admissionFor(f, 'progress-session')
  const { executions } = f.service
  const admitted = await executions.admit(request)
  const owner = { ...request, generation: admitted.generation }
  const session = SessionId(request.session.sessionId)
  const event = { seq: SessionSeq(4), type: 'step/end', time: 1000 }
  await executions.observeSessionEvent(owner, session, event)
  await executions.observeSessionEvent(owner, session, { ...event, type: 'turn/end' })
  await executions.observeSessionEvent(owner, session, { ...event, seq: SessionSeq(1) })
  const later = { ...event, seq: SessionSeq(5) }
  await expect(executions.observeSessionEvent(owner, SessionId('other-session'), later)).rejects.toThrow('another Run Session')
  await expect(executions.observeSessionEvent({ ...owner, generation: owner.generation + 1 }, session, later))
    .rejects.toThrow('another Run Session')
  await executions.observeTransportLoss(owner)
  await executions.started(owner, 'accepted')
  expect(await executions.active(owner)).toMatchObject({ connection: 'suspect', state: 'running', lastEvent: event })
  expect(await executions.claimNext()).toBeNull()
  await executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor' }, 'finished', 'completed')
  await executions.observeSessionEvent(owner, session, later)
  await executions.observeTransportLoss(owner)
  await f.close()
  const { service } = await f.open()
  expect(service.detail(request.projectId, request.taskId)?.runs[0]).toMatchObject({
    connection: 'disconnected', state: 'finished', lastEvent: event,
  })
})

it('accepts one payload-free native summary from the owning Run', async () => {
  const f = await fixture()
  const request = await admissionFor(f, 'native-activity')
  const { executions } = f.service
  const run = await executions.admit({ ...request, model: 'fixture', sdkPatchDigest: 'a'.repeat(64),
    authorization: { executor: 'codex', routeSelection: 'operator-confirmed' } })
  const owner = { ...request, generation: run.generation }
  await executions.started(owner, 'accepted')
  const counts = { command: 1, completed: 1 }
  expect(nativeActivity.safeParse({ ...counts, commandLine: 'private' }).success).toBe(false)
  expect(nativeActivity.safeParse({ ...counts, completed: -1 }).success).toBe(false)
  await expect(executions.recordNativeActivity({ ...owner, generation: owner.generation + 1 }, counts)).rejects.toThrow('no longer owns')
  await executions.recordNativeActivity(owner, counts)
  await executions.recordNativeActivity(owner, counts)
  await expect(executions.recordNativeActivity(owner, { denied: 1 })).rejects.toThrow('already recorded')
  expect(f.service.detail(request.projectId, request.taskId)?.runs[0]?.nativeActivity).toEqual(counts)
})

it('replays a task tool write only for the same active lease and arguments', async () => {
  const f = await fixture()
  const request = await admissionFor(f, 'task-tools')
  const { executions } = f.service
  const run = await executions.admit(request)
  const owner = { ...request, generation: run.generation }
  await executions.started(owner, 'accepted')
  const task = await executions.inspectForTool(owner)
  await expect(executions.recordNativeActivity(owner, {})).rejects.toThrow('requires a native Run')
  const update = { id: commandId(), expectedVersion: task.version, action: 'run-blocked' as const, text: 'Waiting for the fixture' }
  const receipt = await executions.recordToolUpdate(owner, update)
  expect(await executions.recordToolUpdate(owner, update)).toEqual(receipt)
  await expect(executions.recordToolUpdate(owner, { ...update, text: 'Different text' })).rejects.toThrow('identity reused')
  await expect(executions.recordToolUpdate({ ...owner, taskId: f.create.taskId }, update)).rejects.toThrow('no longer owns')
  await executions.observeTransportLoss(owner)
  await expect(executions.recordToolUpdate(owner, update)).rejects.toThrow('no longer accepts task tools')
  const detail = f.service.detail(request.projectId, request.taskId)
  expect(detail?.task.status).toBe('in_progress')
  expect(detail?.activity.filter(item => item.action === 'run-blocked')).toHaveLength(1)
})

it('commits requirements and activity atomically and replays the original receipt after reopen', async () => {
  const f = await fixture()
  const { projectId, taskId } = f.create
  const receipt = await f.service.createTask(f.create)
  const edit = { ...f.create, expectedVersion: 1, commandId: commandId(), requirements: { ...fields, description: 'Second version' } }
  const comment = { projectId, taskId, expectedVersion: 1, commandId: commandId(), text: 'Operator note' }
  const results = await Promise.allSettled([f.service.editTask(edit), f.service.comment(comment)])
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(r => r.status === 'rejected')).toHaveLength(1)
  const detail = f.service.detail(projectId, taskId)
  expect(detail?.activity).toHaveLength(2)
  expect(detail?.task.version).toBe(2)
  expect(detail?.revisions[0]?.description).toBe(fields.description)
  const updated = detail?.activity[1]?.action === 'edited'
  expect(detail?.revisions).toHaveLength(updated ? 2 : 1)
  await f.close()
  const restored = (await f.open()).service
  expect(await restored.createProject(f.project)).toEqual(f.project.project)
  expect(await restored.createTask(f.create)).toEqual(receipt)
  expect(restored.detail(projectId, taskId)).toEqual(detail)
  await expect(restored.createTask({ ...f.create, requirements: { ...fields, title: 'Different action' } })).rejects.toThrow('identity reused')
  expect(restored.detail(projectId, taskId)?.activity).toHaveLength(2)
})

it('retains archived history and rejects edits outside the project or terminal state', async () => {
  const { service, create, project } = await fixture()
  const { projectId, taskId } = create
  const atVersion = (expectedVersion: number) => ({ taskId, projectId, expectedVersion, commandId: commandId() })
  await service.createTask(create)
  await service.planTask(atVersion(1))
  await service.cancelTask(atVersion(2))
  await expect(service.editTask({ ...atVersion(3), requirements: fields })).rejects.toThrow('reopen')
  await service.archiveTask(atVersion(3))
  expect(service.listTasks(projectId, false)).toEqual([])
  expect(service.listTasks(projectId, true)).toHaveLength(1)
  await service.reopenTask(atVersion(4))
  expect(service.detail(projectId, taskId)?.activity.map(event => event.action)).toEqual(['created', 'planned', 'canceled', 'archived', 'reopened'])
  const other = brandString<ProjectId>(randomUUID())
  await service.createProject({ ...project, commandId: commandId(), project: { ...project.project, id: other } })
  expect(service.detail(other, taskId)).toBeNull()
  await expect(service.comment({ ...atVersion(5), projectId: other, text: 'wrong project' })).rejects.toThrow('outside project')
  expect(service.detail(projectId, taskId)?.task.version).toBe(5)
})

it('commits project order and task activity together and retains the order across restarts', async () => {
  const f = await fixture()
  const first = f.create.taskId
  const second = brandString<TaskId>(randomUUID())
  const projectId = f.create.projectId
  await f.service.createTask(f.create)
  await f.service.createTask({ ...f.create, taskId: second, commandId: commandId() })
  const move = { taskId: second, projectId, commandId: commandId(), expectedVersion: 1, beforeTaskId: first }
  await expect(f.service.reorderTask({ ...move, beforeTaskId: brandString<TaskId>(randomUUID()) })).rejects.toThrow('destination task')
  expect(f.service.detail(projectId, second)?.activity).toHaveLength(1)
  const receipt = await f.service.reorderTask(move)
  await f.close()
  const { service } = await f.open()
  expect(service.listTasks(projectId, false).map(task => task.id)).toEqual([second, first])
  expect(await service.reorderTask(move)).toEqual(receipt)
  expect(service.detail(projectId, second)?.activity).toHaveLength(2)
})

it('retains constraints on edits from older clients and records explicit clearing once', async () => {
  const { service, create } = await fixture()
  const command = (expectedVersion: number) => ({ ...create, expectedVersion, commandId: commandId() })
  await service.createTask({ ...create, requirements: { ...fields, constraints: 'Preserve existing exports' } })
  const edit = { ...command(1), requirements: { ...fields, description: 'Review compatibility' } }
  await service.editTask(edit)
  const clear = { ...command(2), requirements: { ...edit.requirements, constraints: '' } }
  const cleared = await service.editTask(clear)
  expect(await service.editTask(clear)).toEqual(cleared)
  const result = service.detail(create.projectId, create.taskId)
  expect(result?.revisions.map(item => item.constraints)).toEqual(['Preserve existing exports', 'Preserve existing exports', ''])
  expect(result?.task.constraints).toBe('')
})

it('versions a risk-only edit and keeps its level on edits from older clients', async () => {
  const { service, create } = await fixture()
  await service.createTask(create)
  const edit = (expectedVersion: number, requirements: typeof create.requirements) =>
    service.editTask({ ...create, commandId: commandId(), expectedVersion, requirements })
  await edit(1, { ...create.requirements, riskLevel: 'medium' })
  await edit(2, { ...create.requirements, description: 'Clarified goal' })
  await edit(3, { ...create.requirements, description: 'Clarified goal', riskLevel: null })
  const result = service.detail(create.projectId, create.taskId)
  expect(result?.revisions.map(item => item.riskLevel)).toEqual([undefined, 'medium', 'medium', null])
})

it('keeps workflow versions and ordered steps across edits and restart', async () => {
  const { service, create, close, open } = await fixture()
  await service.createTask(create)
  const edit = (expectedVersion: number, requirements: typeof create.requirements) =>
    service.editTask({ ...create, commandId: commandId(), expectedVersion, requirements })
  const quick = { template: 'task.quick.v1' } as const
  const standard = (steps: string[]) => ({ template: 'task.standard.v1' as const, steps })
  const ordered = standard(['Inspect', 'Check'])
  const reordered = standard(['Check', 'Inspect'])
  await edit(1, { ...create.requirements, workflow: quick })
  await edit(2, { ...create.requirements, workflow: standard([]) })
  await edit(3, { ...create.requirements, workflow: ordered })
  await edit(4, { ...create.requirements, workflow: reordered })
  const olderClient = { ...create.requirements, description: 'Updated goal' }
  await edit(5, olderClient)
  await edit(6, { ...olderClient, workflow: null })
  await close()
  const result = (await open()).service.detail(create.projectId, create.taskId)
  expect(result?.revisions.map(item => item.workflow)).toEqual([undefined, quick, standard([]), ordered, reordered, reordered, null])
})

it('preserves an ordered milestone plan after restart and requires a stage goal', async () => {
  const { service, create, open, close } = await fixture()
  const plan = { template: 'task.milestone.v1', steps: ['Prepare', 'Ship'] } as const
  expect(runCriteria({ workflow: { ...plan, steps: [...plan.steps] }, acceptance: ['Audit', 'Ship', 'Audit'] }, 2)).toEqual(['Audit', 'Ship', 'Audit'])
  for (const steps of [[], ['  ']]) expect(workflow.safeParse({ ...plan, steps }).success).toBe(false)
  await service.createTask({ ...create, requirements: { ...fields, workflow: { ...plan, steps: [...plan.steps] } } })
  await service.planTask({ projectId: create.projectId, taskId: create.taskId, commandId: commandId(), expectedVersion: 1 })
  await close()
  const detail = (await open()).service.detail(create.projectId, create.taskId)
  expect(detail?.nextMilestone).toBe(1)
  expect(detail?.revisions[0]?.workflow).toEqual(plan)
})

it('keeps an immutable input revision, rejects stale acceptance, and requires a new Session for a different directory', async () => {
  const { service, create, root, close, open } = await fixture()
  const { projectId, taskId } = create
  const command = (expectedVersion: number) => ({ projectId, taskId, expectedVersion, commandId: commandId() })
  await service.createTask({ ...create, requirements: { ...create.requirements, constraints: 'Preserve existing exports' } })
  await service.planTask(command(1))
  const runId = brandString<import('../src/execution-domain.ts').TaskRunId>(randomUUID())
  const intent = { ...command(2), runId, runtimeId: randomUUID(), previousRun: null, mode: 'fresh' as const,
    workspace: { directory: root, branch: 'main', baseline: 'base' }, session: { sessionId: 'session-A', home: root, workspace: root,
      provider: 'deepseek-official', compatibility: 'g0' }, materials: [], configurationRef: 'sdk', feedback: [] }
  const first = await service.executions.admit(intent)
  expect(await service.executions.admit(intent)).toEqual(first)
  const owner = { ...intent, generation: first.generation }
  await service.executions.started(owner, 'sdk-receipt')
  await service.editTask({ ...command(4), requirements: { ...fields, constraints: 'Preserve file names' } })
  expect((await service.executions.inspectForTool(owner)).constraints).toBe('Preserve existing exports')
  expect(first.input.description).toEqual(fields.description)
  const id = brandString<import('../src/execution-domain.ts').DeliveryId>(randomUUID())
  const output = { id, projectId, taskId, runId, revision: 1, version: 1, snapshot: 'a'.repeat(64), summary: 'Ready for review',
    changes: [], knownIssues: [], unfinished: [], verification: [{ criterion: fields.acceptance[0]!, status: 'passed' as const, evidence: 'test log' }] }
  await service.executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor: empty' }, 'finished', 'SDK exited', output)
  await service.executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor: empty' }, 'finished', 'SDK exited', output)
  const decision = { commandId: commandId(), projectId, taskId, deliveryId: id, revision: 1, deliveryVersion: 1, snapshot: output.snapshot,
    verdict: 'accept' as const, feedback: '', waivers: [] }
  await expect(service.executions.review(6, decision, output.snapshot)).rejects.toThrow('changed')
  expect(service.detail(projectId, taskId)?.deliveries[0]?.stale).toBe(true)
  await service.executions.review(6, { ...decision, verdict: 'return', feedback: 'Update evidence' }, output.snapshot)
  const moved = join(root, 'other')
  const second = { ...intent, ...command(7), runId: brandString<typeof runId>(randomUUID()), runtimeId: randomUUID(),
    previousRun: runId, workspace: { ...intent.workspace, directory: moved }, session: { ...intent.session, workspace: moved } }
  await expect(service.executions.admit({ ...second, mode: 'resume' })).rejects.toThrow('original session')
  await expect(service.executions.admit(second)).rejects.toThrow('already referenced')
  const fresh = await service.executions.admit({ ...second, session: { ...second.session, sessionId: 'session-B' },
    materials: [{ reference: 'chosen', text: 'Selected text' }] })
  expect(fresh.input.reviewFeedback).toBe('Update evidence')
  expect(fresh.input.constraints).toBe('Preserve file names')
  await expect(service.executions.started(owner, 'late')).rejects.toThrow('no longer owns')
  await close()
  const detail = (await open()).service.detail(projectId, taskId)
  expect(detail?.runs.map(r => [r.sessionId, r.priorSessionId, r.materialReferences])).toEqual([['session-A', null, []], ['session-B', 'session-A', ['chosen']]])
  expect(detail?.reviews[0]?.verdict).toBe('return')
})

it('binds human acceptance to verified code and waivers and preserves it after reopening', async () => {
  const f = await fixture()
  const { service, create, root } = f
  const { taskId, projectId } = create
  const base = (version: number) => ({ projectId, taskId, commandId: commandId(), expectedVersion: version })
  await service.createTask(create)
  await service.planTask(base(1))
  const runId = brandString<import('../src/execution-domain.ts').TaskRunId>(randomUUID())
  const intent = { ...base(2), runId, runtimeId: randomUUID(), previousRun: null, mode: 'fresh' as const, configurationRef: 'sdk',
    session: { sessionId: 's', home: root, workspace: root, compatibility: 'g0', provider: 'deepseek-official' },
    workspace: { directory: root, branch: null, baseline: null }, materials: [], feedback: [] }
  const run = await service.executions.admit(intent)
  const owner = { ...intent, generation: run.generation }
  await service.executions.started(owner, 'receipt')
  const request = { requestId: 'one', sessionId: 's', kind: 'approval' as const, state: 'pending' as const }
  await service.executions.interaction(owner, request)
  await service.executions.interaction(owner, { ...request, state: 'withdrawn' })
  await expect(service.executions.interaction(owner, { ...request, state: 'answered' })).rejects.toThrow('settled')
  const id = brandString<import('../src/execution-domain.ts').DeliveryId>(randomUUID())
  const snapshot = 'f'.repeat(64)
  await service.executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor: empty' }, 'finished', 'confirmed exit', { id, runId, taskId, projectId, revision: 1, version: 1, snapshot,
    summary: 'One check missing', changes: [], unfinished: [], knownIssues: [],
    verification: [{ criterion: fields.acceptance[0]!, status: 'not-run', evidence: 'device unavailable' }] })
  const review = { projectId, taskId, commandId: commandId(), deliveryId: id, revision: 1, deliveryVersion: 1, snapshot, verdict: 'accept' as const, feedback: '', waivers: [] }
  await expect(service.executions.review(5, review, '0'.repeat(64))).rejects.toThrow('changed')
  await expect(service.executions.review(5, review, snapshot)).rejects.toThrow('waiver')
  const accepted = { ...review, waivers: [{ criterion: fields.acceptance[0]!, reason: 'Inspected manually' }] }
  const other = await service.executions.admit(await admissionFor(f, 'current-shared-workspace'))
  await expect(service.executions.review(5, accepted, snapshot)).rejects.toThrow('workspace is in use')
  await service.executions.exited({ ...other.admission, generation: other.generation },
    { runtimeId: other.admission.runtimeId, source: 'fixture scope empty' }, 'failed', 'fixture ended')
  await service.executions.review(5, accepted, snapshot)
  expect(service.detail(projectId, taskId)?.task.status).toBe('done')
  await service.reopenTask(base(6))
  expect(await service.executions.review(5, accepted, snapshot)).toMatchObject({ version: 6 })
  expect(service.detail(projectId, taskId)?.reviews).toHaveLength(1)
})

it('serializes competing run intents from independent Host connections and keeps the winner after restart', async () => {
  const f = await fixture()
  const a = f.create.taskId
  const b = brandString<TaskId>(randomUUID())
  const { projectId } = f.create
  for (const id of [a, b]) {
    await f.service.createTask({ ...f.create, taskId: id, commandId: commandId() })
    await f.service.planTask({ taskId: id, projectId, commandId: commandId(), expectedVersion: 1 })
  }
  const secondHost = (await f.open()).service
  const child = join(f.root, 'child')
  const alias = join(f.root, 'child-alias')
  await mkdir(child)
  await symlink(child, alias, 'dir')
  const directories = new Map([[a, f.root], [b, await realpath(alias)]])
  const intent = (taskId: TaskId) => ({ taskId, projectId, commandId: commandId(), expectedVersion: 2,
    runId: brandString<import('../src/execution-domain.ts').TaskRunId>(randomUUID()), runtimeId: randomUUID(), previousRun: null, mode: 'fresh' as const,
    workspace: { directory: directories.get(taskId)!, branch: 'main', baseline: 'base' },
    session: { sessionId: randomUUID(), home: f.root, workspace: directories.get(taskId)!,
      provider: 'deepseek-official', compatibility: 'g0' }, materials: [], configurationRef: 'sdk', feedback: [] })
  const results = await Promise.allSettled([f.service.executions.admit(intent(a)), secondHost.executions.admit(intent(b))])
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(row => row.status === 'rejected')).toHaveLength(1)
  const restored = (await f.open()).service
  expect([a, b].flatMap(id => restored.detail(projectId, id)?.runs ?? [])).toHaveLength(1)
})

it('records a completed execution without a delivery as blocked and does not infer human acceptance', async () => {
  const { service, create, root } = await fixture()
  const { taskId, projectId } = create
  await service.createTask(create)
  await service.planTask({ taskId, projectId, commandId: commandId(), expectedVersion: 1 })
  const intent = { taskId, projectId, commandId: commandId(), expectedVersion: 2, runtimeId: randomUUID(),
    runId: brandString<import('../src/execution-domain.ts').TaskRunId>(randomUUID()), previousRun: null, mode: 'fresh' as const,
    configurationRef: 'sdk', workspace: { directory: root, branch: null, baseline: null },
    session: { sessionId: 'orphaned-delivery', provider: 'deepseek-official', home: root, workspace: root, compatibility: 'g0' }, materials: [], feedback: [] }
  const run = await service.executions.admit(intent)
  const owner = { ...intent, generation: run.generation }
  await service.executions.started(owner, 'sdk-receipt')
  await service.executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor: empty' }, 'finished', 'Agent says done; runtime exited')
  expect(service.detail(projectId, taskId)).toMatchObject({ task: { status: 'blocked' }, reviews: [], deliveries: [], runs: [{ state: 'finished' }] })
})

it('holds an SDK delivery and its lease until the complete process scope is observed empty', async () => {
  const f = await fixture()
  const request = await admissionFor(f, 'staged-delivery')
  const { executions, stops } = f.service
  const run = await executions.admit(request)
  const owner = { ...request, generation: run.generation }
  await executions.started(owner, 'accepted')
  await writeFile(join(f.root, 'evidence.txt'), 'verified file')
  const task = await executions.inspectForTool(owner)
  const decision = { expectedVersion: task.version, summary: 'Finished', changes: [], knownIssues: [], unfinished: [],
    files: ['evidence.txt'], verification: [{ criterion: task.acceptance[0]!, status: 'passed' as const, evidence: 'fixture evidence' }] }
  const callId = commandId()
  const submitted = await executions.submitDelivery(owner, callId, decision)
  expect(await executions.submitDelivery(owner, callId, decision)).toEqual(submitted)
  let state: ScopeObservation['state'] = 'occupied'
  const shutdown = vi.fn(async () => ({}))
  await stops.attach(owner, { request: shutdown, waitForExit: async () => true, close: async () => {} }, async () => ({
    state, source: 'fixture process supervisor',
  }))
  await stops.finalize(owner, 'finished')
  const detail = () => f.service.detail(request.projectId, request.taskId)
  expect(detail()).toMatchObject({ task: { status: 'in_progress' }, deliveries: [],
    runs: [{ control: 'finalizing', stopFailure: 'scope-occupied' }] })
  expect(await executions.claimNext()).toBeNull()
  state = 'empty'
  await f.service.recheckRunStop(request.projectId, request.taskId, request.runId)
  expect(shutdown).toHaveBeenCalledTimes(1)
  expect(detail()).toMatchObject({ task: { status: 'in_review' }, reviews: [], runs: [{ state: 'finished' }],
    deliveries: [{ runId: request.runId, version: 1, summary: 'Finished' }] })
})

it.each<[ProjectScript, string]>([
  ['build', 'npm-build'],
  [{ manager: 'npm', name: 'verify:internal' }, 'project-script'],
  [{ manager: 'pnpm', name: 'verify:internal' }, 'project-script'],
])('reserves the confirmed project check %j and excludes a result from an earlier snapshot', async (script, check) => {
  const f = await fixture(10_000, 1, script)
  const intent = await admissionFor(f, 'project-check')
  const { executions, stops } = f.service
  await expect(executions.admit(intent)).rejects.toThrow('script differs')
  if (typeof script !== 'string') {
    const other = { ...script, manager: script.manager === 'npm' ? 'pnpm' as const : 'npm' as const }
    await expect(executions.admit({ ...intent, projectScript: other,
      authorization: { executor: 'dsh-sdk', routeSelection: 'operator-confirmed' } })).rejects.toThrow('script differs')
  }
  const run = await executions.admit({ ...intent, projectScript: structuredClone(script),
    authorization: { executor: 'dsh-sdk', routeSelection: 'operator-confirmed' } })
  const owner = { ...intent, generation: run.generation }
  await executions.started(owner, 'sdk-receipt')
  const task = await executions.inspectForTool(owner)
  const callId = commandId()
  const submission = { expectedVersion: task.version, summary: 'Built', changes: [], knownIssues: [], unfinished: [], files: [],
    verification: [{ criterion: task.acceptance[0]!, status: 'passed' as const, evidence: 'reviewed' }] }
  const received = await executions.submitDelivery(owner, callId, submission)
  expect(await executions.submitDelivery(owner, callId, submission)).toEqual(received)
  const before = 'b'.repeat(64)
  const reserve = () => executions.claimProjectScript(owner, callId, before)
  const reserved = await Promise.all([reserve(), reserve()])
  expect(reserved.filter(Boolean)).toEqual([{ script, directory: f.root }])
  const outcome = { exitCode: 0, reason: null }
  await expect(executions.recordProjectScript(owner, commandId(), outcome)).rejects.toThrow('no script reservation')
  await executions.recordProjectScript(owner, callId, outcome)
  await executions.recordProjectScript(owner, callId, outcome)
  await expect(executions.recordProjectScript(owner, callId, { exitCode: 7, reason: null })).rejects.toThrow('already recorded')
  await stops.attach(owner, { request: async () => ({}), waitForExit: async () => true, close: async () => {} },
    async () => ({ state: 'empty', source: 'fixture scope' }))
  await stops.finalize(owner, 'finished')
  const delivery = f.service.detail(intent.projectId, intent.taskId)?.deliveries[0]
  if (!delivery) throw new Error('expected sealed delivery')
  const detail = f.service.deliveryDetail(intent.projectId, intent.taskId, delivery.id)
  expect(detail.validationResults).toMatchObject([{ check, status: 'not-run', reason: 'snapshot-changed', exitCode: null }])
  expect(detail.code?.projectScriptCheck?.script).toEqual(script)
  expect(f.service.exportReviewPackage(intent.projectId, intent.taskId, delivery.id)).not.toContain('verify:internal')
  expect(() => { verifyReviewEvidence({ ...detail, code: detail.code ?? undefined }, { verdict: 'accept', feedback: '', waivers: [] }) }).toThrow('requires a reason')
})

it('accepts a named package script and excludes paths, options and shell syntax', () => {
  for (const name of ['ci:unit', 'test.all', 'test-local', 'lint_js']) expect(projectScript.safeParse({ manager: 'pnpm', name }).success).toBe(true)
  for (const name of ['', '-r', '../test', 'test all', 'test;other', 'test\n']) {
    expect(projectScript.safeParse({ manager: 'npm', name }).success).toBe(false)
  }
})

it('rechecks original changes and prepares a pinned isolated checkout only under its Run lease', async () => {
  const f = await fixture()
  const repo = join(f.root, 'repo')
  const sub = join(repo, 'project')
  const alias = join(f.root, 'alias')
  await mkdir(sub, { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  await writeFile(join(sub, 'tracked'), 'base')
  git('add', '.')
  git('-c', 'user.email=test@example.invalid', '-c', 'user.name=Test', 'commit', '-qm', 'baseline')
  await symlink(sub, alias, 'dir')
  const projectId = brandString<ProjectId>(randomUUID())
  const runId = brandString<TaskRunId>(randomUUID())
  const taskId = f.create.taskId
  const register = (id: ProjectId, baselineBranch: string) => f.service.createProject({
    ...f.project, commandId: commandId(), project: { ...f.project.project, id, root: alias, baselineBranch },
  })
  await register(projectId, 'main')
  const missingBase = brandString<ProjectId>(randomUUID())
  await register(missingBase, 'missing-branch')
  await expect(f.service.planWorkspace(missingBase, runId, null)).rejects.toThrow('rev-parse')
  await writeFile(join(sub, 'tracked'), 'dirty')
  await writeFile(join(sub, 'new'), 'one')
  const seen = await f.service.inspectProject(projectId)
  expect(seen).toMatchObject({ directory: sub, repository: repo, branch: 'main', dirty: true })
  const original = await f.service.planWorkspace(projectId, runId, seen)
  expect(original.directory).toBe(sub)
  await writeFile(join(sub, 'new'), 'two')
  await expect(f.service.planWorkspace(projectId, runId, seen)).rejects.toThrow('confirm it again')
  const isolated = await f.service.planWorkspace(projectId, runId, null)
  const base = (n: number) => ({ projectId, taskId, commandId: commandId(), expectedVersion: n })
  await f.service.createTask({ ...f.create, projectId })
  await f.service.planTask(base(1))
  await f.service.executions.enqueue({ ...base(2), runId, runtimeId: randomUUID(), previousRun: null,
    mode: 'fresh', materials: [], configurationRef: 'sdk', feedback: [], workspace: { directory: isolated.directory,
      baseline: isolated.baseline, branch: isolated.branch }, session: { sessionId: randomUUID(), workspace: isolated.directory,
      home: f.root, provider: 'deepseek-official', compatibility: 'g0' } }, isolated)
  await f.close()
  const { service } = await f.open()
  const admitted = await service.executions.claimNext()
  if (!admitted) throw new Error('the isolated Run was not claimed')
  const owner = { ...admitted.admission, generation: admitted.generation }
  await expect(service.prepareWorkspace({ ...owner, generation: owner.generation + 1 })).rejects.toThrow('no longer owns')
  await expect(service.prepareWorkspace(owner, original)).rejects.toThrow('differs')
  const started = await service.prepareWorkspace(owner)
  expect(started).toMatchObject({ directory: isolated.directory, branch: isolated.branch, head: git('rev-parse', 'HEAD'), dirty: false })
  expect(await readFile(join(started.directory, 'tracked'), 'utf8')).toBe('base')
  expect(await readFile(join(sub, 'tracked'), 'utf8')).toBe('dirty')
  expect(await readFile(join(sub, 'new'), 'utf8')).toBe('two')
  await expect(service.prepareWorkspace(owner)).rejects.toThrow('EEXIST')
  expect(await service.executions.submitInput(owner, async () => 'SDK receipt')).toBe('SDK receipt')
  await service.executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor' }, 'finished', 'completed')
  const previous = await service.inspectPriorWorkspace(projectId, taskId, runId)
  expect((await service.planContinuation(projectId, taskId, runId, previous)).directory).toBe(started.directory)
  execFileSync('git', ['-C', started.directory, 'checkout', '--quiet', '--detach'])
  const detached = await service.inspectPriorWorkspace(projectId, taskId, runId)
  expect(() => service.planContinuation(projectId, taskId, runId, detached)).toThrow('branch changed')
})

it('reviews sealed Git changes as bounded per-file diffs and detects staged, untracked, and HEAD changes', async () => {
  const f = await fixture()
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(LocalSubprocessRuntime)
  const workspace = new TaskWorkspaces(ctx.subprocess, { worktreeRoot: join(f.root, 'worktrees'), gitTimeoutMs: 5000, gitOutputMaxBytes: 1024 })
  const repo = join(f.root, 'repo')
  const cwd = join(repo, 'nested')
  const signal = AbortSignal.timeout(15_000)
  await mkdir(cwd, { recursive: true })
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim()
  git('init', '-q', '-b', 'main')
  await Promise.all(['input.txt', 'oversized.txt'].map(name => writeFile(join(cwd, name), 'before\n')))
  await writeFile(join(cwd, 'binary'), Uint8Array.of(0, 1, 2))
  git('add', '.')
  git('-c', 'user.email=test@example.invalid', '-c', 'user.name=Test', 'commit', '--no-gpg-sign', '-qm', 'baseline')
  const head = git('rev-parse', 'HEAD')
  await writeFile(join(cwd, 'input.txt'), 'after\n')
  await writeFile(join(cwd, 'oversized.txt'), 'large line\n'.repeat(4096))
  await writeFile(join(cwd, 'binary'), Uint8Array.of(0, 2, 3))
  await writeFile(join(cwd, 'new.txt'), 'extra\n')
  git('add', 'nested/input.txt')
  const saved = await workspace.captureDelivery(cwd, head, [], signal)
  expect(saved).toMatchObject({ scope: 'git', baseline: head, head, files: [
    { path: 'binary', status: 'modified' }, { path: 'input.txt', status: 'modified' },
    { path: 'new.txt', status: 'untracked' }, { path: 'oversized.txt', status: 'modified' },
  ] })
  const patch = await workspace.readDeliveryFile(cwd, saved, 'input.txt', signal)
  expect(patch.kind === 'patch' && patch.text).toContain('+after')
  expect(await workspace.readDeliveryFile(cwd, saved, 'binary', signal)).toEqual({ kind: 'binary' })
  expect(await workspace.readDeliveryFile(cwd, saved, 'new.txt', signal)).toEqual({ kind: 'file', text: 'extra\n' })
  expect(await workspace.readDeliveryFile(cwd, saved, 'oversized.txt', signal)).toEqual({ kind: 'oversized' })
  await writeFile(join(cwd, 'new.txt'), 'other\n')
  await expect(workspace.readDeliveryFile(cwd, saved, 'input.txt', signal)).rejects.toThrow('workspace has changed')
  await writeFile(join(cwd, 'new.txt'), 'extra\n')
  expect((await workspace.captureDelivery(cwd, head, [], signal)).fingerprint).toBe(saved.fingerprint)
  git('-c', 'user.email=test@example.invalid', '-c', 'user.name=Test', 'commit', '--no-gpg-sign', '-qm', 'staged revision')
  expect((await workspace.captureDelivery(cwd, head, [], signal)).fingerprint).not.toBe(saved.fingerprint)
})

it('limits non-Git review to declared paths and refuses files outside the Run workspace', async () => {
  const f = await fixture()
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(LocalSubprocessRuntime)
  const workspace = new TaskWorkspaces(ctx.subprocess, { worktreeRoot: join(f.root, 'worktrees'), gitTimeoutMs: 5000, gitOutputMaxBytes: 1024 })
  const cwd = join(f.root, 'selected')
  const signal = AbortSignal.timeout(10_000)
  await mkdir(cwd)
  await writeFile(join(cwd, 'result.txt'), 'submitted result')
  await writeFile(join(cwd, 'omitted.txt'), 'other work')
  await symlink(f.root, join(cwd, 'linked'), 'dir')
  const saved = await workspace.captureDelivery(cwd, null, ['result.txt'], signal, true)
  expect(saved.gitDiffCheck).toBe('not-run')
  const [check] = validationResults({ code: saved, snapshot: saved.fingerprint })
  expect(check?.observedAt).toBeTypeOf('string')
  expect(check).toMatchObject({ check: 'git-diff-check', snapshot: saved.fingerprint,
    status: 'not-run', exitCode: null, reason: 'outside-git' })
  const evidence = { code: saved, snapshot: saved.fingerprint, verification: [{ criterion: 'Read result', status: 'passed' as const, evidence: 'Inspected' }] }
  const review = { verdict: 'accept' as const, feedback: '', waivers: [] }
  expect(() => { verifyReviewEvidence(evidence, review) }).toThrow('unsuccessful project check')
  verifyReviewEvidence(evidence, { ...review, feedback: 'Reviewed the declared file' })
  expect(saved).toMatchObject({ scope: 'declared-files', baseline: null, files: [{ path: 'result.txt', status: 'declared' }] })
  await expect(workspace.captureDelivery(cwd, null, ['../workbench.db'], signal)).rejects.toThrow('outside workspace')
  await expect(workspace.captureDelivery(cwd, null, ['linked/workbench.db'], signal)).rejects.toThrow('outside workspace')
  await expect(workspace.readDeliveryFile(cwd, saved, 'omitted.txt', signal)).rejects.toThrow('outside the delivery snapshot')
  await writeFile(join(cwd, 'omitted.txt'), 'new unrelated content')
  expect(await workspace.readDeliveryFile(cwd, saved, 'result.txt', signal)).toEqual({ kind: 'file', text: 'submitted result' })
})

it('retains an unconfirmed stop through Host restart and requires an explicit, versioned force request', async () => {
  const f = await fixture()
  const { projectId, taskId } = f.create
  const command = (v: number) => ({ projectId, taskId, expectedVersion: v, commandId: commandId() })
  const seen = await f.service.inspectProject(projectId)
  expect(seen.repository).toBeNull()
  const runId = brandString<TaskRunId>(randomUUID())
  await expect(f.service.planWorkspace(projectId, runId, null)).rejects.toThrow('Git baseline')
  const original = await f.service.planWorkspace(projectId, runId, seen)
  await f.service.createTask(f.create)
  await f.service.planTask(command(1))
  const intent = { ...command(2), runId, runtimeId: randomUUID(), previousRun: null, mode: 'fresh' as const, materials: [],
    feedback: [], configurationRef: 'sdk', workspace: { directory: original.directory, branch: null, baseline: null },
    session: { workspace: original.directory, sessionId: 'serial', home: f.root, provider: 'deepseek-official', compatibility: 'g0' } }
  const run = await f.service.executions.admit(intent)
  const owner = { ...intent, generation: run.generation }
  expect((await f.service.prepareWorkspace(owner, original)).directory).toBe(f.root)
  await f.service.executions.started(owner, 'SDK accepted')
  await expect(f.service.executions.requestStop(owner, command(4), true)).rejects.toThrow('control state')
  const stop = command(4)
  const receipt = await f.service.executions.requestStop(owner, stop, false)
  expect(await f.service.executions.requestStop(owner, stop, false)).toEqual({ receipt: receipt.receipt, issued: false })
  await f.close()
  const { service } = await f.open()
  await service.stopRun({ ...stop, runId, force: false })
  expect(service.detail(projectId, taskId)?.runs[0]).toMatchObject({ stopFailure: 'runtime-unavailable', control: 'stop_requested', connection: 'suspect', state: 'running' })
  await service.recheckRunStop(projectId, taskId, runId)
  expect((await service.executions.active(owner)).stopFailure).toBe('runtime-unavailable')
  await expect(service.executions.requestStop({ ...owner, generation: owner.generation + 1 }, command(5), true)).rejects.toThrow('no longer owns')
  await service.executions.requestStop(owner, command(5), true)
  await service.executions.stopUnconfirmed(owner, 'deadline')
  expect((await service.executions.active(owner)).admission.workspace.directory).toBe(f.root)
  await expect(service.cancelTask(command(6))).rejects.toThrow('stop the active run')
})

it('signals only the attached client and releases its generation after both exit observations', async () => {
  const f = await fixture()
  const { projectId, taskId } = f.create
  const cmd = (v: number) => ({ projectId, taskId, expectedVersion: v, commandId: commandId() })
  const runId = brandString<TaskRunId>(randomUUID())
  await f.service.createTask(f.create)
  await f.service.planTask(cmd(1))
  const run = await f.service.executions.admit({ ...cmd(2), runId, previousRun: null, runtimeId: randomUUID(),
    configurationRef: 'sdk', mode: 'fresh', materials: [], feedback: [], workspace: { directory: f.root, baseline: null, branch: null },
    session: { workspace: f.root, sessionId: 'target', home: f.root, provider: 'deepseek-official', compatibility: 'G0' } })
  const owner = { ...run.admission, generation: run.generation }
  const calls: string[] = []
  let scopeEmpty = false
  await f.service.stops.attach(owner, {
    request: async () => { calls.push('shutdown'); return {} },
    close: async () => { calls.push('force') },
    waitForExit: async () => true,
  }, async () => ({ state: scopeEmpty ? 'empty' : 'occupied', source: 'test supervisor' }))
  const stop = { ...cmd(3), runId, force: false }
  await f.service.stopRun(stop)
  expect(f.service.detail(projectId, taskId)?.runs[0]).toMatchObject({ connection: 'suspect', stopFailure: 'scope-occupied' })
  scopeEmpty = true
  const force = { ...cmd(4), runId, force: true }
  await Promise.all([f.service.stopRun(force), f.service.stopRun(force)])
  await f.service.stopRun(force)
  expect(calls).toEqual(['shutdown', 'force'])
  expect(f.service.detail(projectId, taskId)?.runs[0]).toMatchObject({ state: 'interrupted', stopFailure: null })
  await expect(f.service.executions.active(owner)).rejects.toThrow('no longer owns')
})

it('delivers a stop recorded during the SDK handshake once the client is attached', async () => {
  const f = await fixture()
  const intent = await admissionFor(f, 'stop-before-attach')
  const { projectId, taskId, runId } = intent
  const admitted = await f.service.executions.admit(intent)
  const owner = { ...intent, generation: admitted.generation }
  const request = { projectId, taskId, runId, commandId: commandId(), expectedVersion: 3, force: false }
  await f.service.stopRun(request)
  expect((await f.service.executions.active(owner)).stopFailure).toBe('runtime-unavailable')
  const shutdown = vi.fn(() => Promise.resolve({}))
  await f.service.stops.attach(owner, {
    request: shutdown,
    close: () => Promise.resolve(),
    waitForExit: () => Promise.resolve(true),
  }, () => Promise.resolve({ state: 'unknown', source: 'test supervisor' }))
  expect(await f.service.stops.shutdownAfterAttach(owner)).toBe(true)
  await f.service.stopRun(request)
  expect(shutdown).toHaveBeenCalledTimes(1)
  expect((await f.service.executions.active(owner)).stopFailure).toBe('scope-unknown')
})

it('returns at the stop deadline and ignores a late acknowledgement without freeing the workspace', async () => {
  const f = await fixture(50)
  const { projectId, taskId } = f.create
  const cmd = (v: number) => ({ projectId, taskId, expectedVersion: v, commandId: commandId() })
  const runId = brandString<TaskRunId>(randomUUID())
  await f.service.createTask(f.create)
  await f.service.planTask(cmd(1))
  const run = await f.service.executions.admit({ ...cmd(2), runId, previousRun: null, runtimeId: randomUUID(), mode: 'fresh',
    configurationRef: 'sdk', materials: [], feedback: [], workspace: { directory: f.root, branch: null, baseline: null },
    session: { workspace: f.root, sessionId: 'delayed', home: f.root, provider: 'deepseek-official', compatibility: 'G0' } })
  const owner = { ...run.admission, generation: run.generation }
  const reply = Promise.withResolvers<boolean>()
  let observed = false
  await f.service.stops.attach(owner, { request: () => reply.promise, close: async () => {}, waitForExit: async () => true }, async () => {
    observed = true
    return { state: 'empty', source: 'test supervisor' }
  })
  await f.service.stopRun({ ...cmd(3), runId, force: false })
  reply.resolve(true)
  expect((await f.service.executions.active(owner)).stopFailure).toBe('deadline')
  expect(observed).toBe(false)
})

it('rechecks the same stopped runtime without signalling again and commits confirmed exit once', async () => {
  const f = await fixture()
  const { projectId, taskId } = f.create
  const cmd = (v: number) => ({ projectId, taskId, expectedVersion: v, commandId: commandId() })
  const runId = brandString<TaskRunId>(randomUUID())
  await f.service.createTask(f.create)
  await f.service.planTask(cmd(1))
  const run = await f.service.executions.admit({ ...cmd(2), runId, previousRun: null, runtimeId: randomUUID(), mode: 'fresh',
    configurationRef: 'sdk', materials: [], feedback: [], workspace: { directory: f.root, baseline: null, branch: null },
    session: { workspace: f.root, sessionId: 'recheck', home: f.root, provider: 'deepseek-official', compatibility: 'g0' } })
  const owner = { ...run.admission, generation: run.generation }
  const request = vi.fn(async () => ({}))
  const close = vi.fn(async () => {})
  const observing = Promise.withResolvers<undefined>()
  const empty = Promise.withResolvers<ScopeObservation>()
  const scope = vi.fn(async () => { observing.resolve(undefined); return empty.promise })
    .mockResolvedValueOnce({ state: 'unknown', source: 'no complete process observation' })
  const waitForExit = vi.fn(async () => true).mockResolvedValueOnce(false)
  await f.service.stops.attach(owner, { request, close, waitForExit }, scope)
  await expect(f.service.recheckRunStop(projectId, taskId, runId)).rejects.toThrow('no unconfirmed stop')
  await f.service.stopRun({ ...cmd(3), runId, force: false })
  expect((await f.service.executions.active(owner)).stopFailure).toBe('runtime-alive')
  await f.service.recheckRunStop(projectId, taskId, runId)
  expect((await f.service.executions.active(owner)).stopFailure).toBe('scope-unknown')
  const first = f.service.recheckRunStop(projectId, taskId, runId)
  await observing.promise
  const second = f.service.recheckRunStop(projectId, taskId, runId)
  empty.resolve({ state: 'empty', source: 'test supervisor' })
  await Promise.all([first, second])
  await f.service.recheckRunStop(projectId, taskId, runId)
  expect(request).toHaveBeenCalledTimes(1)
  expect(close).not.toHaveBeenCalled()
  expect(scope).toHaveBeenCalledTimes(2)
  const detail = f.service.detail(projectId, taskId)
  expect(detail?.runs[0]).toMatchObject({ state: 'interrupted', stopFailure: null })
  expect(detail?.activity.filter(entry => entry.action === 'run-ended')).toHaveLength(1)
  await expect(f.service.executions.active(owner)).rejects.toThrow('no longer owns')
})

it('two Hosts fill independent slots and keep a conflicting Run queued until its own workspace is released', async () => {
  const f = await fixture(10_000, 2)
  const peer = (await f.open()).service
  const first = await admissionFor(f, 'first')
  const conflict = await admissionFor(f, 'conflict')
  const second = await admissionFor(f, 'second')
  const confirmation = await f.service.inspectProject(first.projectId)
  const plan = await f.service.planWorkspace(first.projectId, first.runId, confirmation)
  await f.service.executions.enqueue(first, plan)
  const nested = join(f.root, 'nested')
  await f.service.executions.enqueue({ ...conflict, workspace: { ...conflict.workspace, directory: nested },
    session: { ...conflict.session, workspace: nested } }, { ...plan, mode: 'original', checkout: null, directory: nested, source: nested,
    confirmation: { ...confirmation, directory: nested } })
  const directory = f.root + '-sibling'
  await f.service.executions.enqueue({ ...second, workspace: { ...second.workspace, directory },
    session: { ...second.session, workspace: directory } },
  { ...plan, mode: 'original', checkout: null, directory, source: directory, confirmation: { ...confirmation, directory } })
  const claimed = await Promise.all([f.service.executions.claimNext(), peer.executions.claimNext()])
  expect(claimed.map(run => run?.admission.runId).sort()).toEqual([first.runId, second.runId].sort())
  expect(await f.service.executions.claimNext()).toBeNull()
  const interactions = new RunInteractions(f.service.executions)
  const id = brandString<import('../src/types.ts').TaskInteractionId>(randomUUID())
  const requests = claimed.map((run) => {
    if (!run) throw new Error('missing concurrent Run')
    const owner = { ...run.admission, generation: run.generation }
    const sessionId = run.admission.session.sessionId
    const reply = interactions.request(owner, sessionId, 'approval/request', { sessionId, requestId: id, toolName: 'write' })
    return { owner, reply }
  })
  await vi.waitFor(() => { for (const { owner } of requests) expect(interactions.list(owner)).toHaveLength(1) })
  const [allowed, rejected] = requests
  await interactions.answer(allowed!.owner, { ...allowed!.owner, kind: 'approval', requestId: id, outcome: 'allowed-once' })
  expect(await allowed!.reply).toEqual({ outcome: 'allowed-once' })
  expect(interactions.list(rejected!.owner)).toHaveLength(1)
  await interactions.answer(rejected!.owner, { ...rejected!.owner, kind: 'approval', requestId: id, outcome: 'rejected' })
  expect(await rejected!.reply).toEqual({ outcome: 'rejected' })
  for (const target of [second, first]) {
    const run = claimed.find(item => item?.admission.runId === target.runId)!
    const owner = { ...target, generation: run.generation }
    await peer.executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor' }, 'interrupted', 'stopped')
    if (target === second) {
      expect(await peer.executions.claimNext()).toBeNull()
      await expect(f.service.exportBackup()).rejects.toThrow('active Run')
    }
  }
  expect(await f.service.executions.claimNext()).toMatchObject({ generation: 3, admission: { runId: conflict.runId } })
})

it('rejects cross-project and cyclic relationships and consumes only the authorized task request', async () => {
  const f = await fixture()
  const a = await admissionFor(f, 'dependent')
  const b = await admissionFor(f, 'prerequisite')
  const { service } = f
  const parent = { parent: b.taskId, blockers: [b.taskId] }
  const link = { taskId: a.taskId, projectId: a.projectId, expectedVersion: 2, commandId: commandId(), relations: parent }
  const saved = await service.setRelations(link)
  expect(await service.setRelations(link)).toEqual(saved)
  for (const relations of [{ parent: a.taskId, blockers: [] }, { parent: null, blockers: [a.taskId] }]) {
    await expect(service.setRelations({ ...link, taskId: b.taskId, commandId: commandId(), relations })).rejects.toThrow('cycle')
  }
  const external = brandString<ProjectId>(randomUUID())
  await service.createProject({ ...f.project, commandId: commandId(), project: { ...f.project.project, id: external } })
  const outsider = await service.createTask({ ...f.create, projectId: external })
  expect(outsider.version).toBe(1)
  await expect(service.setRelations({ ...link, commandId: commandId(), expectedVersion: saved.version,
    relations: { parent: null, blockers: [f.create.taskId] } })).rejects.toThrow('outside project')
  const intent = { ...a, expectedVersion: saved.version }
  await expect(service.executions.admit(intent)).rejects.toThrow('unaccepted prerequisites')
  const confirmation = await service.inspectProject(a.projectId)
  const original = await service.planWorkspace(a.projectId, a.runId, confirmation)
  await expect(service.executions.enqueue({ ...intent, whenReady: true }, original)).rejects.toThrow('fresh isolated')
  const directory = join(f.root, 'isolated')
  const plan = { mode: 'isolated' as const, source: f.root, checkout: directory, directory, branch: 'task', baseline: 'base', confirmation: null }
  const authorized = { ...intent, whenReady: true as const, workspace: { directory, branch: plan.branch, baseline: plan.baseline },
    session: { ...intent.session, workspace: directory } }
  const queued = await service.executions.enqueue(authorized, plan)
  expect(await service.executions.claimNext()).toBeNull()
  await expect(service.setRelations({ ...link, commandId: commandId(), expectedVersion: queued.version,
    relations: { parent: null, blockers: [] } })).rejects.toThrow('cannot change')
  await expect(service.editTask({ projectId: a.projectId, taskId: a.taskId, commandId: commandId(), expectedVersion: queued.version,
    requirements: fields })).rejects.toThrow('cancel the automatic claim')
  const cancel = { projectId: a.projectId, taskId: a.taskId, commandId: commandId(), expectedVersion: queued.version, runId: a.runId }
  await service.cancelQueuedRun(cancel)
  expect(await service.executions.enqueue(authorized, plan)).toEqual(queued)
  expect(await service.executions.claimNext()).toBeNull()
  const peer = (await f.open()).service
  expect(peer.detail(a.projectId, a.taskId)).toMatchObject({ task: { relations: parent }, runs: [{ state: 'canceled', whenReady: true }] })
})

it('serializes membership changes across Hosts and excludes login grants from portable history', async () => {
  const f = await fixture()
  const peer = (await f.open()).service
  const id = brandString<import('../src/types.ts').MemberId>(randomUUID())
  const projectId = f.create.projectId
  const account = { id, name: 'Ming', verifier: 'a'.repeat(64), projectId, role: 'viewer' as const }
  await f.service.createMember(account)
  await peer.createMember(account)
  expect(await peer.projectMembers(projectId)).toEqual([{ id, name: 'Ming', version: 1, disabled: false, role: 'viewer' }])
  const outcomes = await Promise.allSettled([peer.changeMember({ id, action: 'grant', projectId, expectedVersion: 1, role: 'editor' }),
    f.service.changeMember({ id, action: 'grant', projectId, expectedVersion: 1, role: null })])
  expect(outcomes.map(result => result.status).sort()).toEqual(['fulfilled', 'rejected'])
  await peer.changeMember({ id, action: 'disable', expectedVersion: 2 })
  await expect(f.service.createMember(account)).rejects.toThrow('already exists')
  await expect(peer.changeMember({ id, action: 'grant', projectId, expectedVersion: 3, role: 'editor' })).rejects.toThrow('conflict')
  expect(await f.service.projectMembers(projectId)).toEqual([{ id, name: 'Ming', version: 3, disabled: true, role: null }])
  expect(await f.service.exportBackup()).not.toContain(account.verifier)
  const reopened = (await f.open()).service
  expect(await reopened.projectMembers(projectId)).toEqual(await peer.projectMembers(projectId))
})
