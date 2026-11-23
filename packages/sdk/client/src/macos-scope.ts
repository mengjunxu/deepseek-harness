/** Kernel observations for one SDK launchd job. A resource coalition survives reparenting and process-group changes. */
import { execFile, spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { constants } from 'node:os'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { RuntimeProcessOptions } from './launch.ts'

const launch = promisify(execFile)
const runtimeRelay = fileURLToPath(new URL('../macos-runtime.mjs', import.meta.url))
const require = createRequire(import.meta.url)
const launchEnvironment = { PATH: '/usr/bin:/bin' }

type Membership = 'empty' | 'occupied' | 'unknown'

/** The kernel resource coalition and one-use launchd job bound during SDK startup. */
export interface MacosProcessScopeIdentity {
  readonly kind: 'macos-launchd'
  readonly bootId: string
  readonly coalitionId: string
  readonly service: string
}

const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
const bootIdPattern = new RegExp('^' + uuid + '$')

function validService(service: string): boolean {
  return new RegExp(`^gui/${process.getuid?.()}/ai\\.deepseek\\.dsh\\.sdk\\.${uuid}$`).test(service)
}

async function currentBootId(signal: AbortSignal): Promise<string> {
  const { stdout } = await launch('/usr/sbin/sysctl', ['-n', 'kern.bootsessionuuid'], { signal, env: launchEnvironment })
  const id = stdout.trim().toLowerCase()
  if (!bootIdPattern.test(id)) throw new Error('macOS did not report a boot session identity')
  return id
}

function kernel() {
  const koffi = require('koffi') as typeof import('koffi')['default']
  const libc = koffi.load(null)
  const procInfo = libc.func('int proc_pidinfo(int pid, int flavor, uint64_t arg, void *buffer, int size)')
  const usage = libc.func('int coalition_info_resource_usage(uint64_t id, void *buffer, size_t size)')
  return {
    resourceId(pid: number): bigint | undefined {
      // XNU's PROC_PIDCOALITIONINFO contains the two IDs followed by three reserved words.
      const result = Buffer.alloc(40)
      if (procInfo(pid, 20, 0n, result, result.length) !== result.length) return
      return result.readBigUInt64LE(0)
    },
    active(id: bigint): bigint | 'absent' | undefined {
      // XNU publishes tasks_started and tasks_exited together under the coalition lock.
      const result = Buffer.alloc(1024, 0xff)
      if (usage(id, result, result.length) !== 0) {
        if (koffi.errno() === constants.errno.ESRCH) return 'absent'
        return
      }
      const started = result.readBigUInt64LE(0)
      const exited = result.readBigUInt64LE(8)
      if (started === 0n || started === 0xffff_ffff_ffff_ffffn || exited > started) return
      return started - exited
    },
  }
}

async function unload(service: string, signal: AbortSignal): Promise<void> {
  try {
    await launch('/bin/launchctl', ['bootout', service], { signal, env: launchEnvironment })
  } catch (bootoutError) {
    signal.throwIfAborted()
    try {
      await launch('/bin/launchctl', ['print', service], { signal, env: launchEnvironment })
    } catch (error) {
      // The relay may have booted out the job when it lost its Host.
      const { code, stderr } = error as { code?: number; stderr?: string }
      const label = service.slice(service.lastIndexOf('/') + 1)
      if (code === 113 && stderr?.includes(`Could not find service "${label}" in domain for user gui: ${process.getuid?.()}\n`)) return
      throw error
    }
    throw bootoutError
  }
}

/**
 * Reobserve a scope saved by the launching Host, after acquiring its durable ownership lock.
 * @param identity - originally verified job and kernel resource coalition.
 * @param signal - deadline for native inspection and service cleanup.
 * @returns the observed membership, with empty requiring proof of exit or a subsequent boot.
 */
export async function observeSavedMacosProcessScope(identity: MacosProcessScopeIdentity, signal: AbortSignal): Promise<Membership> {
  signal.throwIfAborted()
  if (process.platform !== 'darwin' || !validService(identity.service)
    || !bootIdPattern.test(identity.bootId) || !/^[1-9][0-9]{0,19}$/.test(identity.coalitionId)) return 'unknown'
  const id = BigInt(identity.coalitionId)
  if (id <= 1n || id > 0xffff_ffff_ffff_ffffn) return 'unknown'
  if (await currentBootId(signal) !== identity.bootId) return 'empty'
  const active = kernel().active(id)
  if (active === undefined) return 'unknown'
  if (active !== 'absent' && active !== 0n) return 'occupied'
  await unload(identity.service, signal)
  return 'empty'
}

interface Job {
  id: bigint
  service: string
}

/** Binds the relay to its initial live job before the relay starts the SDK. */
export class MacosSdkScope {
  private readonly kernel = kernel()
  private job: Job | undefined
  private released = false
  private unloading: Promise<void> | undefined

  /**
   * Start the private stdio relay for the already resolved dsh profile.
   * @param runtime - canonical SDK launch and startup deadline.
   * @returns the relay with an independent kernel scope available after startup.
   */
  spawn(runtime: RuntimeProcessOptions): ChildProcessWithoutNullStreams {
    const relay = spawn(runtime.command, [runtimeRelay, 'relay', String(runtime.initializeTimeoutMs), ...runtime.args], {
      cwd: runtime.cwd,
      env: runtime.environment(),
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    }) as ChildProcessWithoutNullStreams
    relay.once('message', (value: unknown) => { this.bind(relay, value) })
    return relay
  }

  private bind(relay: ChildProcess, value: unknown): void {
    try {
      if (value === null || typeof value !== 'object' || !('kind' in value) || value.kind !== 'macos-sdk-job'
        || !('pid' in value) || typeof value.pid !== 'number' || !Number.isSafeInteger(value.pid) || value.pid <= 1
        || !('service' in value) || typeof value.service !== 'string'
        || !validService(value.service)) return
      const id = this.kernel.resourceId(value.pid)
      const hostId = this.kernel.resourceId(process.pid)
      if (!hostId || !id || id <= 1n || id === hostId || this.kernel.active(id) !== 1n) return
      this.job = { id, service: value.service }
    } catch (_error) {
      // The relay must never start the SDK without a verified coalition.
    } finally {
      if (relay.connected) relay.send(this.job ? 'confirmed' : 'rejected', () => { /* Relay exit is observed by the SDK transport. */ })
    }
  }

  /**
   * Describe the verified launchd job for durable process-exit observation.
   * @param signal - deadline for reading the current macOS boot identity.
   * @returns the job identity once relay startup has verified it.
   */
  async identity(signal: AbortSignal): Promise<MacosProcessScopeIdentity | undefined> {
    const job = this.job
    if (!job) return
    return { kind: 'macos-launchd', bootId: await currentBootId(signal), coalitionId: job.id.toString(), service: job.service }
  }

  /**
   * Wait for the bound job's active count to reach zero, then unload its one-use service.
   * @param signal - observation deadline, including the cleanup command.
   * @returns empty only after the native observation and job cleanup.
   */
  async wait(signal: AbortSignal): Promise<Membership> {
    let state = await this.inspect(signal)
    while (state === 'occupied') {
      await delay(40, undefined, { signal })
      state = await this.inspect(signal)
    }
    return state
  }

  /**
   * Check the complete bound scope once after root exit.
   * @param signal - cancels service cleanup.
   * @returns the native observation or unknown if the coalition cannot be inspected.
   */
  async inspect(signal: AbortSignal): Promise<Membership> {
    signal.throwIfAborted()
    if (this.released) return 'empty'
    const job = this.job
    if (!job) return 'unknown'
    const active = this.kernel.active(job.id)
    if (active === undefined) return 'unknown'
    if (active !== 'absent' && active !== 0n) return 'occupied'
    this.unloading ??= this.unload(job, signal).finally(() => { this.unloading = undefined })
    await this.unloading
    return 'empty'
  }

  private async unload(job: Job, signal: AbortSignal): Promise<void> {
    await unload(job.service, signal)
    this.released = true
  }
}
