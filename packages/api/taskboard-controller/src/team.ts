/** Project grants checked against the same SQLite snapshot as the member's task operation. */
import { createHash, timingSafeEqual } from 'node:crypto'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Domain, DomainTransaction } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { changeMember, newMember, taskboardDomain } from './domain.ts'
import type { ChangeMember, CreateMember, MemberBoard, MemberId, ProjectId, ProjectMember } from './types.ts'

type Tx = DomainTransaction<typeof taskboardDomain>
/** Authentication failure or authorization refusal safe to expose to a member. */
export class TeamAccessError extends Error {
  /** @param status - HTTP authentication or project authorization failure. */
  constructor(readonly status: 401 | 403) { super(status === 401 ? 'Invalid member credential' : 'Project access denied') }
}

/** A presented credential reduced to its public identity and non-replayable verifier. */
export interface MemberProof {
  id: MemberId
  verifier: string
}

/**
 * Parse a member bearer credential and discard its secret before dispatch.
 * @param header - Authorization from the member route.
 * @returns the account ID and SHA-256 verifier.
 */
export function memberProof(header: string | undefined): MemberProof {
  const match = /^Bearer ([\da-f-]{36})\.([a-f0-9]{64})$/.exec(header ?? '')
  if (!match?.[1] || !match[2] || !z.uuid().safeParse(match[1]).success) throw new TeamAccessError(401)
  return { id: brandString<MemberId>(match[1]), verifier: createHash('sha256').update(match[2]).digest('hex') }
}

function authenticated(tx: Tx, proof: MemberProof) {
  const account = tx.get('accounts', proof.id)
  if (!account || account.disabled || !timingSafeEqual(Buffer.from(account.verifier, 'hex'), Buffer.from(proof.verifier, 'hex'))) {
    throw new TeamAccessError(401)
  }
  return account
}

/**
 * Identify a current project editor inside the task mutation's transaction.
 * @param tx - transaction applying the edit.
 * @param proof - credential from the member carrier.
 * @param projectId - selected project.
 * @returns immutable identity to record with the accepted activity.
 */
export function requireEditor(tx: Tx, proof: MemberProof, projectId: ProjectId): { id: MemberId; name: string } {
  const account = authenticated(tx, proof)
  if (!account.grants.some(grant => grant.projectId === projectId && grant.role === 'editor')) throw new TeamAccessError(403)
  return { id: account.id, name: account.name }
}

/** Account administration and scoped reads for Taskboard. */
export class TeamAccounts {
  /** @param domain - authoritative task and account store. */
  constructor(private readonly domain: Domain<typeof taskboardDomain>) {}

  /**
   * Create the account or acknowledge its identical initial grant.
   * @param request - first project grant and verifier selected by the operator.
   * @returns after creation.
   */
  async create(request: CreateMember): Promise<void> {
    const { id, name, verifier, projectId, role } = newMember.parse(request)
    await this.domain.transaction((tx) => {
      if (!tx.get('projects', projectId)) throw new Error('unknown project')
      const prior = tx.get('accounts', id)
      if (prior?.version === 1 && prior.name === name && prior.verifier === verifier &&
        prior.grants.some(grant => grant.projectId === projectId && grant.role === role)) return
      if (prior) throw new Error('member identity already exists')
      tx.set('accounts', id, { id, name, verifier, disabled: false, version: 1, grants: [{ projectId, role }] })
    })
  }

  /**
   * Apply one versioned change to the account.
   * @param request - access change and observed account version.
   * @returns after commit.
   */
  async change(request: ChangeMember): Promise<void> {
    const input = changeMember.parse(request)
    await this.domain.transaction((tx) => {
      const account = tx.get('accounts', input.id)
      if (!account || account.disabled || account.version !== input.expectedVersion) throw new Error('member access version conflict')
      switch (input.action) {
        case 'grant':
          if (!tx.get('projects', input.projectId)) throw new Error('unknown project')
          account.grants = account.grants.filter(grant => grant.projectId !== input.projectId)
          if (input.role) account.grants.push({ projectId: input.projectId, role: input.role })
          break
        case 'disable':
          account.disabled = true
          account.grants = []
          break
        case 'rotate':
          account.verifier = input.verifier
          break
      }
      account.version++
      tx.set('accounts', account.id, account)
    })
  }

  /**
   * List accounts and their roles in the selected project.
   * @param projectId - project selected in the operator console.
   * @returns public account metadata and project roles.
   */
  members(projectId: ProjectId): Promise<ProjectMember[]> {
    return this.domain.transaction((tx) => {
      if (!tx.get('projects', projectId)) throw new Error('unknown project')
      return tx.entries('accounts').map(([, account]) => ({
        id: account.id, name: account.name, version: account.version, disabled: account.disabled,
        role: account.grants.find(grant => grant.projectId === projectId)?.role ?? null,
      }))
    })
  }

  /**
   * Read project visibility, requirements and discussion under current grants.
   * @param proof - presented member credential.
   * @param projectId - selected project, or null to list available projects.
   * @returns member-visible records.
   */
  board(proof: MemberProof, projectId: ProjectId | null): Promise<MemberBoard> {
    return this.domain.transaction((tx) => {
      const account = authenticated(tx, proof)
      if (projectId && !account.grants.some(grant => grant.projectId === projectId)) throw new TeamAccessError(403)
      const projects = account.grants.map((grant) => {
        const record = tx.get('projects', grant.projectId)
        if (!record) throw new Error('missing granted project')
        return { id: grant.projectId, title: record.project.title, role: grant.role }
      })
      const tasks = (projectId && tx.get('projects', projectId)?.order || []).flatMap((id) => {
        const record = tx.get('tasks', id)
        if (!record || record.task.archived || record.task.projectId !== projectId) return []
        const comments = record.activity.flatMap(item => item.action === 'commented' && item.comment ?
          [{ author: item.member?.name ?? null, actor: item.actor, text: item.comment }] : [])
        return [{ task: record.task, comments }]
      })
      return { name: account.name, projects, tasks }
    })
  }
}
