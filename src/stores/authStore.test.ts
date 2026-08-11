import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { accountManager } from '$lib/accountManager'
import { startLegacySync, stopLegacySync } from '$lib/legacySync'
import { db } from '$storage/db'
import { authStore } from '$stores/authStore.svelte'

vi.mock('$lib/legacySync', () => ({ startLegacySync: vi.fn(), stopLegacySync: vi.fn() }))

describe('authStore', () => {
  beforeEach(async () => {
    sessionStorage.clear()
    await db.accounts.clear()
    authStore.reset()
    vi.mocked(startLegacySync).mockClear()
    vi.mocked(stopLegacySync).mockClear()
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
    expect(startLegacySync).toHaveBeenCalledWith('@alice:example.org')
  })

  it('returns false when no session is persisted', async () => {
    const resolved = await authStore.restoreSession()

    expect(resolved).toBe(false)
    expect(authStore.isAuthenticated).toBe(false)
    expect(startLegacySync).not.toHaveBeenCalled()
  })
})
