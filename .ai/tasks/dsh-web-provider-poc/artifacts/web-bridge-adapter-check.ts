/**
 * Adapter-level bridge verification, run under tsx without the full Harness runtime:
 * wire-JSON round-trip and phase classification (mock-complete), mid-stream cancellation
 * and worker cleanup (mock-generating), and failure projection (mock-rejected). No real
 * browser request happens here; every case asserts the worker evidence file as well.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebBridgeAdapter, type WebBridgeConfig } from '../../../../packages/llm/llm/tests/fixtures/web-bridge.ts'
import type { GenerateOptions, StreamChunk } from '../../../../packages/llm/llm/src/types.ts'

const root = new URL('../../../../', import.meta.url).pathname
const wrapper = join(root, '.artifacts/cgw-cli.py')
const worker = join(root, '.ai/tasks/dsh-web-provider-poc/artifacts/web-validation-worker.ts')

const failures: string[] = []
function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`PASS ${label}`)
  } else {
    failures.push(label)
    console.log(`FAIL ${label}`)
  }
}

function blockText(chunks: readonly StreamChunk[], blockType: 'text' | 'reasoning'): string | undefined {
  for (const chunk of chunks) {
    if (chunk.type === 'block-end' && chunk.block.type === blockType) return chunk.block.text
  }
  return undefined
}

function config(scenario: WebBridgeConfig['scenario'], evidencePath: string): WebBridgeConfig {
  return {
    scenario,
    command: ['python3', wrapper, '--probe', worker],
    model: 'gpt-5.6-sol',
    maxCalls: 1,
    expiryMinutes: 5,
    evidencePath,
  }
}

function options(prompt: string, signal?: AbortSignal): GenerateOptions {
  return {
    provider: 'chatgpt_web_unofficial',
    model: 'gpt-5.6-sol',
    system: 'Synthetic bridge check instructions.',
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    ...signal === undefined ? {} : { signal },
  }
}

function records(path: string): Record<string, unknown>[] {
  return readFileSync(path, 'utf8').split('\n')
    .filter(line => line.trim() !== '')
    .map(line => JSON.parse(line) as Record<string, unknown>)
}

function noOrphanWorker(): boolean {
  try {
    execFileSync('pgrep', ['-f', 'web-validation-worker.ts'], { stdio: 'pipe' })
    return false
  } catch {
    return true
  }
}

const scratch = mkdtempSync(join(tmpdir(), 'web-bridge-check-'))
const logger = { warn: (message: unknown): void => { console.log(`WARN ${String(message)}`) } }

{
  const evidence = join(scratch, 'complete.ndjson')
  const prompt = 'Reply with exactly BRIDGE_WIRE_OK.'
  const chunks: StreamChunk[] = []
  for await (const chunk of new WebBridgeAdapter(logger, config('mock-complete', evidence)).stream(options(prompt))) {
    chunks.push(chunk)
  }
  const kinds = chunks.map(chunk => `${chunk.type}${chunk.type === 'block-start' ? `:${chunk.blockType}` : ''}`)
  check(kinds.join(',') === 'block-start:reasoning,reasoning-delta,block-end,block-start:text,text-delta,block-end,usage,finish', 'mock-complete chunk sequence keeps commentary and text blocks distinct')
  const commentary = blockText(chunks, 'reasoning')
  const answer = blockText(chunks, 'text')
  check(commentary !== undefined && commentary.includes('commentary stays separate'), 'commentary maps onto a reasoning block')
  check(answer === prompt, 'final text block echoes the exact prompt through the wire')
  const evidenceRecords = records(evidence)
  const started = evidenceRecords.find(record => record['kind'] === 'started') as
    { request?: { model?: string, effort?: string, prompt?: string, threadId?: string, turnId?: string, userAgent?: string, instructionsChars?: number } } | undefined
  check(started?.request?.model === 'gpt-5.6-sol' && started.request.prompt === prompt, 'wire carries the exact model and prompt')
  check(started?.request?.effort === 'high', 'wire carries the default high effort')
  check(started?.request?.threadId === 'dsh_oneshot' && started?.request?.turnId === 'dsh_turn_oneshot_call1', 'wire correlates the DSH session and turn identity')
  check(started?.request?.userAgent !== undefined && started.request.userAgent.startsWith('deepseek-harness/'), 'wire request carries the harness attribution user-agent')
  check(started?.request?.instructionsChars === 'Synthetic bridge check instructions.'.length, 'wire request carries the assembled system prompt length')
  const exit = evidenceRecords.at(-1) as { kind?: string, failure?: string, aborted?: boolean, activeTurns?: number } | undefined
  check(exit?.kind === 'exit' && exit.failure === null && exit.aborted === false && exit.activeTurns === 0, 'worker exits cleanly after completion')
  check(noOrphanWorker(), 'no orphan worker process remains after completion')
}

{
  const evidence = join(scratch, 'cancel.ndjson')
  const controller = new AbortController()
  const chunks: StreamChunk[] = []
  for await (const chunk of new WebBridgeAdapter(logger, config('mock-generating', evidence)).stream(options('List the integers from 1 to 300, one per line.', controller.signal))) {
    chunks.push(chunk)
    if (chunk.type === 'text-delta') controller.abort()
  }
  check(chunks.some(chunk => chunk.type === 'text-delta'), 'cancellation case observes final-answer deltas before abort')
  check(!chunks.some(chunk => chunk.type === 'finish'), 'aborted stream emits no finish chunk')
  const evidenceRecords = records(evidence)
  const exit = evidenceRecords.at(-1) as { kind?: string, failure?: string, aborted?: boolean, activeTurns?: number } | undefined
  check(exit?.kind === 'exit' && exit.aborted === true && exit.activeTurns === 0, 'worker reports the abort and cleans up its turn state')
  check(noOrphanWorker(), 'no orphan worker process remains after cancellation')
}

{
  const evidence = join(scratch, 'rejected.ndjson')
  let error: unknown
  try {
    for await (const chunk of new WebBridgeAdapter(logger, config('mock-rejected', evidence)).stream(options('This submission must be rejected by the mock bridge.'))) {
      void chunk
    }
    error = new Error('mock-rejected completed without throwing')
  } catch (caught) {
    error = caught
  }
  const code = (error as { code?: string }).code
  const status = (error as { failure?: { status?: number } }).failure?.status
  const message = error instanceof Error ? error.message : ''
  check(code === 'invalid_request' && status === 400, 'transport failure projects the worker error code and HTTP status')
  check(message.includes('Mock bridge preflight rejection'), 'transport failure keeps the worker failure message')
  const evidenceRecords = records(evidence)
  const exit = evidenceRecords.at(-1) as { kind?: string, aborted?: boolean, activeTurns?: number } | undefined
  check(exit?.kind === 'exit' && exit.activeTurns === 0, 'worker exits cleanly after a rejected submission')
  check(noOrphanWorker(), 'no orphan worker process remains after a rejected submission')
}

console.log(failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`)
process.exitCode = failures.length === 0 ? 0 : 1
