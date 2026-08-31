import {
  ClientEvent,
  EventTimeline,
  EventType,
  KnownMembership,
  NotificationCountType,
  SyncState,
  type MatrixClient,
  type MatrixEvent,
  type Room,
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
    txn_id: event.getTxnId() ?? event.getUnsigned().transaction_id,
  }
}

const ENCRYPTED_PREVIEW = 'Encrypted message'

/** Preview of the newest message-like event in the timeline. */
function lastMessageOf(events: MatrixEvent[]): string | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const type = events[i].getType()
    if (type === 'm.room.encrypted') return ENCRYPTED_PREVIEW
    if (type !== 'm.room.message') continue
    const body = events[i].getContent().body
    if (typeof body === 'string' && body.trim()) return body
  }
  return undefined
}

export function toSyncJoinedRoom(room: Room, isDirect = false, baseUrl?: string): SyncJoinedRoom {
  const timeline = room.getLiveTimeline()
  const others = room
    .getJoinedMembers()
    .map((m) => m.userId)
    .filter((userId) => userId !== room.myUserId)
  const joined: SyncJoinedRoom = {
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
  if (others.length === 1) joined.dmPartner = others[0]
  if (baseUrl) {
    joined.avatarUrl = room.getAvatarUrl(baseUrl, 112, 112, 'crop', false) ?? undefined
    // DMs usually have no room avatar — fall back to the partner's profile picture.
    if (!joined.avatarUrl && joined.dmPartner) {
      const partner = room.getMember(joined.dmPartner)
      joined.avatarUrl = partner?.getAvatarUrl(baseUrl, 112, 112, 'crop', false, false) ?? undefined
    }
  }
  joined.lastMessage = lastMessageOf(timeline.getEvents())
  return joined
}

function directRoomIds(client: MatrixClient): Set<string> {
  const accountData = client.getAccountData(EventType.Direct)
  if (!accountData) return new Set()
  const ids = new Set<string>()
  for (const rooms of Object.values(accountData.getContent())) {
    if (!Array.isArray(rooms)) continue
    for (const roomId of rooms) {
      if (typeof roomId === 'string') ids.add(roomId)
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
    state: SyncState,
    _prevState: SyncState | null,
    data?: SyncStateData,
  ): void => {
    if (!data?.nextSyncToken) return
    if (state !== SyncState.Syncing) return

    const directRooms = directRoomIds(this.client)
    const join: Record<string, SyncJoinedRoom> = {}
    const leave: Record<string, unknown> = {}
    for (const room of this.client.getRooms()) {
      if (room.getMyMembership() === KnownMembership.Join) {
        join[room.roomId] = toSyncJoinedRoom(room, directRooms.has(room.roomId), this.client.baseUrl)
      } else if (room.getMyMembership() === KnownMembership.Leave) {
        leave[room.roomId] = {}
      }
    }

    const sync: SyncResponse = { next_batch: data.nextSyncToken, rooms: { join, leave } }
    for (const listener of this.listeners) {
      void Promise.resolve(listener(sync)).catch((error) =>
        console.error('legacy sync handler failed', error),
      )
    }
  }
}