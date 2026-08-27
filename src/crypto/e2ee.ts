import type { MatrixClient } from 'matrix-js-sdk'
import type { SyncRawEvent } from '$sync/ISyncProvider'
import type { BatchedStoreManager } from '$stores/batchedStore.svelte'
import { db } from '$storage/db'
import { toEventDto } from '$types/dto'

export const PERMANENT_UTD = 'Unable to decrypt: keys not found (permanent)'
const UTD_TIMEOUT_MS = 30_000

export interface E2EEHandle {
  isReady(): boolean
  tryDecrypt(raw: SyncRawEvent): { content: Record<string, unknown>; type: string } | null
  initCrypto(userId: string, deviceId: string, _accessToken: string, _homeserver: string): Promise<void>
  /** Awaits the most recent Event.decrypted handler completion. Useful in tests. */
  lastReDecrypt: Promise<void>
  startUtdTimer(eventId: string, roomId: string): void
  cancelUtdTimer(eventId: string): void
  destroy(): void
}

export function createE2EE(client: MatrixClient, store?: BatchedStoreManager): E2EEHandle {
  let ready = false
  let destroyed = false
  let _lastResolve: () => void
  let lastReDecrypt = new Promise<void>((r) => { _lastResolve = r })
  function resolveReDecrypt(): void { _lastResolve(); lastReDecrypt = new Promise<void>((r) => { _lastResolve = r }) }

  let userId = ''
  const utdTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function startUtdTimer(eventId: string, roomId: string): void {
    if (utdTimers.has(eventId)) return
    const timer = setTimeout(async () => {
      utdTimers.delete(eventId)
      const row = await db.events.where('[userId+roomId+eventId]').equals([userId, roomId, eventId]).first().catch(() => undefined) as { decryptionError?: string } | undefined
      // ponytail: only transition if still temporary UTD (not already permanent)
      if (row && row.decryptionError && row.decryptionError !== PERMANENT_UTD) {
        await db.events.where('[userId+roomId+eventId]').equals([userId, roomId, eventId]).modify({ decryptionError: PERMANENT_UTD })
      }
    }, UTD_TIMEOUT_MS)
    utdTimers.set(eventId, timer)
  }

  function cancelUtdTimer(eventId: string): void {
    const timer = utdTimers.get(eventId)
    if (timer) {
      clearTimeout(timer)
      utdTimers.delete(eventId)
    }
  }

  function isReady(): boolean {
    return ready
  }

  function tryDecrypt(_raw: SyncRawEvent): { content: Record<string, unknown>; type: string } | null {
    if (!ready) return null
    // ponytail: mock always returns Unable to decrypt; real impl calls
    // client.crypto.decryptEvent and returns the decrypted content.
    return { content: { body: 'Unable to decrypt' }, type: 'm.room.message' }
  }

  // Re-decryption listener: when keys arrive, the SDK fires Event.decrypted.
  const handleDecrypted = (event: { getId(): string; getRoomId(): string; getContent(): Record<string, unknown>; getType(): string }): void => {
    if (destroyed) return
    const eventId = event.getId()
    const roomId = event.getRoomId()
    if (!eventId || !roomId) return

    cancelUtdTimer(eventId)
    const content = event.getContent()
    const type = event.getType()

    db.events
      .where('[userId+roomId+eventId]')
      .equals([userId, roomId, eventId])
      .first()
      .then(async (row) => {
        if (!row) return
        await db.events.put({
          ...row,
          content,
          type,
          decryptionError: undefined,
        })
        store?.pushEvents([
          toEventDto({
            id: eventId,
            roomId,
            sender: row.sender,
            originServerTs: row.originServerTs,
            type,
            content,
            syncState: row.syncState,
            isEncrypted: true,
            txnId: row.txnId,
          }),
        ])
      })
      .catch((err) => console.error('re-decryption failed', eventId, err))
      .finally(resolveReDecrypt)
  }

  return {
    isReady,
    tryDecrypt,
    get lastReDecrypt() { return lastReDecrypt },
    startUtdTimer,
    cancelUtdTimer,
    async initCrypto(uid: string, deviceId: string, _accessToken: string, _homeserver: string): Promise<void> {
      userId = uid
      const cryptoDatabasePrefix = `matrix-js-sdk:crypto:${uid}:${deviceId}`
      await client.initRustCrypto({ cryptoDatabasePrefix })
      ready = true
      // ponytail: 'Event.decrypted' is a valid Matrix SDK event not in TS types
      client.on('Event.decrypted' as Parameters<typeof client.on>[0], handleDecrypted as never)
    },
    destroy(): void {
      destroyed = true
      for (const timer of utdTimers.values()) clearTimeout(timer)
      utdTimers.clear()
      client.removeListener('Event.decrypted' as Parameters<typeof client.removeListener>[0], handleDecrypted as never)
    },
  }
}
