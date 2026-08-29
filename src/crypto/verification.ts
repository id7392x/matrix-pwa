import type { MatrixClient } from 'matrix-js-sdk'
import { CryptoEvent, type CryptoApi, type UserVerificationStatus } from 'matrix-js-sdk/lib/crypto-api'
import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type EmojiMapping,
  type ShowQrCodeCallbacks,
  type ShowSasCallbacks,
  type VerificationRequest,
  type Verifier,
} from 'matrix-js-sdk/lib/crypto-api/verification'
import { VerificationMethod } from 'matrix-js-sdk/lib/types'

export type VerificationUiPhase = 'emoji' | 'qr' | 'done' | 'cancelled' | 'mismatch'

/** What the verification dialog needs to render, produced from a SAS or QR verifier. */
export interface VerificationSessionUi {
  otherUserId: string
  roomId?: string
  phase: VerificationUiPhase
  emojis: EmojiMapping[]
  /** QR-content string to display for a `qr` session (render with `qrcode`). */
  qrText?: string
  callbacks?: ShowSasCallbacks | ShowQrCodeCallbacks
}

export type SessionHandler = (session: VerificationSessionUi) => void
export type TrustHandler = (userId: string, verified: boolean) => void

/**
 * RustCrypto doubles as the event sink for {@link CryptoEvent}s, but the `CryptoApi`
 * interface does not declare emitter methods. This is the minimal surface we need.
 */
interface CryptoEventSink {
  on(event: string, listener: (...args: never[]) => void): void
  off(event: string, listener: (...args: never[]) => void): void
}

let crypto: CryptoApi | null = null
let sink: CryptoEventSink | null = null
let sessionHandler: SessionHandler | null = null
let trustHandler: TrustHandler | null = null
let onIncomingRequest: (request: VerificationRequest) => void = () => {}
let onTrustChanged: (userId: string, status: UserVerificationStatus) => void = () => {}

export function attachVerification(client: MatrixClient): void {
  detachVerification()
  crypto = client.getCrypto() ?? null
  sink = crypto as unknown as CryptoEventSink | null
  onIncomingRequest = (request) => {
    void runSasVerification(request, request.roomId)
  }
  onTrustChanged = (userId, status) => {
    trustHandler?.(userId, status.isCrossSigningVerified())
  }
  sink?.on(CryptoEvent.VerificationRequestReceived, onIncomingRequest)
  sink?.on(CryptoEvent.UserTrustStatusChanged, onTrustChanged)
}

export function detachVerification(): void {
  sink?.off(CryptoEvent.VerificationRequestReceived, onIncomingRequest)
  sink?.off(CryptoEvent.UserTrustStatusChanged, onTrustChanged)
  crypto = null
  sink = null
}

export function setVerificationHandlers(
  onSession: SessionHandler | null,
  onTrust: TrustHandler | null,
): void {
  sessionHandler = onSession
  trustHandler = onTrust
}

/** Initiates a SAS verification of `userId` over the direct chat `roomId`. */
export async function beginUserVerification(userId: string, roomId: string): Promise<void> {
  if (!crypto) return
  const request = await crypto.requestVerificationDM(userId, roomId)
  await runSasVerification(request, roomId)
}

/** Runs a SAS verification against `request`, pushing UI sessions through the handler. */
export async function runSasVerification(request: VerificationRequest, roomId?: string): Promise<void> {
  const otherUserId: string = request.otherUserId || ''
  try {
    sessionHandler?.({ otherUserId, roomId, phase: 'emoji', emojis: [] })

    if (!request.accepting && (request.phase === VerificationPhase.Unsent || request.phase === VerificationPhase.Requested)) {
      await request.accept()
    }
    const verifier = await getSasVerifier(request)

    const onShowSas = (sas: ShowSasCallbacks): void => {
      sessionHandler?.({
        otherUserId,
        roomId,
        phase: 'emoji',
        emojis: sas.sas.emoji ?? [],
        callbacks: sas,
      })
    }
    let cancelled = false
    const onCancel = (): void => {
      cancelled = true
      sessionHandler?.({ otherUserId, roomId, phase: 'cancelled', emojis: [] })
    }
    verifier.on(VerifierEvent.ShowSas, onShowSas)
    verifier.on(VerifierEvent.Cancel, onCancel)
    try {
      await verifier.verify()
      sessionHandler?.({ otherUserId, roomId, phase: 'done', emojis: [] })
    } catch {
      // Some SDK paths reject verify() without a Cancel event (e.g. mismatched SAS).
      if (!cancelled) sessionHandler?.({ otherUserId, roomId, phase: 'cancelled', emojis: [] })
    } finally {
      verifier.off(VerifierEvent.ShowSas, onShowSas)
      verifier.off(VerifierEvent.Cancel, onCancel)
    }
  } catch {
    // Request could not be accepted or started (e.g. already cancelled): report dead state.
    sessionHandler?.({ otherUserId, roomId, phase: 'cancelled', emojis: [] })
  }
}

async function getSasVerifier(request: VerificationRequest): Promise<Verifier> {
  if (request.verifier) return request.verifier
  if (request.phase === VerificationPhase.Ready) {
    return request.startVerification(VerificationMethod.Sas)
  }
  if (request.phase === VerificationPhase.Cancelled || request.phase === VerificationPhase.Done) {
    throw new Error(`verification cannot start (phase ${request.phase})`)
  }
  // The remote side may still be accepting; wait until the request settles.
  await new Promise<void>((resolve) => {
    const onChange = (): void => {
      if (
        request.phase === VerificationPhase.Ready ||
        request.phase === VerificationPhase.Started ||
        request.phase === VerificationPhase.Cancelled ||
        request.phase === VerificationPhase.Done
      ) {
        request.off(VerificationRequestEvent.Change, onChange)
        resolve()
      }
    }
    request.on(VerificationRequestEvent.Change, onChange)
  })
  if (request.verifier) return request.verifier
  // Re-read: control-flow narrowing from the earlier phase checks is stale
  // after we waited for the request to transition.
  const phase = request.phase as VerificationPhase
  if (phase === VerificationPhase.Ready) {
    return request.startVerification(VerificationMethod.Sas)
  }
  throw new Error(`verification cannot start (phase ${phase})`)
}

/** Caches the cross-signing trust level of `userId` and pushes it to the trust handler. */
export async function ensureUserTrust(userId: string): Promise<boolean> {
  if (!crypto) return false
  try {
    const status = await crypto.getUserVerificationStatus(userId)
    const verified = status.isCrossSigningVerified()
    trustHandler?.(userId, verified)
    return verified
  } catch {
    return false
  }
}

/** QR methods present on the runtime RustVerificationRequest but absent from the crypto-api type. */
interface RustRequestQrOverlay {
  generateQRCode(): Promise<Uint8ClampedArray | undefined>
  scanQRCode(bytes: Uint8ClampedArray): Promise<Verifier>
}

function textToBytes(text: string): Uint8ClampedArray {
  return new Uint8ClampedArray(new TextEncoder().encode(text))
}

/** Waits until the request exposes a verifier (show side: after the other side reciprocates). */
async function waitForQrVerifier(request: VerificationRequest): Promise<Verifier | null> {
  if (request.verifier) return request.verifier
  await new Promise<void>((resolve) => {
    const onChange = (): void => {
      if (
        request.verifier ||
        request.phase === VerificationPhase.Cancelled ||
        request.phase === VerificationPhase.Done
      ) {
        request.off(VerificationRequestEvent.Change, onChange)
        resolve()
      }
    }
    request.on(VerificationRequestEvent.Change, onChange)
  })
  return request.verifier ?? null
}

/**
 * Starts a verification in which the local user shows their QR code; the other
 * side scans it and reciprocates, after which the user confirms the match.
 */
export async function beginQrShow(userId: string, roomId: string): Promise<void> {
  if (!crypto) return
  const request = await crypto.requestVerificationDM(userId, roomId)
  const session: VerificationSessionUi = { otherUserId: userId, roomId, phase: 'qr', emojis: [], callbacks: undefined }
  try {
    const rustReq = request as unknown as RustRequestQrOverlay
    const bytes = await rustReq.generateQRCode()
    if (!bytes) {
      sessionHandler?.({ ...session, phase: 'cancelled' })
      return
    }
    sessionHandler?.({ ...session, qrText: new TextDecoder('utf-8').decode(bytes) })

    const verifier = await waitForQrVerifier(request)
    if (!verifier) return // cancelled via request events; session already closed

    let userCancelled = false
    const onReciprocate = (qr: ShowQrCodeCallbacks): void => {
      sessionHandler?.({ ...session, qrText: session.qrText, callbacks: qr })
    }
    const onCancel = (): void => {
      userCancelled = true
      sessionHandler?.({ ...session, phase: 'cancelled' })
    }
    verifier.on(VerifierEvent.ShowReciprocateQr, onReciprocate)
    verifier.on(VerifierEvent.Cancel, onCancel)
    try {
      await verifier.verify()
      sessionHandler?.({ ...session, phase: 'done' })
    } catch {
      if (!userCancelled) sessionHandler?.({ ...session, phase: 'cancelled' })
    } finally {
      verifier.off(VerifierEvent.ShowReciprocateQr, onReciprocate)
      verifier.off(VerifierEvent.Cancel, onCancel)
    }
  } catch {
    sessionHandler?.({ ...session, phase: 'cancelled' })
  }
}

/**
 * Starts a verification by scanning the other side's QR code; the scanned text
 * is fed to `scanQRCode` and the resulting verifier awaited.
 */
export async function scanQrVerification(userId: string, roomId: string, qrText: string): Promise<void> {
  if (!crypto) return
  const request = await crypto.requestVerificationDM(userId, roomId)
  const session: VerificationSessionUi = { otherUserId: userId, roomId, phase: 'qr', emojis: [], callbacks: undefined }
  try {
    const rustReq = request as unknown as RustRequestQrOverlay
    sessionHandler?.({ ...session, qrText })
    const verifier = await rustReq.scanQRCode(textToBytes(qrText))

    let userCancelled = false
    const onCancel = (): void => {
      userCancelled = true
      sessionHandler?.({ ...session, phase: 'cancelled' })
    }
    verifier.on(VerifierEvent.Cancel, onCancel)
    try {
      await verifier.verify()
      sessionHandler?.({ ...session, phase: 'done' })
    } catch {
      if (!userCancelled) sessionHandler?.({ ...session, phase: 'cancelled' })
    } finally {
      verifier.off(VerifierEvent.Cancel, onCancel)
    }
  } catch {
    sessionHandler?.({ ...session, phase: 'cancelled' })
  }
}