import { db, type EventModel, type RoomModel } from '$storage/db'
import type { BatchedStoreManager } from '$stores/batchedStore.svelte'
import { toEventDto, type EventDto } from '$types/dto'
import type { SyncJoinedRoom, SyncRawEvent, SyncResponse } from './ISyncProvider'
import type { PendingQueueService } from './PendingQueueService'

const isEncrypted = (raw: SyncRawEvent): boolean => raw.type === 'm.room.encrypted'

export class SyncOrchestrator {
  constructor(
    private readonly userId: string,
    private readonly pendingQueue: PendingQueueService,
    private readonly store: BatchedStoreManager,
  ) {}

  async handleSync(sync: SyncResponse): Promise<void> {
    const dtos: EventDto[] = []
    for (const [roomId, room] of Object.entries(sync.rooms.join)) {
      await this.upsertRoom(roomId, room)
      for (const raw of room.timeline?.events ?? []) {
        // C11: one malformed event must not drop the rest of the batch.
        try {
          await this.upsertEvent(roomId, raw)
          // S1: state events live in the DB but never render as blank rows.
          if (raw.type === 'm.room.message' || raw.type === 'm.room.encrypted') {
            dtos.push(this.toDto(roomId, raw))
          }
        } catch (error) {
          console.error(`sync: failed to persist event ${raw.event_id}`, error)
        }
      }
    }
    this.store.pushEvents(dtos)
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

    const model: EventModel = {
      userId: this.userId,
      roomId,
      eventId: raw.event_id,
      originServerTs: raw.origin_server_ts,
      sender: raw.sender,
      type: raw.type,
      content: raw.content,
      txnId,
      syncState: 'synced',
      isEncrypted: isEncrypted(raw),
    }
    await db.events.put(model)
  }

  private toDto(roomId: string, raw: SyncRawEvent): EventDto {
    const txnId = raw.unsigned?.transaction_id ?? (typeof raw.txn_id === 'string' ? raw.txn_id : undefined)
    return toEventDto({
      id: raw.event_id,
      roomId,
      sender: raw.sender,
      originServerTs: raw.origin_server_ts,
      type: raw.type,
      content: raw.content,
      syncState: txnId ? (this.pendingQueue.isActive(txnId) ? 'sending' : 'synced') : 'synced',
      txnId,
      isEncrypted: isEncrypted(raw),
    })
  }
}
