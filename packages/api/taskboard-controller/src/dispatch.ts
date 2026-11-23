/** Host dispatch from committed queue entries to isolated SDK runtimes. */
import { observeSavedMacosProcessScope, type DeepSeekHarness, type NotificationSubscription } from '@deepseek-ai/dsh-sdk-client'
import { createHash } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import { z } from 'zod'
import { runSessionEvent, scriptOutcome, type RuntimeBinding, type TaskRun, type TurnOutcome } from './execution-domain.ts'
import type { TaskExecutions } from './execution.ts'
import { createTaskRuntime, type TaskRuntimeOptions } from './runtime.ts'
import type { RunStops } from './stop.ts'
import type { RunInteractions } from './interactions.ts'
import { inputReceipt, recoverSessionPosition, sessionInputStart, taskInput, turnOutcome } from './session-recovery.ts'
import { RunProcessLock } from './process-lock.ts'
import { hostToolRequest, taskDeliveryToolArgs, taskReadArgs, taskUpdateArgs } from './tool-protocol.ts'
import type { CommandId } from './types.ts'

interface DispatchOptions {
  executions: TaskExecutions
  stops: RunStops
  interactions: RunInteractions
  capture: (run: TaskRun, files: string[]) => Promise<string>
  prepare: (owner: RuntimeBinding) => Promise<void>
  resolve: (run: TaskRun) => Promise<TaskRuntimeOptions>
  stopTimeoutMs: number
  signal: AbortSignal
  warn: (message: string) => void
}

interface OwnedRuntime {
  harness: DeepSeekHarness
  processLock?: RunProcessLock
  detach?: () => void
  stopObserving?: () => Promise<void>
  turnOutcome?: TurnOutcome
}

const acceptedInput = z.object({
  type: z.literal('agent/inbox/spliced'),
  data: z.object({ inserted: z.array(z.unknown()) }),
})

function toolCommandId(owner: RuntimeBinding, callId: string): CommandId {
  const hex = createHash('sha256').update(JSON.stringify([owner.runId, callId])).digest('hex')
  return brandString<CommandId>(`${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`)
}

const toolAction = { progress: 'run-progress', comment: 'commented', blocked: 'run-blocked' } as const
const turnEnd = z.object({ data: z.object({ reason: z.object({ kind: z.enum(['completed', 'aborted', 'error', 'blocked', 'max-tokens']) }) }) })

async function storedReceipt(events: NotificationSubscription, input: string, timeoutMs: number): Promise<string | undefined> {
  const timer = setTimeout(() => { events.close() }, timeoutMs)
  try {
    for await (const notification of events) {
      const event = acceptedInput.safeParse(notification.params.event)
      if (!event.success) continue
      for (const entry of event.data.data.inserted) {
        const receipt = inputReceipt(entry, input)
        if (receipt) return receipt
      }
    }
  } catch {
    // A closed transport cannot establish the outcome of the prompt.
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/** Owns the SDK process between claim and Host disposal or confirmed stop. */
export class RunDispatch {
  private pending: Promise<void> | undefined
  private requested = false
  private readonly runtimes = new Map<string, OwnedRuntime>()
  private readonly starting = new Map<string, Promise<void>>()
  private recoveryRetry: ReturnType<typeof setTimeout> | undefined

  /** @param options - Host preparation, SQLite lease, process controls and lifetime. */
  constructor(private readonly options: DispatchOptions) {}

  /** Wake dispatch after admission or lease release. Concurrent wakes are coalesced. */
  wake(): void {
    if (this.options.signal.aborted) return
    this.requested = true
    this.pending ??= this.drain().catch(() => {
      if (!this.options.signal.aborted) this.options.warn('Taskboard dispatch failed while reading or updating the execution queue')
    }).finally(() => {
      this.pending = undefined
      if (this.requested) this.wake()
    })
  }

  /** Reap the SDK process and wait for any in-flight dispatch before closing storage. */
  async close(): Promise<void> {
    await this.pending
    clearTimeout(this.recoveryRetry)
    const results = await Promise.allSettled([...this.runtimes.values()].map(runtime => this.disposeRuntime(runtime)))
    await Promise.allSettled(this.starting.values())
    const errors = results.filter(result => result.status === 'rejected')
    if (errors.length) throw new AggregateError(errors.map((result): unknown => result.reason), 'Taskboard SDK cleanup failed')
  }

  private async disposeRuntime(runtime: OwnedRuntime): Promise<void> {
    try {
      await runtime.stopObserving?.()
      await runtime.harness.close()
    } finally {
      runtime.detach?.()
      await runtime.processLock?.close()
    }
  }

  private async drain(): Promise<void> {
    while (this.requested && !this.options.signal.aborted) {
      this.requested = false
      const active = await this.options.executions.activeRuns()
      for (const [id, runtime] of this.runtimes) {
        if (!active.some(({ owner }) => owner.runId === id) && !this.starting.has(id)) {
          await this.disposeRuntime(runtime)
          this.runtimes.delete(id)
        }
      }
      for (const entry of active) {
        if (!this.runtimes.has(entry.owner.runId) && !this.starting.has(entry.owner.runId)) await this.recover(entry)
      }
      const run = await this.options.executions.claimNext()
      if (!run) continue
      const id = run.admission.runId
      this.starting.set(id, this.start(run).catch(() => {
        if (!this.options.signal.aborted) this.options.warn(`Taskboard Run ${id} failed during dispatch`)
      }).finally(() => { this.starting.delete(id); this.wake() }))
      this.requested = true
    }
  }

  private async recover(active: { owner: RuntimeBinding; run: TaskRun }): Promise<void> {
    if (process.platform !== 'darwin') return
    const { executions, signal, stopTimeoutMs, stops, warn } = this.options
    const scope = active.run.processScope
    if (!scope) return
    const lock = await RunProcessLock.recover(active.run, scope.lock)
    if (!lock) return
    try {
      signal.throwIfAborted()
      const { owner } = active
      if (!(await executions.activeRuns()).some(entry => entry.owner.runtimeId === owner.runtimeId)) return
      await executions.disconnectedHost(owner)
      const observation = AbortSignal.any([signal, AbortSignal.timeout(stopTimeoutMs)])
      const state = await observeSavedMacosProcessScope(scope.identity, observation)
      if (state === 'empty') {
        const reconciled = await recoverSessionPosition(active.run, signal).catch(() => {
          if (!signal.aborted) warn(`Taskboard Run ${owner.runId} could not read its stored Session during restart`)
          return undefined
        })
        if (reconciled) {
          if (!active.run.receipt) await executions.started(owner, reconciled.receipt)
          await executions.observeSessionEvent(owner, active.run.admission.session.sessionId, reconciled.position)
        }
        await stops.recoveredExit(owner, { runtimeId: owner.runtimeId, source: 'persisted SDK launchd resource coalition' }, reconciled?.outcome)
      } else if (state === 'occupied' && !this.recoveryRetry) {
        this.recoveryRetry = setTimeout(() => { this.recoveryRetry = undefined; this.wake() }, stopTimeoutMs)
        this.recoveryRetry.unref()
      }
    } catch (_error) {
      if (!signal.aborted) warn(`Taskboard Run ${active.owner.runId} could not reconcile its persisted process scope`)
    } finally {
      await lock.close()
    }
  }

  private async start(run: TaskRun): Promise<void> {
    const { executions, stops, prepare, resolve, signal, warn } = this.options
    const owner = { ...run.admission, generation: run.generation }
    let harness: DeepSeekHarness | undefined
    let processLock: RunProcessLock | undefined
    let stage = 'previous SDK cleanup'
    try {
      signal.throwIfAborted()
      stage = 'workspace or execution configuration preparation'
      const options = await resolve(run)
      await prepare(owner)
      signal.throwIfAborted()
      if ((await executions.active(owner)).control !== 'normal') throw new Error('stop requested')
      signal.throwIfAborted()
      if (process.platform === 'darwin') processLock = await RunProcessLock.create(run)
      signal.throwIfAborted()
      stage = 'SDK permission handshake'
      harness = createTaskRuntime({
        ...options, ...process.platform === 'darwin' ? { processScope: 'macos-launchd' } : {},
      })
      const runtime: OwnedRuntime = { harness, ...processLock && { processLock } }
      this.runtimes.set(owner.runId, runtime)
      await harness.start()
      signal.throwIfAborted()
      const client = harness.client
      if (processLock) {
        stage = 'SDK process scope persistence'
        const identity = await client.macosProcessScopeIdentity(AbortSignal.any([signal, AbortSignal.timeout(this.options.stopTimeoutMs)]))
        if (!identity) throw new Error('SDK has no verified macOS process scope')
        await executions.bindProcessScope(owner, { identity, lock: processLock.identity })
      }
      runtime.detach = await stops.attach(owner, client, async stopSignal => ({
        state: await client.waitForProcessScope(stopSignal),
        source: client.options.processScope ? 'SDK launchd resource coalition' : 'SDK has no complete process scope',
      }))
      if (await stops.shutdownAfterAttach(owner)) return
      const { session, mode } = run.admission
      if (mode === 'resume') {
        stage = 'SDK Session restoration'
        await harness.client.resumeSession(session.sessionId, { expectedCwd: session.workspace, requireEmptyInbox: true })
      }
      this.observe(runtime, owner, session.sessionId)
      stage = 'SDK input acknowledgement'
      const receipt = await this.submit(owner, harness, session.sessionId, options.requestTimeoutMs)
      if (!receipt) await executions.launchUnconfirmed(owner, stage)
      else if (runtime.turnOutcome) await this.finalize(owner, runtime.turnOutcome)
      return
    } catch {
      if (!harness) {
        await processLock?.close()
        await executions.failedBeforeLaunch(owner, stage)
        return
      }
      if (signal.aborted) return
      warn(`Taskboard Run ${owner.runId} requires reconciliation after ${stage}`)
      await executions.launchUnconfirmed(owner, stage)
      return
    }
  }

  private observe(runtime: OwnedRuntime, owner: RuntimeBinding, sessionId: TaskRun['admission']['session']['sessionId']): void {
    const { executions, interactions, signal, warn } = this.options
    const client = runtime.harness.client
    const observation = new AbortController()
    const lifetime = AbortSignal.any([observation.signal, signal])
    client.onRequest((method, payload) => {
      lifetime.throwIfAborted()
      if (method === 'host/tool') return this.taskTool(owner, sessionId, payload)
      return interactions.request(owner, sessionId, method, payload)
    })
    const events = client.subscribe(({ method, params }) => params.sessionId === sessionId
      && (method === 'session.event' || method === 'approval.cancelled' || method === 'user-question.cancelled'))
    const stopped = (async () => {
      try {
        for await (const notification of events) {
          if (lifetime.aborted) return
          if (notification.method !== 'session.event') {
            await interactions.withdraw(owner, notification.method, notification.params).catch(() => {
              warn(`Taskboard Run ${owner.runId} could not save a withdrawn SDK request`)
            })
            continue
          }
          const event = runSessionEvent.safeParse(notification.params.event)
          if (event.success) {
            await executions.observeSessionEvent(owner, sessionId, event.data).catch(() => {
              warn(`Taskboard Run ${owner.runId} could not save its Session event position`)
            })
            if (event.data.type === 'turn/end') {
              const end = turnEnd.safeParse(notification.params.event)
              if (end.success) {
                runtime.turnOutcome = turnOutcome[end.data.data.reason.kind]
                await this.finalize(owner, runtime.turnOutcome)
              }
            }
          }
        }
      } catch {
        if (!lifetime.aborted) {
          await interactions.close(owner).catch(() => {
            warn(`Taskboard Run ${owner.runId} could not withdraw SDK requests after disconnect`)
          })
          await executions.observeTransportLoss(owner).then(async () => {
            const run = await executions.active(owner)
            if (run.connection !== 'suspect') return
            const recovered = await recoverSessionPosition(run, lifetime)
            if (recovered) {
              if (!run.receipt) await executions.started(owner, recovered.receipt)
              await executions.observeSessionEvent(owner, sessionId, recovered.position)
            }
          }).catch(() => {
            if (!lifetime.aborted) warn(`Taskboard Run ${owner.runId} could not reconcile its disconnected Session`)
          })
        }
      }
    })()
    runtime.stopObserving = async () => {
      observation.abort()
      events.close()
      await stopped
      await interactions.close(owner).catch(() => {
        warn(`Taskboard Run ${owner.runId} could not save SDK request withdrawals during cleanup`)
      })
    }
  }

  private async finalize(owner: RuntimeBinding, outcome: TurnOutcome): Promise<void> {
    await this.options.stops.finalize(owner, outcome).catch(() => {
      this.options.warn(`Taskboard Run ${owner.runId} could not finalize its SDK execution`)
    })
    this.wake()
  }

  private async taskTool(owner: RuntimeBinding, sessionId: string, payload: Record<string, unknown>): Promise<unknown> {
    const request = hostToolRequest.parse(payload)
    if (request.sessionId !== sessionId) throw new Error('task tool belongs to another Run Session')
    if (request.tool === 'taskboard/read') {
      taskReadArgs.parse(request.args)
      return this.options.executions.inspectForTool(owner)
    }
    const id = toolCommandId(owner, request.callId)
    if (request.tool === 'taskboard/script-result') {
      await this.options.executions.recordProjectScript(owner, id, scriptOutcome.parse(request.args))
      return {}
    }
    if (request.tool === 'taskboard/submit-delivery') {
      const { expected_version: expectedVersion, ...content } = taskDeliveryToolArgs.parse(request.args)
      const { version } = await this.options.executions.submitDelivery(owner, id, { ...content, expectedVersion })
      const run = await this.options.executions.active(owner)
      if (run.admission.projectScript && !run.deliveryDraft?.scriptCheck) {
        const before = await this.options.capture(run, content.files)
        const check = await this.options.executions.claimProjectScript(owner, id, before)
        if (check) return { version, check }
      }
      return { version }
    }
    const { kind, text, expected_version: expectedVersion } = taskUpdateArgs.parse(request.args)
    const { version } = await this.options.executions.recordToolUpdate(owner, {
      id, expectedVersion, action: toolAction[kind], text,
    })
    return { version }
  }

  private async submit(owner: RuntimeBinding, harness: DeepSeekHarness, sessionId: TaskRun['admission']['session']['sessionId'],
    requestTimeoutMs: number | undefined): Promise<string | null> {
    const { executions, signal } = this.options
    const client = harness.client
    const inputStartSeq = await sessionInputStart(await executions.active(owner), signal)
    const events = client.subscribe(notification => notification.method === 'session.event' && notification.params.sessionId === sessionId)
    let messageId: string | undefined
    let input: string | undefined
    try {
      return await executions.submitInput(owner, async (saved) => {
        signal.throwIfAborted()
        input = taskInput(saved)
        messageId = await client.prompt(sessionId, [{ type: 'text', text: input }])
        return messageId
      }, inputStartSeq)
    } catch (error) {
      if (signal.aborted || input === undefined) throw error
      if (!messageId && requestTimeoutMs !== undefined) messageId = await storedReceipt(events, input, requestTimeoutMs)
      if (!messageId) throw error
      await executions.started(owner, messageId)
      return messageId
    } finally {
      events.close()
    }
  }
}
