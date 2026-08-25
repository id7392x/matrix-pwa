import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accountManager } from '$lib/accountManager'
import { exchangeSsoLoginToken } from '$lib/authService'
import { startLegacySync, stopLegacySync } from '$lib/legacySync'
import { db } from '$storage/db'
import { authStore } from '$stores/authStore.svelte'

vi.mock('$lib/legacySync', () => ({
  startLegacySync: vi.fn(() => Promise.resolve({ stop: () => undefined })),
  stopLegacySync: vi.fn(),
}))

vi.mock('$lib/authService', () => ({
  login: vi.fn(),
  exchangeSsoLoginToken: vi.fn(),
}))

describe('authStore', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    await db.accounts.clear()
    authStore.reset()
    vi.mocked(startLegacySync).mockClear()
    vi.mocked(stopLegacySync).mockClear()
    vi.mocked(exchangeSsoLoginToken).mockClear()
  })

  it('starts signed out', () => {
    expect(authStore.isAuthenticated).toBe(false)
    expect(authStore.userId).toBeNull()
  })

  it('signs in and stores the token in sessionStorage only', () => {
    authStore.signIn('@alice:example.org', 'DEV1', 'example.org', 'secret-token')
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.userId).toBe('@alice:example.org')
    expect(authStore.deviceId).toBe('DEV1')
    expect(sessionStorage.getItem('mx_token:@alice:example.org')).toBe('secret-token')
    expect(authStore.accessToken).toBe('secret-token')
  })

  it('signs out and clears the session token', () => {
    authStore.signIn('@alice:example.org', 'DEV1', 'example.org', 'secret-token')
    authStore.signOut()
    expect(authStore.isAuthenticated).toBe(false)
    expect(authStore.userId).toBeNull()
    expect(authStore.accessToken).toBeNull()
    expect(sessionStorage.getItem('mx_token:@alice:example.org')).toBeNull()
  })

  it('signOut stops the running sync for the user', () => {
    authStore.signIn('@alice:example.org', 'DEV1', 'example.org', 'secret-token')
    vi.mocked(stopLegacySync).mockClear()
    authStore.signOut()
    expect(stopLegacySync).toHaveBeenCalledWith('@alice:example.org')
  })

  it('restores a persisted session on reload and resumes sync, returns true', async () => {
    await db.accounts.add({
      userId: '@alice:example.org',
      homeserver: 'example.org',
      deviceId: 'DEV1',
      isPrimary: true,
    })
    accountManager.setAccessToken('@alice:example.org', 'secret-token')

    const resolved = await authStore.restoreSession()

    expect(resolved).toBe(true)
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.userId).toBe('@alice:example.org')
    expect(authStore.deviceId).toBe('DEV1')
    expect(authStore.accessToken).toBe('secret-token')
    expect(startLegacySync).toHaveBeenCalledWith('@alice:example.org', expect.any(Function))
  })

  it('returns false when no session is persisted', async () => {
    const resolved = await authStore.restoreSession()

    expect(resolved).toBe(false)
    expect(authStore.isAuthenticated).toBe(false)
    expect(startLegacySync).not.toHaveBeenCalled()
  })

  it('restores a session from a refresh token without an access token', async () => {
    await db.accounts.add({
      userId: '@alice:example.org',
      homeserver: 'example.org',
      deviceId: 'DEV1',
      isPrimary: true,
      refreshToken: 'persisted-refresh',
    })

    const resolved = await authStore.restoreSession()

    expect(resolved).toBe(true)
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.userId).toBe('@alice:example.org')
    expect(authStore.accessToken).toBeNull()
    expect(startLegacySync).toHaveBeenCalledWith('@alice:example.org', expect.any(Function))
  })

  it('returns false when the account has neither access nor refresh token', async () => {
    await db.accounts.add({
      userId: '@alice:example.org',
      homeserver: 'example.org',
      deviceId: 'DEV1',
      isPrimary: true,
    })

    const resolved = await authStore.restoreSession()

    expect(resolved).toBe(false)
    expect(authStore.isAuthenticated).toBe(false)
    expect(startLegacySync).not.toHaveBeenCalled()
  })

  it('signs out and clears the refresh token from the account', async () => {
    await db.accounts.add({
      userId: '@alice:example.org',
      homeserver: 'example.org',
      deviceId: 'DEV1',
      isPrimary: true,
      refreshToken: 'persisted-refresh',
    })
    authStore.signIn('@alice:example.org', 'DEV1', 'example.org', 'secret-token')

    await authStore.signOut()

    expect((await db.accounts.get('@alice:example.org'))?.refreshToken).toBeUndefined()
    expect(sessionStorage.getItem('mx_token:@alice:example.org')).toBeNull()
  })

  it('signs out when the logged-out callback fires during restore', async () => {
    await db.accounts.add({
      userId: '@alice:example.org',
      homeserver: 'example.org',
      deviceId: 'DEV1',
      isPrimary: true,
      refreshToken: 'persisted-refresh',
    })
    let onLoggedOut: (() => void) | undefined
    vi.mocked(startLegacySync).mockImplementation((_userId: string, cb?: () => void) => {
      onLoggedOut = cb
      return Promise.resolve({ stop: () => undefined })
    })

    await authStore.restoreSession()
    expect(authStore.isAuthenticated).toBe(true)

    onLoggedOut?.()

    expect(authStore.isAuthenticated).toBe(false)
    expect(authStore.userId).toBeNull()
  })

  it('handleSsoCallback exchanges loginToken and signs in', async () => {
    vi.mocked(exchangeSsoLoginToken).mockResolvedValue({
      userId: '@alice:example.org',
      deviceId: 'SSODEV',
      homeserver: 'https://matrix.org',
    })
    accountManager.setAccessToken('@alice:example.org', 'sso-access')
    sessionStorage.setItem('sso_homeserver', 'matrix.org')
    history.replaceState({}, '', '?loginToken=my-token')

    const handled = await authStore.handleSsoCallback()

    expect(handled).toBe(true)
    expect(exchangeSsoLoginToken).toHaveBeenCalledWith('matrix.org', 'my-token')
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.userId).toBe('@alice:example.org')
    expect(location.search).toBe('')
    expect(sessionStorage.getItem('sso_homeserver')).toBeNull()
  })

  it('handleSsoCallback returns false when no loginToken in URL', async () => {
    history.replaceState({}, '', '/')

    const handled = await authStore.handleSsoCallback()

    expect(handled).toBe(false)
    expect(exchangeSsoLoginToken).not.toHaveBeenCalled()
  })
})
