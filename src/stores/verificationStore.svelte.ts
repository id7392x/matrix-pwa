import {
  beginQrShow,
  beginUserVerification,
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

  /** Starts a SAS verification of `userId` inside the DM `roomId`. */
  verifyUser(userId: string, roomId: string): void {
    void beginUserVerification(userId, roomId)
  }

  /** Starts a verification in which the local user shows their QR code. */
  startQrShow(userId: string, roomId: string): void {
    void beginQrShow(userId, roomId)
  }

  /** Starts a verification by feeding a QR code scanned off the other side. */
  scanQr(userId: string, roomId: string, qrText: string): void {
    void scanQrVerification(userId, roomId, qrText)
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