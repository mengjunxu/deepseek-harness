/** Plain-Node artifact fixture exposing one SQLite record operation over IPC. */
import { Config, SqliteStorageBackend } from '../../lib/index.js'

if (process.argv[2] === undefined || process.send === undefined) throw new Error('Atomic owner requires a database and IPC')
const backend = new SqliteStorageBackend(new Config({ path: process.argv[2] }))
const unit = await backend.kv.open({ name: 'atomic_budget', version: 1, tables: ['records'], hasGlobal: false })
if (unit.modifyRecord === undefined) throw new Error('Built SQLite API lacks atomic modification')
await unit.putRecord('records', 'shared', 5)
process.on('disconnect', () => { void backend.close() })
process.on('message', async (message) => {
  if (message === 'stop') {
    await backend.close()
    process.disconnect()
    return
  }
  if (message !== 'increment') throw new Error('Unexpected atomic owner command')
  let callbackCalled = false
  try {
    const value = await unit.modifyRecord('records', 'shared', (current) => {
      callbackCalled = true
      if (typeof current !== 'number') throw new Error('Expected persisted counter')
      return current + 1
    })
    process.send({ type: 'result', value })
  } catch (error) {
    process.send({ type: 'failure', callbackCalled, message: error instanceof Error ? error.message : String(error) })
  }
})
process.send('ready')
