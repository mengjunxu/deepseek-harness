/** Commit, CI and human-review identity checks on an exported delivery. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { deliveryReceipt } from './delivery-ci.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const head = 'a'.repeat(40)
const baseline = 'b'.repeat(40)
const workspace = { directory: '/fixture', branch: 'topic', baseline }
const tree = hash(JSON.stringify(['/fixture', 'topic', head, '']) + '\0\0')
const snapshot = hash(JSON.stringify(['/fixture', baseline, tree]))
const repo = { full_name: 'owner/project' }
const pr = { number: 1, draft: true, base: { repo }, head: { repo, sha: head, ref: 'topic' }, html_url: 'https://github.com/owner/project/pull/1' }
const run = { repository: repo, head_repository: repo, head_sha: head, head_branch: 'topic', event: 'pull_request',
  pull_requests: [{ number: 1 }], status: 'completed', conclusion: 'success' }
const handoff = { format: 'dsh-taskboard-handoff', version: 1, project: { id: 'p' }, tasks: [{ task: { projectId: 'p', id: 't', status: 'in_review' } }],
  runs: [{ runId: 'r', taskId: 't', state: 'finished', workspace }], reviews: [], deliveries: [{ id: 'd', projectId: 'p', taskId: 't',
    runId: 'r', snapshot, version: 1, revision: 1, code: { scope: 'git', head, baseline, fingerprint: snapshot } }] }

test('successful or failed CI preserves the pending human decision', () => {
  for (const conclusion of ['success', 'failure']) {
    const receipt = deliveryReceipt(handoff, 'd', pr, { ...run, conclusion })
    assert.equal(receipt.ci.conclusion, conclusion)
    assert.equal(receipt.taskStatus, 'in_review')
    assert.deepEqual(receipt.humanReviews, [])
  }
})

test('a dirty snapshot, new PR head or unrelated workflow cannot attest the delivery', () => {
  const dirty = structuredClone(handoff)
  dirty.deliveries[0].snapshot = dirty.deliveries[0].code.fingerprint = hash('dirty')
  assert.throws(() => deliveryReceipt(dirty, 'd', pr, run), /uncommitted/)
  assert.throws(() => deliveryReceipt(handoff, 'd', { ...pr, head: { ...pr.head, sha: baseline } }, run), /PR head/)
  for (const patch of [{ head_sha: baseline }, { head_repository: { full_name: 'other/project' } }, { head_branch: 'elsewhere' },
    { pull_requests: [] }, { status: 'queued', conclusion: null }]) {
    assert.throws(() => deliveryReceipt(handoff, 'd', pr, { ...run, ...patch }), /CI/)
  }
})

test('only a human decision for this snapshot and delivery version is reported', () => {
  const review = { projectId: 'p', taskId: 't', deliveryId: 'd', deliveryVersion: 1, revision: 1, snapshot, verdict: 'return', time: 'recorded' }
  const receipt = deliveryReceipt({ ...handoff, reviews: [review, { ...review, deliveryVersion: 2 }, { ...review, snapshot: 'different' }] },
    'd', pr, { ...run, event: 'push', pull_requests: [] })
  assert.deepEqual(receipt.humanReviews, [{ verdict: 'return', time: 'recorded' }])
})
