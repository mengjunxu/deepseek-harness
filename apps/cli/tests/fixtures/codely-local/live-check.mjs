/** Independent file-content acceptance for the explicitly invoked real-Codely smoke. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
assert.equal(readFileSync('local-smoke.txt', 'utf8').trim(), 'DSH_CODELY_LOCAL_OK')
process.stdout.write('Independent file check passed\n')
