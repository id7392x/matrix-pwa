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
    const params = new URLSearchParams(location.search)

    const code = params.get('code')
    const state = params.get('state')
    if (code && state) {
      return this.handleOidcCallback(code, state)
    }

    const loginToken = params.get('loginToken')
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
    history.replaceState({}, '', location.pathname)
    try {
      const result = await exchangeOidcCode(code, state)
      return this.completeLogin(result.userId, result.deviceId, result.homeserver)
    } catch (error) {
      console.error('OIDC code exchange failed', error)
      return false
    }
  }

  private completeLogin(userId: string, deviceId: string, homeserver: string): boolean {
    this.signIn(userId, deviceId, homeserver, accountManager.getAccessToken(userId) ?? '')
    void startLegacySync(userId, () => {
      void this.signOut()
    }).catch(() => {
      void this.signOut()
    })
    return true
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
    void startLegacySync(account.userId, () => {
      void this.signOut()
    }).catch(() => {
      void this.signOut()
    })
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
