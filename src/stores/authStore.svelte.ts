import { accountManager } from '$lib/accountManager'
import { startLegacySync, stopLegacySync } from '$lib/legacySync'

class AuthStore {
  userId = $state<string | null>(null)
  deviceId = $state<string | null>(null)
  homeServer = $state<string | null>(null)
  accessToken = $state<string | null>(null)

  isAuthenticated = $derived(this.userId !== null && this.accessToken !== null)

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
    if (!token) return false
    this.userId = account.userId
    this.deviceId = account.deviceId
    this.homeServer = account.homeserver
    this.accessToken = token
    void startLegacySync(account.userId)
    return true
  }

  signOut(): void {
    if (this.userId) {
      stopLegacySync(this.userId)
      sessionStorage.removeItem(`mx_token:${this.userId}`)
    }
    this.userId = null
    this.deviceId = null
    this.homeServer = null
    this.accessToken = null
  }

  reset(): void {
    this.userId = null
    this.deviceId = null
    this.homeServer = null
    this.accessToken = null
  }
}

export const authStore = new AuthStore()
