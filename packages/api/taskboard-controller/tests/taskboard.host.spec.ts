import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import SessionStore from '@deepseek-ai/dsh-session'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import Storage from '@deepseek-ai/dsh-storage'
import * as Sqlite from '@deepseek-ai/dsh-storage-sqlite'
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import TaskboardController from '../src/index.ts'
import type { ScopeObservation } from '../src/stop.ts'
import type { CommandId, ProjectId, TaskId, TaskRequirements, TaskRunId } from '../src/types.ts'

const commandId = () => brandString<CommandId>(randomUUID())
const fields: TaskRequirements = { title: 'Review export', description: 'Keep the source history', acceptance: ['Old revisions remain readable'], priority: 'normal', labels: [] }

async function fixture(stopTimeoutMs = 10_000) {
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
    await ctx.plugin(TaskboardController, { worktreeRoot: join(root, 'worktrees'), stopTimeoutMs })
    return { service: ctx.taskboardController, close: async () => { await ctx.fiber.dispose(); contexts.delete(ctx) } }
  }
  const { service, close } = await open()
  const projectId = brandString<ProjectId>(randomUUID())
  const taskId = brandString<TaskId>(randomUUID())
  const project = { commandId: commandId(), expectedVersion: 0 as const, project: { id: projectId, title: 'First', root } }
  await service.createProject(project)
  const create = { taskId, projectId, expectedVersion: 0, commandId: commandId(), requirements: fields }
  return { root, open, service, close, project, create }
}

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

it('keeps an immutable input revision, rejects stale acceptance, and requires a new Session for a different directory', async () => {
  const { service, create, root, close, open } = await fixture()
  const { projectId, taskId } = create
  const command = (expectedVersion: number) => ({ projectId, taskId, expectedVersion, commandId: commandId() })
  await service.createTask(create)
  await service.planTask(command(1))
  const runId = brandString<import('../src/execution-domain.ts').TaskRunId>(randomUUID())
  const intent = { ...command(2), runId, runtimeId: randomUUID(), previousRun: null, mode: 'fresh' as const,
    workspace: { directory: root, branch: 'main', baseline: 'base' }, session: { sessionId: 'session-A', home: root, workspace: root,
      provider: 'deepseek-official', compatibility: 'g0' }, materials: [], configurationRef: 'sdk', feedback: [] }
  const first = await service.executions.admit(intent)
  expect(await service.executions.admit(intent)).toEqual(first)
  const owner = { ...intent, generation: first.generation }
  await service.executions.started(owner, 'sdk-receipt')
  await service.editTask({ ...command(4), requirements: { ...fields, description: 'Changed after start' } })
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
  expect(fresh.input.description).toBe('Changed after start')
  await expect(service.executions.started(owner, 'late')).rejects.toThrow('no longer owns')
  await close()
  const detail = (await open()).service.detail(projectId, taskId)
  expect(detail?.runs.map(r => [r.sessionId, r.priorSessionId, r.materialReferences])).toEqual([['session-A', null, []], ['session-B', 'session-A', ['chosen']]])
  expect(detail?.reviews[0]?.verdict).toBe('return')
})

it('binds human acceptance to verified code and waivers and preserves it after reopening', async () => {
  const { service, create, root } = await fixture()
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
  const admitted = await f.service.executions.admit({ ...base(2), runId, runtimeId: randomUUID(), previousRun: null,
    mode: 'fresh', materials: [], configurationRef: 'sdk', feedback: [], workspace: { directory: isolated.directory,
      baseline: isolated.baseline, branch: isolated.branch }, session: { sessionId: randomUUID(), workspace: isolated.directory,
      home: f.root, provider: 'deepseek-official', compatibility: 'g0' } })
  const owner = { ...admitted.admission, generation: admitted.generation }
  await expect(f.service.prepareWorkspace({ ...owner, generation: owner.generation + 1 }, isolated)).rejects.toThrow('no longer owns')
  await expect(f.service.prepareWorkspace(owner, original)).rejects.toThrow('differs')
  const started = await f.service.prepareWorkspace(owner, isolated)
  expect(started).toMatchObject({ directory: isolated.directory, branch: isolated.branch, head: git('rev-parse', 'HEAD'), dirty: false })
  expect(await readFile(join(started.directory, 'tracked'), 'utf8')).toBe('base')
  expect(await readFile(join(sub, 'tracked'), 'utf8')).toBe('dirty')
  expect(await readFile(join(sub, 'new'), 'utf8')).toBe('two')
  await expect(f.service.prepareWorkspace(owner, isolated)).rejects.toThrow('EEXIST')
  await f.service.executions.started(owner, 'SDK receipt')
  await f.service.executions.exited(owner, { runtimeId: owner.runtimeId, source: 'test supervisor' }, 'finished', 'completed')
  const previous = await f.service.inspectPriorWorkspace(projectId, taskId, runId)
  expect((await f.service.planContinuation(projectId, taskId, runId, previous)).directory).toBe(started.directory)
  execFileSync('git', ['-C', started.directory, 'checkout', '--quiet', '--detach'])
  const detached = await f.service.inspectPriorWorkspace(projectId, taskId, runId)
  expect(() => f.service.planContinuation(projectId, taskId, runId, detached)).toThrow('branch changed')
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
