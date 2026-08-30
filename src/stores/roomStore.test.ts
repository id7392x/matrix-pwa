import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type RoomModel } from '$storage/db'
import { roomStore, toRoomDto } from '$stores/roomStore.svelte'

const alice = '@alice:example.org'

const roomA: RoomModel = { userAndRoomId: `${alice}:!a`, userId: alice, roomId: '!a', membership: 'join', isDirect: false, unreadCount: 1, highlightCount: 0, lastEventTs: 100, name: 'A' }
const roomB: RoomModel = { userAndRoomId: `${alice}:!b`, userId: alice, roomId: '!b', membership: 'join', isDirect: true, unreadCount: 5, highlightCount: 1, lastEventTs: 300, name: 'B' }

describe('toRoomDto', () => {
  it('maps RoomModel to RoomDto without leaking database internals', () => {
    const dto = toRoomDto(roomA)
    expect(dto.id).toBe('!a')
    expect(dto.name).toBe('A')
    expect(dto.isDirect).toBe(false)
    expect(dto.unreadCount).toBe(1)
    expect(dto.highlightCount).toBe(0)
    expect(dto.lastEventTs).toBe(100)
    expect(dto).not.toHaveProperty('userId')
    expect(dto).not.toHaveProperty('userAndRoomId')
    expect(dto).not.toHaveProperty('membership')
    expect(dto).not.toHaveProperty('summaryDto')
  })

  it('falls back to roomId as the display name', () => {
    expect(toRoomDto({ ...roomA, name: undefined }).name).toBe('!a')
  })

  it('passes the dm partner through to the DTO', () => {
    const dto = toRoomDto({ ...roomA, dmPartner: '@partner:example.org' })
    expect(dto.dmPartner).toBe('@partner:example.org')
  })
})

describe('roomStore', () => {
  beforeEach(async () => {
    await db.rooms.clear()
    roomStore.reset()
  })

  it('surfaces Dexie rows as RoomDto through liveQuery', async () => {
    await db.rooms.bulkAdd([roomA, roomB])
    await vi.waitFor(() => {
      expect(roomStore.rooms).toHaveLength(2)
    })
    expect(roomStore.rooms[0]).not.toHaveProperty('userId')
  })

  it('updates unread count reactively', async () => {
    await db.rooms.bulkAdd([roomA])
    await vi.waitFor(() => {
      expect(roomStore.rooms).toHaveLength(1)
    })
    await db.rooms.update(`${alice}:!a`, { unreadCount: 9 })
    await vi.waitFor(() => {
      expect(roomStore.rooms.find((r) => r.id === '!a')?.unreadCount).toBe(9)
    })
  })

  it('derives rooms sorted by lastEventTs descending', async () => {
    await db.rooms.bulkAdd([roomA, roomB])
    await vi.waitFor(() => {
      expect(roomStore.sortedRooms.map((r) => r.id)).toEqual(['!b', '!a'])
    })
  })

  it('derives total unread across rooms', async () => {
    await db.rooms.bulkAdd([roomA, roomB])
    await vi.waitFor(() => {
      expect(roomStore.totalUnread).toBe(6)
    })
  })
})
