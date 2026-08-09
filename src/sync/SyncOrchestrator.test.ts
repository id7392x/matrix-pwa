import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '$storage/db'
import { BatchedStoreManager } from '$stores/batchedStore.svelte'
import type { SyncResponse } from './ISyncProvider'
import { PendingQueueService } from './PendingQueueService'
import { SyncOrchestrator } from './SyncOrchestrator'

const alice = '@alice:example.org'
const roomId = '!general:example.org'

function instantScheduler(): (fn: () => void) => void {
  return (fn: () => void) => fn()
}

function sync(overrides: Partial<SyncResponse> = {}): SyncResponse {
  return {
    next_batch: 's1',
    rooms: {
      join: {
        [roomId]: {
          name: 'General',
          unread_notifications: { notification_count: 2, highlight_count: 1 },
          timeline: {
            prev_batch: 't0',
            events: [
              {
                event_id: '$1',
                origin_server_ts: 1000,
                sender: '@bob:example.org',
                type: 'm.room.message',
                content: { body: 'hello' },
              },
            ],
          },
        },
      },
    },
    ...overrides,
  }
}

function setup() {
  const store = new BatchedStoreManager(instantScheduler())
  const queue = new PendingQueueService()
  const orchestrator = new SyncOrchestrator(alice, queue, store)
  return { store, queue, orchestrator }
}

describe('SyncOrchestrator', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('persists joined rooms as RoomModel and pushes event DTOs to the store', async () => {
    const { store, orchestrator } = setup()
    await orchestrator.handleSync(sync())

    const room = await db.rooms.get(`${alice}:${roomId}`)
    expect(room?.name).toBe('General')
    expect(room?.unreadCount).toBe(2)
    expect(room?.highlightCount).toBe(1)
    expect(room?.lastEventTs).toBe(1000)

    const event = await db.events.get([alice, roomId, '$1'])
    expect(event?.syncState).toBe('synced')
    expect(event?.content).toEqual({ body: 'hello' })

    expect(store.events).toHaveLength(1)
    expect(store.events[0]).toEqual({
      id: '$1',
      roomId,
      sender: '@bob:example.org',
      originServerTs: 1000,
      type: 'm.room.message',
      body: 'hello',
      isEncrypted: false,
      syncState: 'synced',
    })
  })

  it('routes echo events with an active txnId through promote (no duplicate)', async () => {
    const { store, queue, orchestrator } = setup()
    await queue.create(alice, roomId, { body: 'hello' }, 'txn-1')

    await orchestrator.handleSync(
      sync({
        rooms: {
          join: {
            [roomId]: {
              timeline: {
                prev_batch: 't0',
                events: [
                  {
                    event_id: '$1',
                    origin_server_ts: 1000,
                    sender: alice,
                    type: 'm.room.message',
                    content: { body: 'hello' },
                    txn_id: 'txn-1',
                  },
                ],
              },
            },
          },
        },
      }),
    )

    expect(queue.isActive('txn-1')).toBe(false)
    expect(await db.pendingEvents.get(`${alice}:txn-1`)).toBeUndefined()
    const all = await db.events.where('[userId+roomId+eventId]').equals([alice, roomId, '$1']).toArray()
    expect(all).toHaveLength(1)
    expect(all[0].syncState).toBe('synced')
    expect(all[0].txnId).toBe('txn-1')
    expect(store.events).toHaveLength(1)
  })

  it('stores events without an active txnId normally', async () => {
    const { store, orchestrator } = setup()
    await orchestrator.handleSync(
      sync({
        rooms: {
          join: {
            [roomId]: {
              timeline: {
                prev_batch: 't0',
                events: [
                  {
                    event_id: '$1',
                    origin_server_ts: 1000,
                    sender: alice,
                    type: 'm.room.message',
                    content: { body: 'x' },
                    txn_id: 'foreign-txn',
                  },
                ],
              },
            },
          },
        },
      }),
    )

    const all = await db.events.where('[userId+roomId+eventId]').equals([alice, roomId, '$1']).toArray()
    expect(all).toHaveLength(1)
    expect(all[0].syncState).toBe('synced')
    expect(store.events).toHaveLength(1)
  })

  it('handles an empty join section without errors', async () => {
    const { store, orchestrator } = setup()
    await orchestrator.handleSync({ next_batch: 's2', rooms: { join: {} } })
    expect(store.events).toHaveLength(0)
    expect((await db.rooms.toArray()).length).toBe(0)
  })
})
