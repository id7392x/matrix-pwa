import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MatrixClient } from 'matrix-js-sdk'
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api'
import type { ShowQrCodeCallbacks, ShowSasCallbacks, VerificationRequest } from 'matrix-js-sdk/lib/crypto-api/verification'
import { VerificationPhase, VerificationRequestEvent, VerifierEvent } from 'matrix-js-sdk/lib/crypto-api/verification'

import {
  attachVerification,
  beginQrShow,
  beginUserVerification,
  cancelActiveVerification,
  detachVerification,
  ensureUserTrust,
  runSasVerification,
  scanQrVerification,
  setVerificationHandlers,
  type VerificationSessionUi,
} from './verification'

const bob = '@bob:example.org'
const roomId = '!dm:example.org'
const QR_TEXT = 'M2V2:transaction:public:hmac'

class FakeEmitter {
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  on(event: string, fn: (...args: unknown[]) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn])
  }

  off(event: string, fn: (...args: unknown[]) => void): void {
    this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l !== fn))
  }

  emit(event: string, ...args: unknown[]): void {
    for (const l of this.listeners.get(event) ?? []) l(...args)
  }
}

class FakeVerifier extends FakeEmitter {
  verify = vi.fn(async () => {})
  showSasCallbacks: ShowSasCallbacks | null = null

  getShowSasCallbacks(): ShowSasCallbacks | null {
    return this.showSasCallbacks
  }

  emitShowSas(sas: ShowSasCallbacks): void {
    this.showSasCallbacks = sas
    this.emit(VerifierEvent.ShowSas, sas)
  }

  emitShowReciprocateQr(qr: ShowQrCodeCallbacks): void {
    this.emit(VerifierEvent.ShowReciprocateQr, qr)
  }
}

class FakeRequest extends FakeEmitter {
  accepting = false
  initiatedByMe = false
  verifier: FakeVerifier | null = null
  accept = vi.fn(async () => {
    this.phase = VerificationPhase.Ready
  })
  startVerification = vi.fn(async (_method: string) => {
    const v = new FakeVerifier()
    this.verifier = v
    this.phase = VerificationPhase.Started
    return v
  })
  generateQRCode = vi.fn(async () => new Uint8ClampedArray(new TextEncoder().encode(QR_TEXT)))
  scanQRCode = vi.fn(async (_bytes: Uint8ClampedArray) => {
    const v = new FakeVerifier()
    this.verifier = v
    return v
  })

  constructor(public phase: number, opts: { initiatedByMe?: boolean } = {}) {
    super()
    if (opts.initiatedByMe) this.initiatedByMe = true
  }

  get otherUserId(): string {
    return bob
  }

  get roomId(): string {
    return roomId
  }
}

function mockClient(crypto: unknown): MatrixClient {
  return { getCrypto: vi.fn(() => crypto) } as unknown as MatrixClient
}

/** A crypto double that is also an event sink, mirroring the real RustCrypto emitter. */
class FakeCrypto {
  private listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  requestVerificationDM = vi.fn(async () => new FakeRequest(VerificationPhase.Unsent))
  getUserVerificationStatus = vi.fn(async (): Promise<{ isCrossSigningVerified: () => boolean }> => ({
    isCrossSigningVerified: () => false,
  }))

  on(event: string, fn: (...args: unknown[]) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn])
  }

  off(event: string, fn: (...args: unknown[]) => void): void {
    this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l !== fn))
  }

  emit(event: string, ...args: unknown[]): void {
    for (const l of this.listeners.get(event) ?? []) l(...args)
  }

  listenerCount(event: string): number {
    return (this.listeners.get(event) ?? []).length
  }
}

describe('verification', () => {
  let sessions: VerificationSessionUi[]
  let trusted: Array<[string, boolean]>
  let crypto: FakeCrypto

  beforeEach(() => {
    sessions = []
    trusted = []
    crypto = new FakeCrypto()
    setVerificationHandlers(
      (session) => { sessions.push(session) },
      (userId, verified) => { trusted.push([userId, verified]) },
    )
  })

  afterEach(() => {
    detachVerification()
  })

  describe('runSasVerification', () => {
    it('accepts an incoming request and reuses the verifier the SDK builds on the remote .start', async () => {
      const request = new FakeRequest(VerificationPhase.Requested)
      const pending = runSasVerification(request as unknown as VerificationRequest, roomId)

      // The remote side sends `.start` after our `.ready`: the request surfaces a verifier.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      const verifier = new FakeVerifier()
      request.verifier = verifier
      request.phase = VerificationPhase.Started
      request.emit(VerificationRequestEvent.Change)

      await pending

      expect(request.accept).toHaveBeenCalledTimes(1)
      // The responder must never start its own SAS (that would race the remote as a "tie").
      expect(request.startVerification).not.toHaveBeenCalled()
      expect(sessions.filter((s) => s.phase === 'done')).toHaveLength(1)
    })

    it('does not accept a request that is already started and reuses its verifier', async () => {
      const request = new FakeRequest(VerificationPhase.Started)
      request.verifier = new FakeVerifier()

      await runSasVerification(request as unknown as VerificationRequest)

      expect(request.accept).not.toHaveBeenCalled()
      expect(request.startVerification).not.toHaveBeenCalled()
      expect(sessions.at(-1)?.phase).toBe('done')
    })

    it('reports show_sas emojis and callbacks to the UI', async () => {
      const request = new FakeRequest(VerificationPhase.Started)
      const verifier = new FakeVerifier()
      let resolveVerify: () => void = () => {}
      verifier.verify = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveVerify = resolve
          }),
      )
      request.verifier = verifier

      const pending = runSasVerification(request as unknown as VerificationRequest, roomId)
      await Promise.resolve() // let runSas attach its listeners
      const confirm = vi.fn(async () => {})
      verifier.emitShowSas({
        sas: { emoji: [['🦊', 'Fox'], ['🐱', 'Cat']] },
        confirm,
        mismatch: vi.fn(),
        cancel: vi.fn(),
      } as unknown as ShowSasCallbacks)

      const emojiSession = sessions.at(-1)
      expect(emojiSession?.phase).toBe('emoji')
      expect(emojiSession?.emojis).toEqual([['🦊', 'Fox'], ['🐱', 'Cat']])
      expect(emojiSession?.callbacks?.confirm).toBeTypeOf('function')

      resolveVerify()
      await pending
      expect(sessions.at(-1)?.phase).toBe('done')
    })

    it('replays SAS callbacks already computed before the ShowSas listener attached', async () => {
      const request = new FakeRequest(VerificationPhase.Started)
      const verifier = new FakeVerifier()
      verifier.showSasCallbacks = {
        sas: { emoji: [['🦊', 'Fox'], ['🐱', 'Cat']] },
        confirm: vi.fn(),
        mismatch: vi.fn(),
        cancel: vi.fn(),
      } as unknown as ShowSasCallbacks
      request.verifier = verifier

      await runSasVerification(request as unknown as VerificationRequest, roomId)

      const emojiSessions = sessions.filter((s) => s.emojis.length > 0)
      expect(emojiSessions.at(-1)?.phase).toBe('emoji')
      expect(emojiSessions.at(-1)?.emojis).toEqual([['🦊', 'Fox'], ['🐱', 'Cat']])
    })

    it('reports a cancelled verification', async () => {
      const request = new FakeRequest(VerificationPhase.Started)
      const verifier = new FakeVerifier()
      verifier.verify = vi.fn(() => Promise.reject(new Error('cancelled')))
      request.verifier = verifier

      await runSasVerification(request as unknown as VerificationRequest)

      expect(sessions.at(-1)?.phase).toBe('cancelled')
    })

    it('emits a cancelled session when the request is already dead', async () => {
      const request = new FakeRequest(VerificationPhase.Cancelled)

      await runSasVerification(request as unknown as VerificationRequest, roomId)

      expect(sessions.at(-1)?.phase).toBe('cancelled')
    })
  })

  describe('attach/detach and incoming events', () => {
    it('subscribes to VerificationRequestReceived and runs SAS for incoming requests', async () => {
      attachVerification(mockClient(crypto))
      expect(crypto.listenerCount(CryptoEvent.VerificationRequestReceived)).toBe(1)
      expect(crypto.listenerCount(CryptoEvent.UserTrustStatusChanged)).toBe(1)

      const request = new FakeRequest(VerificationPhase.Requested)
      crypto.emit(CryptoEvent.VerificationRequestReceived, request)

      await vi.waitFor(() => {
        expect(request.accept).toHaveBeenCalledTimes(1)
      })
      request.verifier = new FakeVerifier()
      request.phase = VerificationPhase.Started
      request.emit(VerificationRequestEvent.Change)

      await vi.waitFor(() => {
        expect(sessions.at(-1)?.otherUserId).toBe(bob)
      })
      expect(request.startVerification).not.toHaveBeenCalled()
    })

    it('detach removes the event listeners', () => {
      attachVerification(mockClient(crypto))
      detachVerification()

      crypto.emit(CryptoEvent.VerificationRequestReceived, new FakeRequest(VerificationPhase.Requested))
      expect(crypto.listenerCount(CryptoEvent.VerificationRequestReceived)).toBe(0)
      expect(crypto.listenerCount(CryptoEvent.UserTrustStatusChanged)).toBe(0)
    })

    it('notifies trust handlers on UserTrustStatusChanged', async () => {
      attachVerification(mockClient(crypto))

      crypto.emit(CryptoEvent.UserTrustStatusChanged, bob, { isCrossSigningVerified: () => true })
      expect(trusted).toEqual([[bob, true]])
    })

    it('attaches cleanly when the client has no crypto backend', () => {
      expect(() => attachVerification(mockClient(undefined))).not.toThrow()
      expect(() => detachVerification()).not.toThrow()
    })
  })

  describe('beginUserVerification and trust', () => {
    it('starts a SAS verification via requestVerificationDM', async () => {
      const request = new FakeRequest(VerificationPhase.Unsent, { initiatedByMe: true })
      crypto.requestVerificationDM = vi.fn(async () => request)
      attachVerification(mockClient(crypto))

      const pending = beginUserVerification(bob, roomId)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))

      // An outgoing request must not be "accepted" by us (the SDK rejects that).
      expect(request.accept).not.toHaveBeenCalled()
      // The remote accepts: `.ready` arrives and the flow can start.
      request.phase = VerificationPhase.Ready
      request.emit(VerificationRequestEvent.Change)

      await pending

      expect(crypto.requestVerificationDM).toHaveBeenCalledWith(bob, roomId)
      expect(request.startVerification).toHaveBeenCalledWith('m.sas.v1')
      expect(sessions.at(-1)?.otherUserId).toBe(bob)
    })

    it('reports a cancelled session when the verification request cannot be created', async () => {
      crypto.requestVerificationDM = vi.fn(async () => {
        throw new Error('unknown userId')
      })
      attachVerification(mockClient(crypto))

      await expect(beginUserVerification(bob, roomId)).resolves.toBeUndefined()
      expect(sessions.at(-1)?.phase).toBe('cancelled')
    })

    it('maps getUserVerificationStatus to a boolean trust value', async () => {
      crypto.getUserVerificationStatus = vi.fn(async () => ({ isCrossSigningVerified: () => true }))
      attachVerification(mockClient(crypto))

      await expect(ensureUserTrust(bob)).resolves.toBe(true)
      expect(trusted).toEqual([[bob, true]])
    })

    it('returns false when crypto is unavailable', async () => {
      attachVerification(mockClient(crypto))
      detachVerification()

      await expect(ensureUserTrust(bob)).resolves.toBe(false)
      expect(trusted).toEqual([])
    })
  })

  describe('QR verification', () => {
    it('beginQrShow publishes QR text and completes on reciprocate confirm', async () => {
      const request = new FakeRequest(VerificationPhase.Requested)
      const verifier = new FakeVerifier()
      let resolveVerify: () => void = () => {}
      verifier.verify = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveVerify = resolve
          }),
      )
      request.verifier = verifier
      crypto.requestVerificationDM = vi.fn(async () => request)
      attachVerification(mockClient(crypto))

      const pending = beginQrShow(bob, roomId)
      await vi.waitFor(() => {
        expect(sessions.at(-1)?.qrText).toBe(QR_TEXT)
      })
      expect(crypto.requestVerificationDM).toHaveBeenCalledWith(bob, roomId)

      const confirm = vi.fn()
      verifier.emitShowReciprocateQr({ confirm, cancel: vi.fn() })
      const qrSession = sessions.at(-1)
      expect(qrSession?.phase).toBe('qr')
      expect(qrSession?.callbacks).toBeDefined()

      qrSession?.callbacks?.confirm()
      resolveVerify()
      await pending
      expect(sessions.at(-1)?.phase).toBe('done')
    })

    it('beginQrShow cancels when no QR code can be generated', async () => {
      const request = new FakeRequest(VerificationPhase.Requested)
      request.generateQRCode = vi.fn(
        async () => undefined,
      ) as unknown as FakeRequest['generateQRCode']
      crypto.requestVerificationDM = vi.fn(async () => request)
      attachVerification(mockClient(crypto))

      await beginQrShow(bob, roomId)

      expect(sessions.at(-1)?.phase).toBe('cancelled')
    })

    it('beginQrShow reports cancelled when the verification request cannot be created', async () => {
      crypto.requestVerificationDM = vi.fn(async () => {
        throw new Error('crash')
      })
      attachVerification(mockClient(crypto))

      await beginQrShow(bob, roomId)

      expect(sessions.at(-1)?.phase).toBe('cancelled')
    })

    it('beginQrShow reports cancelled when QR generation throws', async () => {
      const request = new FakeRequest(VerificationPhase.Requested)
      request.generateQRCode = vi.fn(async () => {
        throw new Error('boom')
      })
      crypto.requestVerificationDM = vi.fn(async () => request)
      attachVerification(mockClient(crypto))

      await beginQrShow(bob, roomId)

      expect(sessions.at(-1)?.phase).toBe('cancelled')
    })

    it('scanQrVerification feeds decoded text as bytes and completes', async () => {
      const request = new FakeRequest(VerificationPhase.Unsent)
      crypto.requestVerificationDM = vi.fn(async () => request)
      attachVerification(mockClient(crypto))

      await scanQrVerification(bob, roomId, QR_TEXT)

      expect(request.scanQRCode).toHaveBeenCalledWith(new Uint8ClampedArray(new TextEncoder().encode(QR_TEXT)))
      expect(sessions.at(-1)?.otherUserId).toBe(bob)
      expect(sessions.at(-1)?.phase).toBe('done')
    })

    it('scanQrVerification reports cancelled when verification fails', async () => {
      const request = new FakeRequest(VerificationPhase.Unsent)
      const verifier = new FakeVerifier()
      verifier.verify = vi.fn(() => Promise.reject(new Error('cancelled')))
      request.scanQRCode = vi.fn(async () => verifier)
      crypto.requestVerificationDM = vi.fn(async () => request)
      attachVerification(mockClient(crypto))

      await scanQrVerification(bob, roomId, QR_TEXT)

      expect(sessions.at(-1)?.phase).toBe('cancelled')
    })

    it('scanQrVerification reports cancelled when the request cannot be created', async () => {
      crypto.requestVerificationDM = vi.fn(async () => {
        throw new Error('crash')
      })
      attachVerification(mockClient(crypto))

      await scanQrVerification(bob, roomId, QR_TEXT)

      expect(sessions.at(-1)?.phase).toBe('cancelled')
    })

    it('QR flows are no-ops without a crypto backend', async () => {
      attachVerification(mockClient(undefined))

      await beginQrShow(bob, roomId)
      await scanQrVerification(bob, roomId, QR_TEXT)

      expect(sessions).toHaveLength(0)
    })

    it('beginQrShow closes the pending session when the remote cancels before reciprocating', async () => {
      const request = new FakeRequest(VerificationPhase.Requested)
      // The request never gets a verifier: the remote cancels while the QR is displayed.
      request.verifier = null
      crypto.requestVerificationDM = vi.fn(async () => request)
      attachVerification(mockClient(crypto))

      const pending = beginQrShow(bob, roomId)
      await vi.waitFor(() => {
        expect(sessions.at(-1)?.qrText).toBe(QR_TEXT)
      })
      // The remote cancels: the request transitions to Cancelled with no verifier.
      request.phase = VerificationPhase.Cancelled
      request.emit(VerificationRequestEvent.Change)
      await pending

      expect(sessions.at(-1)?.phase).toBe('cancelled')
    })

    it('a late reciprocate does not resurrect a cancelled show flow', async () => {
      const request = new FakeRequest(VerificationPhase.Requested)
      const verifier = new FakeVerifier()
      let resolveWait: () => void = () => {}
      request.verifier = null
      verifier.verify = vi.fn(() => new Promise<void>((resolve) => (resolveWait = resolve)))
      // Simulate the verifier appearing later (after the user cancelled), as the SDK does on reciprocate.
      crypto.requestVerificationDM = vi.fn(async () => {
        Promise.resolve().then(() => {
          request.verifier = verifier
          request.emit(VerificationRequestEvent.Change)
        })
        return request
      })
      attachVerification(mockClient(crypto))

      const pending = beginQrShow(bob, roomId)
      await vi.waitFor(() => {
        expect(sessions.at(-1)?.qrText).toBe(QR_TEXT)
      })

      const before = sessions.length
      cancelActiveVerification()
      // The verifier appears and reciprocates only after the user already cancelled.
      verifier.emitShowReciprocateQr({ confirm: vi.fn(), cancel: vi.fn() })
      resolveWait()
      await pending

      expect(sessions.length).toBe(before)
    })

    it('in-flight emissions are dropped after detach (no stale emit into a new session)', async () => {
      const request = new FakeRequest(VerificationPhase.Requested)
      const verifier = new FakeVerifier()
      let resolveVerify: () => void = () => {}
      verifier.verify = vi.fn(() => new Promise<void>((resolve) => (resolveVerify = resolve)))
      request.verifier = verifier
      crypto.requestVerificationDM = vi.fn(async () => request)
      attachVerification(mockClient(crypto))

      const pending = beginQrShow(bob, roomId)
      await vi.waitFor(() => {
        expect(sessions.at(-1)?.qrText).toBe(QR_TEXT)
      })

      const before = sessions.length
      detachVerification()
      verifier.emitShowReciprocateQr({ confirm: vi.fn(), cancel: vi.fn() })
      resolveVerify()
      await pending

      // Session 2 (the flow's 'qr' with callbacks) and 'done' must NOT be pushed after detach.
      expect(sessions.length).toBe(before)
    })
  })
})