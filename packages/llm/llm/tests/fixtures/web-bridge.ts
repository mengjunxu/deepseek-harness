/**
 * Isolated PoC bridge adapter for the gated Web validation route. Each model call spawns
 * the configured independent worker process (which hosts the reference in-process
 * transport), writes one JSON request line, and maps the worker's NDJSON records onto
 * the harness stream vocabulary. Commentary, final text, failures, and cancellation stay
 * distinct; no tool capability is declared, so unexpected tool traffic fails closed.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import type { Context } from '@deepseek-ai/cordis'
import { LlmAdapter, LlmError, attributionHeaders, resolveProviderPolicy } from '@deepseek-ai/dsh-llm'
import type {
  ContentBlock,
  GenerateOptions,
  LlmValidationAdmission,
  RequestMessage,
  StreamChunk,
  TokenUsage,
  UserMessage,
} from '../../src/index.ts'

/** Worker scenarios the bridge may drive; only `real` reaches the logged-in browser. */
export type WebBridgeScenario = 'mock-complete' | 'mock-generating' | 'mock-rejected' | 'real'

/** Minimal logging surface the bridge uses; the loader context satisfies this structurally. */
export interface WebBridgeLogger {
  /** Advisory warning channel for ignored reference event types. */
  warn(...values: unknown[]): void
}

/** Patch-supplied bridge configuration; machine-local paths stay in the local patch file. */
export interface WebBridgeConfig {
  /** Worker scenario for every stream call through this registration. */
  scenario: WebBridgeScenario
  /** Full worker spawn command: runtime binary plus wrapper and worker script arguments. */
  command: readonly string[]
  /** Sole admitted model id; the worker maps it onto the reference wire model. */
  model: string
  /** Reasoning effort forwarded to the worker when the request does not select one. */
  effort?: string
  /** Real-mode reference runtime state root handed to the worker. */
  runtimeStateRoot?: string
  /** Mock-generating pacing in milliseconds between final-answer deltas. */
  deltaDelayMs?: number
  /** Optional evidence file the worker mirrors every protocol record into. */
  evidencePath?: string
  /** Bounded preparation budget for the isolated admission grant. */
  maxCalls: number
  /** Admission expiry window in minutes from registration. */
  expiryMinutes: number
}

/** Reference transport event fields the bridge consumes; unknown fields are ignored. */
interface BridgeRecord {
  readonly kind?: unknown
  readonly type?: unknown
  readonly text?: unknown
  readonly phase?: unknown
  readonly thinking?: unknown
  readonly message?: unknown
  readonly status?: unknown
  readonly code?: unknown
  readonly stopReason?: unknown
  readonly endTurn?: unknown
  readonly failure?: unknown
  readonly usage?: unknown
}

function parseRecord(line: string): BridgeRecord | undefined {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return undefined
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value
}

function stringField(record: BridgeRecord, field: keyof BridgeRecord): string | undefined {
  const value = record[field]
  return typeof value === 'string' ? value : undefined
}

function userText(content: UserMessage['content']): string {
  let text = ''
  for (const block of content) {
    if (block.type === 'text') text += block.text
  }
  return text
}

function systemText(options: GenerateOptions): string | undefined {
  if (options.system !== undefined) return options.system
  const leading = options.messages[0]
  if (leading?.role === 'system') return userText(leading.content)
  return undefined
}

function usageOf(record: BridgeRecord): TokenUsage | undefined {
  const value = record.usage
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const usage = value as Record<string, unknown>
  const inputTokens = usage.inputTokens
  const outputTokens = usage.outputTokens
  if (typeof inputTokens !== 'number' || typeof outputTokens !== 'number') return undefined
  const tokens: TokenUsage = { inputTokens, outputTokens }
  const optional = (wireName: string, ours: keyof TokenUsage): void => {
    const entry = usage[wireName]
    if (typeof entry === 'number') tokens[ours] = entry
  }
  optional('totalTokens', 'totalTokens')
  optional('cacheReadInputTokens', 'cacheReadTokens')
  optional('cacheCreationInputTokens', 'cacheWriteTokens')
  optional('reasoningOutputTokens', 'reasoningTokens')
  return tokens
}

function isRuntimeContext(message: RequestMessage): boolean {
  const source = message.role === 'user' ? message.source : undefined
  return (source as { kind?: string } | undefined)?.kind === 'runtime-context'
}

async function* workerLines(child: ChildProcess): AsyncGenerator<string> {
  if (child.stdout === null) return
  yield* createInterface({ input: child.stdout })
}

/**
 * One bridge adapter bound to a single worker configuration. Register instances through
 * {@link apply} so every registration carries its own admission generation; direct
 * construction exists only for adapter-level protocol and cancellation checks.
 */
export class WebBridgeAdapter extends LlmAdapter {
  private calls = 0
  private readonly logger: WebBridgeLogger
  private readonly bridge: WebBridgeConfig

  constructor(logger: WebBridgeLogger, bridge: WebBridgeConfig) {
    super()
    this.logger = logger
    this.bridge = bridge
  }

  override providerInfo(provider: string) {
    return {
      id: provider,
      name: 'ChatGPT Web bridge (validation PoC)',
      policy: resolveProviderPolicy({
        usageSource: 'chatgpt_web_unofficial', availability: 'gated', gateReason: 'Isolated PoC admission only',
      }),
    }
  }

  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const messages = [...options.messages].reverse()
    // Runtime-context injections ride the request as user-role messages; the browser
    // turn carries only the real conversation prompt.
    const lastUser = messages.find(message => message.role === 'user' && !isRuntimeContext(message))
    if (lastUser === undefined) throw new LlmError('the bridge requires a user message', 'INVALID_ADAPTER')
    const sessionId = options.sessionId ?? 'oneshot'
    const turnId = `dsh_turn_${sessionId}_${lastUser.id ?? `call${++this.calls}`}`
    const threadId = `dsh_${sessionId}`
    const runtime = this.bridge.command[0]
    if (runtime === undefined) throw new LlmError('the bridge worker command is empty', 'INVALID_ADAPTER')
    const child = spawn(runtime, [
      ...this.bridge.command.slice(1),
      '--scenario', this.bridge.scenario,
      ...this.bridge.runtimeStateRoot === undefined ? [] : ['--runtime-state', this.bridge.runtimeStateRoot],
      ...this.bridge.deltaDelayMs === undefined ? [] : ['--delta-delay-ms', String(this.bridge.deltaDelayMs)],
      ...this.bridge.evidencePath === undefined ? [] : ['--evidence', this.bridge.evidencePath],
    ], { stdio: ['pipe', 'pipe', 'pipe'] })
    for (const stream of [child.stdin, child.stdout, child.stderr]) {
      if (stream !== null) stream.on('error', () => {})
    }
    const stderrTail: string[] = []
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail.push(chunk.toString('utf8'))
      if (stderrTail.length > 8) stderrTail.shift()
    })
    let spawnFailure: Error | undefined
    child.on('error', (error) => { spawnFailure = error })
    const exited = new Promise<void>((resolvePromise) => {
      child.once('exit', () => { resolvePromise() })
    })
    const writeLine = (line: string): void => {
      try {
        child.stdin.write(`${line}\n`)
      } catch {
        // The worker side is already gone; its EOF handling aborts and cleans up.
      }
    }
    writeLine(JSON.stringify({
      kind: 'generate',
      model: options.model,
      effort: options.reasoningEffort ?? this.bridge.effort ?? 'high',
      ...systemText(options) === undefined ? {} : { instructions: systemText(options) },
      prompt: userText(lastUser.content),
      threadId, turnId,
      userAgent: attributionHeaders()['user-agent'],
    }))
    const onAbort = (): void => {
      writeLine('{"kind":"abort"}')
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    let openType: 'text' | 'reasoning' | undefined
    let openIndex = -1
    let openText = ''
    let terminal: 'done' | 'error' | 'none' = 'none'
    const emitted: StreamChunk[] = []
    const closeOpen = (): void => {
      if (openType === undefined) return
      const block: ContentBlock = openType === 'text' ? { type: 'text', text: openText } : { type: 'reasoning', text: openText }
      emitted.push({ type: 'block-end', index: openIndex, block })
      openType = undefined
      openText = ''
    }
    const openBlock = (type: 'text' | 'reasoning'): number => {
      if (openType === type) return openIndex
      closeOpen()
      openIndex += 1
      openType = type
      openText = ''
      emitted.push({ type: 'block-start', index: openIndex, blockType: type })
      return openIndex
    }
    try {
      for await (const line of workerLines(child)) {
        emitted.length = 0
        if (line.trim() === '') continue
        const record = parseRecord(line)
        if (record === undefined) continue
        if (record.kind === 'event') {
          const type = stringField(record, 'type')
          if (type === 'heartbeat' || type === undefined) continue
          if (type === 'assistant_boundary') {
            closeOpen()
          } else if (type === 'text_delta') {
            const text = stringField(record, 'text') ?? ''
            const phase = stringField(record, 'phase')
            if (phase === 'commentary') {
              const index = openBlock('reasoning')
              emitted.push({ type: 'reasoning-delta', index, text })
            } else {
              const index = openBlock('text')
              emitted.push({ type: 'text-delta', index, text })
            }
            openText += text
          } else if (type === 'thinking_delta') {
            const text = stringField(record, 'thinking') ?? ''
            const index = openBlock('reasoning')
            emitted.push({ type: 'reasoning-delta', index, text })
            openText += text
          } else if (type === 'done') {
            terminal = 'done'
            closeOpen()
            const usage = usageOf(record)
            if (usage !== undefined) emitted.push({ type: 'usage', usage })
            const stopReason = stringField(record, 'stopReason')
            if ((stopReason !== undefined && stopReason !== 'stop') || record.endTurn === false) {
              throw new LlmError('the browser-only route continued beyond the one turn the bridge can serve', 'PROVIDER_ERROR')
            }
            emitted.push({ type: 'finish', reason: { kind: 'stop' } })
          } else if (type === 'error') {
            terminal = 'error'
            const status = record.status
            const failureOptions = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
              ? { status }
              : undefined
            throw new LlmError(
              stringField(record, 'message') ?? 'bridge transport error',
              stringField(record, 'code') ?? 'PROVIDER_ERROR',
              failureOptions,
            )
          } else if (type === 'incomplete') {
            terminal = 'error'
            throw new LlmError(`incomplete reference turn: ${stringField(record, 'message') ?? 'unspecified reason'}`, 'PROVIDER_ERROR')
          } else if (type.startsWith('tool_call')) {
            terminal = 'error'
            throw new LlmError('the browser-only route returned tool traffic the bridge declares unsupported', 'PROVIDER_ERROR')
          } else {
            this.logger.warn(`llm: bridge ignored reference event type ${type}`)
          }
        }
        for (const chunk of emitted) yield chunk
      }
    } finally {
      options.signal?.removeEventListener('abort', onAbort)
      try {
        child.stdin.end()
      } catch {
        // stdin already destroyed; the worker treats EOF as an abort.
      }
      if (child.exitCode === null && child.signalCode === null) {
        await Promise.race([exited, delay(5_000)])
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL')
          await exited
        }
      }
    }
    if (terminal === 'none') {
      if (options.signal?.aborted === true) return
      const tail = stderrTail.join('').trimEnd()
      const cause = spawnFailure !== undefined ? ` (${spawnFailure.message})` : tail.length > 0 ? ` (${tail.slice(-400)})` : ''
      throw new LlmError(`bridge worker ended without a terminal event${cause}`, 'PROVIDER_ERROR')
    }
  }
}

/** Name of the bridge plugin inside an isolated profile. */
export const name = 'web-bridge-validation'

/** Services the bridge consumes: the LLM registry and the profile's home locator. */
export const inject = ['llm']

/**
 * Register the bridge adapter with an explicit isolated-home admission grant.
 * @param ctx - Loader-owned profile scope.
 * @param config - Patch-supplied bridge configuration.
 */
export function apply(ctx: Context, config: WebBridgeConfig): void {
  if (config.scenario === undefined || config.command === undefined || config.model === undefined
    || !config.command.length || !config.maxCalls || !config.expiryMinutes) {
    throw new LlmError('the web bridge requires scenario, command, model, maxCalls, and expiryMinutes', 'INVALID_ADAPTER')
  }
  const locateHome = ctx.get('dshHomePath') as () => string
  const admission: LlmValidationAdmission = {
    scope: 'isolated-web-poc',
    home: locateHome(),
    provider: 'chatgpt_web_unofficial',
    models: [config.model],
    expiresAt: new Date(Date.now() + config.expiryMinutes * 60_000).toISOString(),
    maxCalls: config.maxCalls,
  }
  ctx.llm.registerAdapter(['chatgpt_web_unofficial'], new WebBridgeAdapter(ctx.logger, config), admission)
  ctx.on('agent/request', async (_payload, next) => ({
    ...await next(),
    provider: 'chatgpt_web_unofficial',
    model: config.model,
  }))
}
