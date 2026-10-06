/** External-agent fixture: argv transport, observable writes, and cooperative cancellation. */
import { writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
const prompt = process.argv.find(value => value.startsWith('--prompt='))?.slice(9)
if (!prompt) throw new Error('missing prompt')
writeFileSync('received.txt', prompt)
if (prompt === 'hang') {
  const child = spawn(process.execPath, ['-e', "setInterval(() => {}, 1000); process.send('ready')"], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  })
  await once(child, 'message')
  writeFileSync('process-tree.json', JSON.stringify([process.pid, child.pid]))
  setInterval(() => {}, 1000)
}
process.stdout.write('fixture ready\n')
