/** Independent P0 SIWC probe; credentials remain outside the checkout. */
import { createServer } from 'node:http'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const repository = process.cwd()
const requireDependency = createRequire(resolve(repository, 'node_modules/.pnpm/package.json'))
const { jwtVerify, createRemoteJWKSet } = await import(pathToFileURL(requireDependency.resolve('jose')).href)
const directory = join(homedir(), '.config/deepseek-harness/siwc-p0')
await mkdir(directory, { recursive: true, mode: 0o700 })
const resource = 'https://api.openai.com/v1'
const issuer = 'https://auth.openai.com'
const evidence = { started_at: new Date().toISOString(), stages: {} }
const evidencePath = resolve('.ai/tasks/dsh-p0-siwc/artifacts/siwc-result.json')
const safeCode = value => typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? value : 'unclassified'
async function saveJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
  await rename(temporary, path)
}
async function readOptional(path) {
  try { return JSON.parse(await readFile(path, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error }
}
async function record(stage, result) {
  evidence.stages[stage] = result
  await saveJson(evidencePath, evidence)
  console.log(JSON.stringify({ stage, ...result }))
}
async function request(url, options = {}) {
  return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(60_000) })
}
const discovery = await (await request(`${issuer}/.well-known/openid-configuration`)).json()
if (discovery.issuer !== issuer || discovery.jwks_uri !== `${issuer}/.well-known/jwks.json`) {
  throw new Error('Unexpected OpenAI issuer or JWKS URL')
}
await record('discovery', { status: 'PASS', issuer })
let host = await readOptional(join(directory, 'host.json'))
if (!host) {
  host = { ext_agent_host_id: `urn:uuid:${randomUUID()}` }
  await saveJson(join(directory, 'host.json'), host)
}
const savedRegistration = await readOptional(join(directory, 'registration.json'))
const verifier = randomBytes(48).toString('base64url')
const state = randomBytes(32).toString('base64url')
const nonce = randomBytes(32).toString('base64url')
let consumed = false
let authorizeUrl
let redirectUri
let statusText = 'Ready. Continue with ChatGPT to verify this account.'
const html = () => `<!doctype html><meta charset="utf-8"><title>DeepSeek Harness SIWC probe</title><h1>DeepSeek Harness: SIWC verification</h1><p>${statusText}</p><p>This probe lists models and sends one short synthetic prompt using your ChatGPT plan. Credentials stay in a private local directory.</p><p><a href="/auth/start">Continue with ChatGPT</a></p>`
const server = createServer((req, res) => {
  void handle(req, res).catch(async error => {
    // Error messages can contain upstream responses; expose only the error class.
    statusText = 'Verification stopped. Return to Codex for the result.'
    await record('probe', { status: 'FAIL', error_class: safeCode(error.name) })
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' })
    res.end(statusText)
  })
})
async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'")
  if (req.headers.host !== new URL(redirectUri).host || req.method !== 'GET') {
    res.writeHead(400); res.end('Invalid request'); return
  }
  const url = new URL(req.url, redirectUri)
  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html()); return
  }
  if (url.pathname === '/auth/start' && !consumed) {
    res.writeHead(302, { Location: authorizeUrl }); res.end(); return
  }
  if (url.pathname !== '/auth/callback') { res.writeHead(404); res.end(); return }
  if (consumed || url.searchParams.get('state') !== state) {
    res.writeHead(400); res.end('Invalid or already consumed authorization state'); return
  }
  consumed = true
  if (url.searchParams.has('error')) {
    await record('authorization', { status: 'FAIL', code: safeCode(url.searchParams.get('error')) })
    statusText = 'Authorization was not granted. Return to Codex.'
    res.writeHead(400); res.end(statusText); return
  }
  const returnedId = url.searchParams.get('client_id')
  const clientId = returnedId ?? savedRegistration?.client_id
  if (!clientId || clientId === 'dynamic_agent_client' || !url.searchParams.get('code')
    || (savedRegistration && returnedId && returnedId !== savedRegistration.client_id)) {
    res.writeHead(400); res.end('Missing or mismatched client registration'); return
  }
  await saveJson(join(directory, 'registration.json'), { client_id: clientId })
  await record('authorization', { status: 'PASS', issued_client_id_present: true })
  const response = await request(`${issuer}/api/accounts/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId,
      code: url.searchParams.get('code'), code_verifier: verifier, redirect_uri: redirectUri, resource }),
  })
  const tokens = await response.json()
  if (!response.ok) {
    await record('token_exchange', { status: 'FAIL', http_status: response.status, code: safeCode(tokens.error) })
    res.writeHead(502); res.end('Token exchange failed. Return to Codex.'); return
  }
  const { payload } = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(discovery.jwks_uri)), {
    issuer, audience: clientId, requiredClaims: ['iss', 'sub', 'aud', 'exp', 'iat', 'nonce'],
  })
  if (payload.nonce !== nonce) throw new Error('ID token nonce mismatch')
  const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(' ') : []
  await record('identity', { status: 'PASS', signature_issuer_audience_expiry_nonce_valid: true })
  const credentials = { issuer, subject: payload.sub, client_id: clientId, ...host,
    id_token: tokens.id_token, access_token: tokens.access_token, refresh_token: tokens.refresh_token,
    token_type: tokens.token_type, expires_in: tokens.expires_in, scopes, saved_at: new Date().toISOString() }
  const profileName = createHash('sha256').update(`${clientId}:${payload.sub}`).digest('hex') + '.json'
  await saveJson(join(directory, profileName), credentials)
  if (!scopes.includes('chatgpt.tokens.use.direct') || typeof tokens.access_token !== 'string') {
    await record('plan_permission', { status: 'FAIL', code: 'plan_usage_not_granted' })
    res.writeHead(403); res.end('ChatGPT plan usage was not granted. Return to Codex.'); return
  }
  await record('plan_permission', { status: 'PASS', granted: true })
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Authorization received. The model and streaming checks are running; return to Codex.')
  await infer(tokens.access_token)
}
async function infer(accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` }
  const response = await request(`${resource}/models`, { headers })
  const catalog = await response.json()
  if (!response.ok) {
    await record('models', { status: 'FAIL', http_status: response.status, code: safeCode(catalog.error?.code) }); return
  }
  if (!Array.isArray(catalog.models)) throw new Error('Missing SIWC models array')
  const models = catalog.models.filter(model => model.visibility === 'list' && typeof model.slug === 'string')
  await record('models', { status: 'PASS', models: models.map(model => ({ slug: model.slug, display_name: model.display_name })) })
  if (!models.length) { await record('inference', { status: 'BLOCKED', code: 'no_visible_models' }); return }
  const model = models[0].slug
  const stream = await request(`${resource}/responses`, { method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: [{ role: 'user', content: 'Reply with exactly SIWC_OK.' }], store: false, stream: true }),
  })
  if (!stream.ok) {
    const body = await stream.json()
    await record('inference', { status: 'FAIL', model, http_status: stream.status, code: safeCode(body.error?.code) }); return
  }
  let pending = '', terminal, output = '', usage
  const types = new Set()
  const decoder = new TextDecoder()
  for await (const chunk of stream.body) {
    pending += decoder.decode(chunk, { stream: true }).replaceAll('\r\n', '\n')
    let index
    while ((index = pending.indexOf('\n\n')) >= 0) {
      const frame = pending.slice(0, index); pending = pending.slice(index + 2)
      const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      if (!data || data === '[DONE]') continue
      const event = JSON.parse(data)
      types.add(safeCode(event.type))
      if (event.type === 'response.output_text.delta') output += event.delta
      if (event.type === 'response.completed') {
        terminal = 'completed'
        const reportedUsage = event.response?.usage
        usage = { input_tokens: reportedUsage?.input_tokens, output_tokens: reportedUsage?.output_tokens,
          total_tokens: reportedUsage?.total_tokens }
      }
      else if (event.type === 'response.failed' || event.type === 'response.incomplete' || event.type === 'error') {
        terminal = event.type
        await record('stream_error', { status: 'FAIL', code: safeCode(event.response?.error?.code ?? event.code) })
      }
    }
  }
  await record('inference', { status: terminal === 'completed' && output.trim() === 'SIWC_OK' ? 'PASS' : 'FAIL',
    model, terminal: terminal ?? 'missing', output_matches: output.trim() === 'SIWC_OK', event_types: [...types], usage })
  statusText = 'Verification finished. Return to Codex for the result.'
}
await new Promise((resolveListen, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolveListen)
})
const port = server.address().port
redirectUri = `http://127.0.0.1:${port}/auth/callback`
const query = new URLSearchParams({ client_id: savedRegistration?.client_id ?? 'dynamic_agent_client',
  ...savedRegistration ? {} : { agent_name_hint: 'DeepSeek Harness' }, ...host,
  response_type: 'code', redirect_uri: redirectUri,
  scope: 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct', resource,
  state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') })
authorizeUrl = `${issuer}/api/accounts/authorize?${query}`
await record('listener', { status: 'READY', origin: `http://127.0.0.1:${port}`, callback_path: '/auth/callback' })
const expiry = setTimeout(() => { server.closeAllConnections(); server.close() }, 30 * 60_000)
function stop() { clearTimeout(expiry); server.closeAllConnections(); server.close() }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
