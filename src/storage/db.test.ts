import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { db, type MessageRecord, type RoomRecord } from './db'

describe('AppDatabase', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('initializes the schema with all tables', () => {
    expect(db.accounts).toBeDefined()
    expect(db.rooms).toBeDefined()
    expect(db.messages).toBeDefined()
    expect(db.crypto_keys).toBeDefined()
    expect(db.tables.map((t) => t.name).sort()).toEqual(['accounts', 'crypto_keys', 'messages', 'rooms'])
  })

  it('adds and reads an account', async () => {
    const id = await db.accounts.add({
      userId: '@alice:example.org',
      homeServer: 'example.org',
      deviceId: 'DEV1',
    })
    const account = await db.accounts.get(id)
    expect(account?.userId).toBe('@alice:example.org')
    expect(account?.deviceId).toBe('DEV1')
  })

  it('updates an account', async () => {
    const id = await db.accounts.add({
      userId: '@alice:example.org',
      homeServer: 'example.org',
      deviceId: 'DEV1',
    })
    await db.accounts.update(id, { deviceId: 'DEV2' })
    expect((await db.accounts.get(id))?.deviceId).toBe('DEV2')
  })

  it('adds, reads and updates a room', async () => {
    const room: RoomRecord = {
      roomId: '!general:example.org',
      name: 'General',
      avatarUrl: '',
      unreadCount: 3,
      lastEventTimestamp: 1000,
      isEncrypted: true,
    }
    await db.rooms.add(room)

    const got = await db.rooms.get('!general:example.org')
    expect(got?.name).toBe('General')
    expect(got?.isEncrypted).toBe(true)

    await db.rooms.update('!general:example.org', { unreadCount: 5, lastEventTimestamp: 2000 })
    const updated = await db.rooms.get('!general:example.org')
    expect(updated?.unreadCount).toBe(5)
    expect(updated?.lastEventTimestamp).toBe(2000)
  })

  it('queries rooms by the unreadCount index', async () => {
    await db.rooms.bulkAdd([
      { roomId: '!a', name: 'A', avatarUrl: '', unreadCount: 1, lastEventTimestamp: 1, isEncrypted: false },
      { roomId: '!b', name: 'B', avatarUrl: '', unreadCount: 9, lastEventTimestamp: 2, isEncrypted: false },
      { roomId: '!c', name: 'C', avatarUrl: '', unreadCount: 5, lastEventTimestamp: 3, isEncrypted: false },
    ])
    const unread = await db.rooms.where('unreadCount').aboveOrEqual(5).toArray()
    expect(unread.map((r) => r.roomId).sort()).toEqual(['!b', '!c'])
  })

  it('adds and reads a message', async () => {
    const message: MessageRecord = {
      eventId: '$1',
      roomId: '!a',
      sender: '@alice',
      type: 'm.room.message',
      content: 'hi',
      timestamp: 1000,
      status: 'synced',
    }
    await db.messages.add(message)
    expect((await db.messages.get('$1'))?.content).toBe('hi')
  })

  it('updates a message status', async () => {
    await db.messages.add({
      eventId: '$1',
      roomId: '!a',
      sender: '@alice',
      type: 'm.room.message',
      content: 'hi',
      timestamp: 1000,
      status: 'pending',
    })
    await db.messages.update('$1', { status: 'synced' })
    expect((await db.messages.get('$1'))?.status).toBe('synced')
  })

  it('queries messages by the [roomId+timestamp] composite index', async () => {
    await db.messages.bulkAdd([
      { eventId: '$1', roomId: '!a', sender: '@a', type: 'm.room.message', content: '1', timestamp: 100, status: 'synced' },
      { eventId: '$2', roomId: '!a', sender: '@a', type: 'm.room.message', content: '2', timestamp: 200, status: 'synced' },
      { eventId: '$3', roomId: '!b', sender: '@b', type: 'm.room.message', content: '3', timestamp: 300, status: 'synced' },
    ])
    const roomA = await db.messages.where('[roomId+timestamp]').between(['!a', 0], ['!a', Number.MAX_SAFE_INTEGER]).sortBy('timestamp')
    expect(roomA.map((m) => m.eventId)).toEqual(['$1', '$2'])
  })

  it('queries messages by roomId', async () => {
    await db.messages.bulkAdd([
      { eventId: '$1', roomId: '!a', sender: '@a', type: 'm.room.message', content: '1', timestamp: 100, status: 'synced' },
      { eventId: '$2', roomId: '!b', sender: '@b', type: 'm.room.message', content: '2', timestamp: 200, status: 'synced' },
    ])
    const messages = await db.messages.where('roomId').equals('!b').toArray()
    expect(messages.map((m) => m.eventId)).toEqual(['$2'])
  })

  it('stores crypto keys by keyType', async () => {
    await db.crypto_keys.add({ id: 'k1', keyType: 'm.megolm.v1', keyData: { session: 'abc' } })
    const key = await db.crypto_keys.get('k1')
    expect(key?.keyType).toBe('m.megolm.v1')
    const byType = await db.crypto_keys.where('keyType').equals('m.megolm.v1').toArray()
    expect(byType).toHaveLength(1)
  })
})
