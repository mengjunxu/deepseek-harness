/** Keep one tool descendant alive in a separate session until the Web probe releases it. */
import { spawn } from 'node:child_process'
import { access, appendFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

if (process.argv[2] === 'member') {
  await writeFile('scope-member.pending', String(process.pid))
  await rename('scope-member.pending', 'scope-member.pid')
  const deadline = AbortSignal.timeout(25_000)
  while (!deadline.aborted) {
    try {
      await access('scope-release')
      break
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await delay(20)
  }
} else {
  await appendFile('scope-writes.log', String(process.pid) + '\n')
  const member = spawn(process.execPath, [fileURLToPath(import.meta.url), 'member'], { detached: true, stdio: 'ignore' })
  member.unref()
  await writeFile('scope-tool.pid', String(process.pid))
  await delay(20_000)
}
