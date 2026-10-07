/** Human-only local MGSD commands; model proposals never authorize execution. */
import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { MgsdWorkflow, parseNodeConfig } from '../../../../../packages/experimental/mgsd-workflow/lib/index.js'
import { Config as RunnerConfig, validateRunnerConfig } from '../codely-local/plugin.mjs'
import { runLocalTask } from '../codely-local/run.mjs'

export const name = 'mgsd-local'
export const inject = ['commands', 'jobs', 'subprocess']
export const Config = z.intersect([RunnerConfig, z.object({ nodeConfig: z.string().required(), database: z.string().required() })])

/**
 * Register trusted human task commands and dispose only after process settlement.
 * @param {object} ctx - Command, job, and subprocess services.
 * @param {object} config - Explicit local storage, executable argv, checks, and process limits.
 */
export function apply(ctx, config) {
  validateRunnerConfig(config)
  if (!isAbsolute(config.nodeConfig) || !isAbsolute(config.database)) throw new Error('MGSD configuration and database paths must be absolute')
  const node = parseNodeConfig(JSON.parse(readFileSync(config.nodeConfig, 'utf8')))
  const workflow = new MgsdWorkflow(config.database, node)
  const running = new Map()
  ctx.jobs.attachController(name)
  ctx.effect(() => async () => {
    for (const [id, entry] of running) {
      if (workflow.get(id).state === 'executing') workflow.cancel(id)
      entry.controller.abort()
    }
    const outcomes = await Promise.allSettled([...running.values()].map(entry => entry.done))
    workflow.close()
    const failure = outcomes.find(outcome => outcome.status === 'rejected')
    if (failure) throw failure.reason
  })
  const summary = task => `${task.request.id}: ${task.state}; plan ${task.revision}; review ${task.reviewCycle}/2; executions ${task.executionAttempts}/${task.request.budget.maxExecutionAttempts}`
  const projectKey = path => {
    const actual = realpathSync(path)
    return process.platform === 'win32' ? actual.toLowerCase() : actual
  }
  ctx.commands.register({
    name: 'mgsd',
    description: 'Create, approve, execute, or inspect a durable local task',
    input: { hint: 'create <json> | status [task-id] | plan <id> <json> | approve <id> <revision> | run <id> | output <id> | review <id> <json> | fix <id> | replan <id> <reason> | resume <id> | cancel <id>' },
    handler: async ({ agent, rawInput, signal }) => {
      signal.throwIfAborted()
      try {
        const input = rawInput.trim()
        const owner = agent.session.id
        if (input === '' || input === 'status') {
          return { kind: 'success', text: workflow.list().filter(task => task.request.owner === owner).map(summary).join('\n') || 'No local MGSD tasks.' }
        }
        const match = /^(\w+)\s+(\S+)(?:\s+([\s\S]+))?$/u.exec(input)
        if (input.startsWith('create ')) {
          const request = JSON.parse(input.slice(7))
          const repo = node.repos[request.repoAlias]
          if (!repo || !agent.session.header.cwd || projectKey(agent.session.header.cwd) !== projectKey(repo.path)) throw new Error('Select the configured repository directory for this Session')
          const task = workflow.create(owner, request)
          for (const stage of ['queued', 'claimed', 'preparing', 'planning']) workflow.advance(task.request.id, stage)
          return { kind: 'success', text: summary(workflow.get(task.request.id)) }
        }
        if (!match) throw new Error('Use an MGSD operation with a task id')
        const [, action, id, body = ''] = match
        const task = workflow.get(id)
        if (task.request.owner !== owner) throw new Error('Unknown MGSD task in this Session')
        let result
        switch (action) {
          case 'status': result = task; break
          case 'plan':
            if (task.state === 'needs_replan') workflow.advance(id, 'planning')
            result = workflow.propose(id, JSON.parse(body)); break
          case 'approve':
            if (!/^\d+$/u.test(body)) throw new Error('Select the exact plan revision')
            result = workflow.approve(id, Number(body), `human-session:${owner}`); break
          case 'review': result = workflow.review(id, JSON.parse(body)); break
          case 'fix': result = workflow.advance(id, 'fix_started'); break
          case 'resume': result = workflow.advance(id, 'resumed'); break
          case 'replan':
            result = workflow.replan(id, body)
            if (running.has(id)) { running.get(id).controller.abort(); await running.get(id).done; result = workflow.get(id) }
            break
          case 'cancel':
            result = workflow.cancel(id)
            if (running.has(id)) { running.get(id).controller.abort(); await running.get(id).done; result = workflow.get(id) }
            break
          case 'output': {
            if (!task.jobId) throw new Error('Task has no process-local job output')
            const output = ctx.jobs.readAt(task.jobId, 0, owner)
            return { kind: 'success', text: `${summary(task)}\n${output.lossy ? '[Earlier output discarded]\n' : ''}${output.chunks.map(chunk => chunk.text).join('')}` }
          }
          case 'run': {
            if (task.state !== 'approved' && task.state !== 'fixing') throw new Error('Approve the current plan before execution')
            const repo = node.repos[task.request.repoAlias]
            if (!repo || !agent.session.header.cwd || projectKey(agent.session.header.cwd) !== projectKey(repo.path)) throw new Error('Select the configured repository directory for this Session')
            const key = projectKey(repo.path)
            if ([...running.values()].some(entry => entry.key === key)) throw new Error('An MGSD execution already owns this directory')
            const jobId = ctx.jobs.start({
              kind: 'mgsd', owner, label: task.request.title, completionDelivery: 'quiet',
              run: job => {
                workflow.execute(id, job.id, config.checks.length)
                const controller = new AbortController()
                const remaining = task.request.budget.maxDurationMs - (Date.now() - task.request.createdAt)
                const timer = setTimeout(() => {
                  if (workflow.get(id).state === 'executing') workflow.cancel(id)
                  controller.abort(new DOMException('Task deadline reached', 'TimeoutError'))
                }, Math.min(config.timeoutMs, remaining))
                const done = runLocalTask({
                  ...config, subprocess: ctx.subprocess, cwd: repo.path, prompt: task.request.prompt, signal: controller.signal,
                  append: (text, options) => job.append(text, options),
                  onProcessExit: (phase, index, exitCode, signal) => workflow.processExit(id, phase, index, exitCode, signal),
                }).then(outcome => {
                  const settled = workflow.settle(id, outcome.status, outcome.detail)
                  if (settled.state === 'executed') workflow.advance(id, 'review_started')
                  return outcome
                }).finally(() => { clearTimeout(timer); running.delete(id) })
                running.set(id, { controller, done, key })
                return { cancel: () => { if (workflow.get(id).state === 'executing') workflow.cancel(id); controller.abort() }, done }
              },
            })
            return { kind: 'success', text: `Started ${id}; process-local job ${jobId}. Use /mgsd status ${id} or /mgsd output ${id}.` }
          }
          default: throw new Error('Unknown MGSD operation')
        }
        return { kind: 'success', text: summary(result) }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}
