import { accountManager } from '$lib/accountManager'
import { startLegacySync, stopLegacySync } from '$lib/legacySync'
import { uiStore } from '$stores/uiStore.svelte'

class AuthStore {
  userId = $state<string | null>(null)
  deviceId = $state<string | null>(null)
  homeServer = $state<string | null>(null)
  accessToken = $state<string | null>(null)

  isAuthenticated = $derived(this.userId !== null)

  signIn(userId: string, deviceId: string, homeServer: string, accessToken: string): void {
    sessionStorage.setItem(`mx_token:${userId}`, accessToken)
    this.userId = userId
    this.deviceId = deviceId
    this.homeServer = homeServer
    this.accessToken = accessToken
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
    if (userId) {
      stopLegacySync(userId)
      sessionStorage.removeItem(`mx_token:${userId}`)
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
