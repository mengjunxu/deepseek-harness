/** Dispatch one Taskboard SDK Session input to a deployment-registered native adapter. */
import type { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { NativeActivityKind, SubagentResult } from '@deepseek-ai/dsh-subagent'
import z from '@deepseek-ai/schemastery'
import { submitTaskDelivery } from './sdk-tools.ts'
import { taskDeliveryToolArgs, taskReadResult } from './tool-protocol.ts'
import type { NativeTaskExecutor } from './types.ts'

export const name = 'taskboard-native-executor'
export const inject = ['subagents']

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Required by SDK startup when the Host selects a fresh native Run. */
    taskboardNativeExecutor: NativeTaskExecutor
  }
}

/** Native provider named in the operator's saved authorization. */
interface Config { executor: NativeTaskExecutor }

export const Config: z<Config> = z.object({ executor: z.union(['codex', 'codely'] as const).required() })

/** Execute the SDK root input once, await child disposal, and submit validated evidence for human review.
 * @param ctx - SDK profile with its named subagent provider.
 * @param config - native executor confirmed at Run admission.
 */
export function apply(ctx: Context, { executor }: Config): void {
  let started = false
  ctx.on('agent/pre-step', async ({ agent, turn, step, messages, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    const [input] = messages
    if (started || turn !== 1 || step !== 1 || messages.length !== 1 || input?.content.length !== 1 || input.content[0]?.type !== 'text') {
      throw new Error('Taskboard native execution requires one fresh SDK input')
    }
    const host = ctx.get('sdkHost')
    if (!host || !decision.messages.includes(input)) throw new Error('Taskboard SDK did not admit the native Run input')
    if (!ctx.subagents.getProvider(executor)?.usesParentCwd) {
      throw new Error(`Taskboard requires a ${executor} provider that uses the Run workspace`)
    }
    started = true
    const counts: Partial<Record<NativeActivityKind, number>> = {}
    const run = await ctx.subagents.start(executor, { parent: agent, prompt: [...input.content], signal,
      onNativeActivity(kind) { counts[kind] = (counts[kind] ?? 0) + 1 },
    })
    let result: SubagentResult
    try {
      result = await run.result
    } finally {
      await run.dispose()
    }
    signal.throwIfAborted()
    const callId = ToolCallId(input.id)
    await host.callHostTool(agent, callId, 'taskboard/native-activity', counts, signal)
    if (result.stopReason !== 'completed') throw new Error(`Taskboard ${executor} stopped with ${result.stopReason}`)
    const output = result.output.map(block => block.type === 'text' ? block.text : '').join('')
    let report: unknown
    try {
      report = JSON.parse(output)
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      throw new Error('Native executor returned an invalid JSON delivery')
    }
    const content = taskDeliveryToolArgs.omit({ expected_version: true }).parse(report)
    const task = taskReadResult.parse(await host.callHostTool(agent, callId, 'taskboard/read', {}, signal))
    await submitTaskDelivery(ctx, host, { agent, callId, signal }, { ...content, expected_version: task.version })
    return { kind: 'enter', messages: [] }
  })
  ctx.provide('taskboardNativeExecutor', executor)
}
