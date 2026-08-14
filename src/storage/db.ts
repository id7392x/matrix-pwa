import Dexie, { type EntityTable, type Table } from 'dexie'

import type { SyncState } from '$types/dto'

export type PendingStatus = 'pending' | 'sending' | 'failed'

export interface AccountModel {
  userId: string // PK
  homeserver: string
  deviceId: string
  isPrimary: boolean
  lastSyncToken?: string
  refreshToken?: string // единственный токен в БД (Principles §3.2.1.1)
  // accessToken ЗАПРЕЩЕНО хранить в этой модели (только RAM/sessionStorage)
}

export interface RoomModel {
  userAndRoomId: string // PK: `${userId}:${roomId}`
  userId: string
  roomId: string
  membership: 'join' | 'invite' | 'leave' | 'ban'
  isDirect: boolean
  unreadCount: number
  highlightCount: number
  lastEventTs: number
  name?: string
  avatarUrl?: string
  summaryDto?: string
}

export interface EventModel {
  eventId: string
  userId: string
  roomId: string
  originServerTs: number
  sender: string
  type: string
  content: Record<string, unknown> // Расшифрованный / подготовленный content
  txnId?: string
  syncState: SyncState
  isEncrypted: boolean
  decryptionError?: string
  prevBatchToken?: string
  isGapBlock?: boolean
}

export interface PendingEventModel {
  userAndTxnId: string // PK: `${userId}:${txnId}`
  txnId: string
  userId: string
  roomId: string
  content: Record<string, unknown>
  status: PendingStatus
  createdAt: number
  retryCount: number
  errorText?: string
}

export interface TimelineGapModel {
  gapId: string // PK: `${userId}:${roomId}:${eventId}`
  userId: string
  roomId: string
  eventId: string
  prevBatchToken: string
  createdAt: number
}

export class AppDatabase extends Dexie {
  accounts!: EntityTable<AccountModel, 'userId'>
  rooms!: EntityTable<RoomModel, 'userAndRoomId'>
  events!: Table<EventModel, [string, string, string]>
  pendingEvents!: EntityTable<PendingEventModel, 'userAndTxnId'>
  timelineGaps!: EntityTable<TimelineGapModel, 'gapId'>

  constructor() {
    super('MatrixClientDB')

    // Единая статическая схема. Версионирование только через this.version(n)
    this.version(1).stores({
      accounts: 'userId',
      rooms: 'userAndRoomId, [userId+membership], [userId+unreadCount], lastEventTs',
      events: '[userId+roomId+eventId], [userId+roomId+originServerTs], [userId+txnId], [userId+type]',
      pendingEvents: 'userAndTxnId, [userId+roomId], status, createdAt',
      timelineGaps: 'gapId, [userId+roomId]',
    })
  }
}

export const db = new AppDatabase()
