import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { db, type RoomRecord } from '$storage/db'
import { roomStore } from '$stores/roomStore.svelte'

const roomA: RoomRecord = { roomId: '!a', name: 'A', avatarUrl: '', unreadCount: 1, lastEventTimestamp: 100, isEncrypted: false }
const roomB: RoomRecord = { roomId: '!b', name: 'B', avatarUrl: '', unreadCount: 5, lastEventTimestamp: 300, isEncrypted: true }

describe('roomStore', () => {
  beforeEach(async () => {
    await db.transaction('rw', db.rooms, async () => {
      await db.rooms.clear()
    })
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
    await roomStore.updateUnread('!a', 9)
    await vi.waitFor(() => {
      expect(roomStore.rooms.find((r) => r.roomId === '!a')?.unreadCount).toBe(9)
    })
  })

  it('derives rooms sorted by lastEventTimestamp descending', async () => {
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
