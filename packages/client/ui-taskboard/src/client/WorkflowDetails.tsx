/** Selected template and the operator's ordered steps for one requirements revision. */
import type { TaskWorkflow } from '@deepseek-ai/dsh-api-taskboard-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Show the recorded workflow in task history, Run confirmation and saved input.
 * @param props - workflow from the selected revision and its locale.
 * @returns the template and the ordered plan and the stage authorized for a Run.
 */
export function WorkflowDetails({ workflow, milestone, t }: { workflow: TaskWorkflow; milestone?: number | undefined; t: PropsLocale<'taskboard'>['t'] }) {
  return <section>
    <p><strong>{t('workflow')}</strong> · {t(workflow.template)}</p>
    {workflow.template === 'task.milestone.v1' && milestone && <p>{t('milestone')} {milestone}/{workflow.steps.length} · {workflow.steps[milestone - 1]}</p>}
    {'steps' in workflow && workflow.steps.length > 0 && <ol>
      {workflow.steps.map((step, index) => <li key={index}>{step}</li>)}
    </ol>}
  </section>
}
