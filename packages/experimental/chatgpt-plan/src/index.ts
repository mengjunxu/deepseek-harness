/** Opt-in SIWC authorization, account-scoped model directory and DSH adapter. */
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { z } from 'zod'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-authorization'
import { LlmAdapter, LlmError, attributionHeaders } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import { toPiContext, toStreamChunks } from '@deepseek-ai/dsh-llm-pi-ai'
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy'
import type { Model } from '@earendil-works/pi-ai'
import { authorize, Grant, ISSUER, RESOURCE, ROUTE, jsonRequest, planPayload, refreshGrant } from './protocol.ts'
import type { ProtocolOptions } from './protocol.ts'
import type { ChatgptPlanState } from './types.ts'

export type { ChatgptPlanState } from './types.ts'
export type { ProtocolOptions } from './protocol.ts'

const KEY = credentialKey('experimental-chatgpt-plan', 'default')
const HOST = credentialKey('experimental-chatgpt-plan', 'host')
const REGISTRATION = credentialKey('experimental-chatgpt-plan', 'registration')
const storedGrant = z.union([Grant, z.object({ signedOut: z.literal(true) })])
const hostSchema = z.object({ hostId: z.string().startsWith('urn:uuid:') })
const registrationSchema = z.object({ clientId: z.string().min(1) })
const catalogSchema = z.object({ models: z.array(z.object({ slug: z.string().min(1), display_name: z.string(),
  visibility: z.string(), context_window: z.number().positive().optional() })) })

declare module '@deepseek-ai/cordis' {
  interface Context {
    chatgptPlan: ChatgptPlan
  }
}

/** Authenticated account controls; Remote methods expose no bearer credentials. */
export class ChatgptPlan extends TypertRemoteService {
  static inject = ['credentials', 'authorization', 'llm']
  private readonly lifetime = new AbortController()
  private readonly listeners = new Set<() => void>()
  private attempt: { controller: AbortController; done: Promise<void> } | undefined
  private authorizationUrl: string | undefined
  private failure: string | undefined

  /** @param ctx - Host owning existing credential, authorization and LLM services.
   * @param config - deployment deadlines and catalog fallback capacity.
   */
  constructor(ctx: Context, private readonly config: ProtocolOptions) {
    super(ctx, 'chatgptPlan')
    ctx.effect(() => ctx.authorization.registerFlow({ key: KEY, label: 'ChatGPT plan',
      methods: [{ id: 'oauth', label: 'Continue with ChatGPT' }],
      run: async (session) => {
        const host = await ctx.credentials.modifyRecord(HOST, current => Promise.resolve(current ?? {
          kind: 'grant', payload: { hostId: `urn:uuid:${randomUUID()}` },
        }))
        const hostId = hostSchema.parse(host?.kind === 'grant' ? host.payload : undefined).hostId
        const previous = await this.readGrant()
        const registration = await ctx.credentials.readRecord(REGISTRATION)
        const savedId = registration?.kind === 'grant' ? registrationSchema.parse(registration.payload).clientId : undefined
        const grant = await authorize({ hostId, config, signal: session.signal,
          ...savedId ? { clientId: savedId } : {}, ...previous ? { previousSubject: previous.subject } : {},
          notify: (url) => { this.authorizationUrl = url; this.publish(); session.notify({ message: 'Continue with ChatGPT', url }) },
          registered: clientId => ctx.credentials.modifyRecord(REGISTRATION, () => Promise.resolve({
            kind: 'grant', payload: { clientId },
          })).then(() => undefined),
        })
        grant.welcomeAcknowledged = previous?.welcomeAcknowledged ?? false
        await session.commit({ kind: 'grant', payload: grant })
      },
    }))
    ctx.effect(() => ctx.llm.registerAdapter([ROUTE], new PlanAdapter(this, config, this.lifetime.signal)))
    ctx.on('credentials/record-updated', (key) => { if (key === KEY) this.publish() })
    ctx.effect(() => async () => {
      this.lifetime.abort(); this.attempt?.controller.abort()
      await this.attempt?.done
      this.listeners.clear()
    })
  }

  private publish(): void { for (const listener of this.listeners) listener() }
  private async readGrant(): Promise<Grant | undefined> {
    const record = await this.ctx.credentials.readRecord(KEY)
    if (record === undefined) return undefined
    const payload = storedGrant.parse(record.kind === 'grant' ? record.payload : undefined)
    return 'signedOut' in payload ? undefined : payload
  }

  /** Read account and pending-login status without credentials.
   * @returns the safe projection, including only the current attempt's browser URL.
   */
  @Remote
  async getState(): Promise<ChatgptPlanState> {
    const grant = await this.readGrant()
    return { connected: grant !== undefined, needsWelcome: grant !== undefined && !grant.welcomeAcknowledged,
      authorizing: this.attempt !== undefined,
      ...grant?.email ? { email: grant.email } : {},
      ...this.authorizationUrl ? { authorizationUrl: this.authorizationUrl } : {},
      ...this.failure ? { error: this.failure } : {} }
  }

  /** Persist acknowledgement of the first-sign-in plan-usage explanation.
   * @returns safe state after the acknowledgement commits.
   */
  @Remote
  async acknowledgePlanUsage(): Promise<ChatgptPlanState> {
    await this.ctx.credentials.modifyRecord(KEY, (current) => {
      if (current?.kind !== 'grant') return Promise.resolve(current)
      return Promise.resolve({ kind: 'grant', payload: { ...Grant.parse(current.payload), welcomeAcknowledged: true } })
    })
    return this.getState()
  }

  /** Start or join one browser attempt; completion is published through watch.
   * @returns initial status without waiting for browser consent.
   */
  @Remote
  async startSignIn(): Promise<ChatgptPlanState> {
    this.lifetime.signal.throwIfAborted()
    if (!this.attempt) {
      this.failure = undefined
      const controller = new AbortController()
      const done = Promise.resolve().then(async () => {
        try {
          await this.ctx.authorization.begin({ key: KEY, signal: controller.signal,
            interaction: { notify: () => {}, prompt: () => Promise.reject(new Error('SIWC has no text prompts')) } })
        } catch (error) {
          if (!controller.signal.aborted) this.failure = error instanceof LlmError ? error.code : 'AUTH_FAILED'
        } finally {
          this.attempt = undefined; this.authorizationUrl = undefined; this.publish()
        }
      })
      this.attempt = { controller, done }; this.publish()
    }
    return this.getState()
  }

  /** Cancel pending consent and wait for callback/network teardown.
   * @returns current safe state after the attempt settles.
   */
  @Remote
  async cancelSignIn(): Promise<ChatgptPlanState> {
    this.attempt?.controller.abort(); await this.attempt?.done
    return this.getState()
  }

  /** Revoke the renewable session before deleting its local token record.
   * @returns signed-out state; a revocation failure retains credentials for retry.
   */
  @Remote
  async signOut(): Promise<ChatgptPlanState> {
    await this.cancelSignIn()
    await this.ctx.credentials.modifyRecord(KEY, async (current) => {
      if (current?.kind !== 'grant') return undefined
      const grant = storedGrant.parse(current.payload)
      if ('signedOut' in grant) return undefined
      const response = await fetch(`${ISSUER}/api/accounts/oauth/revoke`, { method: 'POST', redirect: 'error',
        signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.config.requestTimeoutMs)]),
        body: new URLSearchParams({ client_id: grant.clientId, token: grant.refresh, token_type_hint: 'refresh_token' }) })
      await response.body?.cancel()
      if (!response.ok) throw new LlmError('ChatGPT disconnect failed; retry or manage access in ChatGPT settings', 'AUTH')
      return { kind: 'grant', payload: { signedOut: true } }
    })
    this.failure = undefined
    return this.getState()
  }

  /** Stream complete safe projections until the caller or plugin stops.
   * @param signal - subscription lifetime.
   * @returns initial state and subsequent committed account/attempt changes.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<ChatgptPlanState> {
    const lifetime = AbortSignal.any([signal, this.lifetime.signal])
    let dirty = true
    let wake: (() => void) | undefined
    const notify = (): void => { dirty = true; wake?.() }
    this.listeners.add(notify); lifetime.addEventListener('abort', notify, { once: true })
    try {
      while (!lifetime.aborted) {
        if (dirty) { dirty = false; yield await this.getState(); continue }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally { this.listeners.delete(notify); lifetime.removeEventListener('abort', notify) }
  }

  /** Resolve and refresh this account's token under the credential mutation lock.
   * @returns Host-only access credential, never exposed through Remote.
   */
  async accessToken(): Promise<string> {
    this.lifetime.signal.throwIfAborted()
    let grant = await this.readGrant()
    if (!grant) throw new LlmError('Connect your ChatGPT plan in Models settings', 'MISSING_CREDENTIAL')
    if (grant.expiresAt <= Date.now()) {
      const record = await this.ctx.credentials.modifyRecord(KEY, async (current) => {
        const latest = Grant.parse(current?.kind === 'grant' ? current.payload : undefined)
        return { kind: 'grant', payload: latest.expiresAt > Date.now() ? latest : await refreshGrant(latest, this.config) }
      })
      grant = Grant.parse(record?.kind === 'grant' ? record.payload : undefined)
    }
    return grant.access
  }
}

/** Account catalog and pi-ai streaming through the public Responses endpoint. */
class PlanAdapter extends LlmAdapter {
  constructor(private readonly account: ChatgptPlan, private readonly config: ProtocolOptions, private readonly lifetime: AbortSignal,
  ) { super() }
  override providerInfo() { return { id: ROUTE, name: 'ChatGPT plan' } }
  override async listModels(): Promise<readonly LlmModelInfo[]> {
    const token = await this.account.accessToken()
    const catalog = catalogSchema.parse(await jsonRequest(`${RESOURCE}/models`, {
      headers: { Authorization: `Bearer ${token}`, ...attributionHeaders() },
    }, this.config.requestTimeoutMs))
    return catalog.models.filter(model => model.visibility === 'list').map(model => ({
      provider: ROUTE, id: model.slug, name: model.display_name, inputModalities: ['text'] as const,
    }))
  }
  override async resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const found = (await this.listModels()).find(entry => entry.id === model)
    if (!found) throw new LlmError('This model is unavailable for the connected ChatGPT account', 'UNKNOWN_MODEL')
    return { ...found, provider, context: { contextWindow: this.config.contextWindow } }
  }
  override async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (options.stop !== undefined || options.temperature !== undefined || options.maxTokens !== undefined
      || options.reasoningEffort !== undefined) {
      throw new LlmError('ChatGPT plan does not support stop, temperature or output-token caps', 'UNSUPPORTED_OPTION')
    }
    const consumer = new AbortController()
    try {
      const apiKey = await this.account.accessToken()
      const model: Model<'openai-responses'> = { id: options.model, name: options.model, provider: ROUTE,
        api: 'openai-responses', baseUrl: RESOURCE, reasoning: false, input: ['text'], contextWindow: this.config.contextWindow,
        maxTokens: this.config.contextWindow, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        compat: { supportsDeveloperRole: true, supportsMaxOutputTokens: false } }
      const context = toPiContext(options)
      const events = openAIResponsesApi().streamSimple(model, context, { apiKey, headers: attributionHeaders(),
        signal: AbortSignal.any([this.lifetime, consumer.signal, ...options.signal ? [options.signal] : [],
          AbortSignal.timeout(this.config.requestTimeoutMs)]),
        fetch: (input, init) => fetch(input, { ...init, redirect: 'error' }),
        onPayload: planPayload })
      for await (const chunk of toStreamChunks(events, model.contextWindow, options.signal, options.model)) {
        if (chunk.type === 'finish' && chunk.reason.kind === 'error'
        && /subscription_sharing_usage_(limit_exceeded|unavailable)/.test(chunk.reason.failure.message)) {
          yield { ...chunk, reason: { kind: 'error', failure: { code: 'QUOTA',
            message: 'ChatGPT usage limit reached. Manage usage at https://chatgpt.com/settings/usage' } } }
        } else yield chunk
      }
    } finally { consumer.abort() }
  }
}

/** Plugin identifier and existing capability requirements. */
export const name = 'experimental-chatgpt-plan'
export const inject = ['credentials', 'authorization', 'llm']
/** Configurable deployment deadlines and undeclared model capacity. */
export const Config = Schema.object({ appName: Schema.string().default('DeepSeek Harness'),
  requestTimeoutMs: Schema.number().min(1).max(3_600_000).default(120_000),
  attemptTimeoutMs: Schema.number().min(1).max(3_600_000).default(600_000),
  contextWindow: Schema.number().min(1).step(1).default(262_144) })
/** Register account controls and the model adapter within this plugin's lifetime.
 * @param ctx - Host context with the existing capability services.
 * @param config - validated deployment options.
 */
export function apply(ctx: Context, config: ProtocolOptions): void { ctx.plugin(ChatgptPlan, config) }
