/** Independent acceptance check, deliberately failing for one executor-success case. */
import { readFileSync } from 'node:fs'
const actual = readFileSync('received.txt', 'utf8')
process.stdout.write('Independent validation executed\n')
process.exitCode = actual === 'fail validation' ? 23 : 0
