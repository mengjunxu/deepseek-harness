/** Deterministic external executor for real browser command acceptance. */
import { writeFileSync } from 'node:fs'

const task = process.argv.find(arg => arg.startsWith('--prompt='))?.slice(9)
if (!task) throw new Error('Expected task argv')
writeFileSync('result.txt', `${task}\n`)
if (task === 'hang') setInterval(() => {}, 1000)
process.stdout.write('Executor wrote result.txt\n')
