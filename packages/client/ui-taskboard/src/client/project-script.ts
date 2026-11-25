/** Display the package-manager command saved for a Taskboard Run. */
import type { ProjectScript } from '@deepseek-ai/dsh-api-taskboard-controller/types'

/**
 * Format a script selection for operator confirmation and delivery history.
 * @param script - saved package manager and script, or a legacy npm selection.
 * @returns the command shown to the operator.
 */
export function projectScriptLabel(script: ProjectScript | undefined): string {
  if (!script) return ''
  return typeof script === 'string' ? `npm run ${script}` : `${script.manager} run ${script.name}`
}
