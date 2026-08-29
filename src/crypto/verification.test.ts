import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MatrixClient } from 'matrix-js-sdk'
import { CryptoEvent } from 'matrix-js-sdk/lib/crypto-api'
import type { ShowSasCallbacks, VerificationRequest } from 'matrix-js-sdk/lib/crypto-api/verification'
import { VerificationPhase, VerifierEvent } from 'matrix-js-sdk/lib/crypto-api/verification'

import {
  attachVerification,
  beginUserVerification,
  detachVerification,
  ensureUserTrust,
  runSasVerification,
  setVerificationHandlers,
  type VerificationSessionUi,
} from './verification'

const bob = '@bob:example.org'
const roomId = '!dm:example.org'

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

  emitShowSas(sas: ShowSasCallbacks): void {
    this.emit(VerifierEvent.ShowSas, sas)
  }

  emitCancel(): void {
    this.emit(VerifierEvent.Cancel, new Error('cancelled'))
  }
}

class FakeRequest extends FakeEmitter {
  accepting = false
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

  constructor(public phase: number) {
    super()
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
    it('accepts an incoming request and starts SAS (m.sas.v1)', async () => {
      const request = new FakeRequest(VerificationPhase.Requested)

      await runSasVerification(request as unknown as VerificationRequest, roomId)

      expect(request.accept).toHaveBeenCalledTimes(1)
      expect(request.startVerification).toHaveBeenCalledWith('m.sas.v1')
      const phases = sessions.map((s) => s.phase)
      expect(phases).toEqual(['emoji', 'done'])
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
        expect(request.startVerification).toHaveBeenCalledWith('m.sas.v1')
      })
      expect(sessions.at(-1)?.otherUserId).toBe(bob)
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
      attachVerification(mockClient(crypto))

      await beginUserVerification(bob, roomId)

      expect(crypto.requestVerificationDM).toHaveBeenCalledWith(bob, roomId)
      expect(sessions.at(-1)?.otherUserId).toBe(bob)
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
})