import { ClientPrefix, Method, createClient, type MatrixClient } from 'matrix-js-sdk'
import type {
  AccessTokens,
  IRefreshTokenResponse,
  TokenRefreshFunction,
} from 'matrix-js-sdk'

import { accountManager } from '$lib/accountManager'

export function normalizeHomeserver(homeserver: string): string {
  // SEC-4: a trailing slash or whitespace must not produce a double-slash baseUrl
  const cleaned = homeserver.trim().replace(/\/+$/, '')
  return cleaned.includes('://') ? cleaned : `https://${cleaned}`
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
  await accountManager.addAccount({
    userId: response.user_id,
    homeserver: baseUrl,
    deviceId: response.device_id,
    isPrimary: true,
    refreshToken: response.refresh_token,
  })
  accountManager.setAccessToken(response.user_id, response.access_token)
  return { userId: response.user_id, deviceId: response.device_id, homeserver: baseUrl }
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
    // SDK-5: anchor expiry to the request start, matching the SDK's own refresher
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
