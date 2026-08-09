import { liveQuery } from 'dexie'

import { db, type RoomModel } from '$storage/db'
import type { RoomDto } from '$types/dto'

export function toRoomDto(model: RoomModel): RoomDto {
  return {
    id: model.roomId,
    name: model.name ?? model.roomId,
    avatarUrl: model.avatarUrl,
    unreadCount: model.unreadCount,
    highlightCount: model.highlightCount,
    lastEventTs: model.lastEventTs,
    isDirect: model.isDirect,
  }
}

class RoomStore {
  rooms = $state<RoomDto[]>([])
  loading = $state(false)
  error = $state<string | null>(null)

  sortedRooms = $derived([...this.rooms].sort((a, b) => b.lastEventTs - a.lastEventTs))
  totalUnread = $derived(this.rooms.reduce((acc, room) => acc + room.unreadCount, 0))

  constructor() {
    liveQuery(() => db.rooms.toArray()).subscribe({
      next: (rooms) => {
        this.rooms = rooms.map(toRoomDto)
      },
      error: (error) => {
        this.error = String(error)
      },
    })
  }

  async load(): Promise<void> {
    this.loading = true
    try {
      this.rooms = (await db.rooms.toArray()).map(toRoomDto)
    } finally {
      this.loading = false
    }
  }

  async upsert(room: RoomModel): Promise<void> {
    await db.rooms.put(room)
  }

  async updateUnread(userAndRoomId: string, unreadCount: number): Promise<void> {
    await db.rooms.update(userAndRoomId, { unreadCount })
  }

  reset(): void {
    this.rooms = []
    this.error = null
  }
}

export const roomStore = new RoomStore()
