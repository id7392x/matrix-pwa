import {
  beginQrShow,
  beginUserVerification,
  cancelActiveVerification,
  ensureUserTrust,
  scanQrVerification,
  setVerificationHandlers,
  type VerificationSessionUi,
} from '$crypto/verification'
import type { ShowQrCodeCallbacks, ShowSasCallbacks } from 'matrix-js-sdk/lib/crypto-api/verification'

function isSasCallbacks(callbacks: ShowSasCallbacks | ShowQrCodeCallbacks): callbacks is ShowSasCallbacks {
  return 'sas' in callbacks
}

class VerificationStore {
  session = $state<VerificationSessionUi | null>(null)
  trust = $state(new Map<string, boolean>())

  // A cancelled/mismatched session should not render; emoji, qr and done are user-facing.
  dialogVisible = $derived(
    this.session !== null &&
      (this.session.phase === 'emoji' || this.session.phase === 'qr' || this.session.phase === 'done'),
  )

  isTrusted(userId: string): boolean {
    return this.trust.get(userId) ?? false
  }

  // The SDK supports one active verification flow per pair; ignore a second start request
  // while one flow is in flight (prevents two competing requestVerificationDM calls).
  private running = false

  private start(next: () => void): void {
    if (this.running) return
    this.running = true
    next()
  }

  /** Releases the single-flow guard once a session reaches a terminal phase. */
  markTerminal(): void {
    this.running = false
  }

  /** Starts a SAS verification of `userId` inside the DM `roomId`. */
  verifyUser(userId: string, roomId: string): void {
    this.start(() => void beginUserVerification(userId, roomId))
  }

  /** Starts a verification in which the local user shows their QR code. */
  startQrShow(userId: string, roomId: string): void {
    this.start(() => void beginQrShow(userId, roomId))
  }

  /** Starts a verification by feeding a QR code scanned off the other side. */
  scanQr(userId: string, roomId: string, qrText: string): void {
    this.start(() => void scanQrVerification(userId, roomId, qrText))
  }

  /** Loads `userId` cross-signing trust at most once per session. */
  ensureTrust(userId: string): void {
    if (this.trust.has(userId)) return
    void ensureUserTrust(userId)
  }

  confirmSas(): void {
    const s = this.session
    if (!s || s.phase !== 'emoji' || !s.callbacks || !isSasCallbacks(s.callbacks)) return
    this.session = { ...s, phase: 'done' }
    void s.callbacks.confirm()
  }

  mismatchSas(): void {
    const s = this.session
    if (!s || s.phase !== 'emoji' || !s.callbacks || !isSasCallbacks(s.callbacks)) return
    this.session = { ...s, phase: 'mismatch' }
    s.callbacks.mismatch()
  }

  /** Confirms the reciprocated QR match; the SDK continues the exchange. */
  confirmQr(): void {
    const s = this.session
    if (!s || s.phase !== 'qr' || !s.callbacks) return
    this.session = { ...s, phase: 'done' }
    s.callbacks.confirm()
  }

  cancelVerification(): void {
    const s = this.session
    if (!s || (s.phase !== 'emoji' && s.phase !== 'qr')) return
    s.callbacks?.cancel()
    cancelActiveVerification()
    this.session = null
    this.running = false
  }

  closeDialog(): void {
    this.session = null
    this.running = false
  }

  reset(): void {
    this.session = null
    this.trust = new Map()
    this.running = false
  }
}

export const verificationStore = new VerificationStore()

setVerificationHandlers(
  (session) => {
    verificationStore.session = session
    if (session.phase === 'done' || session.phase === 'cancelled' || session.phase === 'mismatch') {
      verificationStore.markTerminal()
    }
  },
  (userId, verified) => {
    verificationStore.trust.set(userId, verified)
  },
)