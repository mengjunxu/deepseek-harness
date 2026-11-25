/** Read the saved SDK Session through the same persistence provider as the SDK profile. */
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SessionPersistenceNotFoundError } from '@deepseek-ai/dsh-session-persistence'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { z } from 'zod'
import { runSessionEvent, type SavedTaskRun, type TaskRun, type TurnOutcome } from './execution-domain.ts'
import type { RunSessionEvent, TaskRunInputSnapshot } from './types.ts'

const acceptedUserMessage = z.object({
  id: z.string().min(1),
  source: z.object({ kind: z.literal('user') }),
  content: z.tuple([z.object({ type: z.literal('text'), text: z.string() })]),
})

/** Maps the persisted SDK turn reason to the corresponding Run outcome. */
export const turnOutcome = {
  completed: 'finished', aborted: 'interrupted', interrupted: 'interrupted', error: 'failed',
  blocked: 'failed', 'max-tokens': 'failed', forked: undefined,
} as const

/**
 * Read the confirmed input fields in SDK message order, including selected file contents.
 * @param run - saved admission and immutable requirements.
 * @returns task content captured when the operator queued this Run.
 */
export function savedTaskInput(run: SavedTaskRun): TaskRunInputSnapshot {
  const { title, description, constraints, riskLevel, workflow, milestone, acceptance, reviewFeedback } = run.input
  return { title, description, ...(constraints && { constraints }), ...(riskLevel && { riskLevel }),
    ...(workflow && { workflow }), ...(milestone && { milestone }), acceptance, reviewFeedback, materials: run.admission.materials }
}

/**
 * Encode the saved immutable input for SDK prompts and receipt reconciliation.
 * @param run - active Run with the admitted task and selected materials.
 * @returns the exact text sent as the SDK user's message.
 */
export function taskInput(run: SavedTaskRun): string {
  const task = JSON.stringify(savedTaskInput(run))
  if (!run.admission.authorization || run.admission.authorization.executor === 'dsh-sdk') return task
  return [
    task,
    'Complete this task in the supplied workspace. Return only one JSON object for the human reviewer.',
    'Include summary (string), changes, knownIssues, unfinished, files (arrays of strings), and verification.',
    'Use workspace-relative evidence files outside Git, or an empty files array in Git.',
    'For each acceptance criterion in order, include its exact criterion, status (passed, failed, not-run, or not-applicable), and evidence. Explain any check you could not run.',
  ].join('\n')
}

/**
 * Match an inserted SDK user message to the exact text sent for this Run.
 * @param entry - one entry in the Session inbox splice.
 * @param input - text submitted to the SDK.
 * @returns the matching message ID, if present.
 */
export function inputReceipt(entry: unknown, input: string): string | undefined {
  const parsed = acceptedUserMessage.safeParse(entry)
  if (parsed.success && parsed.data.content[0].text === input) return parsed.data.id
}

async function readBoundSession(run: SavedTaskRun, offset: number, signal: AbortSignal): Promise<readonly SessionEvent[] | undefined> {
  const { home, sessionId, workspace } = run.admission.session
  const context = new Context()
  try {
    await context.plugin(JsonlSessionPersistence, { root: join(home, 'sessions') })
    const handle = await context.sessionPersistence.open(sessionId, 'read', { signal })
    try {
      if (handle.header.cwd !== workspace || handle.header.parentSession !== undefined) throw new Error('stored Session does not match the Run')
      const { events } = await handle.read(offset, undefined, { signal })
      return events
    } finally {
      await handle.close()
    }
  } catch (error) {
    if (!(error instanceof SessionPersistenceNotFoundError)) throw error
  } finally {
    await context.fiber.dispose()
  }
}

/**
 * Verify a restored Run's saved input receipt and last observed event against the original Session.
 * @param run - prior Run whose archive omitted its Session files.
 * @param signal - cancels the original Session read.
 */
export async function verifyRestoredSession(run: SavedTaskRun, signal: AbortSignal): Promise<void> {
  if (!run.sessionNotIncluded) return
  const events = await readBoundSession(run, 0, signal)
  if (!events) throw new Error('the backup did not include the prior Session; restore the original Session files or start fresh')
  const last = run.lastEvent
  if (last && !events.some(event => event.seq === last.seq && event.type === last.type && event.time === last.time)) {
    throw new Error('restored files do not contain the recorded Session position')
  }
  if (run.receipt) {
    const input = taskInput(run)
    if (!events.some(event => event.seq >= (run.inputStartSeq ?? 0) && event.type === 'agent/inbox/spliced'
      && event.data.target === 'next-turn' && event.data.inserted.some(entry => inputReceipt(entry, input) === run.receipt))) {
      throw new Error('restored files do not match the recorded input receipt')
    }
  }
}

/**
 * Observe the log position before any new input to a restored Session.
 * @param run - preparing Run whose SDK already opened the requested Session.
 * @param signal - cancels the stored Session read.
 * @returns the first sequence at which the Run's input can appear.
 */
export async function sessionInputStart(run: TaskRun, signal: AbortSignal): Promise<number> {
  if (run.admission.mode === 'fresh') return 0
  const events = await readBoundSession(run, 0, signal)
  if (!events) throw new Error('restored SDK Session has no readable log')
  return events.length
}

/**
 * Read the persisted input and any ending from the originally bound Session.
 * @param run - active Run loaded by the Host from its lease.
 * @param signal - cancels the stored Session read.
 * @returns the matching receipt and latest position, with optional observed turn outcome.
 */
export async function recoverSessionPosition(run: TaskRun, signal: AbortSignal): Promise<{
  receipt: string
  position: RunSessionEvent
  outcome?: TurnOutcome
} | undefined> {
  if (!run.receipt && run.inputStartSeq === undefined) return
  const events = await readBoundSession(run, run.inputStartSeq ?? 0, signal)
  const last = events?.at(-1)
  if (!events || !last) return
  const input = taskInput(run)
  const matches = new Map<string, number>()
  for (const event of events) {
    if (event.type !== 'agent/inbox/spliced' || event.data.target !== 'next-turn') continue
    for (const entry of event.data.inserted) {
      const receipt = inputReceipt(entry, input)
      if (receipt && (!run.receipt || receipt === run.receipt) && !matches.has(receipt)) matches.set(receipt, event.seq)
    }
  }
  const [match] = matches
  if (matches.size !== 1 || !match) return
  const [receipt, seq] = match
  const ending = events.find(event => event.seq > seq && event.type === 'turn/end')
  const outcome = ending?.type === 'turn/end' ? turnOutcome[ending.data.reason.kind] : undefined
  return { receipt, position: runSessionEvent.parse(last), ...outcome && { outcome } }
}
