import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClientPrefix, Method, SSOAction, createClient } from 'matrix-js-sdk'
import { OAuth2 } from 'matrix-js-sdk/lib/oauth'

import { db } from '$storage/db'
import { accountManager } from '$lib/accountManager'
import {
  login,
  makeTokenRefreshFunction,
  normalizeHomeserver,
  discoverSsoProviders,
  ssoLogin,
  exchangeSsoLoginToken,
  discoverOidcAuth,
  oidcLogin,
  exchangeOidcCode,
} from '$lib/authService'

vi.mock('matrix-js-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('matrix-js-sdk')>()
  return {
    ...actual,
    createClient: vi.fn((opts: Parameters<typeof actual.createClient>[0]) =>
      actual.createClient(opts),
    ),
  }
})

vi.mock('matrix-js-sdk/lib/oauth', () => {
  const mockOAuth2 = vi.fn()
  return {
    OAuth2: Object.assign(mockOAuth2, {
      registerClient: vi.fn(),
    }),
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

describe('authService.discoverSsoProviders', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(createClient).mockClear()
  })

  it('returns identity providers when m.login.sso flow exists', async () => {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'loginFlows').mockResolvedValue({
      flows: [
        {
          type: 'm.login.sso',
          identity_providers: [
            { id: 'apple', name: 'Apple', brand: 'apple' },
            { id: 'google', name: 'Google', brand: 'google' },
          ],
        },
      ],
    })

    const providers = await discoverSsoProviders('matrix.org')

    expect(providers).toHaveLength(2)
    expect(providers[0]).toEqual({ id: 'apple', name: 'Apple', brand: 'apple' })
  })

  it('returns empty array when no SSO flow is available', async () => {
    const client = createClient({ baseUrl: 'https://example.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'loginFlows').mockResolvedValue({
      flows: [{ type: 'm.login.password' }],
    })

    const providers = await discoverSsoProviders('example.org')

    expect(providers).toHaveLength(0)
  })

  it('returns empty array on network error', async () => {
    const client = createClient({ baseUrl: 'https://down.example.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'loginFlows').mockRejectedValue(new Error('fetch failed'))

    const providers = await discoverSsoProviders('down.example.org')

    expect(providers).toHaveLength(0)
  })
})

describe('authService.ssoLogin', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(createClient).mockClear()
  })

  it('generates SSO URL via getSsoLoginUrl with correct params', () => {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'getSsoLoginUrl').mockReturnValue(
      'https://matrix.org/_matrix/client/v3/login/sso/redirect/apple?redirectUrl=http%3A%2F%2Flocalhost%3A5173%2F',
    )

    const url = ssoLogin('matrix.org', 'apple', 'http://localhost:5173/')

    expect(client.getSsoLoginUrl).toHaveBeenCalledWith(
      'http://localhost:5173/',
      'sso',
      'apple',
      SSOAction.LOGIN,
    )
    expect(url).toContain('login/sso/redirect/apple')
  })
})

describe('authService.exchangeSsoLoginToken', () => {
  beforeEach(async () => {
    await db.accounts.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    vi.mocked(createClient).mockClear()
  })

  it('exchanges loginToken and persists account with refresh token', async () => {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'loginRequest').mockResolvedValue({
      access_token: 'sso-access',
      device_id: 'SSODEV',
      user_id: alice,
      refresh_token: 'sso-refresh',
    })

    const result = await exchangeSsoLoginToken('matrix.org', 'my-login-token')

    expect(client.loginRequest).toHaveBeenCalledWith({
      type: 'm.login.token',
      token: 'my-login-token',
      refresh_token: true,
    })
    expect(result.userId).toBe(alice)
    expect(result.deviceId).toBe('SSODEV')
    expect(result.homeserver).toBe('https://matrix.org')
    expect(accountManager.getAccessToken(alice)).toBe('sso-access')
    expect((await db.accounts.get(alice))?.refreshToken).toBe('sso-refresh')
  })

  it('never persists the loginToken', async () => {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'loginRequest').mockResolvedValue({
      access_token: 'sso-access',
      device_id: 'SSODEV',
      user_id: alice,
      refresh_token: 'sso-refresh',
    })

    await exchangeSsoLoginToken('matrix.org', 'my-login-token')

    const account = await db.accounts.get(alice)
    expect(account).not.toHaveProperty('loginToken')
    expect(JSON.stringify(account)).not.toContain('my-login-token')
  })
})

const oidcMetadata = {
  issuer: 'https://matrix.org',
  authorization_endpoint: 'https://matrix.org/auth',
  token_endpoint: 'https://matrix.org/token',
  registration_endpoint: 'https://matrix.org/register',
  code_challenge_methods_supported: ['S256'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  response_types_supported: ['code'],
  response_modes_supported: ['query', 'fragment'],
  revocation_endpoint: 'https://matrix.org/revoke',
}

describe('authService.discoverOidcAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(createClient).mockClear()
  })

  it('returns auth metadata when getAuthMetadata succeeds', async () => {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'getAuthMetadata').mockResolvedValue(oidcMetadata)

    const result = await discoverOidcAuth('matrix.org')

    expect(client.getAuthMetadata).toHaveBeenCalled()
    expect(result).toEqual(oidcMetadata)
  })

  it('returns null when getAuthMetadata throws', async () => {
    const client = createClient({ baseUrl: 'https://down.example.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'getAuthMetadata').mockRejectedValue(new Error('fetch failed'))

    const result = await discoverOidcAuth('down.example.org')

    expect(result).toBeNull()
  })

  it('returns null when metadata validation fails', async () => {
    const client = createClient({ baseUrl: 'https://example.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'getAuthMetadata').mockRejectedValue(
      new Error('Issuer configuration not valid'),
    )

    const result = await discoverOidcAuth('example.org')

    expect(result).toBeNull()
  })
})

describe('authService.oidcLogin', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    sessionStorage.clear()
    vi.mocked(OAuth2).mockClear()
    vi.mocked(OAuth2.registerClient).mockClear()
  })

  it('registers client, generates auth URL, and stores context in sessionStorage', async () => {
    vi.mocked(OAuth2.registerClient).mockResolvedValue('oidc-client-id')
    vi.mocked(OAuth2).mockImplementation(function () {
      return {
        context: { clientId: 'oidc-client-id', codeVerifier: 'test-verifier' },
        generateAuthorizationCodeGrantUrl: vi.fn().mockResolvedValue('https://matrix.org/auth?code=abc'),
      } as unknown as InstanceType<typeof OAuth2>
    })

    const result = await oidcLogin('https://matrix.org', oidcMetadata, 'http://localhost:5173/')

    expect(OAuth2.registerClient).toHaveBeenCalledWith(oidcMetadata, expect.objectContaining({
      client_name: 'Matrix PWA',
      redirect_uris: ['http://localhost:5173/'],
    }))
    expect(result).toBe('https://matrix.org/auth?code=abc')

    const stored = JSON.parse(sessionStorage.getItem('mx_oidc_context')!)
    expect(stored.clientId).toBe('oidc-client-id')
    expect(stored.metadata).toEqual(oidcMetadata)
    expect(stored.redirectUri).toBe('http://localhost:5173/')
    expect(stored.state).toBeDefined()
    expect(stored.codeVerifier).toBe('test-verifier')
  })
})

describe('authService.exchangeOidcCode', () => {
  beforeEach(async () => {
    await db.accounts.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
    vi.mocked(OAuth2).mockClear()
    vi.mocked(OAuth2.registerClient).mockClear()
  })

  it('exchanges code for tokens and persists account', async () => {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    vi.mocked(createClient).mockReturnValue(client)
    vi.spyOn(client, 'whoami').mockResolvedValue({
      user_id: alice,
      device_id: 'OIDCDEV',
    })

    vi.mocked(OAuth2).mockImplementation(function () {
      return {
        completeAuthorizationCodeGrant: vi.fn().mockResolvedValue({
          access_token: 'oidc-access',
          refresh_token: 'oidc-refresh',
          token_type: 'Bearer',
        }),
      } as unknown as InstanceType<typeof OAuth2>
    })

    sessionStorage.setItem(
      'mx_oidc_context',
      JSON.stringify({
        state: 'test-state',
        clientId: 'oidc-client-id',
        codeVerifier: 'test-verifier',
        metadata: oidcMetadata,
        redirectUri: 'http://localhost:5173/',
      }),
    )

    const result = await exchangeOidcCode('auth-code', 'test-state')

    expect(result.userId).toBe(alice)
    expect(accountManager.getAccessToken(alice)).toBe('oidc-access')
    expect((await db.accounts.get(alice))?.refreshToken).toBe('oidc-refresh')
  })

  it('throws when state does not match stored state', async () => {
    sessionStorage.setItem(
      'mx_oidc_context',
      JSON.stringify({ state: 'correct-state', clientId: 'x', codeVerifier: 'v', metadata: oidcMetadata, redirectUri: 'http://localhost:5173/' }),
    )

    await expect(exchangeOidcCode('auth-code', 'wrong-state')).rejects.toThrow('State mismatch')
  })

  it('throws when no OIDC context in sessionStorage', async () => {
    await expect(exchangeOidcCode('auth-code', 'test-state')).rejects.toThrow('No OIDC context')
  })
})
