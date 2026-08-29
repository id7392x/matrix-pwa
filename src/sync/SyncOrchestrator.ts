import Dexie from 'dexie'
import { db, type EventModel, type RoomModel } from '$storage/db'
import type { BatchedStoreManager } from '$stores/batchedStore.svelte'
import { toEventDto, type EventDto } from '$types/dto'
import type { E2EEHandle } from '$crypto/e2ee'
import type { SyncJoinedRoom, SyncRawEvent, SyncResponse } from './ISyncProvider'
import type { PendingQueueService } from './PendingQueueService'

const isEncrypted = (raw: SyncRawEvent): boolean => raw.type === 'm.room.encrypted'

const UTD_ERROR = 'Unable to decrypt: keys not found'

export class SyncOrchestrator {
  constructor(
    private readonly userId: string,
    private readonly pendingQueue: PendingQueueService,
    private readonly store: BatchedStoreManager,
    private readonly e2ee?: E2EEHandle,
  ) {}

  async handleSync(sync: SyncResponse): Promise<void> {
    const dtos: EventDto[] = []
    for (const [roomId, room] of Object.entries(sync.rooms.join)) {
      await this.upsertRoom(roomId, room)
      for (const raw of room.timeline?.events ?? []) {
        try {
          await this.upsertEvent(roomId, raw)
          if (raw.type === 'm.room.message') {
            dtos.push(this.toDto(roomId, raw))
          } else if (raw.type === 'm.room.encrypted') {
            const decrypted = this.e2ee?.tryDecrypt(raw)
            if (decrypted) {
              dtos.push(this.toDto(roomId, raw, {
                type: decrypted.type,
                syncState: 'synced',
              }, decrypted.content))
            } else {
              dtos.push(this.toDto(roomId, raw, {
                type: raw.type,
                syncState: 'synced',
                decryptionError: UTD_ERROR,
              }, {}))
            }
          }
        } catch (error) {
          console.error(`sync: failed to persist event ${raw.event_id}`, error)
        }
      }
    }
    // Rooms the user left/forgot elsewhere are dropped locally along with their events.
    for (const roomId of Object.keys(sync.rooms.leave ?? {})) {
      await this.removeRoom(roomId)
    }
    this.store.pushEvents(dtos)
  }

  private async removeRoom(roomId: string): Promise<void> {
    await db.events
      .where('[userId+roomId+eventId]')
      .between([this.userId, roomId, Dexie.minKey], [this.userId, roomId, Dexie.maxKey])
      .delete()
    await db.rooms.delete(`${this.userId}:${roomId}`)
  }

  private async upsertRoom(roomId: string, room: SyncJoinedRoom): Promise<void> {
    const timeline = room.timeline?.events ?? []
    const computed = timeline.length > 0 ? Math.max(...timeline.map((e) => e.origin_server_ts)) : 0
    // C8: an empty (or ts-less) timeline must not clobber the stored last event time.
    const existing = await db.rooms.get(`${this.userId}:${roomId}`)
    const lastEventTs = Math.max(computed, existing?.lastEventTs ?? 0)
    const model: RoomModel = {
      userAndRoomId: `${this.userId}:${roomId}`,
      userId: this.userId,
      roomId,
      membership: 'join',
      isDirect: room.isDirect ?? false,
      unreadCount: room.unread_notifications?.notification_count ?? 0,
      highlightCount: room.unread_notifications?.highlight_count ?? 0,
      lastEventTs,
      name: room.name ?? roomId,
    }
    await db.rooms.put(model)
  }

  private async upsertEvent(roomId: string, raw: SyncRawEvent): Promise<void> {
    const txnId = raw.unsigned?.transaction_id ?? (typeof raw.txn_id === 'string' ? raw.txn_id : undefined)
    // C4: always promote when a txnId is present, regardless of queue activity, so a
    // stale/restored pending row can never orphan (promote is idempotent).
    if (txnId) {
      await this.pendingQueue.promote(this.userId, roomId, txnId, raw.event_id, {
        originServerTs: raw.origin_server_ts,
        sender: raw.sender,
        type: raw.type,
        content: raw.content,
        isEncrypted: isEncrypted(raw),
      })
      return
    }

    // If encrypted and not yet decrypted, mark as UTD in DB (survives reload).
    const encrypted = isEncrypted(raw)
    const decrypted = encrypted ? this.e2ee?.tryDecrypt(raw) : null

    const model: EventModel = {
      userId: this.userId,
      roomId,
      eventId: raw.event_id,
      originServerTs: raw.origin_server_ts,
      sender: raw.sender,
      type: decrypted ? decrypted.type : raw.type,
      content: decrypted ? decrypted.content : raw.content,
      txnId,
      syncState: 'synced',
      isEncrypted: encrypted,
      decryptionError: encrypted && !decrypted ? UTD_ERROR : undefined,
    }
    await db.events.put(model)

    if (encrypted && !decrypted) {
      this.e2ee?.startUtdTimer(raw.event_id, roomId)
    }
  }

  private toDto(roomId: string, raw: SyncRawEvent, overrides: Partial<EventDto> = {}, content?: Record<string, unknown>): EventDto {
    const txnId = raw.unsigned?.transaction_id ?? (typeof raw.txn_id === 'string' ? raw.txn_id : undefined)
    return toEventDto({
      id: raw.event_id,
      roomId,
      sender: raw.sender,
      originServerTs: raw.origin_server_ts,
      type: raw.type,
      content: content ?? raw.content,
      syncState: txnId ? (this.pendingQueue.isActive(txnId) ? 'sending' : 'synced') : 'synced',
      txnId,
      isEncrypted: isEncrypted(raw),
      ...overrides,
    })
  }
}
