/** Construct the SDK process for a Taskboard Run with its selected policy and working directory. */
import { fileURLToPath } from 'node:url'
import { DeepSeekHarness, type DeepSeekHarnessOptions } from '@deepseek-ai/dsh-sdk-client'

/** Host-resolved deployment settings for an admitted Run. */
export type TaskRuntimeOptions = Pick<DeepSeekHarnessOptions, 'patches' | 'initializeTimeoutMs' | 'requestTimeoutMs'> & {
  cwd: string
  dshHome: string
  provider: string
  model: string
  env: NodeJS.ProcessEnv
}

/**
 * Build the exclusive SDK client without starting a child or sending input.
 * @param options - confirmed directory, Session home and trusted Host configuration.
 * @returns a lazy SDK instance whose handshake requires native approval, permission presets and sandbox services.
 */
export function createTaskRuntime(options: TaskRuntimeOptions): DeepSeekHarness {
  const policy = fileURLToPath(import.meta.resolve('@deepseek-ai/dsh-api-taskboard-controller/sdk-permissions.patch.yml'))
  return new DeepSeekHarness({
    profile: 'sdk', processCwd: options.cwd, cwd: options.cwd, dshHome: options.dshHome, provider: options.provider, model: options.model,
    env: options.env, patches: [...options.patches ?? [], policy], approvalRequests: true, userQuestions: true,
    ...options.initializeTimeoutMs === undefined ? {} : { initializeTimeoutMs: options.initializeTimeoutMs },
    ...options.requestTimeoutMs === undefined ? {} : { requestTimeoutMs: options.requestTimeoutMs },
  })
}
