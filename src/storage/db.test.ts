import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  db,
  type AccountModel,
  type EventModel,
  type PendingEventModel,
  type RoomModel,
  type TimelineGapModel,
} from './db'
import { promotePendingToSynced } from './promote'

const alice = '@alice:example.org'
const roomId = '!general:example.org'

const account: AccountModel = {
  userId: alice,
  homeserver: 'example.org',
  deviceId: 'DEV1',
  isPrimary: true,
}

const room: RoomModel = {
  userAndRoomId: `${alice}:${roomId}`,
  userId: alice,
  roomId,
  membership: 'join',
  isDirect: false,
  unreadCount: 3,
  highlightCount: 1,
  lastEventTs: 1000,
  name: 'General',
}

function event(overrides: Partial<EventModel> = {}): EventModel {
  return {
    eventId: '$1',
    userId: alice,
    roomId,
    originServerTs: 1000,
    sender: alice,
    type: 'm.room.message',
    content: { body: 'hi' },
    syncState: 'synced',
    isEncrypted: true,
    ...overrides,
  }
}

function pending(overrides: Partial<PendingEventModel> = {}): PendingEventModel {
  return {
    userAndTxnId: `${alice}:txn1`,
    txnId: 'txn1',
    userId: alice,
    roomId,
    content: { body: 'hi' },
    status: 'pending',
    createdAt: 1000,
    retryCount: 0,
    ...overrides,
  }
}

describe('AppDatabase', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('initializes the schema with all tables', () => {
    expect(db.accounts).toBeDefined()
    expect(db.rooms).toBeDefined()
    expect(db.events).toBeDefined()
    expect(db.pendingEvents).toBeDefined()
    expect(db.timelineGaps).toBeDefined()
    expect(db.tables.map((t) => t.name).sort()).toEqual(['accounts', 'events', 'pendingEvents', 'rooms', 'timelineGaps'])
  })

  describe('accounts', () => {
    it('adds and reads an account by userId', async () => {
      await db.accounts.add(account)
      const got = await db.accounts.get(alice)
      expect(got?.homeserver).toBe('example.org')
      expect(got?.isPrimary).toBe(true)
      expect(got?.deviceId).toBe('DEV1')
    })

    it('updates an account by userId', async () => {
      await db.accounts.add(account)
      await db.accounts.update(alice, { isPrimary: false, deviceId: 'DEV2', lastSyncToken: 's9' })
      const updated = await db.accounts.get(alice)
      expect(updated?.isPrimary).toBe(false)
      expect(updated?.deviceId).toBe('DEV2')
      expect(updated?.lastSyncToken).toBe('s9')
    })
  })

  describe('rooms', () => {
    it('adds and reads a room by composite key userAndRoomId', async () => {
      await db.rooms.add(room)
      const got = await db.rooms.get(`${alice}:${roomId}`)
      expect(got?.roomId).toBe(roomId)
      expect(got?.membership).toBe('join')
      expect(got?.unreadCount).toBe(3)
    })

    it('updates a room by composite key', async () => {
      await db.rooms.add(room)
      await db.rooms.update(`${alice}:${roomId}`, { unreadCount: 5, highlightCount: 2 })
      const updated = await db.rooms.get(`${alice}:${roomId}`)
      expect(updated?.unreadCount).toBe(5)
      expect(updated?.highlightCount).toBe(2)
    })

    it('queries rooms by the [userId+membership] index', async () => {
      await db.rooms.bulkAdd([
        { ...room, userAndRoomId: `${alice}:!a`, roomId: '!a', membership: 'join', lastEventTs: 1 },
        { ...room, userAndRoomId: `${alice}:!b`, roomId: '!b', membership: 'invite', lastEventTs: 2 },
        { ...room, userAndRoomId: '@bob:example.org:!c', userId: '@bob:example.org', roomId: '!c', membership: 'join', lastEventTs: 3 },
      ])
      const joined = await db.rooms.where('[userId+membership]').equals([alice, 'join']).toArray()
      expect(joined.map((r) => r.roomId)).toEqual(['!a'])
    })

    it('queries rooms by the [userId+unreadCount] index', async () => {
      await db.rooms.bulkAdd([
        { ...room, userAndRoomId: `${alice}:!a`, roomId: '!a', unreadCount: 2, lastEventTs: 1 },
        { ...room, userAndRoomId: `${alice}:!b`, roomId: '!b', unreadCount: 9, lastEventTs: 2 },
        { ...room, userAndRoomId: `${alice}:!c`, roomId: '!c', unreadCount: 5, lastEventTs: 3 },
      ])
      const unread = await db.rooms.where('[userId+unreadCount]').between([alice, 5], [alice, Number.MAX_SAFE_INTEGER]).toArray()
      expect(unread.map((r) => r.roomId).sort()).toEqual(['!b', '!c'])
    })
  })

  describe('events', () => {
    it('writes and reads an event by composite key [userId+roomId+eventId]', async () => {
      await db.events.put(event())
      const got = await db.events.get([alice, roomId, '$1'])
      expect(got?.sender).toBe(alice)
      expect(got?.syncState).toBe('synced')
      expect(got?.isEncrypted).toBe(true)
    })

    it('queries events by the [userId+roomId+originServerTs] index', async () => {
      await db.events.bulkPut([
        event({ eventId: '$1', originServerTs: 100 }),
        event({ eventId: '$2', originServerTs: 200, txnId: 'txnA' }),
        event({ eventId: '$3', originServerTs: 300, type: 'm.call.invite' }),
      ])
      const timeline = await db.events
        .where('[userId+roomId+originServerTs]')
        .between([alice, roomId, 0], [alice, roomId, Number.MAX_SAFE_INTEGER])
        .toArray()
      expect(timeline.map((e) => e.eventId)).toEqual(['$1', '$2', '$3'])
    })

    it('queries events by the [userId+txnId] index', async () => {
      await db.events.bulkPut([
        event({ eventId: '$1' }),
        event({ eventId: '$2', txnId: 'txnA' }),
        event({ eventId: '$3', txnId: 'txnA' }),
      ])
      const byTxn = await db.events.where('[userId+txnId]').equals([alice, 'txnA']).toArray()
      expect(byTxn.map((e) => e.eventId).sort()).toEqual(['$2', '$3'])
    })

    it('queries events by the [userId+type] index', async () => {
      await db.events.bulkPut([
        event({ eventId: '$1' }),
        event({ eventId: '$2', type: 'm.room.member' }),
        event({ eventId: '$3', type: 'm.room.message' }),
      ])
      const members = await db.events.where('[userId+type]').equals([alice, 'm.room.member']).toArray()
      expect(members.map((e) => e.eventId)).toEqual(['$2'])
    })
  })

  describe('pendingEvents', () => {
    it('adds and reads a pending event by composite key userAndTxnId', async () => {
      await db.pendingEvents.add(pending())
      const got = await db.pendingEvents.get(`${alice}:txn1`)
      expect(got?.status).toBe('pending')
      expect(got?.retryCount).toBe(0)
    })

    it('queries pending events by the status index', async () => {
      await db.pendingEvents.bulkAdd([
        pending(),
        pending({ userAndTxnId: `${alice}:txn2`, txnId: 'txn2', status: 'failed', retryCount: 2 }),
      ])
      const failed = await db.pendingEvents.where('status').equals('failed').toArray()
      expect(failed).toHaveLength(1)
      expect(failed[0].retryCount).toBe(2)
    })
  })

  describe('timelineGaps', () => {
    it('stores and reads a gap by composite key gapId', async () => {
      const gap: TimelineGapModel = {
        gapId: `${alice}:${roomId}:$$gap1`,
        userId: alice,
        roomId,
        eventId: '$gap1',
        prevBatchToken: 't42',
        createdAt: 1000,
      }
      await db.timelineGaps.add(gap)
      const got = await db.timelineGaps.get(`${alice}:${roomId}:$$gap1`)
      expect(got?.prevBatchToken).toBe('t42')
    })

    it('queries gaps by the [userId+roomId] index', async () => {
      await db.timelineGaps.bulkAdd([
        { gapId: `${alice}:${roomId}:$g1`, userId: alice, roomId, eventId: '$g1', prevBatchToken: 't1', createdAt: 1 },
        { gapId: `${alice}:${roomId}:$g2`, userId: alice, roomId, eventId: '$g2', prevBatchToken: 't2', createdAt: 2 },
        { gapId: '@bob:example.org:!other:g', userId: '@bob:example.org', roomId: '!other', eventId: 'g', prevBatchToken: 't3', createdAt: 3 },
      ])
      const gaps = await db.timelineGaps.where('[userId+roomId]').equals([alice, roomId]).toArray()
      expect(gaps.map((g) => g.eventId).sort()).toEqual(['$g1', '$g2'])
    })
  })

  describe('promotePendingToSynced', () => {
    it('moves a pending event into events atomically', async () => {
      await db.pendingEvents.add(pending())
      await promotePendingToSynced(alice, roomId, 'txn1', '$1', {
        originServerTs: 1000,
        sender: alice,
        type: 'm.room.message',
        content: { body: 'hi' },
        isEncrypted: true,
      })

      expect(await db.pendingEvents.get(`${alice}:txn1`)).toBeUndefined()
      const synced = await db.events.get([alice, roomId, '$1'])
      expect(synced?.syncState).toBe('synced')
      expect(synced?.txnId).toBe('txn1')
      expect(synced?.content).toEqual({ body: 'hi' })
    })

    it('writes the event even when no pending record exists (guaranteed put)', async () => {
      await promotePendingToSynced(alice, roomId, 'txn-missing', '$9', {
        originServerTs: 500,
        sender: alice,
        type: 'm.room.message',
        content: {},
        isEncrypted: false,
      })
      const synced = await db.events.get([alice, roomId, '$9'])
      expect(synced?.syncState).toBe('synced')
    })

    it('rejects syncedData without required fields and writes nothing', async () => {
      await db.pendingEvents.add(pending())
      await expect(
        promotePendingToSynced(alice, roomId, 'txn1', '$1', {
          originServerTs: 1000,
          sender: alice,
          type: 'm.room.message',
          isEncrypted: true,
        } as Partial<import('./db').EventModel>),
      ).rejects.toThrow(/content/)

      expect(await db.events.get([alice, roomId, '$1'])).toBeUndefined()
      expect(await db.pendingEvents.get(`${alice}:txn1`)).toBeDefined()
    })

    it('rejects wrong-typed required fields', async () => {
      await expect(
        promotePendingToSynced(alice, roomId, 'txn1', '$1', {
          originServerTs: 1000,
          sender: alice,
          type: 'm.room.message',
          content: 'not-an-object',
          isEncrypted: false,
        } as unknown as Partial<import('./db').EventModel>),
      ).rejects.toThrow(/content/)
      expect(await db.events.get([alice, roomId, '$1'])).toBeUndefined()
    })

    it('is idempotent for the same eventId', async () => {
      const syncedData = {
        originServerTs: 1000,
        sender: alice,
        type: 'm.room.message',
        content: { body: 'hi' },
        isEncrypted: true,
      }
      await db.pendingEvents.add(pending())
      await promotePendingToSynced(alice, roomId, 'txn1', '$1', syncedData)
      await promotePendingToSynced(alice, roomId, 'txn1', '$1', syncedData)

      const all = await db.events.where('[userId+roomId+eventId]').equals([alice, roomId, '$1']).toArray()
      expect(all).toHaveLength(1)
    })
  })
})
