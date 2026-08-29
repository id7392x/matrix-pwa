import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatrixClient } from 'matrix-js-sdk'
import type { BootstrapCrossSigningOpts, CryptoApi } from 'matrix-js-sdk/lib/crypto-api'
import { encodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key'
import type { AuthDict } from 'matrix-js-sdk/lib/interactive-auth'
import type { SecretStorageKeyDescription } from 'matrix-js-sdk/lib/secret-storage'

import {
  attachSecurity,
  autoRestoreBackup,
  detachSecurity,
  findMatchingKeyId,
  getSecurityState,
  installRecoveryKey,
  makeCryptoCallbacks,
  setPasswordPrompt,
  setSecretStorageKeyPrompt,
  setupRecovery,
  unlockRecovery,
  verifySecretStorageKey,
} from '$crypto/security'

const alice = '@alice:example.org'

function randomKey(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32))
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

/** Builds a SSSS description whose iv/mac match `key`, using the spec algorithm (HKDF -> AES-CTR -> HMAC). */
async function makeKeyDesc(key: Uint8Array<ArrayBuffer>, keyId = 'k1'): Promise<[string, SecretStorageKeyDescription]> {
  const subtle = globalThis.crypto.subtle
  const hkdfKey = await subtle.importKey('raw', key, 'HKDF', false, ['deriveBits'])
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new Uint8Array(0) },
    hkdfKey,
    512,
  )
  const derived = new Uint8Array(bits)
  const iv = new Uint8Array(16)
  const aesKey = await subtle.importKey('raw', derived.slice(0, 32), { name: 'AES-CTR' }, false, ['encrypt'])
  const macKey = await subtle.importKey('raw', derived.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const ct = await subtle.encrypt({ name: 'AES-CTR', counter: iv, length: 128 }, aesKey, new Uint8Array(32))
  const mac = new Uint8Array(await subtle.sign('HMAC', macKey, ct))
  return [
    keyId,
    {
      name: 'default',
      algorithm: 'm.secret_storage.v1.aes-hmac-sha2',
      passphrase: null as never,
      iv: b64(iv),
      mac: b64(mac),
    },
  ]
}

function noCheckDesc(keyId: string): Record<string, SecretStorageKeyDescription> {
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

function mockCrypto(): CryptoApi {
  return {
    createRecoveryKeyFromPassphrase: vi.fn(),
    bootstrapCrossSigning: vi.fn().mockResolvedValue(undefined),
    bootstrapSecretStorage: vi.fn().mockResolvedValue(undefined),
    getCrossSigningStatus: vi.fn().mockResolvedValue({
      publicKeysOnDevice: true,
      privateKeysInSecretStorage: true,
      privateKeysCachedLocally: { masterKey: true, selfSigningKey: true, userSigningKey: true },
    }),
    getSecretStorageStatus: vi.fn().mockResolvedValue({ ready: true, defaultKeyId: 'k1', secretStorageKeyValidityMap: {} }),
    checkKeyBackupAndEnable: vi.fn().mockResolvedValue(null),
    isKeyBackupTrusted: vi.fn().mockResolvedValue({ trusted: true, matchesDecryptionKey: true }),
    loadSessionBackupPrivateKeyFromSecretStorage: vi.fn().mockResolvedValue(undefined),
    restoreKeyBackup: vi.fn().mockResolvedValue({ total: 3, imported: 3 }),
  } as unknown as CryptoApi
}

const backupInfo = { count: 3, etag: 'e1', version: 'v3' } as const

function mockClient(crypto: CryptoApi): MatrixClient {
  return {
    getCrypto: vi.fn().mockReturnValue(crypto),
    getUserId: () => alice,
  } as unknown as MatrixClient
}

describe('security', () => {
  beforeEach(() => {
    detachSecurity()
    setSecretStorageKeyPrompt(null)
    setPasswordPrompt(null)
  })

  afterEach(() => {
    detachSecurity()
  })

  describe('getSecurityState', () => {
    it('reports everything not ready when crypto is not attached', async () => {
      expect(await getSecurityState()).toEqual({
        crossSigningReady: false,
        secretStorageReady: false,
        recoveryKeyInMemory: false,
      })
    })

    it('mirrors the cross-signing and secret storage status', async () => {
      const crypto = mockCrypto()
      crypto.getCrossSigningStatus = vi.fn().mockResolvedValue({
        publicKeysOnDevice: false,
        privateKeysInSecretStorage: false,
        privateKeysCachedLocally: { masterKey: false, selfSigningKey: false, userSigningKey: false },
      })
      crypto.getSecretStorageStatus = vi.fn().mockResolvedValue({ ready: false, defaultKeyId: null, secretStorageKeyValidityMap: {} })

      attachSecurity(mockClient(crypto))

      const state = await getSecurityState()
      expect(state.crossSigningReady).toBe(false)
      expect(state.secretStorageReady).toBe(false)
    })
  })

  describe('verifySecretStorageKey', () => {
    it('accepts the correct recovery key for a description', async () => {
      const key = randomKey()
      const [, desc] = await makeKeyDesc(key)
      expect(await verifySecretStorageKey(key, desc.iv, desc.mac)).toBe(true)
    })

    it('rejects a wrong recovery key', async () => {
      const key = randomKey()
      const [, desc] = await makeKeyDesc(key)
      const other = randomKey()
      expect(await verifySecretStorageKey(other, desc.iv, desc.mac)).toBe(false)
    })

    it('rejects a malformed MAC', async () => {
      const key = randomKey()
      const [, desc] = await makeKeyDesc(key)
      expect(await verifySecretStorageKey(key, 'not-base64!!', desc.mac)).toBe(false)
    })
  })

  describe('findMatchingKeyId', () => {
    it('picks the key id whose description matches the key', async () => {
      const key = randomKey()
      const [, defaultDesc] = await makeKeyDesc(key, 'default')
      const [, otherDesc] = await makeKeyDesc(randomKey(), 'other')
      const keys = { other: otherDesc, default: defaultDesc }
      expect(await findMatchingKeyId(key, keys)).toBe('default')
    })

    it('returns null when no key matches', async () => {
      const [keyId, desc] = await makeKeyDesc(randomKey())
      const keys = { [keyId]: desc }
      const other = await crypto.subtle.digest('SHA-256', randomKey()) as ArrayBuffer
      expect(await findMatchingKeyId(new Uint8Array(other), keys)).toBeNull()
    })

    it('assumes a description without iv/mac is valid and returns its key id', async () => {
      const keys = noCheckDesc('nokey')
      expect(await findMatchingKeyId(randomKey(), keys)).toBe('nokey')
    })
  })

  describe('setupRecovery', () => {
    it('bootstraps cross-signing before secret storage and returns the encoded key', async () => {
      const crypto = mockCrypto()
      const order: string[] = []
      crypto.createRecoveryKeyFromPassphrase = vi.fn().mockResolvedValue({
        privateKey: randomKey(),
        encodedPrivateKey: 'rec-key-abc',
      })
      crypto.bootstrapCrossSigning = vi.fn().mockImplementation(async () => { order.push('cross') })
      crypto.bootstrapSecretStorage = vi.fn().mockImplementation(async () => { order.push('sss') })

      attachSecurity(mockClient(crypto))

      const encoded = await setupRecovery()

      expect(encoded).toBe('rec-key-abc')
      expect(order).toEqual(['cross', 'sss'])
      // setupRecovery must force a clean reset so it never reads broken 4S secrets
      // (secretStorage.get() throws "Content is not encrypted!" on plaintext entries).
      expect(crypto.bootstrapCrossSigning).toHaveBeenCalledWith(
        expect.objectContaining({ setupNewCrossSigning: true }),
      )
      expect(crypto.bootstrapSecretStorage).toHaveBeenCalledWith(
        expect.objectContaining({ setupNewKeyBackup: true, setupNewSecretStorage: true }),
      )
    })

    it('resolves UIA by prompting for the account password', async () => {
      const crypto = mockCrypto()
      let authSent: AuthDict | null = null
      crypto.createRecoveryKeyFromPassphrase = vi.fn().mockResolvedValue({ privateKey: randomKey(), encodedPrivateKey: 'rec-key-abc' })
      crypto.bootstrapCrossSigning = vi.fn().mockImplementation(async (opts: BootstrapCrossSigningOpts) => {
        await opts.authUploadDeviceSigningKeys?.(async (auth) => {
          if (auth === null) throw new Error('UIA required')
          authSent = auth
          return undefined
        })
      })
      setPasswordPrompt(async () => 'hunter2')
      attachSecurity(mockClient(crypto))

      await setupRecovery()

      expect(authSent).toMatchObject({
        type: 'm.login.password',
        password: 'hunter2',
        identifier: { type: 'm.id.user', user: alice },
      })
    })

    it('fails when the user aborts the password prompt', async () => {
      const crypto = mockCrypto()
      crypto.createRecoveryKeyFromPassphrase = vi.fn().mockResolvedValue({ privateKey: randomKey(), encodedPrivateKey: 'rec-key-abc' })
      crypto.bootstrapCrossSigning = vi.fn().mockImplementation(async (opts: BootstrapCrossSigningOpts) => {
        await opts.authUploadDeviceSigningKeys?.(async (auth) => {
          if (auth === null) throw new Error('UIA required')
          return undefined
        })
      })
      setPasswordPrompt(async () => null)
      attachSecurity(mockClient(crypto))

      await expect(setupRecovery()).rejects.toThrow()
    })
  })

  describe('installRecoveryKey / unlockRecovery', () => {
    it('installRecoveryKey caches a well-formed recovery key even without known key ids', async () => {
      attachSecurity(mockClient(mockCrypto()))
      const key = randomKey()
      const encoded = encodeRecoveryKey(key)
      expect(encoded).toBeDefined()

      expect(await installRecoveryKey(encoded!)).toBe(true)
      expect((await getSecurityState()).recoveryKeyInMemory).toBe(true)
    })

    it('installRecoveryKey rejects a corrupt recovery key string', async () => {
      attachSecurity(mockClient(mockCrypto()))
      expect(await installRecoveryKey('this-is-not-a-recovery-key')).toBe(false)
    })

    it('unlockRecovery decodes, matches a requested key id and caches it in memory', async () => {
      attachSecurity(mockClient(mockCrypto()))
      const key = randomKey()
      const [keyId, desc] = await makeKeyDesc(key)
      const encoded = encodeRecoveryKey(key)!

      const match = await unlockRecovery(encoded, { [keyId]: desc })

      expect(match).toEqual({ keyId, privateKey: key })
      expect((await getSecurityState()).recoveryKeyInMemory).toBe(true)
    })

    it('unlockRecovery returns null when the key does not match any requested key', async () => {
      attachSecurity(mockClient(mockCrypto()))
      const key = randomKey()
      const [keyId, desc] = await makeKeyDesc(key)
      const other = randomKey()

      expect(await unlockRecovery(encodeRecoveryKey(other)!, { [keyId]: desc })).toBeNull()
    })

    it('unlockRecovery returns null for garbage input', async () => {
      attachSecurity(mockClient(mockCrypto()))
      expect(await unlockRecovery('obviously broken', {})).toBeNull()
    })
  })

  describe('autoRestoreBackup', () => {
    it('returns no-backup when crypto is not attached', async () => {
      expect(await autoRestoreBackup()).toBe('no-backup')
    })

    it('returns no-backup when there is no server backup', async () => {
      const crypto = mockCrypto()
      crypto.checkKeyBackupAndEnable = vi.fn().mockResolvedValue(null)
      attachSecurity(mockClient(crypto))

      expect(await autoRestoreBackup()).toBe('no-backup')
      expect(crypto.restoreKeyBackup).not.toHaveBeenCalled()
    })

    it('restores without re-loading when the backup is already trusted and the key matches', async () => {
      const crypto = mockCrypto()
      crypto.checkKeyBackupAndEnable = vi.fn().mockResolvedValue({ backupInfo, trustInfo: { trusted: true, matchesDecryptionKey: true } })
      attachSecurity(mockClient(crypto))

      expect(await autoRestoreBackup()).toBe('restored')
      expect(crypto.loadSessionBackupPrivateKeyFromSecretStorage).not.toHaveBeenCalled()
      expect(crypto.restoreKeyBackup).toHaveBeenCalledTimes(1)
    })

    it('loads the backup decryption key from 4S and restores when the backup is untrusted', async () => {
      const crypto = mockCrypto()
      const checkKeyBackupAndEnable = vi.fn()
        .mockResolvedValueOnce({ backupInfo, trustInfo: { trusted: false, matchesDecryptionKey: false } })
        .mockResolvedValueOnce({ backupInfo, trustInfo: { trusted: false, matchesDecryptionKey: true } })
      crypto.checkKeyBackupAndEnable = checkKeyBackupAndEnable
      attachSecurity(mockClient(crypto))

      expect(await autoRestoreBackup()).toBe('restored')
      expect(crypto.loadSessionBackupPrivateKeyFromSecretStorage).toHaveBeenCalledTimes(1)
      expect(crypto.restoreKeyBackup).toHaveBeenCalledTimes(1)
    })

    it('loads the key from 4S when the signature is trusted but the key is not stored yet', async () => {
      const crypto = mockCrypto()
      const checkKeyBackupAndEnable = vi.fn()
        .mockResolvedValueOnce({ backupInfo, trustInfo: { trusted: true, matchesDecryptionKey: false } })
        .mockResolvedValueOnce({ backupInfo, trustInfo: { trusted: true, matchesDecryptionKey: true } })
      crypto.checkKeyBackupAndEnable = checkKeyBackupAndEnable
      attachSecurity(mockClient(crypto))

      expect(await autoRestoreBackup()).toBe('restored')
      expect(crypto.loadSessionBackupPrivateKeyFromSecretStorage).toHaveBeenCalledTimes(1)
      expect(crypto.restoreKeyBackup).toHaveBeenCalledTimes(1)
    })

    it('returns untrusted when the backup never becomes usable', async () => {
      const crypto = mockCrypto()
      const checkKeyBackupAndEnable = vi.fn()
        .mockResolvedValueOnce({ backupInfo, trustInfo: { trusted: false, matchesDecryptionKey: false } })
        .mockResolvedValueOnce({ backupInfo, trustInfo: { trusted: false, matchesDecryptionKey: false } })
      crypto.checkKeyBackupAndEnable = checkKeyBackupAndEnable
      attachSecurity(mockClient(crypto))

      expect(await autoRestoreBackup()).toBe('untrusted')
      expect(crypto.loadSessionBackupPrivateKeyFromSecretStorage).toHaveBeenCalledTimes(1)
      expect(crypto.restoreKeyBackup).not.toHaveBeenCalled()
    })

    it('returns failed when loading the backup private key throws', async () => {
      const crypto = mockCrypto()
      crypto.checkKeyBackupAndEnable = vi.fn().mockResolvedValue({ backupInfo, trustInfo: { trusted: false, matchesDecryptionKey: false } })
      crypto.loadSessionBackupPrivateKeyFromSecretStorage = vi.fn().mockRejectedValue(new Error('no 4s key'))
      attachSecurity(mockClient(crypto))

      expect(await autoRestoreBackup()).toBe('failed')
      expect(crypto.restoreKeyBackup).not.toHaveBeenCalled()
    })

    it('returns failed when restoring throws', async () => {
      const crypto = mockCrypto()
      const checkKeyBackupAndEnable = vi.fn()
        .mockResolvedValueOnce({ backupInfo, trustInfo: { trusted: false, matchesDecryptionKey: false } })
        .mockResolvedValueOnce({ backupInfo, trustInfo: { trusted: false, matchesDecryptionKey: true } })
      crypto.checkKeyBackupAndEnable = checkKeyBackupAndEnable
      crypto.restoreKeyBackup = vi.fn().mockRejectedValue(new Error('restore failed'))
      attachSecurity(mockClient(crypto))

      expect(await autoRestoreBackup()).toBe('failed')
    })
  })

  describe('makeCryptoCallbacks', () => {
    it('getSecretStorageKey returns the cached key without prompting', async () => {
      const crypto = mockCrypto()
      attachSecurity(mockClient(crypto))
      const callbacks = makeCryptoCallbacks()
      const key = randomKey()
      const [keyId, desc] = await makeKeyDesc(key)
      const prompt = vi.fn()
      setSecretStorageKeyPrompt(prompt)

      callbacks.cacheSecretStorageKey?.(keyId, desc, key)
      const result = await callbacks.getSecretStorageKey?.({ keys: { [keyId]: desc } }, 'm.secret')

      expect(result).toEqual([keyId, key])
      expect(prompt).not.toHaveBeenCalled()
    })

    it('getSecretStorageKey uses the provisional key when it matches the requested keys', async () => {
      const crypto = mockCrypto()
      attachSecurity(mockClient(crypto))
      const callbacks = makeCryptoCallbacks()
      const key = randomKey()
      const [keyId, desc] = await makeKeyDesc(key)
      const prompt = vi.fn()
      setSecretStorageKeyPrompt(prompt)
      expect(await installRecoveryKey(encodeRecoveryKey(key)!)).toBe(true)

      const result = await callbacks.getSecretStorageKey?.({ keys: { [keyId]: desc } }, 'm.secret')

      expect(result).toEqual([keyId, key])
      expect(prompt).not.toHaveBeenCalled()
    })

    it('getSecretStorageKey prompts when no key is known', async () => {
      attachSecurity(mockClient(mockCrypto()))
      const callbacks = makeCryptoCallbacks()
      const key = randomKey()
      const [keyId, desc] = await makeKeyDesc(key)
      setSecretStorageKeyPrompt(async (keys) => ({ keyId: Object.keys(keys)[0], privateKey: key }))

      const result = await callbacks.getSecretStorageKey?.({ keys: { [keyId]: desc } }, 'm.secret')

      expect(result).toEqual([keyId, key])
    })

    it('getSecretStorageKey returns null when there is no prompt provider', async () => {
      attachSecurity(mockClient(mockCrypto()))
      const callbacks = makeCryptoCallbacks()
      const [keyId, desc] = await makeKeyDesc(randomKey())

      expect(await callbacks.getSecretStorageKey?.({ keys: { [keyId]: desc } }, 'm.secret')).toBeNull()
    })
  })
})