import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type RoomModel } from '$storage/db'
import { roomStore } from '$stores/roomStore.svelte'

const alice = '@alice:example.org'

const roomA: RoomModel = { userAndRoomId: `${alice}:!a`, userId: alice, roomId: '!a', membership: 'join', isDirect: false, unreadCount: 1, highlightCount: 0, lastEventTs: 100, name: 'A' }
const roomB: RoomModel = { userAndRoomId: `${alice}:!b`, userId: alice, roomId: '!b', membership: 'join', isDirect: true, unreadCount: 5, highlightCount: 1, lastEventTs: 300, name: 'B' }

describe('roomStore', () => {
  beforeEach(async () => {
    await db.rooms.clear()
    roomStore.reset()
  })

  it('loads rooms from Dexie into $state', async () => {
    await db.rooms.bulkAdd([roomA, roomB])
    await roomStore.load()
    expect(roomStore.rooms).toHaveLength(2)
  })

  it('upserts a room', async () => {
    await roomStore.upsert(roomA)
    await vi.waitFor(() => {
      expect(roomStore.rooms).toHaveLength(1)
    })
    expect(roomStore.rooms[0]).toMatchObject({ roomId: '!a', unreadCount: 1 })
  })

  it('updates unread count reactively', async () => {
    await roomStore.upsert(roomA)
    await vi.waitFor(() => {
      expect(roomStore.rooms).toHaveLength(1)
    })
    await roomStore.updateUnread(`${alice}:!a`, 9)
    await vi.waitFor(() => {
      expect(roomStore.rooms.find((r) => r.roomId === '!a')?.unreadCount).toBe(9)
    })
  })

  it('derives rooms sorted by lastEventTs descending', async () => {
    await roomStore.upsert(roomA)
    await roomStore.upsert(roomB)
    await vi.waitFor(() => {
      expect(roomStore.sortedRooms.map((r) => r.roomId)).toEqual(['!b', '!a'])
    })
  })

  it('derives total unread across rooms', async () => {
    await roomStore.upsert(roomA)
    await roomStore.upsert(roomB)
    await vi.waitFor(() => {
      expect(roomStore.totalUnread).toBe(6)
    })
  })
})
