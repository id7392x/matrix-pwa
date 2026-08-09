import { liveQuery } from 'dexie'

import { db, type RoomModel } from '$storage/db'

class RoomStore {
  rooms = $state<RoomModel[]>([])
  loading = $state(false)
  error = $state<string | null>(null)

  sortedRooms = $derived([...this.rooms].sort((a, b) => b.lastEventTs - a.lastEventTs))
  totalUnread = $derived(this.rooms.reduce((acc, room) => acc + room.unreadCount, 0))

  constructor() {
    liveQuery(() => db.rooms.toArray()).subscribe({
      next: (rooms) => {
        this.rooms = rooms
      },
      error: (error) => {
        this.error = String(error)
      },
    })
  }

  async load(): Promise<void> {
    this.loading = true
    try {
      this.rooms = await db.rooms.toArray()
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
