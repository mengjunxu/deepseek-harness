import { afterEach, expect, it, vi } from 'vitest'
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { createHash } from 'node:crypto'
import { authorize, planPayload, refreshGrant } from '../src/protocol.ts'

const realFetch = globalThis.fetch
const config = { appName: 'DeepSeek Harness', requestTimeoutMs: 10_000, attemptTimeoutMs: 60_000, contextWindow: 262144 }
const controllers: AbortController[] = []
afterEach(() => { for (const controller of controllers.splice(0)) controller.abort(); vi.unstubAllGlobals() })

it('preserves history and namespaced functions while omitting unsupported SIWC fields', () => {
  expect(planPayload({ model: 'test', input: [{ role: 'system', content: 'system' }, { role: 'user', content: 'hello' }],
    max_output_tokens: 9, temperature: 0, previous_response_id: 'old', tools: [{ type: 'function', name: 'read', parameters: {} }] }))
    .toEqual({ model: 'test', input: [{ role: 'developer', content: 'system' }, { role: 'user', content: 'hello' }],
      store: false, stream: true, tools: [{ type: 'namespace', name: 'dsh', tools: [{ type: 'function', name: 'read', parameters: {} }] }] })
})

it.each(['openid profile chatgpt.tokens.use.direct', 'openid profile'])('validates callback state, PKCE, signed identity and granted plan scope: %s', async (scope) => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = { ...await exportJWK(publicKey), kid: 'test' }
  let authUrl: URL | undefined
  vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    if ((typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).endsWith('/.well-known/jwks.json')) return Response.json({ keys: [jwk] })
    expect((typeof url === 'string' ? url : url instanceof URL ? url.href : url.url)).toBe('https://auth.openai.com/api/accounts/oauth/token')
    const form = new URLSearchParams(options?.body instanceof URLSearchParams ? options.body.toString() : '')
    expect(form.get('client_id')).toBe('oaiapp_test')
    expect(form.get('redirect_uri')).toBe(authUrl!.searchParams.get('redirect_uri'))
    expect(createHash('sha256').update(form.get('code_verifier')!).digest('base64url')).toBe(authUrl!.searchParams.get('code_challenge'))
    const idToken = await new SignJWT({ nonce: authUrl!.searchParams.get('nonce'), email: 'fixture@example.test' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://auth.openai.com').setSubject('fixture')
      .setAudience('oaiapp_test').setExpirationTime('5m').sign(privateKey)
    return Response.json({ access_token: 'test-access', refresh_token: 'test-refresh', id_token: idToken, expires_in: 3600, scope })
  }))
  const ready = Promise.withResolvers<undefined>()
  const controller = new AbortController(); controllers.push(controller)
  const registered = vi.fn(async () => {})
  const result = authorize({ hostId: 'urn:uuid:test', config, signal: controller.signal, registered,
    notify: (url) => { authUrl = new URL(url); ready.resolve(undefined) } })
  const settled = result.then(grant => ({ grant }), (error: unknown) => ({ error }))
  await ready.promise
  const target = new URL(authUrl!.searchParams.get('redirect_uri')!)
  target.searchParams.set('code', 'fixture-code'); target.searchParams.set('client_id', 'oaiapp_test')
  target.searchParams.set('state', 'wrong')
  expect((await realFetch(target, { redirect: 'manual' })).status).toBe(400)
  target.searchParams.set('state', authUrl!.searchParams.get('state')!)
  expect((await realFetch(target, { redirect: 'manual' })).status).toBe(302)
  const value = await settled
  if ('grant' in value) expect(value.grant).toMatchObject({ subject: 'fixture', email: 'fixture@example.test' })
  else { expect(scope).not.toContain('chatgpt.tokens.use.direct'); expect(value.error).toMatchObject({ code: 'PLAN_PERMISSION' }) }
  expect(registered).toHaveBeenCalledWith('oaiapp_test')
  await expect(realFetch(new URL('/auth/callback', target))).rejects.toThrow()
})

it('cancels an outstanding listener and awaits its closure', async () => {
  const ready = Promise.withResolvers<string>()
  const controller = new AbortController(); controllers.push(controller)
  const result = authorize({ hostId: 'urn:uuid:test', config, signal: controller.signal,
    registered: async () => {}, notify: (url) =>{  ready.resolve(url) } })
  const settled = result.catch((error: unknown) => error)
  const url = new URL(await ready.promise)
  controller.abort()
  await settled
  await expect(realFetch(url.searchParams.get('redirect_uri')!)).rejects.toThrow()
})

it('rotates refresh credentials and refuses removed subscription permission', async () => {
  const grant = { clientId: 'oaiapp_test', subject: 'fixture', access: 'old', refresh: 'old-refresh',
    idToken: 'retained-id', expiresAt: 0, welcomeAcknowledged: true }
  const fetch = vi.fn(async () => Response.json({ access_token: 'new', refresh_token: 'new-refresh', expires_in: 3600,
    scope: 'chatgpt.tokens.use.direct' }))
  vi.stubGlobal('fetch', fetch)
  expect(await refreshGrant(grant, config)).toMatchObject({ access: 'new', refresh: 'new-refresh', idToken: 'retained-id' })
  fetch.mockImplementation(async () => Response.json({ access_token: 'new', refresh_token: 'new-refresh', expires_in: 3600, scope: 'openid' }))
  await expect(refreshGrant(grant, config)).rejects.toMatchObject({ code: 'PLAN_PERMISSION' })
})
