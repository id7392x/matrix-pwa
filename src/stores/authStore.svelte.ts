import { accountManager } from '$lib/accountManager'
import { exchangeSsoLoginToken, exchangeOidcCode } from '$lib/authService'
import { startLegacySync, stopLegacySync } from '$lib/legacySync'
import { batchedStore } from '$stores/batchedStore.svelte'
import { roomStore } from '$stores/roomStore.svelte'
import { uiStore } from '$stores/uiStore.svelte'

class AuthStore {
  userId = $state<string | null>(null)
  deviceId = $state<string | null>(null)
  homeServer = $state<string | null>(null)
  accessToken = $state<string | null>(null)

  isAuthenticated = $derived(this.userId !== null)

  signIn(userId: string, deviceId: string, homeServer: string, accessToken: string): void {
    accountManager.setAccessToken(userId, accessToken)
    this.userId = userId
    this.deviceId = deviceId
    this.homeServer = homeServer
    this.accessToken = accessToken
  }

  async handleSsoCallback(): Promise<boolean> {
    // ponytail: OIDC fragment mode puts params in hash, query mode puts them in search
    const searchParams = new URLSearchParams(location.search)
    const hashParams = new URLSearchParams(location.hash.slice(1))

    const code = searchParams.get('code') ?? hashParams.get('code')
    const state = searchParams.get('state') ?? hashParams.get('state')
    if (code && state) {
      history.replaceState({}, '', location.pathname)
      return this.handleOidcCallback(code, state)
    }

    const loginToken = searchParams.get('loginToken')
    if (!loginToken) return false
    const homeserver = sessionStorage.getItem('sso_homeserver') ?? 'matrix.org'
    sessionStorage.removeItem('sso_homeserver')
    history.replaceState({}, '', location.pathname)
    try {
      const result = await exchangeSsoLoginToken(homeserver, loginToken)
      return this.completeLogin(result.userId, result.deviceId, result.homeserver)
    } catch (error) {
      console.error('SSO token exchange failed', error)
      return false
    }
  }

  private async handleOidcCallback(code: string, state: string): Promise<boolean> {
    try {
      const result = await exchangeOidcCode(code, state)
      return this.completeLogin(result.userId, result.deviceId, result.homeserver)
    } catch (error) {
      sessionStorage.removeItem('mx_oidc_context')
      console.error('OIDC code exchange failed', error)
      return false
    }
  }

  private completeLogin(userId: string, deviceId: string, homeserver: string): boolean {
    const token = accountManager.getAccessToken(userId) ?? ''
    this.signIn(userId, deviceId, homeserver, token)
    this.startSyncWithAutoSignout(userId)
    return true
  }

  private startSyncWithAutoSignout(userId: string): void {
    void startLegacySync(userId, () => {
      void this.signOut()
    }).catch(() => {
      void this.signOut()
    })
  }

  async restoreSession(): Promise<boolean> {
    const account = await accountManager.getActiveAccount()
    if (!account) return false
    const token = accountManager.getAccessToken(account.userId)
    if (!token && !account.refreshToken) return false
    this.userId = account.userId
    this.deviceId = account.deviceId
    this.homeServer = account.homeserver
    this.accessToken = token
    this.startSyncWithAutoSignout(account.userId)
    return true
  }

  async signOut(): Promise<void> {
    const userId = this.userId
    this.userId = null
    this.deviceId = null
    this.homeServer = null
    this.accessToken = null
    uiStore.openLogin()
    // C15: never leave the previous account's navigation history behind
    uiStore.reset()
    // C3: never let the previous account's rooms/events bleed into the next session
    batchedStore.reset()
    roomStore.reset()
    if (userId) {
      stopLegacySync(userId)
      accountManager.removeAccessToken(userId)
      await accountManager.clearRefreshToken(userId)
    }
  }

  reset(): void {
    this.userId = null
    this.deviceId = null
    this.homeServer = null
    this.accessToken = null
  }
}

export const authStore = new AuthStore()
