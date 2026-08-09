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

  signOut(): void {
    if (this.userId) sessionStorage.removeItem(`mx_token:${this.userId}`)
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
