import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecretStorageKeyDescription } from 'matrix-js-sdk/lib/secret-storage'

import {
  autoRestoreBackup,
  getSecurityState,
  installRecoveryKey,
  setPasswordPrompt,
  setSecretStorageKeyPrompt,
  setupRecovery,
  unlockRecovery,
} from '$crypto/security'
import { db } from '$storage/db'
import { cryptoStore } from '$stores/cryptoStore.svelte'

vi.mock('$crypto/security', () => ({
  autoRestoreBackup: vi.fn(),
  getSecurityState: vi.fn(),
  installRecoveryKey: vi.fn(),
  setupRecovery: vi.fn(),
  unlockRecovery: vi.fn(),
  setSecretStorageKeyPrompt: vi.fn(),
  setPasswordPrompt: vi.fn(),
}))

const alice = '@alice:example.org'
const homeserver = 'https://matrix.org'

function makeDesc(keyId = 'k1'): Record<string, SecretStorageKeyDescription> {
  return {
    [keyId]: {
      name: 'default',
      algorithm: 'm.secret_storage.v1.aes-hmac-sha2',
      passphrase: null as never,
      iv: '',
      mac: '',
    },
  }
}

describe('cryptoStore', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await db.accounts.put({ userId: alice, homeserver, deviceId: 'DEV', isPrimary: true })
    vi.mocked(getSecurityState).mockResolvedValue({
      crossSigningReady: false,
      secretStorageReady: false,
      recoveryKeyInMemory: false,
    })
    cryptoStore.reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
    cryptoStore.reset()
  })

  it('registers the secret-key and password prompt providers with security', () => {
    expect(vi.mocked(setSecretStorageKeyPrompt)).toHaveBeenCalled()
    expect(vi.mocked(setPasswordPrompt)).toHaveBeenCalled()
  })

  it('init loads persisted banner dismissal and the crypto state', async () => {
    await db.accounts.put({ ...(await db.accounts.get(alice))!, securityBannerDismissed: true })
    vi.mocked(getSecurityState).mockResolvedValue({
      crossSigningReady: true,
      secretStorageReady: true,
      recoveryKeyInMemory: true,
    })

    await cryptoStore.init(alice)

    expect(cryptoStore.bannerDismissed).toBe(true)
    expect(cryptoStore.crossSigningReady).toBe(true)
    expect(cryptoStore.secretStorageReady).toBe(true)
    expect(cryptoStore.recoveryKeyInMemory).toBe(true)
    expect(cryptoStore.setupNeeded).toBe(false)
  })

  it('showBanner is true when setup is needed and not dismissed', async () => {
    await cryptoStore.init(alice)
    expect(cryptoStore.setupNeeded).toBe(true)
    expect(cryptoStore.showBanner).toBe(true)
  })

  it('showBanner is false once dismissed', async () => {
    await cryptoStore.init(alice)
    await cryptoStore.dismissBanner()
    expect(cryptoStore.showBanner).toBe(false)
  })

  it('showBanner is false when everything is set up', async () => {
    vi.mocked(getSecurityState).mockResolvedValue({
      crossSigningReady: true,
      secretStorageReady: true,
      recoveryKeyInMemory: false,
    })
    await cryptoStore.init(alice)
    expect(cryptoStore.showBanner).toBe(false)
  })

  it('dismissBanner persists the dismissed flag per account', async () => {
    await cryptoStore.init(alice)
    await cryptoStore.dismissBanner()
    const row = await db.accounts.get(alice)
    expect(row?.securityBannerDismissed).toBe(true)
  })

  it('reset clears the banner dismissal so a fresh session shows the banner again', async () => {
    await cryptoStore.init(alice)
    await cryptoStore.dismissBanner()
    expect(cryptoStore.bannerDismissed).toBe(true)
    cryptoStore.reset()
    expect(cryptoStore.bannerDismissed).toBe(false)
    expect(cryptoStore.setupNeeded).toBe(true)
  })

  it('showBanner stays hidden until the security status has been loaded', () => {
    cryptoStore.reset()
    expect(cryptoStore.setupNeeded).toBe(true)
    expect(cryptoStore.showBanner).toBe(false)
  })

  it('reset re-hides the banner until the status reloads on the next session', async () => {
    await cryptoStore.init(alice)
    expect(cryptoStore.showBanner).toBe(true)
    cryptoStore.reset()
    expect(cryptoStore.setupNeeded).toBe(true)
    expect(cryptoStore.showBanner).toBe(false)
    await cryptoStore.init(alice)
    expect(cryptoStore.showBanner).toBe(true)
  })

  it('runSetup generates a recovery key and finishSetup closes the dialog', async () => {
    await cryptoStore.init(alice)
    vi.mocked(setupRecovery).mockResolvedValue('rec-key-abc')
    cryptoStore.openSetup()
    expect(cryptoStore.setupVisible).toBe(true)

    await cryptoStore.runSetup()

    expect(cryptoStore.setupRecoveryKey).toBe('rec-key-abc')
    expect(cryptoStore.setupError).toBe('')

    cryptoStore.finishSetup()

    expect(cryptoStore.setupVisible).toBe(false)
    expect(cryptoStore.setupRecoveryKey).toBe('')
  })

  it('runSetup surfaces errors and keeps the dialog open', async () => {
    await cryptoStore.init(alice)
    vi.mocked(setupRecovery).mockRejectedValue(new Error('UIA failed'))
    cryptoStore.openSetup()
    await cryptoStore.runSetup()
    expect(cryptoStore.setupVisible).toBe(true)
    expect(cryptoStore.setupError).toContain('UIA failed')
  })

  it('requestRecoveryKey opens the unlock dialog and submitUnlockKey resolves the pending SDK request', async () => {
    await cryptoStore.init(alice)
    const key = new Uint8Array(32).fill(1)
    const keys = makeDesc()
    const pending = cryptoStore.requestRecoveryKey(keys)
    expect(cryptoStore.unlockVisible).toBe(true)

    vi.mocked(unlockRecovery).mockResolvedValue({ keyId: 'k1', privateKey: key })
    await cryptoStore.submitUnlockKey('recoverytext')

    await expect(pending).resolves.toEqual({ keyId: 'k1', privateKey: key })
    expect(cryptoStore.unlockVisible).toBe(false)
    expect(cryptoStore.unlockError).toBe('')
  })

  it('submitUnlockKey with a wrong key keeps the dialog open and reports an error', async () => {
    await cryptoStore.init(alice)
    const pending = cryptoStore.requestRecoveryKey(makeDesc())
    vi.mocked(unlockRecovery).mockResolvedValue(null)

    await cryptoStore.submitUnlockKey('wrong')

    expect(cryptoStore.unlockError).not.toBe('')
    expect(cryptoStore.unlockVisible).toBe(true)

    cryptoStore.cancelUnlock()
    await expect(pending).resolves.toBeNull()
    expect(cryptoStore.unlockVisible).toBe(false)
  })

  it('proactive unlock installs the recovery key without a pending SDK request', async () => {
    await cryptoStore.init(alice)
    cryptoStore.openUnlock()
    expect(cryptoStore.unlockVisible).toBe(true)

    vi.mocked(installRecoveryKey).mockResolvedValue(true)
    await cryptoStore.submitUnlockKey('recoverytext')

    expect(installRecoveryKey).toHaveBeenCalledWith('recoverytext')
    expect(cryptoStore.unlockVisible).toBe(false)
  })

  it('re-runs autoRestore after a pending unlock succeeds', async () => {
    await cryptoStore.init(alice)
    const match = { keyId: 'k1', privateKey: new Uint8Array(32).fill(1) }
    vi.mocked(unlockRecovery).mockResolvedValue(match)
    vi.mocked(autoRestoreBackup).mockResolvedValue('restored')
    const pending = cryptoStore.requestRecoveryKey(makeDesc())

    await cryptoStore.submitUnlockKey('recoverytext')

    await expect(pending).resolves.toEqual(match)
    expect(autoRestoreBackup).toHaveBeenCalledTimes(1)
  })

  it('re-runs autoRestore after a proactive unlock', async () => {
    await cryptoStore.init(alice)
    cryptoStore.openUnlock()
    vi.mocked(installRecoveryKey).mockResolvedValue(true)
    vi.mocked(autoRestoreBackup).mockResolvedValue('restored')

    await cryptoStore.submitUnlockKey('recoverytext')

    expect(autoRestoreBackup).toHaveBeenCalledTimes(1)
    expect((await db.accounts.get(alice))?.backupRestored).toBe(true)
  })

  it('password prompt resolves the entered password', async () => {
    await cryptoStore.init(alice)
    const pending = cryptoStore.requestPassword()
    expect(cryptoStore.passwordVisible).toBe(true)

    cryptoStore.submitPassword('hunter2')

    await expect(pending).resolves.toBe('hunter2')
    expect(cryptoStore.passwordVisible).toBe(false)
  })

  it('password prompt resolves null on cancel', async () => {
    await cryptoStore.init(alice)
    const pending = cryptoStore.requestPassword()
    cryptoStore.cancelPassword()
    await expect(pending).resolves.toBeNull()
    expect(cryptoStore.passwordVisible).toBe(false)
  })

  describe('autoRestore', () => {
    it('restores and records backupRestored once', async () => {
      vi.mocked(autoRestoreBackup).mockResolvedValue('restored')
      await cryptoStore.init(alice)

      await cryptoStore.autoRestore()

      expect(autoRestoreBackup).toHaveBeenCalledTimes(1)
      expect((await db.accounts.get(alice))?.backupRestored).toBe(true)
    })

    it('does not re-run restore once backupRestored is set', async () => {
      vi.mocked(autoRestoreBackup).mockResolvedValue('restored')
      await cryptoStore.init(alice)
      await cryptoStore.autoRestore()

      await cryptoStore.autoRestore()

      expect(autoRestoreBackup).toHaveBeenCalledTimes(1)
    })

    it('does not record backupRestored when there is no trusted backup', async () => {
      vi.mocked(autoRestoreBackup).mockResolvedValue('no-backup')
      await cryptoStore.init(alice)

      await cryptoStore.autoRestore()

      expect(autoRestoreBackup).toHaveBeenCalledTimes(1)
      expect((await db.accounts.get(alice))?.backupRestored).toBeUndefined()
    })
  })
})