/** Taskboard occupants for the existing sidebar and global toast layer. */
import { IconListPenOutlineRegular, IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { createTaskboardSource } from './source.ts'

export function SidebarIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconListPenOutlineRegular size={size} />
}

type NoticeProps = PropsRuntime<'shell.overlay'> & PropsLocale<'taskboard'> & InjectFace<{
  hooks: Pick<ReturnType<typeof createTaskboardSource>['hooks'], 'taskboardNotice'>
  dismiss(): void
}>

export function TaskboardToast({ useTaskboardNotice, dismiss, t }: NoticeProps) {
  const notice = useTaskboardNotice(value => value)
  if (!notice) return null
  return notice.ok ? <Toast key={notice.id} tone="success" text={t('saved')} onDone={dismiss} />
    : <Toast key={notice.id} text={notice.message ?? t('saveFailed')} icon={<IconWarningOutlineRegular />} onDone={dismiss} />
}
