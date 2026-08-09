import type { SyncState } from '$storage/db'

export interface EventDto {
  id: string
  roomId: string
  sender: string
  originServerTs: number
  type: string
  body: string
  formattedBody?: string
  isEncrypted: boolean
  syncState: SyncState
  decryptionError?: string
  mediaUrl?: string
  aspectRatio?: number
  replyTo?: {
    eventId: string
    sender: string
    bodySummary: string
  }
}

export interface RoomDto {
  id: string
  name: string
  avatarUrl?: string
  unreadCount: number
  highlightCount: number
  lastEventTs: number
  lastEventText?: string
  isDirect: boolean
}
