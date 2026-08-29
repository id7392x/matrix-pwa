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
  /** QR-content string to display for a `qr` session (render with `uqr`). */
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

/** Bumped on detach so in-flight flows from a prior session can never emit into a new one. */
let generation = 0
/** Set by the store's cancel; short-circuits any flow waiting on the network. */
let cancelRequested = false

/** Emits `session` only if the flow it belongs to is still the current generation and not cancelled. */
function emit(session: VerificationSessionUi, gen: number): void {
  if (gen !== generation || cancelRequested || !sessionHandler) return
  sessionHandler(session)
}

export function attachVerification(client: MatrixClient): void {
  detachVerification()
  generation = 0
  cancelRequested = false
  crypto = client.getCrypto() ?? null
  sink = crypto as unknown as CryptoEventSink | null
  onIncomingRequest = (request) => {
    void runSasVerification(request, request.roomId)
  }
  onTrustChanged = (userId, status) => {
    emitTrust(userId, status.isCrossSigningVerified(), generation)
  }
  sink?.on(CryptoEvent.VerificationRequestReceived, onIncomingRequest)
  sink?.on(CryptoEvent.UserTrustStatusChanged, onTrustChanged)
}

export function detachVerification(): void {
  sink?.off(CryptoEvent.VerificationRequestReceived, onIncomingRequest)
  sink?.off(CryptoEvent.UserTrustStatusChanged, onTrustChanged)
  crypto = null
  sink = null
  generation++
}

export function setVerificationHandlers(
  onSession: SessionHandler | null,
  onTrust: TrustHandler | null,
): void {
  sessionHandler = onSession
  trustHandler = onTrust
}

/** Requests the store to abandon the active flow; the SDK never emits a cancel event. */
export function cancelActiveVerification(): void {
  cancelRequested = true
}

function emitTrust(userId: string, verified: boolean, gen: number): void {
  if (gen !== generation || cancelRequested || !trustHandler) return
  trustHandler(userId, verified)
}

/** Initiates a SAS verification of `userId` over the direct chat `roomId`. */
export async function beginUserVerification(userId: string, roomId: string): Promise<void> {
  if (!crypto) return
  const request = await crypto.requestVerificationDM(userId, roomId)
  await runSasVerification(request, roomId)
}

/** Runs a SAS verification against `request`, pushing UI sessions through the handler. */
export async function runSasVerification(request: VerificationRequest, roomId?: string): Promise<void> {
  cancelRequested = false
  const otherUserId: string = request.otherUserId || ''
  const gen = generation
  try {
    emit({ otherUserId, roomId, phase: 'emoji', emojis: [] }, gen)

    if (!request.accepting && (request.phase === VerificationPhase.Unsent || request.phase === VerificationPhase.Requested)) {
      await request.accept()
    }
    const verifier = await getSasVerifier(request)
    if (cancelRequested || gen !== generation) return

    const onShowSas = (sas: ShowSasCallbacks): void => {
      emit({ otherUserId, roomId, phase: 'emoji', emojis: sas.sas.emoji ?? [], callbacks: sas }, gen)
    }
    verifier.on(VerifierEvent.ShowSas, onShowSas)
    try {
      await verifier.verify()
      emit({ otherUserId, roomId, phase: 'done', emojis: [] }, gen)
    } catch {
      // Some SDK paths reject verify() without a user-facing step (e.g. mismatched SAS).
      emit({ otherUserId, roomId, phase: 'cancelled', emojis: [] }, gen)
    } finally {
      verifier.off(VerifierEvent.ShowSas, onShowSas)
    }
  } catch {
    // Request could not be accepted or started (e.g. already cancelled): report dead state.
    emit({ otherUserId, roomId, phase: 'cancelled', emojis: [] }, gen)
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
  const gen = generation
  try {
    const status = await crypto.getUserVerificationStatus(userId)
    const verified = status.isCrossSigningVerified()
    emitTrust(userId, verified, gen)
    return verified
  } catch {
    return false
  }
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
  cancelRequested = false
  const gen = generation
  const request = await crypto.requestVerificationDM(userId, roomId)
  const session: VerificationSessionUi = { otherUserId: userId, roomId, phase: 'qr', emojis: [] }
  try {
    const bytes = await request.generateQRCode()
    if (!bytes) {
      emit({ ...session, phase: 'cancelled' }, gen)
      return
    }
    emit({ ...session, qrText: new TextDecoder('utf-8').decode(bytes) }, gen)

    const verifier = await waitForQrVerifier(request)
    if (!verifier) {
      // Remote cancelled/closed before reciprocating: close the pending dialog.
      emit({ ...session, phase: 'cancelled' }, gen)
      return
    }
    if (cancelRequested || gen !== generation) return

    const onReciprocate = (qr: ShowQrCodeCallbacks): void => {
      emit({ ...session, callbacks: qr }, gen)
    }
    verifier.on(VerifierEvent.ShowReciprocateQr, onReciprocate)
    try {
      await verifier.verify()
      emit({ ...session, phase: 'done' }, gen)
    } catch {
      emit({ ...session, phase: 'cancelled' }, gen)
    } finally {
      verifier.off(VerifierEvent.ShowReciprocateQr, onReciprocate)
    }
  } catch {
    emit({ ...session, phase: 'cancelled' }, gen)
  }
}

/**
 * Starts a verification by scanning the other side's QR code; the scanned text
 * is fed to `scanQRCode` and the resulting verifier awaited.
 */
export async function scanQrVerification(userId: string, roomId: string, qrText: string): Promise<void> {
  if (!crypto) return
  cancelRequested = false
  const gen = generation
  const request = await crypto.requestVerificationDM(userId, roomId)
  const session: VerificationSessionUi = { otherUserId: userId, roomId, phase: 'qr', emojis: [] }
  try {
    emit({ ...session, qrText }, gen)
    const verifier = await request.scanQRCode(new Uint8ClampedArray(new TextEncoder().encode(qrText)))
    if (cancelRequested || gen !== generation) return

    // The SDK only emits via verify(); we simply await the show side's confirm.
    try {
      await verifier.verify()
      emit({ ...session, phase: 'done' }, gen)
    } catch {
      emit({ ...session, phase: 'cancelled' }, gen)
    }
  } catch {
    emit({ ...session, phase: 'cancelled' }, gen)
  }
}
