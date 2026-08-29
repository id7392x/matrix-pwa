import {
  beginUserVerification,
  ensureUserTrust,
  setVerificationHandlers,
  type VerificationSessionUi,
} from '$crypto/verification'

class VerificationStore {
  session = $state<VerificationSessionUi | null>(null)
  trust = $state(new Map<string, boolean>())

  // A cancelled/mismatched session should not render; emoji and done are user-facing.
  dialogVisible = $derived(
    this.session !== null && (this.session.phase === 'emoji' || this.session.phase === 'done'),
  )

  isTrusted(userId: string): boolean {
    return this.trust.get(userId) ?? false
  }

  /** Starts a SAS verification of `userId` inside the DM `roomId`. */
  verifyUser(userId: string, roomId: string): void {
    void beginUserVerification(userId, roomId)
  }

  /** Loads `userId` cross-signing trust at most once per session. */
  ensureTrust(userId: string): void {
    if (this.trust.has(userId)) return
    void ensureUserTrust(userId)
  }

  confirmSas(): void {
    const s = this.session
    if (!s || s.phase !== 'emoji' || !s.callbacks) return
    this.session = { ...s, phase: 'done' }
    void s.callbacks.confirm()
  }

  mismatchSas(): void {
    const s = this.session
    if (!s || s.phase !== 'emoji' || !s.callbacks) return
    this.session = { ...s, phase: 'mismatch' }
    s.callbacks.mismatch()
  }

  cancelVerification(): void {
    const s = this.session
    if (!s || s.phase !== 'emoji') return
    s.callbacks?.cancel()
    this.session = null
  }

  closeDialog(): void {
    this.session = null
  }

  reset(): void {
    this.session = null
    this.trust = new Map()
  }
}

export const verificationStore = new VerificationStore()

setVerificationHandlers(
  (session) => {
    verificationStore.session = session
  },
  (userId, verified) => {
    verificationStore.trust.set(userId, verified)
  },
)