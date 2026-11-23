/** Private stdio relay for the SDK's launchd-owned macOS execution range. */
import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createConnection, createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import koffi from 'koffi'

const launchctl = promisify(execFile)
const ownPath = fileURLToPath(import.meta.url)
const launchEnvironment = { PATH: '/usr/bin:/bin' }
const escapeXml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const xmlString = value => '<string>' + escapeXml(value) + '</string>'

function assertLaunchdPeer(socket, expectedPid) {
  const fd = socket._handle?.fd
  const value = Buffer.alloc(4)
  const size = Buffer.alloc(4)
  size.writeUInt32LE(value.length)
  const getsockopt = koffi.load(null).func('int getsockopt(int fd, int level, int name, void *value, void *size)')
  // Darwin SOL_LOCAL / LOCAL_PEERPID identifies the process connected to the socket.
  if (!Number.isInteger(fd) || fd < 0 || getsockopt(fd, 0, 2, value, size) !== 0 ||
    size.readUInt32LE() !== value.length || value.readInt32LE() !== expectedPid) {
    throw new Error('SDK relay peer is not the launchd job')
  }
}

function readRequest(socket) {
  let data = Buffer.alloc(0)
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.off('data', onData)
      socket.off('end', onEnd)
      socket.off('error', onError)
    }
    const onError = error => { cleanup(); reject(error) }
    const onEnd = () => { onError(new Error('SDK relay closed before launch')) }
    const onData = chunk => {
      data = Buffer.concat([data, chunk])
      const end = data.indexOf(10)
      if (end < 0 && data.length < 1_048_576) return
      socket.pause()
      cleanup()
      if (end < 0 || end >= 1_048_576) { reject(new Error('SDK relay launch request is too large')); return }
      try {
        const request = JSON.parse(data.subarray(0, end).toString('utf8'))
        if (data.length > end + 1) socket.unshift(data.subarray(end + 1))
        resolve(request)
      } catch (error) {
        reject(error)
      }
    }
    socket.on('data', onData)
    socket.once('end', onEnd)
    socket.once('error', onError)
  })
}

async function serveJob(path) {
  const socket = createConnection({ path, allowHalfOpen: true })
  try {
    const { args, env } = await readRequest(socket)
    const child = spawn(process.execPath, args, { env, stdio: ['pipe', 'pipe', 'inherit'] })
    const closed = once(child, 'close')
    child.stdin.on('error', () => { /* The child may close stdin before the relay. */ })
    socket.on('error', () => { child.stdin.end() })
    socket.pipe(child.stdin)
    child.stdout.pipe(socket)
    const [code] = await closed
    process.exitCode = code ?? 1
  } finally {
    socket.end()
  }
}

async function relay(args, timeout) {
  const directory = await mkdtemp('/tmp/dsh-sdk-')
  const path = join(directory, 'rpc')
  const diagnostic = join(directory, 'stderr')
  const label = 'ai.deepseek.dsh.sdk.' + randomUUID()
  const domain = 'gui/' + process.getuid()
  const service = domain + '/' + label
  const server = createServer({ allowHalfOpen: true })
  const lifetime = new AbortController()
  const command = (...argv) => launchctl('/bin/launchctl', argv, { timeout, env: launchEnvironment })
  let loaded = false
  let acknowledged = false
  let interrupted = false
  let abandoned = false
  let socket
  const cancel = () => { lifetime.abort(); socket?.destroy() }
  const force = () => { interrupted = true; cancel() }
  const disconnect = () => { abandoned = true; cancel() }
  process.once('SIGTERM', force)
  process.once('disconnect', disconnect)
  const deadline = setTimeout(cancel, timeout)
  try {
    const connection = once(server, 'connection', { signal: lifetime.signal })
    connection.catch(() => { /* Bootstrap can fail before the listener is awaited. */ })
    await once(server.listen(path), 'listening')
    const job = join(directory, 'job.plist')
    await writeFile(job, '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>' +
      '<key>Label</key>' + xmlString(label) + '<key>ProgramArguments</key><array>' +
      [process.execPath, ownPath, 'job', path].map(xmlString).join('') + '</array>' +
      '<key>WorkingDirectory</key>' + xmlString(process.cwd()) +
      '<key>StandardErrorPath</key>' + xmlString(diagnostic) + '</dict></plist>', { mode: 0o600 })
    await command('bootstrap', domain, job)
    loaded = true
    const started = await command('kickstart', '-p', service)
    if (!/^[1-9]\d*\n$/.test(started.stdout)) throw new Error('launchd did not report a single SDK job PID')
    const [connected] = await connection
    socket = connected
    server.close()
    const pid = Number(started.stdout)
    assertLaunchdPeer(socket, pid)
    const confirmation = once(process, 'message', { signal: lifetime.signal })
    process.send({ kind: 'macos-sdk-job', pid, service })
    const [confirmed] = await confirmation
    if (confirmed !== 'confirmed') throw new Error('Host could not verify the SDK job coalition')
    acknowledged = true
    clearTimeout(deadline)
    socket.write(JSON.stringify({ args, env: process.env }) + '\n')
    const ended = once(socket, 'end', { signal: lifetime.signal })
    socket.pipe(process.stdout, { end: false })
    process.stdin.pipe(socket)
    await ended
  } finally {
    clearTimeout(deadline)
    process.off('SIGTERM', force)
    process.off('disconnect', disconnect)
    process.stdin.pause()
    socket?.destroy()
    server.close()
    if (loaded && (!acknowledged || abandoned)) {
      await command('bootout', service).catch(() => { /* There is no live Host observing this cleanup. */ })
    } else if (loaded && interrupted) {
      await command('kill', 'SIGKILL', service).catch(() => { /* The Host checks the same coalition after the relay exits. */ })
    }
    try {
      const bytes = await readFile(diagnostic)
      if (bytes.length) process.stderr.write(bytes.subarray(-65_536))
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    } finally {
      await rm(directory, { recursive: true, force: true })
      if (process.connected) process.disconnect()
    }
  }
}

try {
  const [role, argument, ...args] = process.argv.slice(2)
  if (role === 'job') await serveJob(argument)
  else if (role === 'relay' && process.send) await relay(args, Number(argument))
  else throw new Error('invalid private SDK relay entry')
} catch (error) {
  process.stderr.write('macOS SDK relay: ' + error.message + '\n')
  process.exitCode = 1
}
