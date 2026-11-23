/** Targeted SDK shutdown and independent observations of the Run's process scope. */
import type { RuntimeBinding, TaskRun, TurnOutcome } from './execution-domain.ts'
import type { TaskExecutions } from './execution.ts'
import type { DeliveryCodeSnapshot, StopFailure, TaskCommand, TaskRunId, TaskStopCommand } from './types.ts'

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
type ShutdownControl = 'stop_requested' | 'finalizing'

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
   * @param captureDelivery - optional capture of the workspace after confirmed exit.
   */
  constructor(
    private readonly executions: TaskExecutions,
    private readonly timeoutMs: number,
    private readonly captureDelivery?: (run: TaskRun) => Promise<DeliveryCodeSnapshot>,
  ) {}

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
   * Deliver a stop that the Host recorded before the launcher attached the SDK.
   * @param owner - the generation just attached by the launcher.
   * @returns whether an operator stop prevented the Run from accepting input.
   */
  async shutdownAfterAttach(owner: RuntimeBinding): Promise<boolean> {
    let stopped = false
    await this.serialize(owner.runId, async () => {
      const run = await this.executions.active(owner)
      stopped = run.control === 'stop_requested'
      if (run.stopFailure === 'runtime-unavailable') await this.perform(owner, 'shutdown')
    })
    return stopped
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
   * Reobserve an unconfirmed shutdown using the same Host's SDK child and scope observer.
   * @param owner - recorded runtime and lease generation.
   * @returns after confirmation or retention of the lease. A terminal Run is already settled.
   */
  recheck(owner: RuntimeBinding): Promise<void> {
    return this.serialize(owner.runId, async () => {
      const control = await this.executions.canRecheckStop(owner)
      if (control) await this.perform(owner, 'recheck', control)
    })
  }

  /**
   * Finish recovery after the cold Host verifies that the old macOS scope has exited.
   * @param owner - persisted Run and lease generation held by recovery.
   * @param evidence - independently confirmed exit of the persisted process scope.
   * @param outcome - ending found after the original input in stored Session data.
   * @returns after releasing the slot or sealing a previously finalizing delivery.
   */
  recoveredExit(owner: RuntimeBinding, evidence: ExitEvidence, outcome?: TurnOutcome): Promise<void> {
    return this.serialize(owner.runId, async () => {
      if (outcome) await this.executions.beginFinalization(owner, outcome, true)
      const run = await this.executions.active(owner)
      if (run.control === 'finalizing' && run.receipt) await this.finishRun(owner, evidence)
      else await this.executions.exited(owner, evidence, 'interrupted', 'original Web Host exited')
    })
  }

  /**
   * End an SDK Run after its live turn settles and the scope empties.
   * @param owner - proven Run binding of the SDK notification.
   * @param outcome - known result of the live SDK turn.
   * @returns after finalizing the Run or retaining the lease on unknown shutdown.
   */
  finalize(owner: RuntimeBinding, outcome: TurnOutcome): Promise<void> {
    return this.serialize(owner.runId, async () => {
      if (await this.executions.beginFinalization(owner, outcome)) await this.perform(owner, 'shutdown', 'finalizing')
    })
  }

  private async serialize(runId: TaskRunId, action: () => Promise<void>): Promise<void> {
    const prior = this.pending.get(runId)
    const task = prior ? prior.then(action, action) : action()
    this.pending.set(runId, task)
    try { await task } finally { if (this.pending.get(runId) === task) this.pending.delete(runId) }
  }

  private async perform(owner: RuntimeBinding, attempt: StopAttempt, control: ShutdownControl = 'stop_requested'): Promise<void> {
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
    if (control === 'finalizing') await this.finishRun(owner, result)
    else await this.executions.exited(owner, result, 'interrupted', 'operator stopped runtime')
    this.targets.delete(owner.runId)
  }

  private async finishRun(owner: RuntimeBinding, evidence: ExitEvidence): Promise<void> {
    const run = await this.executions.active(owner)
    const outcome = run.turnOutcome
    if (!outcome) throw new Error('the Run has no observed turn outcome')
    if (outcome !== 'finished' || !run.deliveryDraft) {
      const reason = outcome === 'finished' ? 'execution ended without a delivery'
        : outcome === 'failed' ? 'SDK turn failed' : 'SDK turn was interrupted'
      await this.executions.exited(owner, evidence, outcome, reason)
      return
    }
    let snapshot: DeliveryCodeSnapshot
    try {
      if (!this.captureDelivery) throw new Error('delivery capture unavailable')
      snapshot = await this.captureDelivery(run)
    } catch (error) {
      if (!(error instanceof Error)) throw error
      await this.executions.exited(owner, evidence, 'failed', 'delivery workspace snapshot unavailable')
      return
    }
    try {
      await this.executions.sealDelivery(owner, evidence, snapshot)
    } catch (error) {
      await this.executions.stopUnconfirmed(owner, 'observation-failed')
      throw error
    }
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
