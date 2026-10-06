/** Local Codely execution followed by independently executed validation commands. */

/**
 * Run an executor and its checks within one cancellation lifetime.
 * @param {object} options - Resolved process settings and job output sink.
 * @returns {Promise<object>} Job outcome after managed processes have stopped.
 */
export async function runLocalTask({ subprocess, command, checks, cwd, prompt, signal, graceMs, maxBytes, pollMs, append }) {
  let cleanupFailed = false
  const execute = async (argv, label) => {
    signal.throwIfAborted()
    const handle = subprocess.spawn({
      argv, cwd, signal, graceMs,
      stdio: { stdin: 'ignore', stdout: { maxBytes }, stderr: { maxBytes } },
    })
    // Pull sources remain bounded even when the external agent emits large chunks.
    const offsets = { stdout: 0, stderr: 0 }
    const drain = () => {
      for (const channel of ['stdout', 'stderr']) {
        const chunk = handle.collected[channel].readFrom(offsets[channel])
        offsets[channel] = chunk.nextOffset
        if (chunk.text) append(chunk.text, { channel, ...(chunk.lossy ? { gapBefore: true } : {}) })
      }
    }
    const timer = setInterval(drain, pollMs)
    let outcome
    try {
      outcome = await handle.done
      drain()
      append(`${label} exit code: ${outcome.exitCode}; signal: ${outcome.signal}\n`, { channel: 'log' })
    } finally {
      clearInterval(timer)
      try {
        handle.terminate()
        if (!await handle.waitForExit()) throw new Error('Managed process range did not stop')
      } catch (error) {
        cleanupFailed = true
        throw error
      }
      drain()
    }
    signal.throwIfAborted()
    return outcome
  }

  try {
    const executor = await execute([
      ...command, '--no-upm', '--approval-mode=auto_edit', '--path-policy=strict',
      '--output-format=stream-json', `--prompt=${prompt}`,
    ], 'Codely')
    if (executor.exitCode !== 0) {
      return { status: 'failed', detail: `Codely exit code: ${executor.exitCode}; signal: ${executor.signal}; validation not run` }
    }
    for (const [index, check] of checks.entries()) {
      append(`Validation ${index + 1}/${checks.length}\n`, { channel: 'log' })
      const outcome = await execute(check, `Validation ${index + 1}`)
      if (outcome.exitCode !== 0) {
        return { status: 'failed', detail: `Validation ${index + 1} exit code: ${outcome.exitCode}; signal: ${outcome.signal}` }
      }
    }
    signal.throwIfAborted()
    return { status: 'completed', detail: 'Codely exited 0; all configured validation commands exited 0' }
  } catch (error) {
    const interruption = signal.reason?.name === 'TimeoutError' ? 'Timed out' : 'Cancelled'
    if (signal.aborted && !cleanupFailed) return { status: 'killed', detail: `${interruption}; validation is not certified` }
    append(`${error instanceof Error ? error.message : String(error)}\n`, { channel: 'stderr' })
    return { status: 'failed', detail: `Executor, validation, or process cleanup failed${signal.aborted ? `; ${interruption}` : ''}` }
  }
}
