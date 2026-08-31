export type SyncState = 'synced' | 'pending' | 'sending' | 'failed'

export interface EventDtoSource {
  id: string
  roomId: string
  sender: string
  originServerTs: number
  type: string
  content: Record<string, unknown>
  syncState: SyncState
  txnId?: string
  isEncrypted?: boolean
  errorText?: string
  decryptionError?: string
}

export function toEventDto(source: EventDtoSource): EventDto {
  return {
    id: source.id,
    roomId: source.roomId,
    sender: source.sender,
    originServerTs: source.originServerTs,
    type: source.type,
    body: typeof source.content.body === 'string' ? source.content.body : '',
    formattedBody:
      typeof source.content.formatted_body === 'string'
        ? source.content.formatted_body
        : undefined,
    isEncrypted: source.isEncrypted ?? false,
    syncState: source.syncState,
    txnId: source.txnId,
    errorText: source.errorText,
    decryptionError: source.decryptionError,
  }
}

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
  txnId?: string
  decryptionError?: string
  errorText?: string
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
  lastMessage?: string
  unreadCount: number
  highlightCount: number
  lastEventTs: number
  isDirect: boolean
  dmPartner?: string
}
