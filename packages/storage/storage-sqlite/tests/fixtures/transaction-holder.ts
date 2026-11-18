/** OS fixture holding a SQLite write transaction until IPC commit or process termination. */
import { DatabaseSync } from 'node:sqlite'

const path = process.argv[2]
if (path === undefined || process.send === undefined) throw new Error('Transaction holder requires a database and IPC')
const db = new DatabaseSync(path)
process.on('disconnect', () => { if (db.isOpen) db.close() })
process.on('message', (message: unknown) => {
  if (message !== 'commit') throw new Error('Unexpected transaction holder message')
  db.exec('COMMIT')
  db.close()
  process.disconnect()
})
db.exec('BEGIN IMMEDIATE')
db.prepare('UPDATE u_atomic_budget_records SET value = ? WHERE key = ?').run('9', 'shared')
process.send('holding')
