import { liveQuery } from 'dexie'

import { db, type RoomRecord } from '$storage/db'

class RoomStore {
  rooms = $state<RoomRecord[]>([])
  loading = $state(false)
  error = $state<string | null>(null)

  sortedRooms = $derived([...this.rooms].sort((a, b) => b.lastEventTimestamp - a.lastEventTimestamp))
  totalUnread = $derived(this.rooms.reduce((acc, room) => acc + room.unreadCount, 0))

  constructor() {
    liveQuery(() => db.rooms.orderBy('lastEventTimestamp').reverse().toArray()).subscribe({
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

  async upsert(room: RoomRecord): Promise<void> {
    await db.rooms.put(room)
  }

  async updateUnread(roomId: string, unreadCount: number): Promise<void> {
    await db.rooms.update(roomId, { unreadCount })
  }

  reset(): void {
    this.rooms = []
    this.error = null
  }
}

export const roomStore = new RoomStore()
