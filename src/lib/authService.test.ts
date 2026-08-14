import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientPrefix, Method, createClient } from 'matrix-js-sdk'

import { db } from '$storage/db'
import { accountManager } from '$lib/accountManager'
import { login, makeTokenRefreshFunction, normalizeHomeserver } from '$lib/authService'

vi.mock('matrix-js-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('matrix-js-sdk')>()
  return {
    ...actual,
    createClient: vi.fn((opts: Parameters<typeof actual.createClient>[0]) =>
      actual.createClient(opts),
    ),
  }
})

const alice = '@alice:example.org'

describe('authService.login', () => {
  beforeEach(async () => {
    await db.accounts.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    vi.mocked(createClient).mockClear()
  })

  it('logs in with a password via loginRequest and persists the account with a refresh token', async () => {
    const client = createClient({ baseUrl: 'https://example.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'loginRequest').mockResolvedValue({
      access_token: 'new-access',
      device_id: 'DEV7',
      user_id: alice,
      refresh_token: 'new-refresh',
    })

    await login('example.org', alice, 's3cret-password')

    expect(vi.mocked(createClient)).toHaveBeenCalledWith({ baseUrl: 'https://example.org' })
    expect(client.loginRequest).toHaveBeenCalledWith({
      type: 'm.login.password',
      identifier: { type: 'm.id.user', user: alice },
      password: 's3cret-password',
      refresh_token: true,
    })

    const account = await db.accounts.get(alice)
    expect(account?.deviceId).toBe('DEV7')
    expect(account?.homeserver).toBe('https://example.org')
    expect(account?.refreshToken).toBe('new-refresh')
    expect(accountManager.getAccessToken(alice)).toBe('new-access')
  })

  it('never persists the password or accessToken', async () => {
    const client = createClient({ baseUrl: 'https://example.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'loginRequest').mockResolvedValue({
      access_token: 'new-access',
      device_id: 'DEV7',
      user_id: alice,
      refresh_token: 'new-refresh',
    })

    await login('example.org', alice, 's3cret-password')

    const account = await db.accounts.get(alice)
    expect(account).not.toHaveProperty('accessToken')
    expect(account).not.toHaveProperty('password')
    expect(JSON.stringify(account)).not.toContain('s3cret-password')
    expect(sessionStorage.getItem(`mx_token:${alice}`)).toBe('new-access')
  })
})

describe('authService.normalizeHomeserver', () => {
  it('adds https to a bare hostname', () => {
    expect(normalizeHomeserver('matrix.org')).toBe('https://matrix.org')
  })

  it('strips whitespace and trailing slashes', () => {
    expect(normalizeHomeserver('  matrix.org/  ')).toBe('https://matrix.org')
    expect(normalizeHomeserver('https://matrix.org/')).toBe('https://matrix.org')
  })

  it('keeps an explicit scheme', () => {
    expect(normalizeHomeserver('http://localhost:8008')).toBe('http://localhost:8008')
  })
})

describe('authService.makeTokenRefreshFunction', () => {
  beforeEach(async () => {
    await db.accounts.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('refreshes via the unauthenticated /refresh endpoint, persists new tokens and returns an expiry', async () => {
    const client = createClient({ baseUrl: 'https://example.org' })
    vi.spyOn(client.http, 'request').mockResolvedValue({
      access_token: 'fresh-access',
      refresh_token: 'rotated-refresh',
      expires_in_ms: 60_000,
    })
    await db.accounts.add({
      userId: alice,
      homeserver: 'https://example.org',
      deviceId: 'DEV1',
      isPrimary: true,
      refreshToken: 'stale-refresh',
    })

    const result = await makeTokenRefreshFunction(alice, () => client)('stale-refresh')

    expect(client.http.request).toHaveBeenCalledWith(
      Method.Post,
      '/refresh',
      undefined,
      { refresh_token: 'stale-refresh' },
      expect.objectContaining({ prefix: ClientPrefix.V3 }),
    )
    expect(result.accessToken).toBe('fresh-access')
    expect(result.refreshToken).toBe('rotated-refresh')
    expect(result.expiry).toBeInstanceOf(Date)
    expect(accountManager.getAccessToken(alice)).toBe('fresh-access')
    expect((await db.accounts.get(alice))?.refreshToken).toBe('rotated-refresh')
  })

  it('does not re-enter the SDK refresh pipeline via client.refreshToken', async () => {
    const client = createClient({ baseUrl: 'https://example.org' })
    const refreshTokenSpy = vi.spyOn(client, 'refreshToken').mockRejectedValue(
      new Error('must not be called from within tokenRefreshFunction'),
    )
    vi.spyOn(client.http, 'request').mockResolvedValue({
      access_token: 'fresh-access',
      refresh_token: 'rotated-refresh',
      expires_in_ms: 60_000,
    })
    await db.accounts.add({
      userId: alice,
      homeserver: 'https://example.org',
      deviceId: 'DEV1',
      isPrimary: true,
      refreshToken: 'stale-refresh',
    })

    const result = await makeTokenRefreshFunction(alice, () => client)('stale-refresh')

    expect(refreshTokenSpy).not.toHaveBeenCalled()
    expect(result.accessToken).toBe('fresh-access')
  })
})
