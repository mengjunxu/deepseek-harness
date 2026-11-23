/** Build a read-only receipt from a Taskboard v1 project handoff and a GitHub Actions run. */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const digest = value => createHash('sha256').update(value).digest('hex')

/**
 * Bind one Host-sealed, clean Git delivery to the PR head and a completed workflow run.
 * @param handoff - operator-exported Taskboard project handoff.
 * @param deliveryId - selected delivery UUID.
 * @param pr - GitHub REST pull request.
 * @param run - GitHub REST workflow run.
 * @returns evidence and the independent human decision recorded for this delivery version.
 */
export function deliveryReceipt(handoff, deliveryId, pr, run) {
  if (handoff.format !== 'dsh-taskboard-handoff' || handoff.version !== 1) throw Error('Unsupported Taskboard handoff')
  const delivery = handoff.deliveries.find(item => item.id === deliveryId)
  const execution = handoff.runs.find(item => item.runId === delivery?.runId)
  const task = handoff.tasks.find(item => item.task.id === delivery?.taskId)?.task
  if (!delivery || delivery.projectId !== handoff.project.id || task?.projectId !== delivery.projectId ||
      execution?.taskId !== task.id || execution.state !== 'finished') throw Error('Delivery is outside the finished project Run')
  const code = delivery.code
  if (code?.scope !== 'git' || !/^[a-f0-9]{40}$/.test(code.head) || code.baseline !== execution.workspace.baseline) {
    throw Error('Delivery needs a sealed Git workspace')
  }
  // v1 hashes the canonical directory, branch, HEAD, porcelain status and the staged/unstaged observations.
  const { directory, branch } = execution.workspace
  const cleanTree = digest(JSON.stringify([directory, branch, code.head, '']) + '\0\0')
  const snapshot = digest(JSON.stringify([directory, code.baseline, cleanTree]))
  if (snapshot !== delivery.snapshot || snapshot !== code.fingerprint) throw Error('Delivery includes uncommitted work or its snapshot differs')
  const repository = pr.base.repo.full_name
  if (pr.head.repo.full_name !== repository || pr.head.sha !== code.head) throw Error('Same-repository PR head differs from the delivery')
  if (run.repository.full_name !== repository || run.head_repository?.full_name !== repository ||
      run.head_sha !== code.head || run.head_branch !== pr.head.ref) throw Error('CI repository, branch or commit differs from the PR')
  if (run.event !== 'push' && !(run.event === 'pull_request' && run.pull_requests.some(p => p.number === pr.number))) {
    throw Error('CI event is unrelated to this PR')
  }
  if (run.status !== 'completed' || !run.conclusion) throw Error('CI has no final result yet')
  const reviews = handoff.reviews.filter(review => review.projectId === delivery.projectId && review.taskId === delivery.taskId &&
    review.deliveryId === delivery.id && review.deliveryVersion === delivery.version && review.revision === delivery.revision &&
    review.snapshot === snapshot)
  return {
    projectId: delivery.projectId, taskId: task.id, deliveryId, runId: execution.runId, revision: delivery.revision, version: delivery.version,
    snapshot, commit: code.head, pullRequest: pr.html_url, draft: pr.draft,
    ci: { url: run.html_url, workflow: run.name, attempt: run.run_attempt, conclusion: run.conclusion, event: run.event },
    taskStatus: task.status, humanReviews: reviews.map(({ verdict, time }) => ({ verdict, time })),
  }
}

async function main() {
  const { values } = parseArgs({ options: Object.fromEntries(
    ['handoff', 'delivery', 'repo', 'pr', 'run'].map(name => [name, { type: 'string' }])) })
  if (!values.handoff || !values.delivery || !/^[\w-]+\/[\w-][\w.-]*$/.test(values.repo ?? '') ||
      !/^\d+$/.test(values.pr ?? '') || !/^\d+$/.test(values.run ?? '')) {
    throw Error('Usage: node scripts/taskboard/delivery-ci.mjs --handoff FILE --delivery ID --repo OWNER/NAME --pr NUMBER --run RUN_ID')
  }
  const read = async path => {
    const response = await fetch('https://api.github.com/repos/' + values.repo + '/' + path, {
      headers: { accept: 'application/vnd.github+json', ...(process.env.GH_TOKEN && { authorization: 'Bearer ' + process.env.GH_TOKEN }) },
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) throw Error('GitHub returned HTTP ' + String(response.status) + ' for ' + path)
    return response.json()
  }
  const [file, pr, run] = await Promise.all([readFile(values.handoff, 'utf8'), read('pulls/' + values.pr), read('actions/runs/' + values.run)])
  console.log(JSON.stringify(deliveryReceipt(JSON.parse(file), values.delivery, pr, run), null, 2))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1 })
}
