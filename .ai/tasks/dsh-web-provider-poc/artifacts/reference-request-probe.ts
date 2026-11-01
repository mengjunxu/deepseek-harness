/** Controlled reference-only browser probe; no DSH route or Responses listener is installed. */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { loadConfig } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/config.ts'
import { responseRequest } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/server.ts'
import { createLauncherDevAdapter } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/dev-chat/driver.ts'
import { activateDevProfileEnvironment } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/dev-chat/profile.ts'
import { closeChatGptBrowserWorkers } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/adapters/chatgpt-web/browser-worker.ts'
import { chatGptTurnSessions } from '../../../../.artifacts/references/codex-chatgpt-web-current/src/adapters/chatgpt-web/turn-execution.ts'

const mode = process.argv[2]
if (mode !== 'stream' && mode !== 'cancel' && mode !== 'cancel-generating') throw new Error('Expected stream, cancel or cancel-generating')
const output = resolve(process.argv[3])
const root = resolve(import.meta.dir, '../../../..')
activateDevProfileEnvironment()
const config = loadConfig()
if (config.purpose !== 'dev-harness' || config.mode !== 'browser-only' || config.browserHost !== 'launcher') {
  throw new Error('This probe requires the isolated Browser-only DEV configuration')
}
const controller = new AbortController()
let abortCause: 'first_text_delta' | 'first_generation_trace' | 'probe_deadline' | null = null
const timer = setTimeout(() => {
  abortCause = 'probe_deadline'
  controller.abort(new Error('Reference probe deadline reached; do not retry automatically'))
}, 120_000)
const marker = `DSHWB01${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`
const prompt = mode === 'stream'
  ? `Reply with exactly ${marker}.`
  : 'List the integers from 1 to 300, one per line. Add no other text.'
const threadId = `dsh_web_probe_${crypto.randomUUID()}`
const turnId = `dsh_web_turn_${crypto.randomUUID()}`
const adapter = createLauncherDevAdapter(config, resolve(root, '.artifacts/cgw-dev-runtime/runtime/request-probes'))
const text: string[] = []
let commentaryDeltas = 0
const observedTypes: string[] = []
const wireTypes: string[] = []
const wireStatuses: string[] = []
const adapterErrors: { code?: string; message: string }[] = []
let httpStatus: number | null = null
let failure: string | null = null
const startedAt = new Date().toISOString()
try {
  const response = await responseRequest(new Request('http://reference-probe.invalid/v1/responses', {
    method: 'POST', signal: controller.signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'chatgpt-web/gpt-5.6-sol', stream: true, store: false,
      instructions: 'This is a synthetic browser transport probe. No local tools are available.',
      tools: [], reasoning: { effort: 'high' }, prompt_cache_key: threadId,
      input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: prompt }],
        internal_chat_message_metadata_passthrough: { turn_id: turnId } }],
      client_metadata: { 'x-codex-turn-metadata': JSON.stringify({
        thread_id: threadId, turn_id: turnId, request_kind: 'turn', sandbox: 'none', workspaces: { [root]: {} },
      }) },
    }),
  }), config, adapter.adapterFactory, {
    rememberState: false,
    onAdapterEvent(event) {
      observedTypes.push(event.type)
      if (event.type === 'error') adapterErrors.push({ ...event.code === undefined ? {} : { code: event.code }, message: event.message.replaceAll(root, '<workspace>') })
      if (mode === 'cancel-generating' && event.type === 'thinking_delta' && !controller.signal.aborted) {
        abortCause = 'first_generation_trace'
        controller.abort(new DOMException('Controlled cancellation after generation evidence', 'AbortError'))
      }
      if (event.type === 'text_delta') {
        if (event.phase === 'commentary') {
          commentaryDeltas += 1
          return
        }
        text.push(event.text)
        if (mode === 'cancel' && !controller.signal.aborted) {
          abortCause = 'first_text_delta'
          controller.abort(new DOMException('Controlled cancellation after observed text', 'AbortError'))
        }
      }
    },
  })
  httpStatus = response.status
  const wire = await response.text()
  for (const line of wire.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
    const event: unknown = JSON.parse(line.slice(6))
    if (event === null || typeof event !== 'object') continue
    if ('type' in event && typeof event.type === 'string') wireTypes.push(event.type)
    if ('response' in event && event.response !== null && typeof event.response === 'object'
      && 'status' in event.response && typeof event.response.status === 'string') wireStatuses.push(event.response.status)
  }
} catch (error) {
  failure = error instanceof Error ? `${error.name}: ${error.message}` : 'Unclassified probe failure'
} finally {
  clearTimeout(timer)
  await closeChatGptBrowserWorkers()
}
const summary = {
  startedAt, completedAt: new Date().toISOString(), mode,
  evidenceClass: 'reference Browser-only live request; not DSH runtime admission',
  model: 'chatgpt-web/gpt-5.6-sol', effort: 'high', prompt,
  usageSource: 'chatgpt_web_unofficial', httpStatus, abortCause, signalAborted: controller.signal.aborted,
  observedTypes, commentaryDeltas, textDeltas: text.length, textChars: text.join('').length,
  ...mode === 'stream' ? { expectedMarker: marker, actualMarkdown: text.join(''), exactMarker: text.join('').trim() === marker } : {},
  wireTypes, wireStatuses, adapterErrors, failure, activeTurnsAfterCleanup: chatGptTurnSessions.activeCount(),
}
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(summary, null, 2) + '\n')
console.log(JSON.stringify(summary))
const passed = mode === 'stream'
  ? failure === null && !controller.signal.aborted && text.join('').trim() === marker && wireTypes.includes('response.completed')
  : abortCause === (mode === 'cancel' ? 'first_text_delta' : 'first_generation_trace')
    && controller.signal.aborted && !wireTypes.includes('response.completed')
process.exitCode = passed ? 0 : 1
