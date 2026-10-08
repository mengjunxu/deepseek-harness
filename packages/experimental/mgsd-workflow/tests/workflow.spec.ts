/** Durable policy tests own isolated SQLite roots and an instance-local clock. */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { execa } from 'execa'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { JobId } from '@deepseek-ai/dsh-jobs'
import { MgsdWorkflow, parseNodeConfig } from '../src/index.ts'
import type { TaskId } from '../src/index.ts'
import { fields, integer, parseBudget, parsePlan, text } from '../src/validation.ts'

let root: string
let engine: MgsdWorkflow | undefined
let now: number
const owner = SessionId('mgsd-test')
const job = 'job-test' as JobId
const plan = { summary: 'Fix selected source', allowedFiles: ['source.ts'], acceptanceCriteria: ['Independent test passes'], source: 'human' }
const input = (risk = 'standard') => ({ title: 'Local task', prompt: 'Fix selected source', repoAlias: 'project', risk,
  budget: { maxExecutionAttempts: 2, maxExpertCalls: 4, maxDurationMs: 1000 } })

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mgsd-core-'))
  now = 100
  engine = new MgsdWorkflow(join(root, 'tasks.sqlite'), parseNodeConfig({ nodeId: 'local', workspaceRoot: root, repos: { project: { path: root, defaultBaseRef: 'HEAD' } } }), () => now)
})
afterEach(async () => { engine?.close(); engine = undefined; await rm(root, { recursive: true, force: true }) })

function planning(risk = 'standard'): TaskId {
  const id = engine!.create(owner, input(risk)).request.id
  for (const stage of ['queued', 'claimed', 'preparing', 'planning'] as const) engine!.advance(id, stage)
  return id
}

function approved(risk = 'standard'): TaskId {
  const id = planning(risk)
  engine!.propose(id, { ...plan, source: risk === 'high_risk' ? 'expert' : 'human' })
  engine!.approve(id, 1, 'human')
  return id
}

function executed(id: TaskId): void {
  engine!.execute(id, job, 1)
  engine!.processExit(id, 'executor', 0, 0, null)
  engine!.processExit(id, 'validation', 1, 0, null)
  engine!.settle(id, 'completed', 'All configured checks passed')
}

it('persists failed preparation without admitting successful or killed execution settlement', () => {
  const id = engine!.create(owner, input()).request.id
  for (const stage of ['queued', 'claimed', 'preparing'] as const) engine!.advance(id, stage)
  expect(() => engine!.settle(id, 'completed', 'No executor')).toThrow('Operation is not allowed')
  expect(() => engine!.settle(id, 'killed', 'No executor')).toThrow('Operation is not allowed')
  expect(engine!.settle(id, 'failed', 'Git preparation failed')).toMatchObject({ state: 'failed', executionAttempts: 0, jobId: null })
  expect(() => engine!.advance(id, 'planning')).toThrow('Operation is not allowed')
})

it('retains preparation cancellation intent until managed cleanup settles', () => {
  const id = engine!.create(owner, input()).request.id
  for (const stage of ['queued', 'claimed', 'preparing'] as const) engine!.advance(id, stage)
  expect(engine!.cancel(id).state).toBe('cancel_requested')
  expect(engine!.settle(id, 'killed', 'Git processes stopped')).toMatchObject({ state: 'cancelled', executionAttempts: 0 })
})

it('preserves immutable requests and durable facts across reopening', () => {
  const id = approved()
  const original = engine!.get(id)
  expect(Object.isFrozen(original.request.budget)).toBe(true)
  expect(() => Object.assign(original.request, { prompt: 'mutated' })).toThrow()
  const node = engine!.node
  engine!.close()
  engine = new MgsdWorkflow(join(root, 'tasks.sqlite'), node, () => now)
  expect(engine.get(id)).toEqual(original)
})

it('rejects queued execution and planning output that assigns state or approval', () => {
  const id = engine!.create(owner, input()).request.id
  engine!.advance(id, 'queued')
  expect(() => engine!.execute(id, job, 1)).toThrow('Operation is not allowed')
  expect(engine!.get(id).facts).toHaveLength(1)
  expect(() => engine!.create(owner, { ...input(), state: 'approved' })).toThrow('Expected fields')
  const ready = planning()
  expect(() => engine!.propose(ready, { ...plan, approval: true })).toThrow('Expected fields')
  expect(() => engine!.approve(ready, 1, 'human')).toThrow('A plan is required')
})

it('binds approval to the current revision and invalidates it on scope expansion', () => {
  const id = approved()
  engine!.replan(id, 'Need another file')
  expect(engine!.get(id)).toMatchObject({ state: 'needs_replan', approval: null })
  expect(() => engine!.execute(id, job, 1)).toThrow()
  engine!.advance(id, 'planning')
  engine!.propose(id, { ...plan, allowedFiles: ['source.ts', 'other.ts'] })
  expect(() => engine!.approve(id, 1, 'human')).toThrow('Approval does not match')
  engine!.approve(id, 2, 'human')
  expect(engine!.get(id)).toMatchObject({ state: 'approved', revision: 2, approval: { revision: 2 } })
})

it('stops execution for scope expansion and replans only after process settlement', () => {
  const id = approved()
  engine!.execute(id, job, 1)
  engine!.replan(id, 'Scope changed')
  expect(engine!.get(id)).toMatchObject({ state: 'cancel_requested', approval: null })
  expect(() => engine!.propose(id, plan)).toThrow()
  engine!.processExit(id, 'executor', 0, 0, null)
  expect(() => engine!.settle(id, 'completed', 'exit 0')).toThrow()
  engine!.settle(id, 'killed', 'Cancelled and cleaned')
  expect(engine!.get(id).state).toBe('needs_replan')
  engine!.advance(id, 'planning'); engine!.propose(id, plan); engine!.approve(id, 2, 'human')
  engine!.execute(id, job, 1); engine!.cancel(id); engine!.settle(id, 'killed', 'Ordinary cancellation')
  expect(engine!.get(id).state).toBe('cancelled')
})

it('requires all independent validation facts in order before accepting execution', () => {
  const id = approved('trivial')
  engine!.execute(id, job, 2)
  expect(() => engine!.processExit(id, 'validation', 1, 0, null)).toThrow('out of order')
  engine!.processExit(id, 'executor', 0, 0, null)
  expect(() => engine!.settle(id, 'completed', 'claimed success')).toThrow('Successful independent')
  engine!.processExit(id, 'validation', 1, 0, null)
  engine!.processExit(id, 'validation', 2, 23, null)
  expect(() => engine!.settle(id, 'completed', 'claimed success')).toThrow()
  engine!.settle(id, 'failed', 'Independent check exit 23')
  expect(engine!.get(id).state).toBe('failed')
})

it('routes a second failed review to needs_human and refuses more fixes', () => {
  const id = approved()
  executed(id)
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    engine!.advance(id, 'review_started')
    engine!.review(id, { passed: false, source: 'human', findings: 'Check another case' })
    if (cycle === 1) { engine!.advance(id, 'fix_started'); executed(id) }
  }
  expect(engine!.get(id)).toMatchObject({ state: 'needs_human', reviewCycle: 2, executionAttempts: 2 })
  expect(() => engine!.advance(id, 'fix_started')).toThrow()
  expect(() => engine!.advance(id, 'review_started')).toThrow()
})

it('enforces high-risk expert input, expert budgets, attempt limits, and elapsed time', () => {
  const high = planning('high_risk')
  expect(() => engine!.propose(high, plan)).toThrow('requires expert')
  const budget = input()
  const id = engine!.create(owner, { ...budget, budget: { ...budget.budget, maxExpertCalls: 0 } }).request.id
  for (const stage of ['queued', 'claimed', 'preparing', 'planning'] as const) engine!.advance(id, stage)
  expect(() => engine!.propose(id, { ...plan, source: 'expert' })).toThrow('Expert budget')
  const expired = approved()
  now = 1100
  expect(() => engine!.execute(expired, job, 1)).toThrow('Execution budget')
  expect(engine!.get(expired).executionAttempts).toBe(0)
})

it('preserves cancellation and exit facts even when executor exit zero races cancellation', () => {
  const id = approved()
  engine!.execute(id, job, 1)
  engine!.cancel(id)
  engine!.processExit(id, 'executor', 0, 0, null)
  engine!.settle(id, 'killed', 'Timed out; cleanup complete')
  const task = engine!.get(id)
  expect(task.state).toBe('cancelled')
  expect(task.facts.map(fact => fact.kind)).toContain('cancel_requested')
  expect(task.facts).toContainEqual({ kind: 'process_exit', at: now, phase: 'executor', index: 0, exitCode: 0, signal: null })
})

it('reopens incomplete execution as interrupted and requires a new plan and approval', () => {
  const id = approved()
  engine!.execute(id, job, 1)
  const node = engine!.node
  engine!.close()
  engine = new MgsdWorkflow(join(root, 'tasks.sqlite'), node, () => now)
  expect(engine.get(id)).toMatchObject({ state: 'interrupted', approval: null, executionAttempts: 1 })
  engine.advance(id, 'resumed')
  expect(engine.get(id).state).toBe('needs_replan')
  expect(() => engine!.execute(id, job, 1)).toThrow()
})

it('rejects two live controllers without changing the first controller state', () => {
  const id = approved()
  expect(() => new MgsdWorkflow(join(root, 'tasks.sqlite'), engine!.node)).toThrow('Another live')
  expect(engine!.get(id).state).toBe('approved')
})

it('rejects unknown database generations, tampered plans, and unknown durable facts', () => {
  const id = approved()
  const db = new DatabaseSync(join(root, 'tasks.sqlite'))
  try {
    db.prepare('UPDATE facts SET data = ? WHERE task_id = ? AND seq = 4').run(JSON.stringify({ kind: 'plan', at: now, plan: { ...plan, allowedFiles: ['another.ts'] } }), id)
    expect(() => engine!.get(id)).toThrow('Approval does not match')
    db.prepare('UPDATE facts SET data = ? WHERE task_id = ? AND seq = 4').run(JSON.stringify({ kind: 'unknown', at: now }), id)
    expect(() => engine!.get(id)).toThrow('Unknown task fact')
  } finally { db.close() }
  engine!.close(); engine = undefined
  const version = new DatabaseSync(join(root, 'future.sqlite'))
  version.exec('PRAGMA user_version = 2'); version.close()
  expect(() => new MgsdWorkflow(join(root, 'future.sqlite'), { nodeId: 'local', workspaceRoot: root, repos: {} })).toThrow('Unsupported')
})

it('validates node-local paths and prevents aliases that mutate object prototypes', () => {
  expect(() => parseNodeConfig({ nodeId: 'local', workspaceRoot: 'relative', repos: {} })).toThrow()
  const repos: unknown = JSON.parse('{"__proto__":{"path":"x","defaultBaseRef":"HEAD"}}')
  expect(() => parseNodeConfig({ nodeId: 'local', workspaceRoot: root, repos })).toThrow('Invalid repository alias')
  expect(() => engine!.create(owner, { ...input(), repoAlias: 'missing' })).toThrow('Unknown local repository')
  const id = planning()
  expect(() => engine!.propose(id, { ...plan, allowedFiles: ['../outside'] })).toThrow('relative')
})

it('accepts trivial completion and expert review while rejecting high-risk human review', () => {
  const trivial = approved('trivial')
  executed(trivial)
  expect(engine!.get(trivial).state).toBe('completed')
  expect(() => engine!.cancel(trivial)).toThrow()
  const high = approved('high_risk')
  executed(high)
  engine!.advance(high, 'review_started')
  expect(() => engine!.review(high, { passed: true, source: 'human', findings: 'Accepted' })).toThrow('requires expert')
  expect(engine!.review(high, { passed: true, source: 'expert', findings: 'Accepted' }).state).toBe('completed')
})

it('persists exhausted attempt and expert-review budgets without starting more work', () => {
  const id = engine!.create(owner, { ...input(), budget: { ...input().budget, maxExecutionAttempts: 1, maxExpertCalls: 0 } }).request.id
  for (const stage of ['queued', 'claimed', 'preparing', 'planning'] as const) engine!.advance(id, stage)
  engine!.propose(id, plan); engine!.approve(id, 1, 'human'); executed(id)
  engine!.advance(id, 'review_started')
  engine!.review(id, { passed: false, source: 'human', findings: 'Needs fix' })
  engine!.advance(id, 'fix_started')
  expect(() => engine!.execute(id, job, 1)).toThrow('Execution budget')
  expect(engine!.get(id)).toMatchObject({ state: 'needs_human', executionAttempts: 1 })
  const reviewed = approved()
  executed(reviewed); engine!.advance(reviewed, 'review_started')
  const db = new DatabaseSync(join(root, 'tasks.sqlite'))
  try {
    const request = engine!.get(reviewed).request
    db.prepare('UPDATE tasks SET request = ? WHERE id = ?').run(JSON.stringify({ ...request, budget: { ...request.budget, maxExpertCalls: 0 } }), reviewed)
  } finally { db.close() }
  expect(engine!.review(reviewed, { passed: true, source: 'expert', findings: 'Accepted' }).state).toBe('needs_human')
})

it('settles non-running cancellation and cleanup failures without reporting completion', () => {
  const created = engine!.create(owner, input()).request.id
  expect(engine!.cancel(created).state).toBe('cancelled')
  const id = approved()
  engine!.execute(id, job, 1); engine!.cancel(id)
  expect(() => engine!.cancel(id)).toThrow()
  engine!.processExit(id, 'executor', 0, null, 'SIGTERM')
  expect(engine!.settle(id, 'failed', 'Cleanup failed').state).toBe('failed')
})

it('takes over a dead controller lease and releases it when stored facts are corrupt', async () => {
  const result = await execa(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'])
  const deadPid = Number(result.stdout)
  const node = engine!.node
  engine!.close(); engine = undefined
  const db = new DatabaseSync(join(root, 'tasks.sqlite'))
  db.prepare('INSERT INTO controller VALUES (1, ?, ?)').run(deadPid, 'dead')
  db.close()
  engine = new MgsdWorkflow(join(root, 'tasks.sqlite'), node)
  const id = engine.create(owner, input()).request.id
  engine.close(); engine = undefined
  const corrupt = new DatabaseSync(join(root, 'tasks.sqlite'))
  try {
    corrupt.prepare('UPDATE tasks SET request = ? WHERE id = ?').run('{}', id)
    expect(() => new MgsdWorkflow(join(root, 'tasks.sqlite'), node)).toThrow()
    expect(corrupt.prepare('SELECT * FROM controller').all()).toEqual([])
  } finally { corrupt.close() }
})

it.each([
  null, [], {}, { ...input(), risk: 'unknown' }, { ...input(), title: '' }, { ...input(), prompt: '\0' },
  { ...input(), budget: { ...input().budget, maxDurationMs: -1 } },
])('rejects malformed human request %#', (value) => { expect(() => engine!.create(owner, value)).toThrow() })

it.each([
  { ...plan, source: 'unknown' }, { ...plan, allowedFiles: [] }, { ...plan, allowedFiles: null },
  { ...plan, allowedFiles: ['C:\\outside'] }, { ...plan, allowedFiles: ['/outside'] },
  { ...plan, acceptanceCriteria: [''] },
])('rejects malformed planner input %#', (value) => { expect(() => parsePlan(value)).toThrow() })

it('rejects malformed primitive and node configuration fields', () => {
  for (const value of [null, [], false]) expect(() => fields(value, [])).toThrow()
  for (const value of [null, '', '\0', 1]) expect(() => text(value)).toThrow()
  for (const value of [-1, 0.5, Infinity, '1']) expect(() => integer(value)).toThrow()
  expect(() => parseBudget({})).toThrow()
  for (const repos of [[], null, {}, { 'bad/alias': { path: root, defaultBaseRef: 'HEAD' } }]) expect(() => parseNodeConfig({ nodeId: 'local', workspaceRoot: root, repos })).toThrow()
  expect(() => parseNodeConfig({ nodeId: 'local', workspaceRoot: root, repos: { project: { path: join(root, 'tasks.sqlite'), defaultBaseRef: 'HEAD' } } })).toThrow('directories')
})

it.each([
  null, { kind: 'execution', at: 100, jobId: 'job', checkCount: 0 },
  { kind: 'process_exit', at: 100, phase: 'invalid', index: 0, exitCode: 0, signal: null },
  { kind: 'process_exit', at: 100, phase: 'executor', index: 0, exitCode: '0', signal: null },
  { kind: 'settled', at: 100, outcome: 'invalid', detail: 'x' },
  { kind: 'review', at: 100, passed: 'true', source: 'human', findings: 'x' },
  { kind: 'review', at: 100, passed: true, source: 'invalid', findings: 'x' },
  { kind: 'queued', at: -1 },
])('rejects malformed durable facts %#', (value) => {
  const id = engine!.create(owner, input()).request.id
  const db = new DatabaseSync(join(root, 'tasks.sqlite'))
  try {
    db.prepare('INSERT INTO facts VALUES (?, 0, ?)').run(id, JSON.stringify(value))
    expect(() => engine!.get(id)).toThrow()
  } finally { db.close() }
})

it('rejects durable id mismatch, sequence gaps, and unknown task reads', () => {
  const id = engine!.create(owner, input()).request.id
  expect(() => engine!.get('TASK-00000000-0000-4000-8000-000000000001' as TaskId)).toThrow('Unknown task')
  const db = new DatabaseSync(join(root, 'tasks.sqlite'))
  try {
    const request = engine!.get(id).request
    db.prepare('UPDATE tasks SET request = ? WHERE id = ?').run(JSON.stringify({ ...request, id: 'bad' }), id)
    expect(() => engine!.get(id)).toThrow('Invalid task id')
    db.prepare('UPDATE tasks SET request = ? WHERE id = ?').run(JSON.stringify({ ...request, id: 'TASK-00000000-0000-4000-8000-000000000001' }), id)
    expect(() => engine!.get(id)).toThrow('does not match')
    db.prepare('UPDATE tasks SET request = ? WHERE id = ?').run(JSON.stringify(request), id)
    db.prepare('INSERT INTO facts VALUES (?, 1, ?)').run(id, JSON.stringify({ kind: 'queued', at: 100 }))
    expect(() => engine!.get(id)).toThrow('sequence')
  } finally { db.close() }
})

it.each(['plan', 'execution', 'review'])('rejects durable %s facts that exceed altered budgets', (phase) => {
  const id = approved('high_risk')
  if (phase !== 'plan') executed(id)
  if (phase === 'review') {
    engine!.advance(id, 'review_started')
    engine!.review(id, { passed: true, source: 'expert', findings: 'Accepted' })
  }
  const request = engine!.get(id).request
  const budget = phase === 'execution' ? { ...request.budget, maxDurationMs: 1 }
    : { ...request.budget, maxExpertCalls: phase === 'plan' ? 0 : 1 }
  const db = new DatabaseSync(join(root, 'tasks.sqlite'))
  try {
    if (phase === 'execution') db.prepare('UPDATE facts SET data = ? WHERE task_id = ? AND seq = 6').run(JSON.stringify({ kind: 'execution', at: 101, jobId: job, checkCount: 1 }), id)
    db.prepare('UPDATE tasks SET request = ? WHERE id = ?').run(JSON.stringify({ ...request, budget }), id)
    expect(() => engine!.get(id)).toThrow('budget exhausted')
  } finally { db.close() }
})

it('rejects a budget fact after terminal settlement and an invalid controller PID', () => {
  const id = approved('trivial'); executed(id)
  const task = engine!.get(id)
  const db = new DatabaseSync(join(root, 'tasks.sqlite'))
  try {
    db.prepare('INSERT INTO facts VALUES (?, ?, ?)').run(id, task.facts.length, JSON.stringify({ kind: 'budget_exhausted', at: 100, reason: 'Expired' }))
    expect(() => engine!.get(id)).toThrow('Terminal task')
  } finally { db.close() }
  const node = engine!.node
  engine!.close(); engine = undefined
  const lease = new DatabaseSync(join(root, 'tasks.sqlite'))
  lease.prepare('INSERT INTO controller VALUES (1, ?, ?)').run(2147483648, 'invalid'); lease.close()
  expect(() => new MgsdWorkflow(join(root, 'tasks.sqlite'), node)).toThrow()
})
