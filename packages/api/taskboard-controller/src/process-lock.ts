/** Cross-Host ownership of a Run's macOS process observation. */
import { constants } from 'node:fs'
import { lstat, mkdir, open, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { tryLockExclusive } from '@deepseek-ai/node-addon-system/flock'
import type { RunProcessScope, TaskRun } from './execution-domain.ts'

type LockIdentity = RunProcessScope['lock']

function lockPath(run: TaskRun): string {
  return join(run.admission.session.home, `taskboard-${run.admission.runtimeId}.lock`)
}

async function readLock(path: string, handle: FileHandle): Promise<LockIdentity> {
  await tryLockExclusive(handle.fd)
  const opened = await handle.stat({ bigint: true })
  const named = await lstat(path, { bigint: true })
  if (!opened.isFile() || opened.dev !== named.dev || opened.ino !== named.ino
    || Number(opened.uid) !== process.getuid?.() || (opened.mode & 0o077n) !== 0n) throw new Error('invalid Host ownership lock')
  return { device: opened.dev.toString(), inode: opened.ino.toString() }
}

/** The native file lock survives a lost SDK transport and releases when the Host itself exits. */
export class RunProcessLock {
  private constructor(private readonly handle: FileHandle, readonly identity: LockIdentity) {}

  /**
   * Create and hold the private lock for the first launch of this runtime.
   * @param run - newly claimed Run before its SDK starts.
   * @returns the lock held by the launching Host.
   */
  static async create(run: TaskRun): Promise<RunProcessLock> {
    await mkdir(run.admission.session.home, { recursive: true, mode: 0o700 })
    const path = lockPath(run)
    return this.open(path, constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW)
  }

  /**
   * Take over observation only after the original owner releases the original inode.
   * @param run - persisted active Run from the serial slot.
   * @param identity - the device and inode saved by the launching Host.
   * @returns the acquired original lock, or undefined when ownership is unconfirmed.
   */
  static async recover(run: TaskRun, identity: LockIdentity): Promise<RunProcessLock | undefined> {
    try {
      const lock = await this.open(lockPath(run), constants.O_RDWR | constants.O_NOFOLLOW)
      if (lock.identity.device === identity.device && lock.identity.inode === identity.inode) return lock
      await lock.close()
    } catch (_error) {
      // Contention, missing files and kernel errors all leave ownership unconfirmed.
    }
  }

  private static async open(path: string, flags: number): Promise<RunProcessLock> {
    const handle = await open(path, flags | constants.O_NONBLOCK, 0o600)
    try {
      return new RunProcessLock(handle, await readLock(path, handle))
    } catch (error) {
      await handle.close()
      throw error
    }
  }

  /**
   * Release ownership. The lock pathname continues to identify the same inode.
   * @returns after closing the held descriptor.
   */
  close(): Promise<void> {
    return this.handle.close()
  }
}
