import type { MatrixClient } from 'matrix-js-sdk'
import type { CryptoApi, CryptoCallbacks, GeneratedSecretStorageKey } from 'matrix-js-sdk/lib/crypto-api'
import { decodeRecoveryKey } from 'matrix-js-sdk/lib/crypto-api/recovery-key'
import type { AuthDict, UIAuthCallback } from 'matrix-js-sdk/lib/interactive-auth'
import type { SecretStorageKeyDescription } from 'matrix-js-sdk/lib/secret-storage'

export interface SecurityState {
  crossSigningReady: boolean
  secretStorageReady: boolean
  recoveryKeyInMemory: boolean
}

export interface RecoveryKeyMatch {
  keyId: string
  privateKey: Uint8Array<ArrayBuffer>
}

export type KeyPrompt = (keys: Record<string, SecretStorageKeyDescription>) => Promise<RecoveryKeyMatch | null>
export type PasswordPrompt = () => Promise<string | null>

let client: MatrixClient | null = null
let crypto: CryptoApi | null = null
let cachedKey: RecoveryKeyMatch | null = null
let provisionalKey: Uint8Array<ArrayBuffer> | null = null
let keyPrompt: KeyPrompt | null = null
let passwordPrompt: PasswordPrompt | null = null

export function attachSecurity(c: MatrixClient): void {
  client = c
  crypto = c.getCrypto() ?? null
}

export function detachSecurity(): void {
  client = null
  crypto = null
  cachedKey = null
  provisionalKey = null
}

export function setSecretStorageKeyPrompt(fn: KeyPrompt | null): void {
  keyPrompt = fn
}

export function setPasswordPrompt(fn: PasswordPrompt | null): void {
  passwordPrompt = fn
}

export async function getSecurityState(): Promise<SecurityState> {
  if (!crypto) {
    return { crossSigningReady: false, secretStorageReady: false, recoveryKeyInMemory: false }
  }
  const [cs, ss] = await Promise.all([
    crypto.getCrossSigningStatus().catch(() => null),
    crypto.getSecretStorageStatus().catch(() => null),
  ])
  return {
    crossSigningReady: cs ? cs.publicKeysOnDevice && cs.privateKeysInSecretStorage : false,
    secretStorageReady: ss?.ready ?? false,
    recoveryKeyInMemory: cachedKey !== null || provisionalKey !== null,
  }
}

/** Creates new cross-signing + secret storage + key backup and returns the recovery key for display. */
export async function setupRecovery(): Promise<string> {
  if (!crypto) throw new Error('crypto unavailable')
  const generated: GeneratedSecretStorageKey = await crypto.createRecoveryKeyFromPassphrase()
  const encoded = generated.encodedPrivateKey
  if (!encoded) throw new Error('recovery key encoding failed')

  await crypto.bootstrapCrossSigning({
    authUploadDeviceSigningKeys: makeUploadDeviceSigningKeys(),
    setupNewCrossSigning: true,
  })
  await crypto.bootstrapSecretStorage({
    createSecretStorageKey: async () => generated,
    setupNewKeyBackup: true,
    setupNewSecretStorage: true,
  })
  return encoded
}

/**
 * Detects the server-side key backup, and if it is trusted, loads its decryption
 * key from 4S secret storage and restores all room keys into the local crypto store.
 * Old (pre-login) encrypted history then re-decrypts via `Event.decrypted`.
 * Never throws: cold-start must not break because a restore failed.
 */
export type RestoreStatus = 'restored' | 'no-backup' | 'untrusted' | 'failed'

export async function autoRestoreBackup(): Promise<RestoreStatus> {
  if (!crypto) return 'no-backup'
  try {
    let check = await crypto.checkKeyBackupAndEnable()
    if (!check) return 'no-backup'
    if (!check.trustInfo.trusted || !check.trustInfo.matchesDecryptionKey) {
      // A fresh device can't prove signature trust and has no backup decryption key yet.
      // Load it from 4S (uses a cached/provisional recovery key, otherwise prompts via
      // the recovery-key dialog); with it the backup becomes usable (matchesDecryptionKey).
      await crypto.loadSessionBackupPrivateKeyFromSecretStorage()
      check = await crypto.checkKeyBackupAndEnable()
      if (!check || !check.trustInfo.matchesDecryptionKey) return 'untrusted'
    }
    // `restoreKeyBackup` reads the decryption key saved above from the crypto store.
    await crypto.restoreKeyBackup({ progressCallback: () => {} })
    return 'restored'
  } catch {
    return 'failed'
  }
}

function makeUploadDeviceSigningKeys(): UIAuthCallback<void> {
  return async (makeRequest) => {
    try {
      await makeRequest(null)
      return
    } catch (error) {
      // UIA required: retry once with m.login.password. Password is never stored or logged.
      if (!passwordPrompt || !client) throw error
      const password = await passwordPrompt()
      if (!password) throw error
      const auth: AuthDict = {
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: client.getUserId() ?? '' },
        password,
      }
      await makeRequest(auth)
    }
  }
}

/** Whether this device is cross-signed, i.e. the current session is verified. */
export async function getDeviceVerified(): Promise<boolean> {
  if (!crypto || !client) return false
  try {
    const status = await crypto.getDeviceVerificationStatus(client.getUserId() ?? '', client.getDeviceId() ?? '')
    return status?.crossSigningVerified ?? false
  } catch {
    return false
  }
}

/**
 * Adopts the account's existing cross-signing keys from 4S so this device gets
 * signed by its own self-signing key (session verification after unlock).
 */
export async function adoptCrossSigning(): Promise<void> {
  if (!crypto) return
  try {
    await crypto.bootstrapCrossSigning({ authUploadDeviceSigningKeys: makeUploadDeviceSigningKeys() })
  } catch {
    // Keys missing / server hiccup: verification surfaces on the next status refresh.
  }
}

/** Caches a well-formed recovery key for later use, without knowing its key id yet. */
export async function installRecoveryKey(recoveryKey: string): Promise<boolean> {
  try {
    provisionalKey = decodeRecoveryKey(recoveryKey)
    cachedKey = null
    return true
  } catch {
    return false
  }
}

/** Decodes a recovery key, matches it to one of the requested keys and caches it in memory. */
export async function unlockRecovery(
  recoveryKey: string,
  keys: Record<string, SecretStorageKeyDescription>,
): Promise<RecoveryKeyMatch | null> {
  let key: Uint8Array<ArrayBuffer>
  try {
    key = decodeRecoveryKey(recoveryKey)
  } catch {
    return null
  }
  const keyId = await findMatchingKeyId(key, keys)
  if (!keyId) return null
  const match: RecoveryKeyMatch = { keyId, privateKey: key }
  cachedKey = match
  return match
}

export function makeCryptoCallbacks(): CryptoCallbacks {
  return {
    cacheSecretStorageKey: (keyId, _keyInfo, key) => {
      cachedKey = { keyId, privateKey: key }
    },
    getSecretStorageKey: async ({ keys }) => {
      const cached = cachedKey && keys[cachedKey.keyId] ? cachedKey : null
      if (cached) return [cached.keyId, cached.privateKey]

      if (provisionalKey) {
        const keyId = await findMatchingKeyId(provisionalKey, keys)
        if (keyId) {
          cachedKey = { keyId, privateKey: provisionalKey }
          return [keyId, provisionalKey]
        }
      }

      if (!keyPrompt) return null
      const match = await keyPrompt(keys)
      if (match) cachedKey = match
      return match ? [match.keyId, match.privateKey] : null
    },
  }
}

/** Returns the key id whose iv/mac validation check matches `key`, or the only key without a check. */
export async function findMatchingKeyId(
  key: Uint8Array<ArrayBuffer>,
  keys: Record<string, SecretStorageKeyDescription>,
): Promise<string | null> {
  for (const [keyId, desc] of Object.entries(keys)) {
    if (!desc.iv || !desc.mac) return keyId // spec: no validation check ⇒ assume valid
    if (await verifySecretStorageKey(key, desc.iv, desc.mac)) return keyId
  }
  return null
}

/**
 * SSSS validation check (spec §m.secret_storage.v1.aes-hmac-sha2):
 * encrypt 32 zero bytes with the key and compare the HMAC against the stored mac.
 */
export async function verifySecretStorageKey(key: Uint8Array<ArrayBuffer>, iv: string, mac: string): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return false
  let ivBytes: Uint8Array<ArrayBuffer>
  try {
    ivBytes = base64ToBytes(iv)
  } catch {
    return false
  }
  const derived = await deriveKeyMaterial(subtle, key)
  const ciphertext = await subtle.encrypt({ name: 'AES-CTR', counter: ivBytes, length: 128 }, derived.aesKey, new Uint8Array(32))
  const actual = new Uint8Array(await subtle.sign('HMAC', derived.macKey, ciphertext))
  let expected: Uint8Array<ArrayBuffer>
  try {
    expected = base64ToBytes(mac)
  } catch {
    return false
  }
  return bytesEqual(actual, expected)
}

async function deriveKeyMaterial(
  subtle: SubtleCrypto,
  key: Uint8Array<ArrayBuffer>,
): Promise<{ aesKey: CryptoKey; macKey: CryptoKey }> {
  // HKDF-SHA-256 with 32 zero-byte salt and empty info → 64 bytes: AES key + MAC key
  const hkdfKey = await subtle.importKey('raw', key, 'HKDF', false, ['deriveBits'])
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new Uint8Array(0) },
    hkdfKey,
    512,
  )
  const derived = new Uint8Array(bits)
  const aesKey = await subtle.importKey('raw', derived.slice(0, 32), { name: 'AES-CTR' }, false, ['encrypt'])
  const macKey = await subtle.importKey('raw', derived.slice(32, 64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return { aesKey, macKey }
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const padded = b64.length % 4 === 0 ? b64 : b64 + '='.repeat(4 - (b64.length % 4))
  const decoded = atob(padded)
  const bytes = new Uint8Array(decoded.length)
  for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i)
  return bytes
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}