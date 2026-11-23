/** Taskboard model tools for an SDK process launched by the Taskboard Host. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-sdk-jsonrpc-server'
import type {} from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type { ProjectScript, ProjectScriptOutcome } from './types.ts'
import { defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools'
import { submissionReceipt, taskDeliveryToolArgs, taskReadArgs, taskReadResult, taskUpdateArgs, taskUpdateResult } from './tool-protocol.ts'

export const name = 'taskboard-sdk-tools'
export const inject = ['tools', 'sdkHost']

async function runProjectScript(
  ctx: Context, exec: ToolExecution, script: ProjectScript, directory: string,
): Promise<ProjectScriptOutcome> {
  const shell = ctx.get('shell')
  const policies = ctx.get('sandboxPolicy')
  if (shell?.sandboxMode === undefined || !policies || !exec.agent) return { exitCode: null, reason: 'unavailable' }
  const standing = policies.resolve({ session: exec.agent.session })
  if (standing.workspaceRoot !== directory) return { exitCode: null, reason: 'unavailable' }
  const mode = standing.mode === 'read-only' ? 'read-only' : 'workspace-write'
  try {
    const handle = await shell.execute(shell.resolve({ command: `npm --prefix . run ${script}`, workdir: directory, signal: exec.signal,
      onExpiry: 'kill', sandboxPolicy: { ...standing, mode } }))
    const result = await handle.result()
    if (result.timedOut) return { exitCode: null, reason: 'timed-out' }
    if (result.aborted || result.signal) return { exitCode: null, reason: 'interrupted' }
    if (result.sandbox?.runnerFailed || !result.sandbox || result.exitCode === null) return { exitCode: null, reason: 'unavailable' }
    if (result.sandbox.denied) return { exitCode: null, reason: 'sandbox-denied' }
    return { exitCode: result.exitCode, reason: null }
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return { exitCode: null, reason: exec.signal.aborted ? 'interrupted' : 'unavailable' }
  }
}

/** Register the current task's read, activity and delivery tools.
 * @param ctx - Taskboard SDK runtime context.
 */
export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'taskboard_read',
    description: 'Read this Run’s confirmed task requirements and the current version for posting an update.',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        title: { type: 'string', required: true }, description: { type: 'string', required: true },
        constraints: { type: 'string' }, riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
        workflow: { type: 'object', additionalProperties: false, properties: {
          template: { type: 'string', required: true, enum: ['task.quick.v1', 'task.standard.v1'] },
          steps: { type: 'array', items: { type: 'string' } },
        } },
        acceptance: { type: 'array', required: true, items: { type: 'string' } },
        revision: { type: 'number', required: true }, version: { type: 'number', required: true },
      } },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    async execute(args, exec) {
      const result = await ctx.sdkHost.callHostTool(exec.agent, exec.callId, 'taskboard/read', taskReadArgs.parse(args), exec.signal)
      const { constraints, riskLevel, workflow, ...requirements } = taskReadResult.parse(result)
      return { ...requirements, ...(constraints !== undefined && { constraints }),
        ...(riskLevel !== undefined && { riskLevel }), ...(workflow !== undefined && { workflow }) }
    },
    presentCall: () => ({ card: 'generic', title: 'Read current task', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'taskboard_update',
    description: 'Post a progress summary, comment, or blocker to this Run’s task history.',
    parameters: {
      kind: { type: 'string', required: true, enum: ['progress', 'comment', 'blocked'] },
      text: { type: 'string', required: true, description: 'Short message for the task operator.' },
      expected_version: { type: 'number', required: true, description: 'Current version from taskboard_read or the last update.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { version: { type: 'number', required: true } } },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    async execute(args, exec) {
      const result = await ctx.sdkHost.callHostTool(exec.agent, exec.callId, 'taskboard/update', taskUpdateArgs.parse(args), exec.signal)
      return taskUpdateResult.parse(result)
    },
    presentCall: args => ({ card: 'generic', title: 'Update current task', kind: 'other', rawInput: args.text }),
  }))

  ctx.tools.register(defineTool({
    name: 'taskboard_submit_delivery',
    description: 'Submit the finished work and verification evidence for human review. Submission runs the project script if the operator selected one.',
    parameters: {
      summary: { type: 'string', required: true, description: 'Short summary for the reviewer.' },
      changes: { type: 'array', required: true, description: 'Important changes.', items: { type: 'string' } },
      knownIssues: { type: 'array', required: true, items: { type: 'string' } },
      unfinished: { type: 'array', required: true, items: { type: 'string' } },
      files: { type: 'array', required: true, description: 'Workspace-relative evidence files outside Git. In a Git workspace use [].',
        items: { type: 'string' } },
      verification: {
        type: 'array', required: true, description: 'One entry for each confirmed acceptance criterion, in its original order.',
        items: { type: 'object', additionalProperties: false, properties: {
          criterion: { type: 'string', required: true, description: 'Exact acceptance criterion from taskboard_read.' },
          status: { type: 'string', required: true, enum: ['passed', 'failed', 'not-run', 'not-applicable'] },
          evidence: { type: 'string', required: true, description: 'Observed result, or the reason a check did not run or apply.' },
        } },
      },
      expected_version: { type: 'number', required: true, description: 'Current version from taskboard_read or the last update.' },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: { version: { type: 'number', required: true } } },
      render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    async execute(args, exec) {
      const request = taskDeliveryToolArgs.parse(args)
      const result = await ctx.sdkHost.callHostTool(exec.agent, exec.callId, 'taskboard/submit-delivery', request, exec.signal)
      const { version, check } = submissionReceipt.parse(result)
      if (check) {
        const outcome = await runProjectScript(ctx, exec, check.script, check.directory)
        await ctx.sdkHost.callHostTool(exec.agent, exec.callId, 'taskboard/script-result', outcome, exec.signal)
      }
      return { version }
    },
    presentCall: args => ({ card: 'generic', title: 'Submit delivery for review', kind: 'other', rawInput: args.summary }),
  }))
}
