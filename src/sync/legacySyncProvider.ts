import {
  ClientEvent,
  EventTimeline,
  EventType,
  KnownMembership,
  NotificationCountType,
  type MatrixClient,
  type MatrixEvent,
  type Room,
  type SyncState,
  type SyncStateData,
} from 'matrix-js-sdk'

import type { ISyncProvider, SyncJoinedRoom, SyncListener, SyncRawEvent, SyncResponse } from './ISyncProvider'

export function toSyncRawEvent(event: MatrixEvent): SyncRawEvent {
  return {
    event_id: event.getId() ?? '',
    origin_server_ts: event.getTs(),
    sender: event.getSender() ?? '',
    type: event.getType(),
    content: event.getContent(),
    txn_id: event.getTxnId(),
  }
}

export function toSyncJoinedRoom(room: Room, isDirect = false): SyncJoinedRoom {
  const timeline = room.getLiveTimeline()
  return {
    name: room.name || room.roomId,
    isDirect,
    unread_notifications: {
      notification_count: room.getUnreadNotificationCount(NotificationCountType.Total),
      highlight_count: room.getUnreadNotificationCount(NotificationCountType.Highlight),
    },
    timeline: {
      prev_batch: timeline.getPaginationToken(EventTimeline.BACKWARDS) ?? '',
      events: timeline.getEvents().map(toSyncRawEvent),
    },
  }
}

function directRoomIds(client: MatrixClient): Set<string> {
  const accountData = client.getAccountData(EventType.Direct)
  if (!accountData) return new Set()
  const ids = new Set<string>()
  for (const rooms of Object.values(accountData.getContent())) {
    for (const roomId of rooms) {
      ids.add(roomId)
    }
  }
  return ids
}

export class LegacySyncProvider implements ISyncProvider {
  private readonly listeners: SyncListener[] = []

  constructor(private readonly client: MatrixClient) {}

  onSync(listener: SyncListener): void {
    this.listeners.push(listener)
  }

  async start(): Promise<void> {
    this.client.on(ClientEvent.Sync, this.handleSync)
    await this.client.startClient()
  }

  stop(): void {
    this.client.removeListener(ClientEvent.Sync, this.handleSync)
    this.client.stopClient()
  }

  private readonly handleSync = (
    _state: SyncState,
    _prevState: SyncState | null,
    data?: SyncStateData,
  ): void => {
    if (!data?.nextSyncToken) return

    const directRooms = directRoomIds(this.client)
    const join: Record<string, SyncJoinedRoom> = {}
    for (const room of this.client.getRooms()) {
      if (room.getMyMembership() !== KnownMembership.Join) continue
      join[room.roomId] = toSyncJoinedRoom(room, directRooms.has(room.roomId))
    }

    const sync: SyncResponse = { next_batch: data.nextSyncToken, rooms: { join } }
    for (const listener of this.listeners) {
      void Promise.resolve(listener(sync)).catch((error) =>
        console.error('legacy sync handler failed', error),
      )
    }
  }
}