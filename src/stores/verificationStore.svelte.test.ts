import { beforeEach, describe, expect, it, vi } from 'vitest'

import { beginUserVerification, ensureUserTrust } from '$crypto/verification'
import type { VerificationSessionUi } from '$crypto/verification'
import type { ShowSasCallbacks } from 'matrix-js-sdk/lib/crypto-api/verification'
import { verificationStore } from '$stores/verificationStore.svelte'

const handlers = vi.hoisted(() => ({
  onSession: null as null | ((s: VerificationSessionUi) => void),
  onTrust: null as null | ((u: string, v: boolean) => void),
}))

vi.mock('$crypto/verification', () => ({
  beginUserVerification: vi.fn(),
  ensureUserTrust: vi.fn(async (u: string) => {
    handlers.onTrust?.(u, true)
    return true
  }),
  setVerificationHandlers: (s: (x: VerificationSessionUi) => void, t: (u: string, v: boolean) => void) => {
    handlers.onSession = s
    handlers.onTrust = t
  },
}))

const bob = '@bob:example.org'
const roomId = '!dm:example.org'

function makeCallbacks(): ShowSasCallbacks {
  return {
    sas: { emoji: [] },
    confirm: vi.fn(async () => {}),
    mismatch: vi.fn(),
    cancel: vi.fn(),
  }
}

function emitSession(session: VerificationSessionUi): void {
  handlers.onSession?.(session)
}

describe('verificationStore', () => {
  beforeEach(() => {
    verificationStore.reset()
  })

  it('registers module handlers on load', () => {
    expect(handlers.onSession).toBeTypeOf('function')
    expect(handlers.onTrust).toBeTypeOf('function')
  })

  it('exposes trust as unverified by default', () => {
    expect(verificationStore.isTrusted(bob)).toBe(false)
  })

  it('updates trust from the module trust handler', () => {
    handlers.onTrust?.(bob, true)
    expect(verificationStore.isTrusted(bob)).toBe(true)

    handlers.onTrust?.(bob, false)
    expect(verificationStore.isTrusted(bob)).toBe(false)
  })

  it('routes ensureTrust with fetch dedupe', async () => {
    verificationStore.ensureTrust(bob)
    verificationStore.ensureTrust(bob)
    expect(ensureUserTrust).toHaveBeenCalledTimes(1)
    expect(ensureUserTrust).toHaveBeenCalledWith(bob)
    await Promise.resolve()
  })

  it('opens a dialog on an emoji session and closes it on closeDialog', () => {
    expect(verificationStore.dialogVisible).toBe(false)
    emitSession({ otherUserId: bob, phase: 'emoji', emojis: [] })
    expect(verificationStore.dialogVisible).toBe(true)

    verificationStore.closeDialog()
    expect(verificationStore.dialogVisible).toBe(false)
  })

  it('keeps the dialog open on a done session and closeDialog hides it', () => {
    emitSession({ otherUserId: bob, phase: 'done', emojis: [] })
    expect(verificationStore.dialogVisible).toBe(true)

    verificationStore.closeDialog()
    expect(verificationStore.session).toBeNull()
  })

  it('confirmSas flips to done and calls confirm', async () => {
    const callbacks = makeCallbacks()
    emitSession({ otherUserId: bob, phase: 'emoji', emojis: [['🦊', 'Fox']], callbacks })
    verificationStore.confirmSas()
    expect(callbacks.confirm).toHaveBeenCalledTimes(1)
    expect(verificationStore.session?.phase).toBe('done')
  })

  it('confirmSas on a pending session without callbacks is a no-op', () => {
    emitSession({ otherUserId: bob, phase: 'emoji', emojis: [] })
    verificationStore.confirmSas()
    expect(verificationStore.session?.phase).toBe('emoji')
  })

  it('mismatchSas flips to mismatch and calls mismatch', () => {
    const callbacks = makeCallbacks()
    emitSession({ otherUserId: bob, phase: 'emoji', emojis: [['🦊', 'Fox']], callbacks })
    verificationStore.mismatchSas()
    expect(callbacks.mismatch).toHaveBeenCalledTimes(1)
    expect(verificationStore.session?.phase).toBe('mismatch')
  })

  it('cancelVerification cancels and closes the dialog', () => {
    const callbacks = makeCallbacks()
    emitSession({ otherUserId: bob, phase: 'emoji', emojis: [['🦊', 'Fox']], callbacks })
    verificationStore.cancelVerification()
    expect(callbacks.cancel).toHaveBeenCalledTimes(1)
    expect(verificationStore.session).toBeNull()
  })

  it('verifyUser routes to beginUserVerification', () => {
    verificationStore.verifyUser(bob, roomId)
    expect(beginUserVerification).toHaveBeenCalledWith(bob, roomId)
  })

  it('reset clears session and trust', () => {
    emitSession({ otherUserId: bob, phase: 'done', emojis: [] })
    handlers.onTrust?.(bob, true)
    verificationStore.reset()
    expect(verificationStore.session).toBeNull()
    expect(verificationStore.isTrusted(bob)).toBe(false)
    expect(verificationStore.dialogVisible).toBe(false)
  })

  it('hides the dialog for cancelled sessions', () => {
    emitSession({ otherUserId: bob, phase: 'cancelled', emojis: [] })
    expect(verificationStore.dialogVisible).toBe(false)
  })
})