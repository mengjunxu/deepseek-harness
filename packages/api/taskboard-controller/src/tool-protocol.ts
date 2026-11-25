/** Task tool arguments and results shared by the SDK plugin and its owning Host. */
import { z } from 'zod'
import { projectScript, riskLevel, workflow } from './member-board.ts'
import { deliverySubmission } from './execution-domain.ts'

const version = z.number().int().nonnegative()
const text = z.string().trim().min(1)

/** Runtime-identified tool call offered to the Host. */
export const hostToolRequest = z.strictObject({
  sessionId: text, callId: text, tool: z.enum(['taskboard/read', 'taskboard/update', 'taskboard/submit-delivery', 'taskboard/script-result', 'taskboard/native-activity']), args: z.unknown(),
})

/** The read tool takes no arguments. */
export const taskReadArgs = z.strictObject({})

/** The read result uses the active Run's confirmed requirements. */
export const taskReadResult = z.strictObject({
  title: text, description: z.string(), constraints: text.optional(), riskLevel: riskLevel.optional(),
  workflow: workflow.optional(), milestone: z.number().int().positive().optional(),
  acceptance: z.array(text), revision: version, version,
})

/** Updates are constrained to the Agent's allowed activity types. */
export const taskUpdateArgs = z.strictObject({ kind: z.enum(['progress', 'comment', 'blocked']), text, expected_version: version })

/** An update confirms the new current task version. */
export const taskUpdateResult = z.strictObject({ version })

/** Private instructions returned only to the SDK after the Host reserves the script. */
export const submissionReceipt = taskUpdateResult.extend({
  check: z.strictObject({ script: projectScript, directory: text }).optional(),
})

/** Delivery arguments exposed to the model use its current task version. */
export const taskDeliveryToolArgs = deliverySubmission.omit({ expectedVersion: true }).extend({ expected_version: version })
