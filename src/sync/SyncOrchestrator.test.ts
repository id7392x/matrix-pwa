import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatrixClient } from 'matrix-js-sdk'

import { db } from '$storage/db'
import { BatchedStoreManager } from '$stores/batchedStore.svelte'
import type { SyncResponse, SyncRawEvent } from './ISyncProvider'
import { PendingQueueService } from './PendingQueueService'
import { SyncOrchestrator } from './SyncOrchestrator'

const alice = '@alice:example.org'
const roomId = '!general:example.org'

function instantScheduler(): (fn: () => void) => number | undefined {
  return (fn: () => void) => {
    fn()
  }
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

  it('promotes an echo with a non-active txnId so a stale pending row cannot orphan', async () => {
    const { store, orchestrator } = setup()
    await db.pendingEvents.add({
      userAndTxnId: `${alice}:txn-1`,
      txnId: 'txn-1',
      userId: alice,
      roomId,
      content: { body: 'hello' },
      status: 'pending',
      createdAt: 1,
      retryCount: 0,
    })

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

    expect(await db.pendingEvents.get(`${alice}:txn-1`)).toBeUndefined()
    const all = await db.events.where('[userId+roomId+eventId]').equals([alice, roomId, '$1']).toArray()
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ syncState: 'synced', txnId: 'txn-1' })
    expect(store.events).toHaveLength(1)
  })

  it('handles an empty join section without errors', async () => {
    const { store, orchestrator } = setup()
    await orchestrator.handleSync({ next_batch: 's2', rooms: { join: {} } })
    expect(store.events).toHaveLength(0)
    expect((await db.rooms.toArray()).length).toBe(0)
  })

  it('keeps the stored lastEventTs when a later timeline is empty', async () => {
    const { orchestrator } = setup()
    await orchestrator.handleSync(sync())
    expect((await db.rooms.get(`${alice}:${roomId}`))?.lastEventTs).toBe(1000)

    await orchestrator.handleSync(
      sync({
        rooms: {
          join: {
            [roomId]: {
              timeline: { prev_batch: 't1', events: [] },
            },
          },
        },
      }),
    )

    expect((await db.rooms.get(`${alice}:${roomId}`))?.lastEventTs).toBe(1000)
  })

  it('continues processing other events when one event fails to persist', async () => {
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
                    event_id: '$broken',
                    origin_server_ts: 500,
                    sender: alice,
                    type: 'm.room.message',
                    txn_id: 'txn-broken',
                  } as unknown as SyncRawEvent,
                  {
                    event_id: '$ok',
                    origin_server_ts: 1500,
                    sender: '@bob:example.org',
                    type: 'm.room.message',
                    content: { body: 'survived' },
                  },
                ],
              },
            },
          },
        },
      }),
    )

    const ok = await db.events.get([alice, roomId, '$ok'])
    expect(ok?.syncState).toBe('synced')
    expect(store.events.some((e) => e.id === '$ok')).toBe(true)
    expect(store.events.some((e) => e.id === '$broken')).toBe(false)
  })

  it('skips state events in the UI store but still persists them', async () => {
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
                    event_id: '$state',
                    origin_server_ts: 900,
                    sender: alice,
                    type: 'm.room.create',
                    content: { creator: alice, room_version: '11' },
                  },
                  {
                    event_id: '$msg',
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
      }),
    )

    expect((await db.events.get([alice, roomId, '$state']))?.type).toBe('m.room.create')
    expect(store.events.map((e) => e.id)).toEqual(['$msg'])
  })

  it('replaces the optimistic local row with the echo that carries the same txnId', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ event_id: '$1' })
    const client = { sendMessage, makeTxnId: vi.fn(() => 'txn-1') } as unknown as MatrixClient
    const store = new BatchedStoreManager(instantScheduler())
    const queue = new PendingQueueService(undefined, client, store)
    const orchestrator = new SyncOrchestrator(alice, queue, store)

    await queue.sendMessage(alice, roomId, { body: 'hello', msgtype: 'm.text' })
    expect(store.events).toHaveLength(1)
    expect(store.events[0].id).toBe('local-txn-1')

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

    expect(store.events).toHaveLength(1)
    expect(store.events[0].id).toBe('$1')
    expect(store.events[0].syncState).toBe('synced')
    expect(store.events[0].txnId).toBe('txn-1')
  })

  it('retry after failure resends with the same txnId and the late echo does not duplicate', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ event_id: '$1' })
    const client = { sendMessage, makeTxnId: vi.fn(() => 'txn-1') } as unknown as MatrixClient
    const store = new BatchedStoreManager(instantScheduler())
    const queue = new PendingQueueService(3, client, store)
    const orchestrator = new SyncOrchestrator(alice, queue, store)

    await expect(
      queue.sendMessage(alice, roomId, { body: 'hi', msgtype: 'm.text' }),
    ).rejects.toThrow('network down')
    expect(store.events).toHaveLength(1)
    expect(store.events[0]).toMatchObject({ id: 'local-txn-1', syncState: 'failed' })

    await queue.retry(alice, 'txn-1')

    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage).toHaveBeenLastCalledWith(roomId, { body: 'hi', msgtype: 'm.text' }, 'txn-1')
    expect(store.events[0]).toMatchObject({ id: 'local-txn-1', syncState: 'synced' })
    expect(await db.pendingEvents.get(`${alice}:txn-1`)).toBeUndefined()
    expect((await db.events.get([alice, roomId, '$1']))?.syncState).toBe('synced')

    const echo = sync({
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
                  content: { body: 'hi' },
                  txn_id: 'txn-1',
                },
              ],
            },
          },
        },
      },
    })

    await orchestrator.handleSync(echo)
    expect(store.events).toHaveLength(1)
    expect(store.events[0]).toMatchObject({ id: '$1', syncState: 'synced', txnId: 'txn-1' })

    await orchestrator.handleSync(echo)
    expect(store.events).toHaveLength(1)
    const rows = await db.events
      .where('[userId+roomId+eventId]')
      .equals([alice, roomId, '$1'])
      .toArray()
    expect(rows).toHaveLength(1)
  })

  it('marks m.room.encrypted events as isEncrypted and hides the ciphertext envelope', async () => {
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
                    event_id: '$enc',
                    origin_server_ts: 2000,
                    sender: '@bob:example.org',
                    type: 'm.room.encrypted',
                    content: { algorithm: 'm.megolm.v1.aes-sha2', sender_key: 'k', ciphertext: 'x' },
                  },
                ],
              },
            },
          },
        },
      }),
    )

    const event = await db.events.get([alice, roomId, '$enc'])
    expect(event?.isEncrypted).toBe(true)
    expect(store.events[0].isEncrypted).toBe(true)
    expect(store.events[0].body).toBe('')
    expect(store.events[0].errorText).toBeUndefined()
    expect(store.events[0].decryptionError).toBe('Unable to decrypt: keys not found')
  })
})
