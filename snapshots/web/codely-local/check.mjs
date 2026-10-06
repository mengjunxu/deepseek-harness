/** Trusted independent acceptance check outside the executor's workspace. */
import { readFileSync } from 'node:fs'

process.stdout.write('Independent validation executed\n')
process.exitCode = readFileSync('result.txt', 'utf8').trim() === 'fail validation' ? 23 : 0
