/** Official SIWC OAuth and Responses restrictions; tokens never leave the Host. */
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { z } from 'zod'
import { LlmError } from '@deepseek-ai/dsh-llm'

/** Fixed issuer allowed to mint subscription credentials. */
export const ISSUER = 'https://auth.openai.com'
/** Public inference resource authorized by SIWC. */
export const RESOURCE = 'https://api.openai.com/v1'
/** Provider route selected by DSH sessions. */
export const ROUTE = 'chatgpt-plan'

/** Persisted, validated grant; configuration cannot redirect its bearer token. */
export const Grant = z.object({
  clientId: z.string().min(1), subject: z.string().min(1), email: z.string().optional(),
  access: z.string().min(1), refresh: z.string().min(1), idToken: z.string().min(1),
  expiresAt: z.number(), welcomeAcknowledged: z.boolean().default(false),
})
/** Validated subscription grant retained by the Host. */
export type Grant = z.infer<typeof Grant>

/** Validated deadlines and fallback catalog capacity for this deployment. */
export interface ProtocolOptions {
  /** Name shown in OpenAI consent. */
  appName: string
  /** Total deadline for each network request, including the full inference stream. */
  requestTimeoutMs: number
  /** Maximum complete browser attempt duration in milliseconds. */
  attemptTimeoutMs: number
  /** Context capacity when the account catalog omits it. */
  contextWindow: number
}

/** Exact-origin requests with bounded cancellation and no credential-bearing redirects.
 * @param url - pinned provider endpoint.
 * @param options - request credentials, payload and cancellation.
 * @param timeoutMs - maximum request duration.
 * @returns parsed JSON after a successful HTTP response.
 */
export async function jsonRequest(url: string, options: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, { ...options, redirect: 'error',
    signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) })
  if (!response.ok) {
    const detail = await response.text()
    const code = response.status === 401 || response.status === 403 ? 'AUTH'
      : response.status === 429 ? detail.includes('subscription_sharing_usage_limit_exceeded') ? 'QUOTA' : 'RATE_LIMIT'
        : 'SERVER'
    const requestId = response.headers.get('x-request-id')
    throw new LlmError(`ChatGPT request failed (${new URL(url).pathname}, HTTP ${response.status})${requestId ? ` [${requestId}]` : ''}: ${detail}`, code)
  }
  return response.json()
}

const tokensSchema = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1),
  id_token: z.string().min(1), expires_in: z.number().positive(), scope: z.string() })

/**
 * Register or reauthorize one local account through a temporary loopback callback.
 * @param input - host identity, optional saved registration, and lifecycle callbacks.
 * @returns a verified grant after browser approval; always awaits listener shutdown.
 */
export async function authorize(input: {
  hostId: string
  clientId?: string
  previousSubject?: string
  config: ProtocolOptions
  signal: AbortSignal
  notify: (url: string) => void
  registered: (clientId: string) => Promise<void>
}): Promise<Grant> {
  const state = randomBytes(32).toString('base64url'), nonce = randomBytes(32).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(input.config.attemptTimeoutMs)])
  const callback = Promise.withResolvers<URL>()
  let consumed = false
  let redirectUri = ''
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('Referrer-Policy', 'no-referrer')
    if (req.url === '/done') { res.writeHead(204); res.end(); return }
    const url = new URL(req.url ?? '/', redirectUri)
    if (req.method !== 'GET' || req.headers.host !== new URL(redirectUri).host || url.pathname !== '/auth/callback'
      || consumed || url.searchParams.get('state') !== state) {
      res.writeHead(400); res.end(); return
    }
    consumed = true
    // The callback has no rendered secrets and immediately removes the code from the address bar.
    res.writeHead(302, { Location: '/done' }); res.end()
    callback.resolve(url)
  })
  const abort = (): void => { callback.reject(signal.reason) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    signal.throwIfAborted()
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('SIWC listener has no TCP address')
    redirectUri = `http://127.0.0.1:${address.port}/auth/callback`
    const params = new URLSearchParams({ client_id: input.clientId ?? 'dynamic_agent_client',
      ...input.clientId ? {} : { agent_name_hint: input.config.appName }, ext_agent_host_id: input.hostId,
      response_type: 'code', redirect_uri: redirectUri, resource: RESOURCE,
      scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', state, nonce,
      code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') })
    input.notify(`${ISSUER}/api/accounts/authorize?${params}`)
    const returned = await callback.promise
    if (returned.searchParams.has('error')) throw new LlmError('ChatGPT authorization was declined', 'AUTH_DECLINED')
    const clientId = returned.searchParams.get('client_id') ?? input.clientId
    const code = returned.searchParams.get('code')
    if (!clientId || clientId === 'dynamic_agent_client' || !code || (input.clientId && clientId !== input.clientId)) {
      throw new LlmError('ChatGPT registration is incomplete', 'AUTH')
    }
    await input.registered(clientId)
    const tokens = tokensSchema.parse(await jsonRequest(`${ISSUER}/api/accounts/oauth/token`, {
      method: 'POST', signal, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
        code, code_verifier: verifier, redirect_uri: redirectUri, resource: RESOURCE }),
    }, input.config.requestTimeoutMs))
    const { payload } = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`)), {
      issuer: ISSUER, audience: clientId, requiredClaims: ['iss', 'sub', 'aud', 'exp', 'nonce'],
    })
    if (typeof payload.sub !== 'string' || payload.nonce !== nonce || (input.previousSubject && payload.sub !== input.previousSubject)) {
      throw new LlmError('ChatGPT account validation failed', 'AUTH')
    }
    if (!tokens.scope.split(' ').includes('chatgpt.tokens.use.direct')) {
      throw new LlmError('ChatGPT plan usage was not granted', 'PLAN_PERMISSION')
    }
    signal.throwIfAborted()
    return { clientId, subject: payload.sub, ...typeof payload.email === 'string' ? { email: payload.email } : {},
      access: tokens.access_token, refresh: tokens.refresh_token, idToken: tokens.id_token,
      expiresAt: Date.now() + tokens.expires_in * 1000, welcomeAcknowledged: false }
  } finally {
    signal.removeEventListener('abort', abort)
    server.closeAllConnections()
    await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
  }
}

/**
 * Renew a grant under the credential store's cross-process mutation lock.
 * @param grant - current account registration and credentials.
 * @param config - request deadline.
 * @returns replacement access/refresh credentials; missing plan permission refuses inference.
 */
export async function refreshGrant(grant: Grant, config: ProtocolOptions): Promise<Grant> {
  const result = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1),
    expires_in: z.number().positive(), scope: z.string() }).parse(await jsonRequest(`${ISSUER}/api/accounts/oauth/token`, {
    method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: grant.clientId,
      refresh_token: grant.refresh, resource: RESOURCE }),
  }, config.requestTimeoutMs))
  if (!result.scope.split(' ').includes('chatgpt.tokens.use.direct')) {
    throw new LlmError('ChatGPT plan usage was withdrawn', 'PLAN_PERMISSION')
  }
  return { ...grant, access: result.access_token, refresh: result.refresh_token, expiresAt: Date.now() + result.expires_in * 1000 }
}

/**
 * Restrict library-generated Responses fields to the SIWC-supported request.
 * @param raw - protocol payload immediately before the HTTP request.
 * @returns a request preserving history and namespaced tool definitions.
 */
export function planPayload(raw: unknown): Record<string, unknown> {
  const source = z.record(z.string(), z.unknown()).parse(raw)
  const omitted = new Set(['background', 'conversation', 'max_output_tokens', 'max_tool_calls', 'metadata', 'moderation',
    'multi_agent', 'prompt', 'prompt_cache_retention', 'safety_identifier', 'temperature', 'top_logprobs', 'top_p',
    'truncation', 'user', 'previous_response_id'])
  const value = Object.fromEntries(Object.entries(source).filter(([key]) => !omitted.has(key)))
  value.store = false; value.stream = true
  if (Array.isArray(value.input)) value.input = value.input.map((item) => {
    const entry = z.record(z.string(), z.unknown()).parse(item)
    return entry.role === 'system' ? { ...entry, role: 'developer' } : entry
  })
  if (Array.isArray(value.tools) && value.tools.length) value.tools = [{
    type: 'namespace', name: 'dsh', description: 'Tools available in this DSH session.', tools: value.tools,
  }]
  return value
}
