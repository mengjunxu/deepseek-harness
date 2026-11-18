/** Targeted SDK shutdown and independent observations of the Run's process scope. */
import type { RuntimeBinding } from './execution-domain.ts'
import type { TaskExecutions } from './execution.ts'
import type { StopFailure, TaskCommand, TaskRunId, TaskStopCommand } from './types.ts'

/** Operations on the exclusive SDK child, captured by the adapter at launch. */
export interface RuntimeStopTarget {
  request(method: 'shutdown', params: object, timeoutMs: number): Promise<unknown>
  waitForExit(timeoutMs: number): Promise<boolean>
  close(): Promise<void>
}

/** Observed process ownership covering all local tools of one runtime. */
export interface ScopeObservation {
  state: 'empty' | 'occupied' | 'unknown'
  source: string
}

/** A stopped runtime and its independently verified empty tool scope. */
export interface ExitEvidence {
  runtimeId: string
  source: string
}

interface Target {
  owner: RuntimeBinding
  client: RuntimeStopTarget
  scope: (signal: AbortSignal) => Promise<ScopeObservation>
}

type StopAttempt = 'shutdown' | 'force' | 'recheck'

function sameOwner(a: RuntimeBinding, b: RuntimeBinding): boolean {
  return a.runId === b.runId && a.runtimeId === b.runtimeId && a.projectId === b.projectId &&
    a.taskId === b.taskId && a.generation === b.generation
}

/** Keeps SDK handles private to the launching Host. SQLite remains authoritative after a restart. */
export class RunStops {
  private readonly targets = new Map<TaskRunId, Target>()
  private readonly pending = new Map<TaskRunId, Promise<void>>()

  /**
   * @param executions - durable execution and lease owner.
   * @param timeoutMs - deadline for acknowledgement, root exit and scope observation together.
   */
  constructor(private readonly executions: TaskExecutions, private readonly timeoutMs: number) {}

  /**
   * Associate the exact SDK child and its process supervision source with a live generation.
   * @param owner - generation issued at admission.
   * @param client - exclusive child handle created by the launching adapter.
   * @param scope - OS-backed observation, or unknown when coverage cannot be established.
   * @returns a disposer for this exact registration.
   */
  async attach(owner: RuntimeBinding, client: RuntimeStopTarget, scope: Target['scope']): Promise<() => void> {
    await this.executions.active(owner)
    if (this.targets.has(owner.runId)) throw new Error('runtime already attached')
    const target = { owner, client, scope }
    this.targets.set(owner.runId, target)
    return () => { if (this.targets.get(owner.runId) === target) this.targets.delete(owner.runId) }
  }

  /**
   * Advance a recorded stop using only the handle bound to this Run.
   * @param owner - target recovered from its durable Run.
   * @param command - versioned operator action with explicit force selection.
   * @returns after confirmed exit or after preserving the lease on an inconclusive attempt.
   */
  async stop(owner: RuntimeBinding, command: TaskStopCommand): Promise<void> {
    const { force, runId, ...base } = command
    if (runId !== owner.runId) throw new Error('wrong stop target')
    const request: TaskCommand = base
    await this.serialize(runId, async () => {
      const { issued } = await this.executions.requestStop(owner, request, force)
      if (issued) await this.perform(owner, force ? 'force' : 'shutdown')
      else if (!this.targets.has(runId)) await this.executions.stopUnconfirmed(owner, 'runtime-unavailable')
    })
  }

  /**
   * Reobserve an unconfirmed stop using the same Host's SDK child and scope observer.
   * @param owner - recorded runtime and lease generation.
   * @returns after confirmation or retention of the lease. A terminal Run is already settled.
   */
  recheck(owner: RuntimeBinding): Promise<void> {
    return this.serialize(owner.runId, async () => {
      if (await this.executions.canRecheckStop(owner)) await this.perform(owner, 'recheck')
    })
  }

  private async serialize(runId: TaskRunId, action: () => Promise<void>): Promise<void> {
    const prior = this.pending.get(runId)
    const task = prior ? prior.then(action, action) : action()
    this.pending.set(runId, task)
    try { await task } finally { if (this.pending.get(runId) === task) this.pending.delete(runId) }
  }

  private async perform(owner: RuntimeBinding, attempt: StopAttempt): Promise<void> {
    const target = this.targets.get(owner.runId)
    let result: ExitEvidence | StopFailure = 'runtime-unavailable'
    if (target && sameOwner(target.owner, owner)) {
      const timer = AbortSignal.timeout(this.timeoutMs)
      const deadline = new Promise<StopFailure>((resolve) => { timer.addEventListener('abort', () => { resolve('deadline') }, { once: true }) })
      try {
        result = await Promise.race([deadline, this.observeExit(target, timer, attempt)])
      } catch (error) {
        // A broken transport or failed process observation leaves this generation occupied.
        if (!(error instanceof Error)) throw error
        result = timer.aborted ? 'deadline' : 'observation-failed'
      }
    }
    if (typeof result === 'string') return this.executions.stopUnconfirmed(owner, result)
    await this.executions.exited(owner, result, 'interrupted', 'operator stopped runtime')
    this.targets.delete(owner.runId)
  }

  private async observeExit(target: Target, signal: AbortSignal, attempt: StopAttempt): Promise<ExitEvidence | StopFailure> {
    if (attempt === 'force') await target.client.close()
    if (attempt === 'shutdown') await target.client.request('shutdown', {}, this.timeoutMs)
    signal.throwIfAborted()
    if (!await target.client.waitForExit(this.timeoutMs)) return 'runtime-alive'
    signal.throwIfAborted()
    const scope = await target.scope(signal)
    signal.throwIfAborted()
    if (scope.state === 'unknown') return 'scope-unknown'
    if (scope.state === 'occupied') return 'scope-occupied'
    return { runtimeId: target.owner.runtimeId, source: scope.source }
  }
}
