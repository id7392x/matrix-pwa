import Dexie, { type EntityTable } from 'dexie'

export interface AccountRecord {
  id: number
  userId: string
  homeServer: string
  deviceId: string
}

export interface RoomRecord {
  roomId: string
  name: string
  avatarUrl: string
  unreadCount: number
  lastEventTimestamp: number
  isEncrypted: boolean
}

export type MessageStatus = 'pending' | 'synced' | 'failed'

export interface MessageRecord {
  eventId: string
  roomId: string
  sender: string
  type: string
  content: string
  timestamp: number
  status: MessageStatus
}

export interface CryptoKeyRecord {
  id: string
  keyType: string
  keyData: unknown
}

export class AppDatabase extends Dexie {
  accounts!: EntityTable<AccountRecord, 'id'>
  rooms!: EntityTable<RoomRecord, 'roomId'>
  messages!: EntityTable<MessageRecord, 'eventId'>
  crypto_keys!: EntityTable<CryptoKeyRecord, 'id'>

  constructor() {
    super('MatrixClientDB')
    this.version(1).stores({
      accounts: '++id, userId, homeServer, deviceId',
      rooms: 'roomId, name, unreadCount, lastEventTimestamp, isEncrypted',
      messages: 'eventId, roomId, sender, type, timestamp, status, [roomId+timestamp], [roomId+status]',
      crypto_keys: 'id, keyType',
    })
  }
}

export const db = new AppDatabase()
