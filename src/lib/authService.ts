import { ClientPrefix, Method, SSOAction, createClient, type MatrixClient } from 'matrix-js-sdk'
import type {
  AccessTokens,
  IRefreshTokenResponse,
  TokenRefreshFunction,
} from 'matrix-js-sdk'
import { OAuth2, type ValidatedAuthMetadata } from 'matrix-js-sdk/lib/oauth'

import { accountManager } from '$lib/accountManager'

const OIDC_CONTEXT_KEY = 'mx_oidc_context'

export interface SsoProvider {
  id: string
  name: string
  brand?: string
}

export function normalizeHomeserver(homeserver: string): string {
  const cleaned = homeserver.trim().replace(/\/+$/, '')
  return cleaned.includes('://') ? cleaned : `https://${cleaned}`
}

async function persistLoginResponse(
  userId: string,
  deviceId: string,
  homeserver: string,
  accessToken: string,
  refreshToken?: string,
): Promise<{ userId: string; deviceId: string; homeserver: string }> {
  await accountManager.addAccount({
    userId,
    homeserver,
    deviceId,
    isPrimary: true,
    refreshToken,
  })
  accountManager.setAccessToken(userId, accessToken)
  return { userId, deviceId, homeserver }
}

export async function login(
  homeserver: string,
  userId: string,
  password: string,
): Promise<{ userId: string; deviceId: string; homeserver: string }> {
  const baseUrl = normalizeHomeserver(homeserver)
  const client = createClient({ baseUrl })
  const response = await client.loginRequest({
    type: 'm.login.password',
    identifier: { type: 'm.id.user', user: userId },
    password,
    refresh_token: true,
  })
  return persistLoginResponse(response.user_id, response.device_id, baseUrl, response.access_token, response.refresh_token)
}

// ponytail: unauthenticated /refresh bypasses the SDK TokenRefresher, which
// would otherwise re-enter tokenRefreshFunction (stack overflow / deadlock)
export async function refreshAccessTokens(
  client: MatrixClient,
  refreshToken: string,
): Promise<IRefreshTokenResponse> {
  return client.http.request(Method.Post, '/refresh', undefined, { refresh_token: refreshToken }, {
    prefix: ClientPrefix.V3,
  })
}

export function makeTokenRefreshFunction(
  userId: string,
  getClient: () => MatrixClient,
): TokenRefreshFunction {
  return async (refreshToken: string): Promise<AccessTokens> => {
    const startedAt = Date.now()
    const response = await refreshAccessTokens(getClient(), refreshToken)
    await accountManager.setTokens(userId, {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
    })
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiry: new Date(startedAt + response.expires_in_ms),
    }
  }
}

export async function discoverSsoProviders(homeserver: string): Promise<SsoProvider[]> {
  const baseUrl = normalizeHomeserver(homeserver)
  const client = createClient({ baseUrl })
  try {
    const response = await client.loginFlows()
    const ssoFlow = response.flows.find((f) => f.type === 'm.login.sso')
    if (!ssoFlow || !('identity_providers' in ssoFlow)) return []
    return (ssoFlow.identity_providers ?? []).map((idp) => ({
      id: idp.id,
      name: idp.name,
      brand: idp.brand,
    }))
  } catch {
    return []
  }
}

export function ssoLogin(homeserver: string, idpId: string, redirectUrl: string): string {
  const baseUrl = normalizeHomeserver(homeserver)
  const client = createClient({ baseUrl })
  return client.getSsoLoginUrl(redirectUrl, 'sso', idpId, SSOAction.LOGIN)
}

export async function exchangeSsoLoginToken(
  homeserver: string,
  loginToken: string,
): Promise<{ userId: string; deviceId: string; homeserver: string }> {
  const baseUrl = normalizeHomeserver(homeserver)
  const client = createClient({ baseUrl })
  const response = await client.loginRequest({
    type: 'm.login.token',
    token: loginToken,
    refresh_token: true,
  })
  return persistLoginResponse(response.user_id, response.device_id, baseUrl, response.access_token, response.refresh_token)
}

export async function discoverOidcAuth(
  homeserver: string,
): Promise<ValidatedAuthMetadata | null> {
  const baseUrl = normalizeHomeserver(homeserver)
  const client = createClient({ baseUrl })
  try {
    return await client.getAuthMetadata()
  } catch {
    return null
  }
}

export async function oidcLogin(
  homeserver: string,
  metadata: ValidatedAuthMetadata,
  redirectUri: string,
): Promise<string> {
  // ponytail: client_uri MUST be https per OAuth2 spec; http breaks strict IdPs
  const clientUri = location.origin.startsWith('https')
    ? location.origin
    : location.href.replace(/\/[^/]*$/, '')

  const clientId = await OAuth2.registerClient(metadata, {
    client_name: 'Matrix PWA',
    client_uri: clientUri,
    redirect_uris: [redirectUri],
  })

  const state = crypto.randomUUID()
  const oauth2 = new OAuth2(metadata, {
    clientId,
    redirectUri,
  })

  const authUrl = await oauth2.generateAuthorizationCodeGrantUrl(state)

  sessionStorage.setItem(
    OIDC_CONTEXT_KEY,
    JSON.stringify({
      state,
      clientId,
      codeVerifier: oauth2.context.codeVerifier,
      metadata,
      redirectUri,
    }),
  )

  return authUrl
}

interface OidcContext {
  state: string
  clientId: string
  codeVerifier: string
  metadata: ValidatedAuthMetadata
  redirectUri: string
}

export async function exchangeOidcCode(
  code: string,
  state: string,
): Promise<{ userId: string; deviceId: string; homeserver: string }> {
  const raw = sessionStorage.getItem(OIDC_CONTEXT_KEY)
  if (!raw) throw new Error('No OIDC context')

  const ctx: OidcContext = JSON.parse(raw)
  if (ctx.state !== state) throw new Error('State mismatch')

  sessionStorage.removeItem(OIDC_CONTEXT_KEY)

  const oauth2 = new OAuth2(ctx.metadata, {
    clientId: ctx.clientId,
    codeVerifier: ctx.codeVerifier,
    redirectUri: ctx.redirectUri,
  })

  const tokens = await oauth2.completeAuthorizationCodeGrant(code)

  const client = createClient({
    baseUrl: ctx.metadata.issuer,
    accessToken: tokens.access_token,
  })
  const whoami = await client.whoami()

  return persistLoginResponse(
    whoami.user_id,
    whoami.device_id ?? 'OIDC_DEVICE',
    ctx.metadata.issuer,
    tokens.access_token,
    tokens.refresh_token,
  )
}
