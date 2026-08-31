import type { SecretStorageKeyDescription } from 'matrix-js-sdk/lib/secret-storage'

import {
  adoptCrossSigning,
  autoRestoreBackup,
  getDeviceVerified,
  getSecurityState,
  installRecoveryKey,
  setPasswordPrompt,
  setSecretStorageKeyPrompt,
  setupRecovery,
  unlockRecovery,
  type RecoveryKeyMatch,
} from '$crypto/security'
import { db } from '$storage/db'

class CryptoStoreManager {
  crossSigningReady = $state(false)
  secretStorageReady = $state(false)
  recoveryKeyInMemory = $state(false)
  bannerDismissed = $state(false)
  statusLoaded = $state(false)
  /** Whether the current device (session) is cross-signed by the account keys. */
  deviceVerified = $state(false)

  setupVisible = $state(false)
  setupBusy = $state(false)
  setupError = $state('')
  setupRecoveryKey = $state('')
  unlockVisible = $state(false)
  unlockError = $state('')
  passwordVisible = $state(false)

  setupNeeded = $derived(!this.crossSigningReady || !this.secretStorageReady)
  showBanner = $derived(this.statusLoaded && this.setupNeeded && !this.bannerDismissed)

  private userId = ''
  private unlockKeys: Record<string, SecretStorageKeyDescription> = {}
  private pendingUnlock: ((pair: RecoveryKeyMatch | null) => void) | null = null
  private pendingPassword: ((pw: string | null) => void) | null = null

  async init(userId: string): Promise<void> {
    this.userId = userId
    const row = await db.accounts.get(userId)
    this.bannerDismissed = row?.securityBannerDismissed ?? false
    await this.refreshStatus()
  }

  private async refreshStatus(): Promise<void> {
    const [state, deviceVerified] = await Promise.all([getSecurityState(), getDeviceVerified()])
    this.crossSigningReady = state.crossSigningReady
    this.secretStorageReady = state.secretStorageReady
    this.recoveryKeyInMemory = state.recoveryKeyInMemory
    this.deviceVerified = deviceVerified
    this.statusLoaded = true
  }

  /**
   * Adopts + restores a trusted server key backup so pre-login history re-decrypts.
   * Runs once per account (per device): the expensive `restoreKeyBackup` is skipped
   * on later logins once this device has already restored. Never blocks or throws.
   */
  async autoRestore(): Promise<void> {
    if (!this.userId) return
    const row = await db.accounts.get(this.userId)
    if (row?.backupRestored) return
    const status = await autoRestoreBackup()
    if (status === 'restored' && row) {
      await db.accounts.put({ ...row, backupRestored: true })
    }
  }

  async dismissBanner(): Promise<void> {
    this.bannerDismissed = true
    if (!this.userId) return
    const row = await db.accounts.get(this.userId)
    if (row) await db.accounts.put({ ...row, securityBannerDismissed: true })
  }

  openSetup(): void {
    this.setupVisible = true
    this.setupError = ''
    this.setupRecoveryKey = ''
  }

  closeSetup(): void {
    this.setupVisible = false
    this.setupBusy = false
    this.setupError = ''
    this.setupRecoveryKey = ''
  }

  async runSetup(): Promise<void> {
    this.setupBusy = true
    this.setupError = ''
    try {
      this.setupRecoveryKey = await setupRecovery()
      await this.refreshStatus()
    } catch (error) {
      this.setupError = error instanceof Error ? error.message : 'Setup failed'
      this.setupRecoveryKey = ''
    } finally {
      this.setupBusy = false
    }
  }

  finishSetup(): void {
    this.closeSetup()
  }

  openUnlock(): void {
    this.unlockKeys = {}
    this.unlockError = ''
    this.unlockVisible = true
  }

  cancelUnlock(): void {
    this.unlockVisible = false
    this.unlockKeys = {}
    const resolve = this.pendingUnlock
    this.pendingUnlock = null
    resolve?.(null)
  }

  async submitUnlockKey(recoveryKey: string): Promise<void> {
    if (this.pendingUnlock && Object.keys(this.unlockKeys).length > 0) {
      const match = await unlockRecovery(recoveryKey, this.unlockKeys)
      if (!match) {
        this.unlockError = 'Recovery key does not match any key on this account'
        return
      }
      this.unlockError = ''
      this.unlockVisible = false
      this.unlockKeys = {}
      const resolve = this.pendingUnlock
      this.pendingUnlock = null
      resolve(match)
      await this.refreshStatus()
      await this.adoptSession().catch(() => undefined)
      await this.autoRestore().catch(() => undefined)
      return
    }
    const ok = await installRecoveryKey(recoveryKey)
    if (!ok) {
      this.unlockError = 'Malformed recovery key'
      return
    }
    this.unlockError = ''
    this.unlockVisible = false
    await this.adoptSession()
    await this.refreshStatus()
    await this.autoRestore().catch(() => undefined)
  }

  /**
   * Signs the current device with the recovered cross-signing keys so the
   * session flips to verified. Tolerates API failures — the session stays
   * unverified and the widget allows retrying.
   */
  private async adoptSession(): Promise<void> {
    try {
      await adoptCrossSigning()
    } catch {
      // surfaced via deviceVerified on the next status refresh
    }
  }

  /** Provider callback for the SDK: opens the unlock dialog and waits for the user. */
  requestRecoveryKey(keys: Record<string, SecretStorageKeyDescription>): Promise<RecoveryKeyMatch | null> {
    this.unlockKeys = keys
    this.unlockError = ''
    this.unlockVisible = true
    return new Promise((resolve) => {
      this.pendingUnlock = resolve
    })
  }

  /** Provider callback for the SDK: opens the password prompt and waits for the user. */
  requestPassword(): Promise<string | null> {
    this.passwordVisible = true
    return new Promise((resolve) => {
      this.pendingPassword = resolve
    })
  }

  submitPassword(password: string): void {
    this.passwordVisible = false
    const resolve = this.pendingPassword
    this.pendingPassword = null
    resolve?.(password)
  }

  cancelPassword(): void {
    this.passwordVisible = false
    const resolve = this.pendingPassword
    this.pendingPassword = null
    resolve?.(null)
  }

  reset(): void {
    this.userId = ''
    this.crossSigningReady = false
    this.secretStorageReady = false
    this.recoveryKeyInMemory = false
    this.deviceVerified = false
    this.bannerDismissed = false
    this.statusLoaded = false
    this.setupVisible = false
    this.setupBusy = false
    this.setupError = ''
    this.setupRecoveryKey = ''
    this.unlockVisible = false
    this.unlockError = ''
    this.passwordVisible = false
    this.unlockKeys = {}
    const unlockResolve = this.pendingUnlock
    this.pendingUnlock = null
    unlockResolve?.(null)
    const passwordResolve = this.pendingPassword
    this.pendingPassword = null
    passwordResolve?.(null)
  }
}

export const cryptoStore = new CryptoStoreManager()

setSecretStorageKeyPrompt((keys) => cryptoStore.requestRecoveryKey(keys))
setPasswordPrompt(() => cryptoStore.requestPassword())