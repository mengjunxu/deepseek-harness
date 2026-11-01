/**
 * Independent bridge worker for the isolated Web validation PoC. One process per model
 * call: it reads a single JSON request line from stdin, drives the reference DEV
 * in-process transport (never the forbidden Responses listener), and writes NDJSON
 * protocol records to stdout. Mock scenarios exercise the wire protocol without
 * touching the browser; only `real` reaches the logged-in reference session.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { activateDevProfileEnvironment } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/dev-chat/profile.ts'
import { loadConfig } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/config.ts'
import { responseRequest } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/server.ts'
import { createLauncherDevAdapter } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/dev-chat/driver.ts'
import { closeChatGptBrowserWorkers } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/adapters/chatgpt-web/browser-worker.ts'
import { chatGptTurnSessions } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/adapters/chatgpt-web/turn-execution.ts'
import type { AdapterEvent } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/types.ts'

interface GenerateRequest {
  kind: 'generate'
  model: string
  effort: string
  instructions?: string
  prompt: string
  threadId: string
  turnId: string
  userAgent: string
}

const SCENARIOS = ['mock-complete', 'mock-generating', 'mock-rejected', 'real'] as const
type Scenario = typeof SCENARIOS[number]

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 || index + 1 >= process.argv.length ? undefined : process.argv[index + 1]
}

const scenarioArgument = argument('--scenario')
if (scenarioArgument === undefined || !(SCENARIOS as readonly string[]).includes(scenarioArgument)) {
  throw new Error(`Expected --scenario ${SCENARIOS.join('|')}`)
}
const scenario = scenarioArgument as Scenario
const root = resolve(import.meta.dir, '../../../..')
const runtimeStateRoot = argument('--runtime-state') ?? resolve(root, '.artifacts/cgw-dev-runtime/runtime/dsh-bridge')
const deltaDelayMs = Number(argument('--delta-delay-ms') ?? 100)
const deadlineMs = Number(argument('--deadline-ms') ?? 180_000)
const evidencePath = argument('--evidence')
if (evidencePath !== undefined) mkdirSync(dirname(evidencePath), { recursive: true })

const controller = new AbortController()
let abortCause: string | null = null
const abort = (cause: string): void => {
  if (abortCause === null) abortCause = cause
  controller.abort(new DOMException(cause, 'AbortError'))
}
// The reference transport logs to console.info; keep the protocol stdout pure NDJSON
// by routing informational noise to stderr, where the adapter collects diagnostics.
console.info = (...values: unknown[]) => {
  try {
    console.error(...values)
  } catch {
    // stderr is gone; nothing to do.
  }
}
let stdoutBroken = false
const write = (record: object): void => {
  const line = `${JSON.stringify(record)}\n`
  if (!stdoutBroken) {
    try {
      process.stdout.write(line)
    } catch {
      stdoutBroken = true
    }
  }
  if (evidencePath !== undefined) {
    try {
      appendFileSync(evidencePath, line)
    } catch {
      // Evidence mirroring is best-effort; the protocol stream stays authoritative.
    }
  }
}

function readLines(onLine: (line: string) => void, onClosed: () => void): void {
  let buffer = ''
  const finish = (): void => {
    if (buffer.length > 0) {
      const rest = buffer
      buffer = ''
      onLine(rest)
    }
    onClosed()
  }
  process.stdin.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      onLine(line)
      newline = buffer.indexOf('\n')
    }
  })
  process.stdin.on('end', finish)
  process.stdin.on('close', finish)
  process.stdin.on('error', finish)
}

function emitEvent(event: AdapterEvent): void {
  write({ kind: 'event', ...event })
}

async function runMock(request: GenerateRequest): Promise<void> {
  write({
    kind: 'started', scenario, pid: process.pid, capturedAt: new Date().toISOString(), request: {
      model: request.model, effort: request.effort, prompt: request.prompt, threadId: request.threadId,
      turnId: request.turnId, userAgent: request.userAgent, instructionsChars: request.instructions?.length ?? 0,
    },
  })
  if (scenario === 'mock-rejected') {
    write({ kind: 'status', httpStatus: 400 })
    emitEvent({
      type: 'error', message: 'Mock bridge preflight rejection: submission was not accepted',
      status: 400, errorType: 'invalid_request_error', code: 'invalid_request',
    })
    return
  }
  write({ kind: 'status', httpStatus: 200 })
  emitEvent({ type: 'heartbeat' })
  emitEvent({ type: 'text_delta', text: 'Bridge commentary stays separate from the final answer.', phase: 'commentary' })
  emitEvent({ type: 'assistant_boundary' })
  if (scenario === 'mock-generating') {
    for (let index = 0; index < 60 && !controller.signal.aborted; index++) {
      emitEvent({ type: 'text_delta', text: `bridge-chunk-${index} `, phase: 'final_answer' })
      await new Promise(resolvePromise => setTimeout(resolvePromise, deltaDelayMs))
    }
  } else {
    emitEvent({ type: 'text_delta', text: request.prompt, phase: 'final_answer' })
  }
  if (controller.signal.aborted) return
  emitEvent({
    type: 'done', stopReason: 'stop', endTurn: true,
    usage: { inputTokens: 12, outputTokens: 34, totalTokens: 46 },
  })
}

async function runReal(request: GenerateRequest): Promise<void> {
  activateDevProfileEnvironment()
  const config = loadConfig()
  if (config.purpose !== 'dev-harness' || config.mode !== 'browser-only' || config.browserHost !== 'launcher') {
    throw new Error('This worker requires the isolated Browser-only DEV configuration')
  }
  mkdirSync(runtimeStateRoot, { recursive: true })
  write({
    kind: 'started', scenario, pid: process.pid, capturedAt: new Date().toISOString(), request: {
      model: request.model, effort: request.effort, prompt: request.prompt, threadId: request.threadId,
      turnId: request.turnId, userAgent: request.userAgent, instructionsChars: request.instructions?.length ?? 0,
    },
  })
  const adapter = createLauncherDevAdapter(config, runtimeStateRoot)
  const response = await responseRequest(new Request('http://bridge-worker.invalid/v1/responses', {
    method: 'POST', signal: controller.signal,
    headers: { 'content-type': 'application/json', 'user-agent': request.userAgent },
    body: JSON.stringify({
      model: `chatgpt-web/${request.model}`, stream: true, store: false,
      instructions: request.instructions ?? 'This is a synthetic browser transport probe. No local tools are available.',
      tools: [], reasoning: { effort: request.effort }, prompt_cache_key: request.threadId,
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: request.prompt }],
        internal_chat_message_metadata_passthrough: { turn_id: request.turnId } }],
      client_metadata: { 'x-codex-turn-metadata': JSON.stringify({
        thread_id: request.threadId, turn_id: request.turnId, request_kind: 'turn', sandbox: 'none', workspaces: { [root]: {} },
      }) },
    }),
  }), config, adapter.adapterFactory, { rememberState: false, onAdapterEvent: emitEvent })
  write({ kind: 'status', httpStatus: response.status })
  const wire = await response.text()
  const types: string[] = []
  const statuses: string[] = []
  for (const line of wire.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    const event: unknown = JSON.parse(line.slice(6))
    if (event === null || typeof event !== 'object') continue
    if ('type' in event && typeof event.type === 'string') types.push(event.type)
    if ('response' in event && event.response !== null && typeof event.response === 'object'
      && 'status' in event.response && typeof event.response.status === 'string') statuses.push(event.response.status)
  }
  write({ kind: 'wire', types, statuses })
}

let request: GenerateRequest | undefined
let runSettled = false
readLines(line => {
  if (line.trim() === '') return
  const record: unknown = JSON.parse(line)
  if (record === null || typeof record !== 'object' || !('kind' in record)) return
  const kind = (record as { kind: unknown }).kind
  if (kind === 'generate' && request === undefined) {
    request = record as GenerateRequest
  } else if (kind === 'abort') {
    abort('adapter requested abort')
  }
}, () => {
  // The adapter side went away: stop the run promptly so no browser turn is left behind.
  if (!runSettled) abort('adapter stdin closed')
})

const timer = setTimeout(() => {
  abort('bridge worker deadline reached; do not retry automatically')
}, deadlineMs)

let failure: string | null = null
try {
  const deadline = Date.now() + 10_000
  while (request === undefined && Date.now() < deadline) await new Promise(resolvePromise => setTimeout(resolvePromise, 50))
  if (request === undefined) throw new Error('Bridge worker received no generate request on stdin')
  if (scenario === 'real') await runReal(request)
  else await runMock(request)
} catch (error) {
  failure = error instanceof Error ? `${error.name}: ${error.message}` : 'Unclassified bridge worker failure'
} finally {
  runSettled = true
  clearTimeout(timer)
  if (scenario === 'real') await closeChatGptBrowserWorkers()
}

write({
  kind: 'exit', capturedAt: new Date().toISOString(), failure, aborted: controller.signal.aborted,
  abortCause, activeTurns: chatGptTurnSessions.activeCount(),
})
process.exit(failure === null ? 0 : 1)
