/** Bounded, process-local Web validation grants for explicitly isolated Harness homes. */
import { realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { defaultDshHome } from '@deepseek-ai/dsh-home-paths'
import type { LlmCallConfig } from './call-config.ts'
import { HarnessError } from './error.ts'

/** Operator approval for one experimental route in a separate, explicitly selected Harness home. */
export interface LlmValidationAdmission {
  /** Explicit opt-in; no shipped profile supplies this grant. */
  scope: 'isolated-web-poc'
  /** Existing absolute Harness home, matching the running profile and differing from the default home. */
  home: string
  /** Sole route this registration may own. */
  provider: string
  /** Exact model identifiers allowed by the approval. */
  models: readonly string[]
  /** Absolute expiry; checked again before dispatch. */
  expiresAt: string
  /** Preparation budget; failed and unused preparations also consume a slot, without refunds. */
  maxCalls: number
}

/** A reservation stays subject to expiry and registration revocation. */
export interface ValidationReservation {
  /** Reject dispatch after expiry or revocation. */
  assert(): void
}

/** One registration generation; replacement revokes its prepared reservations. */
export interface ValidationGeneration {
  /**
   * Check route, model, remaining budget, expiry and revocation without consuming.
   * @param config - exact request route and model.
   */
  assert(config: LlmCallConfig): void
  /**
   * Atomically consume one preparation slot.
   * @param config - exact request route and model.
   * @returns the reservation's expiry and revocation check.
   */
  reserve(config: LlmCallConfig): ValidationReservation
  /** Refuse future preparations and dispatches from this generation. */
  revoke(): void
}

function denied(): never {
  throw new HarnessError('Web validation approval is absent, expired, revoked, exhausted or outside its scope', 'VALIDATION_ADMISSION_DENIED')
}

function canonical(path: string): string {
  try { return realpathSync(path) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return resolve(path)
  }
}

/** Shared budget survives atomic route replacement; grants never renew through HMR. */
export class ValidationAdmissionBudget {
  private remaining: number
  private readonly expires: number
  private readonly models: ReadonlySet<string>
  /** Sole route named by the approval. */
  readonly provider: string

  /**
   * Validate approval against the profile's actual home before registering anything.
   * @param input - explicit operator grant.
   * @param runningHome - home supplied by the profile launcher; absent outside a profile.
   */
  constructor(input: LlmValidationAdmission, runningHome: string | undefined) {
    this.expires = Date.parse(input.expiresAt)
    if (!isAbsolute(input.home) || runningHome === undefined
      || realpathSync(input.home) !== realpathSync(runningHome) || canonical(input.home) === canonical(defaultDshHome())
      || !input.provider || !input.models.length || input.models.some(model => !model)
      || !Number.isFinite(this.expires) || this.expires <= Date.now()
      || !Number.isSafeInteger(input.maxCalls) || input.maxCalls <= 0) denied()
    this.provider = input.provider
    this.models = new Set(input.models)
    this.remaining = input.maxCalls
  }

  /**
   * Create a revocable generation sharing this approval's finite budget.
   * @returns preparation checks and revocation for one registration generation.
   */
  generation(): ValidationGeneration {
    let revoked = false
    const check = (): void => { if (revoked || Date.now() >= this.expires) denied() }
    const assert = (config: LlmCallConfig): void => {
      check()
      if (config.provider !== this.provider || !this.models.has(config.model) || this.remaining <= 0) denied()
    }
    return {
      assert,
      reserve: (config) => { assert(config); this.remaining -= 1; return { assert: check } },
      revoke: () => { revoked = true },
    }
  }
}
