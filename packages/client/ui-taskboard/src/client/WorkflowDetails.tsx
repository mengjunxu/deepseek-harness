/** Selected template and the operator's ordered steps for one requirements revision. */
import type { TaskWorkflow } from '@deepseek-ai/dsh-api-taskboard-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'

/**
 * Show the recorded workflow in task history, Run confirmation and saved input.
 * @param props - workflow from the selected revision and its locale.
 * @returns the template and any standard-task steps.
 */
export function WorkflowDetails({ workflow, t }: { workflow: TaskWorkflow; t: PropsLocale<'taskboard'>['t'] }) {
  return <section>
    <p><strong>{t('workflow')}</strong> · {t(workflow.template)}</p>
    {workflow.template === 'task.standard.v1' && workflow.steps.length > 0 && <ol>
      {workflow.steps.map((step, index) => <li key={index}>{step}</li>)}
    </ol>}
  </section>
}
