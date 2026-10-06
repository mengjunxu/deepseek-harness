/** Opt-in human commands for local Codely jobs; never submits a model message. */
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import z from '@deepseek-ai/schemastery'
import { runLocalTask } from './run.mjs'

export const name = 'codely-local'
export const inject = ['commands', 'jobs', 'subprocess']
export const Config = z.object({
  command: z.array(z.string()).required(),
  checks: z.array(z.array(z.string())).required(),
  timeoutMs: z.number().default(900000),
  graceMs: z.number().default(3000),
  maxBytes: z.number().default(65536),
  pollMs: z.number().default(100),
})

/**
 * Register local commands and cancel owned work when this plugin unloads.
 * @param {object} ctx - DSH context with command, job, and subprocess services.
 * @param {object} config - Executable argv, validation argv lists, and resource bounds.
 */
export function apply(ctx, config) {
  for (const key of ['timeoutMs', 'graceMs', 'maxBytes', 'pollMs']) {
    if (!Number.isSafeInteger(config[key]) || config[key] <= 0 || config[key] > 2147483647) {
      throw new Error(`codely-local: ${key} must be an integer between 1 and 2147483647`)
    }
  }
  for (const argv of [config.command, ...config.checks]) {
    if (!argv.length || !argv[0].trim() || argv.some(arg => arg.includes('\0'))) {
      throw new Error('codely-local: each command must contain an executable and no NUL bytes')
    }
    if (/\.(cmd|bat|ps1)$/iu.test(argv[0])) {
      throw new Error('codely-local: use an executable (for Codely on Windows, node.exe plus its CLI entry), not a shell shim')
    }
  }
  if (!config.checks.length) throw new Error('codely-local: configure at least one independent validation command')
  const active = new Map()
  ctx.jobs.attachController(name)
  ctx.effect(() => async () => {
    const running = [...active.values()]
    for (const entry of running) entry.controller.abort()
    await Promise.all(running.map(entry => entry.done))
  })
  ctx.commands.register({
    name: 'codely',
    description: 'Run, inspect, or cancel a local Codely task',
    input: { hint: 'run <task> | status | output <id> | cancel <id>' },
    handler: ({ agent, rawInput, signal }) => {
      signal.throwIfAborted()
      const input = rawInput.trim()
      const owner = agent.session.id
      const visible = () => ctx.jobs.list(owner).filter(job => job.kind === 'codely')
      if (input === '' || input === 'status') {
        return { kind: 'success', text: visible().map(job => `${job.id}: ${job.status}${job.detail ? ` — ${job.detail}` : ''}`).join('\n') || 'No local Codely jobs.' }
      }
      const control = /^(output|cancel)\s+(\S+)$/u.exec(input)
      if (control) {
        const job = visible().find(job => job.id === control[2])
        if (!job) return { kind: 'error', text: 'Unknown Codely job in this session.' }
        if (control[1] === 'cancel') return { kind: 'success', text: ctx.jobs.kill(job.id, owner, 'User cancelled') }
        const output = ctx.jobs.readAt(job.id, 0, owner)
        return { kind: 'success', text: `${job.id}: ${job.status}\n${output.lossy ? '[Earlier output discarded]\n' : ''}${output.chunks.map(chunk => chunk.text).join('')}` }
      }
      if (!input.startsWith('run ') || !input.slice(4).trim()) {
        return { kind: 'error', text: 'Usage: /codely run <task> | status | output <id> | cancel <id>' }
      }
      const cwd = agent.session.header.cwd
      if (!cwd || !isAbsolute(cwd) || !statSync(cwd).isDirectory()) {
        return { kind: 'error', text: 'Select an existing local project directory for this session.' }
      }
      const project = realpathSync(cwd)
      const projectKey = process.platform === 'win32' ? project.toLowerCase() : project
      if ([...active.values()].some(entry => entry.projectKey === projectKey)) {
        return { kind: 'error', text: 'A Codely job is already running in this directory.' }
      }
      const id = ctx.jobs.start({
        kind: 'codely', owner, label: input.slice(4).split(/\r?\n/u)[0],
        completionDelivery: 'quiet',
        run: job => {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(new DOMException('Task deadline reached', 'TimeoutError')), config.timeoutMs)
          const done = runLocalTask({
            ...config, subprocess: ctx.subprocess, cwd, prompt: input.slice(4), signal: controller.signal,
            append: (text, options) => job.append(text, options),
          }).finally(() => { clearTimeout(timer); active.delete(job.id) })
          active.set(job.id, { controller, done, projectKey })
          return { cancel: () => controller.abort(), done }
        },
      })
      return { kind: 'success', text: `Started ${id}. Use /codely output ${id} or /codely cancel ${id}.` }
    },
  })
}
