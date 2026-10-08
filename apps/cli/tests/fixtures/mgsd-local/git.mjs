/** Git fixture with an observable preparation barrier; ordinary Git commands remain real. */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { once } from 'node:events'

const barrier = process.argv[2]
const args = process.argv.slice(3)
const blocked = args.find(arg => /^refs\/heads\/(cancel|unload)-blocked\^\{commit\}$/u.test(arg))
if (blocked) {
  const phase = blocked.includes('cancel-') ? 'cancel' : 'unload'
  writeFileSync(`${barrier}-${phase}`, String(process.pid))
  setInterval(() => {}, 1000)
} else {
  const child = spawn('git', args, { stdio: 'inherit' })
  const [code] = await once(child, 'exit')
  process.exitCode = code ?? 1
}
