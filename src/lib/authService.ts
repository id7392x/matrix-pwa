import { createClient, type MatrixClient } from 'matrix-js-sdk'
import type { AccessTokens, TokenRefreshFunction } from 'matrix-js-sdk'

import { accountManager } from '$lib/accountManager'

export function normalizeHomeserver(homeserver: string): string {
  return homeserver.includes('://') ? homeserver : `https://${homeserver}`
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

export function makeTokenRefreshFunction(
  userId: string,
  getClient: () => MatrixClient,
): TokenRefreshFunction {
  return async (refreshToken: string): Promise<AccessTokens> => {
    const response = await getClient().refreshToken(refreshToken)
    await accountManager.setTokens(userId, {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
    })
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
      expiry: new Date(Date.now() + response.expires_in_ms),
    }
  }
}
