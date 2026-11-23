/** Host operator controls for project memberships and member credentials. */
import { useEffect, useState } from 'react'
import { Button, Input, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { randomUUID } from '@deepseek-ai/dsh-util-crypto'
import type { ChangeMember, CreateMember, MemberId, MemberRole, ProjectId, ProjectMember } from '@deepseek-ai/dsh-api-taskboard-controller/types'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TaskboardPage.module.css'

/** Account management is provided by the authenticated operator Remote. */
export interface TeamActions {
  members: (projectId: ProjectId) => Promise<ProjectMember[]>
  createMember(input: CreateMember): Promise<boolean>
  changeMember(input: ChangeMember): Promise<boolean>
}

async function memberKey(id: MemberId) {
  const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  const secret = hex(crypto.getRandomValues(new Uint8Array(32)))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return { credential: id + '.' + secret, verifier: hex(new Uint8Array(digest)) }
}

/**
 * Manage access to the selected project and display a newly issued credential once.
 * @param props - operator actions, selected project, translations and dialog lifetime.
 * @returns the team access dialog.
 */
export function TeamPanel({ projectId, actions, t, close }: {
  projectId: ProjectId
  actions: TeamActions
  t: PropsLocale<'taskboard'>['t']
  close: () => void
}) {
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState<MemberRole>('viewer')
  const [credential, setCredential] = useState('')
  const [busy, setBusy] = useState(true)
  const [failed, setFailed] = useState(false)
  const read = actions.members
  useEffect(() => {
    let current = true
    void read(projectId).then((rows) => { if (current) setMembers(rows) }, () => { if (current) setFailed(true) })
      .finally(() => { if (current) setBusy(false) })
    return () => { current = false }
  }, [projectId, read])
  const run = async (work: () => Promise<boolean>) => {
    setBusy(true)
    setFailed(false)
    try { if (!await work()) setFailed(true) }
    catch { setFailed(true) }
    try { setMembers(await read(projectId)) } catch { setFailed(true) }
    finally { setBusy(false) }
  }
  const issue = async (account?: ProjectMember) => {
    const id = account?.id ?? randomUUID() as MemberId
    const key = await memberKey(id)
    const ok = account ? await actions.changeMember({ id, expectedVersion: account.version, action: 'rotate', verifier: key.verifier })
      : await actions.createMember({ id, name: name.trim(), role, projectId, verifier: key.verifier })
    if (ok) { setCredential(key.credential); setName('') }
    return ok
  }
  const [confirmDisable, setConfirmDisable] = useState<MemberId>()
  return <Modal open title={t('teamAccess')} closeLabel={t('close')} onClose={close}>
    <div className={css.form}>
      <a href="./taskboard-team.html" target="_blank" rel="noreferrer">{t('memberPortal')}</a>
      <label>{t('memberName')}<Input value={name} maxLength={120} onChange={(event) => { setName(event.target.value) }} /></label>
      <label>{t('initialRole')}<select value={role} onChange={(event) => { setRole(event.target.value as MemberRole) }}>
        <option value="viewer">{t('viewer')}</option><option value="editor">{t('editor')}</option>
      </select></label>
      <Button disabled={busy || !name.trim()} onClick={() => { void run(() => issue()) }}>{t('createMember')}</Button>
      {credential && <label>{t('issuedKey')}<input readOnly value={credential} onFocus={(event) => { event.target.select() }} /></label>}
      {members.map(member => <div key={member.id} className={css.controls}>
        <code>{member.id}</code>
        <label>{member.name}<select aria-label={member.name} value={member.role ?? ''} disabled={busy || member.disabled} onChange={(event) => {
          const next = event.target.value as MemberRole | ''
          void run(() => actions.changeMember({ id: member.id, expectedVersion: member.version, action: 'grant', projectId, role: next || null }))
        }}>
          <option value="">{t('noGrant')}</option><option value="viewer">{t('viewer')}</option><option value="editor">{t('editor')}</option>
        </select></label>
        {member.disabled ? <span>{t('accountDisabled')}</span> : <>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => { void run(() => issue(member)) }}>{t('rotateKey')}</Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => {
            if (confirmDisable !== member.id) { setConfirmDisable(member.id); return }
            void run(() => actions.changeMember({ id: member.id, action: 'disable', expectedVersion: member.version }))
          }}>{t(confirmDisable === member.id ? 'confirmDisable' : 'disableMember')}</Button>
        </>}
      </div>)}
      {failed && <div role="alert">{t('teamFailed')}</div>}
    </div>
  </Modal>
}
