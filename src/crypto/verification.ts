import type { MatrixClient } from 'matrix-js-sdk'
import { CryptoEvent, type CryptoApi, type UserVerificationStatus } from 'matrix-js-sdk/lib/crypto-api'
import {
  VerificationPhase,
  VerificationRequestEvent,
  VerifierEvent,
  type EmojiMapping,
  type ShowSasCallbacks,
  type VerificationRequest,
  type Verifier,
} from 'matrix-js-sdk/lib/crypto-api/verification'
import { VerificationMethod } from 'matrix-js-sdk/lib/types'

export type VerificationUiPhase = 'emoji' | 'done' | 'cancelled' | 'mismatch'

/** What the verification dialog needs to render, produced from a SAS verifier. */
export interface VerificationSessionUi {
  otherUserId: string
  roomId?: string
  phase: VerificationUiPhase
  emojis: EmojiMapping[]
  callbacks?: ShowSasCallbacks
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