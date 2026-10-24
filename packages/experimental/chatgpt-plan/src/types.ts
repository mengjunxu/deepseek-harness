/** Safe account projection shared with the browser; credentials are Host-only. */
export interface ChatgptPlanState {
  /** Whether a validated subscription grant is stored. */
  connected: boolean
  /** Whether first-sign-in usage information has not yet been acknowledged. */
  needsWelcome?: boolean
  /** Whether browser authorization is waiting or committing. */
  authorizing: boolean
  /** Authorization URL, present only during a pending attempt; contains no tokens. */
  authorizationUrl?: string
  /** Verified account label; never used as an authentication identifier. */
  email?: string
  /** Stable failure category; upstream messages and credentials are never forwarded. */
  error?: string
}
