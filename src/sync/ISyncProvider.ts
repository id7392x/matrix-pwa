export interface SyncRawEvent {
  event_id: string
  origin_server_ts: number
  sender: string
  type: string
  content: Record<string, unknown>
  txn_id?: string
  unsigned?: {
    transaction_id?: string
  }
}

export interface SyncRoomTimeline {
  events: SyncRawEvent[]
  prev_batch: string
}

export interface SyncJoinedRoom {
  timeline?: SyncRoomTimeline
  name?: string
  isDirect?: boolean
  unread_notifications?: {
    notification_count?: number
    highlight_count?: number
  }
}

export interface SyncResponse {
  next_batch: string
  rooms: {
    join: Record<string, SyncJoinedRoom>
    /** Rooms the local user has just left/forgot; the orchestrator removes them locally. */
    leave?: Record<string, unknown>
  }
}

export type SyncListener = (sync: SyncResponse) => void | Promise<void>

export interface ISyncProvider {
  start(): Promise<void>
  stop(): void
  onSync(listener: SyncListener): void
}
