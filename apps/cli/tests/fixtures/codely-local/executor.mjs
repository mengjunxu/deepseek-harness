/** External-agent fixture: argv transport, observable writes, and cooperative cancellation. */
import { writeFileSync } from 'node:fs'
const prompt = process.argv.find(value => value.startsWith('--prompt='))?.slice(9)
if (!prompt) throw new Error('missing prompt')
writeFileSync('received.txt', prompt)
process.stdout.write('fixture ready\n')
if (prompt === 'hang') setInterval(() => {}, 1000)
