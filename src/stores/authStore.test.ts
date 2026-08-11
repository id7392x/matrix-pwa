import { beforeEach, describe, expect, it, vi } from 'vitest'

import { stopLegacySync } from '$lib/legacySync'
import { authStore } from '$stores/authStore.svelte'

vi.mock('$lib/legacySync', () => ({ startLegacySync: vi.fn(), stopLegacySync: vi.fn() }))

describe('authStore', () => {
  beforeEach(() => {
    sessionStorage.clear()
    authStore.reset()
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
})
