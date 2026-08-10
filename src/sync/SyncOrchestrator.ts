import { db, type EventModel, type RoomModel } from '$storage/db'
import type { BatchedStoreManager } from '$stores/batchedStore.svelte'
import type { EventDto } from '$types/dto'
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
        await this.upsertEvent(roomId, raw)
        dtos.push(this.toDto(roomId, raw))
      }
    }
    this.store.pushEvents(dtos)
  }

  private async upsertRoom(roomId: string, room: SyncJoinedRoom): Promise<void> {
    const timeline = room.timeline?.events ?? []
    const lastEventTs = timeline.length > 0 ? Math.max(...timeline.map((e) => e.origin_server_ts)) : 0
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
    if (raw.txn_id && this.pendingQueue.isActive(raw.txn_id)) {
      await this.pendingQueue.promote(this.userId, roomId, raw.txn_id, raw.event_id, {
        originServerTs: raw.origin_server_ts,
        sender: raw.sender,
        type: raw.type,
        content: raw.content,
        isEncrypted: isEncrypted(raw),
      })
      return
    }

    const model: EventModel = {
      eventId: raw.event_id,
      userId: this.userId,
      roomId,
      originServerTs: raw.origin_server_ts,
      sender: raw.sender,
      type: raw.type,
      content: raw.content,
      syncState: 'synced',
      isEncrypted: isEncrypted(raw),
    }
    await db.events.put(model)
  }

  private toDto(roomId: string, raw: SyncRawEvent): EventDto {
    const body = typeof raw.content.body === 'string' ? raw.content.body : ''
    const formattedBody =
      typeof raw.content.formatted_body === 'string' ? raw.content.formatted_body : undefined
    return {
      id: raw.event_id,
      roomId,
      sender: raw.sender,
      originServerTs: raw.origin_server_ts,
      type: raw.type,
      body,
      formattedBody,
      isEncrypted: isEncrypted(raw),
      syncState: 'synced',
    }
  }
}
