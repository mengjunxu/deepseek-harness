/** Validation at JSON/configuration and durable-record admission. */
import { isAbsolute, win32 } from 'node:path'
import { statSync } from 'node:fs'
import type { NodeConfig, TaskBudget, TaskPlan } from './types.ts'

/**
 * Require a JSON object with exactly the declared fields.
 * @param value - Parsed external input.
 * @param keys - Permitted, required fields.
 * @returns Object whose keys have been checked.
 */
export function fields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object')
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(record, key))) throw new Error(`Expected fields: ${keys.join(', ')}`)
  return record
}

/**
 * Admit a non-empty external string.
 * @param value - Input value.
 * @returns Validated string.
 */
export function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) throw new Error('Expected a non-empty string without NUL')
  return value
}

/**
 * Admit a bounded integer.
 * @param value - Input value.
 * @param minimum - Inclusive lower bound.
 * @returns Validated integer.
 */
export function integer(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error('Expected a bounded integer')
  return value
}

/**
 * Validate human-selected resource limits.
 * @param value - External budget object.
 * @returns Explicit resource limits.
 */
export function parseBudget(value: unknown): TaskBudget {
  const input = fields(value, ['maxExecutionAttempts', 'maxExpertCalls', 'maxDurationMs'])
  return {
    maxExecutionAttempts: integer(input.maxExecutionAttempts, 1),
    maxExpertCalls: integer(input.maxExpertCalls), maxDurationMs: integer(input.maxDurationMs, 1),
  }
}

/**
 * Admit a plan without workflow state or approval fields.
 * @param value - Planner JSON or a persisted plan.
 * @returns Validated proposal.
 */
export function parsePlan(value: unknown): TaskPlan {
  const input = fields(value, ['summary', 'allowedFiles', 'acceptanceCriteria', 'source'])
  if (input.source !== 'human' && input.source !== 'expert') throw new Error('Unknown plan source')
  const list = (items: unknown): string[] => {
    if (!Array.isArray(items) || !items.length) throw new Error('Expected a non-empty string list')
    return items.map((item: unknown) => text(item))
  }
  const allowedFiles = list(input.allowedFiles)
  if (allowedFiles.some(path => isAbsolute(path) || win32.isAbsolute(path) || path.split(/[\\/]/u).includes('..'))) throw new Error('Plan paths must be relative without traversal')
  return { summary: text(input.summary), allowedFiles, acceptanceCriteria: list(input.acceptanceCriteria), source: input.source }
}

/**
 * Validate an explicit same-host configuration and existing directories.
 * @param value - Parsed node-local JSON.
 * @returns Validated configuration, with no path defaults.
 */
export function parseNodeConfig(value: unknown): NodeConfig {
  const input = fields(value, ['nodeId', 'workspaceRoot', 'repos'])
  const directory = (value: unknown): string => {
    const path = text(value)
    if (!isAbsolute(path) || !statSync(path).isDirectory()) throw new Error('Node paths must be existing absolute directories')
    return path
  }
  if (!input.repos || typeof input.repos !== 'object' || Array.isArray(input.repos)) throw new Error('Expected repository aliases')
  const repos: Record<string, { path: string; defaultBaseRef: string }> = {}
  for (const [alias, value] of Object.entries(input.repos)) {
    if (!/^[a-zA-Z0-9_-]+$/u.test(alias) || ['__proto__', 'constructor', 'prototype'].includes(alias)) throw new Error('Invalid repository alias')
    const repo = fields(value, ['path', 'defaultBaseRef'])
    repos[alias] = { path: directory(repo.path), defaultBaseRef: text(repo.defaultBaseRef) }
  }
  if (!Object.keys(repos).length) throw new Error('Configure at least one repository')
  return { nodeId: text(input.nodeId), workspaceRoot: directory(input.workspaceRoot), repos }
}
