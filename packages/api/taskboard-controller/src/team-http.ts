/** Member-only HTTP carrier on the existing local Web Host. */
import { BlockList, isIPv6 } from 'node:net'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { bridgeHttpRequest, isTrustedApiRequest } from '@deepseek-ai/dsh-client-connection'
import { brandString } from '@deepseek-ai/dsh-brand'
import { z } from 'zod'
import { commentCommand, requirementsCommand } from './domain.ts'
import { memberProof, TeamAccessError, type MemberProof, type TeamAccounts } from './team.ts'
import type { ProjectId, TaskReceipt } from './types.ts'

const loopback = new BlockList()
loopback.addSubnet('127.0.0.0', 8, 'ipv4')
loopback.addAddress('::1', 'ipv6')

const mutation = z.discriminatedUnion('action', [
  commentCommand.extend({ action: z.literal('commented') }),
  requirementsCommand.extend({ action: z.literal('edited') }),
])
type Mutation = z.output<typeof mutation>

/**
 * Serve the member board separately from the operator's Remote namespace.
 * @param accounts - authoritative membership and board reads.
 * @param write - commits an attributed edit after checking the grant inside its transaction.
 * @param bodyLimit - maximum buffered member request bytes.
 * @returns the exact route to register on the Web Host.
 */
export function teamRoute(accounts: TeamAccounts, write: (proof: MemberProof, input: Mutation) => Promise<TaskReceipt>,
  bodyLimit: number): WebRoute {
  return { kind: 'exact', path: '/taskboard-team-api', handler: async (req, res) => {
    res.setHeader('cache-control', 'no-store')
    res.setHeader('x-content-type-options', 'nosniff')
    const address = req.socket.remoteAddress
    if (!address || !loopback.check(address, isIPv6(address) ? 'ipv6' : 'ipv4') || !isTrustedApiRequest(req, [])) {
      res.writeHead(403).end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'POST') { res.writeHead(405, { allow: 'GET, POST' }).end(); return }
    try {
      const proof = memberProof(req.headers.authorization)
      if (req.method === 'GET') {
        const project = new URL(req.url ?? '/', 'http://localhost').searchParams.get('project')
        const projectId = project === null ? null : brandString<ProjectId>(z.uuid().parse(project))
        const board = await accounts.board(proof, projectId)
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(board))
        return
      }
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') { res.writeHead(415).end(); return }
      await bridgeHttpRequest(req, res, { requestBodyMode: () => 'buffered', fetch: async (request) => {
        const parsed = mutation.parse(await request.json())
        return Response.json(await write(proof, parsed))
      } }, bodyLimit)
    } catch (error) {
      if (error instanceof TeamAccessError) res.writeHead(error.status).end()
      else if (error instanceof z.ZodError || error instanceof SyntaxError) res.writeHead(400).end()
      else if (error instanceof Error && [
        'task version conflict', 'task outside project', 'task does not exist', 'command identity reused with different input',
        'reopen the archived task first', 'reopen the task before editing', 'cancel the automatic claim before editing',
      ].includes(error.message)) res.writeHead(409).end()
      else throw error
    }
  } }
}
