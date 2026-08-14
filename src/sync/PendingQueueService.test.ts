import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MatrixClient } from 'matrix-js-sdk'

import { db } from '$storage/db'
import { BatchedStoreManager } from '$stores/batchedStore.svelte'
import { PendingQueueService } from './PendingQueueService'

const alice = '@alice:example.org'
const roomId = '!general:example.org'

function instantStore(): BatchedStoreManager {
  return new BatchedStoreManager((fn: () => void) => fn())
}

describe('PendingQueueService', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  it('creates a pending event and registers the txnId as active', async () => {
    const queue = new PendingQueueService()
    const txnId = await queue.create(alice, roomId, { body: 'hi' }, 'txn-1')

    expect(txnId).toBe('txn-1')
    expect(queue.isActive('txn-1')).toBe(true)

    const row = await db.pendingEvents.get(`${alice}:txn-1`)
    expect(row?.status).toBe('pending')
    expect(row?.retryCount).toBe(0)
    expect(row?.content).toEqual({ body: 'hi' })
  })

  it('promotes an active pending event into events and deactivates the txnId', async () => {
    const queue = new PendingQueueService()
    await queue.create(alice, roomId, { body: 'hi' }, 'txn-1')
    await queue.promote(alice, roomId, 'txn-1', '$1', {
      originServerTs: 1000,
      sender: alice,
      type: 'm.room.message',
      content: { body: 'hi' },
      isEncrypted: false,
    })

    expect(queue.isActive('txn-1')).toBe(false)
    expect(await db.pendingEvents.get(`${alice}:txn-1`)).toBeUndefined()
    const synced = await db.events.get([alice, roomId, '$1'])
    expect(synced?.syncState).toBe('synced')
    expect(synced?.txnId).toBe('txn-1')
  })

  it('restores pending and sending rows from the database at startup', async () => {
    await db.pendingEvents.bulkAdd([
      { userAndTxnId: `${alice}:txn-1`, txnId: 'txn-1', userId: alice, roomId, content: {}, status: 'pending', createdAt: 1, retryCount: 0 },
      { userAndTxnId: `${alice}:txn-2`, txnId: 'txn-2', userId: alice, roomId, content: {}, status: 'sending', createdAt: 2, retryCount: 1 },
      { userAndTxnId: `${alice}:txn-3`, txnId: 'txn-3', userId: alice, roomId, content: {}, status: 'failed', createdAt: 3, retryCount: 3 },
    ])

    const queue = new PendingQueueService()
    await queue.restore()

    expect(queue.isActive('txn-1')).toBe(true)
    expect(queue.isActive('txn-2')).toBe(true)
    expect(queue.isActive('txn-3')).toBe(false)

    const sending = await db.pendingEvents.get(`${alice}:txn-2`)
    expect(sending?.status).toBe('pending')
  })

  it('marks a sending row as failed during restore when retry limit is exceeded', async () => {
    await db.pendingEvents.add({
      userAndTxnId: `${alice}:txn-4`,
      txnId: 'txn-4',
      userId: alice,
      roomId,
      content: {},
      status: 'sending',
      createdAt: 1,
      retryCount: 3,
    })

    const queue = new PendingQueueService()
    await queue.restore()

    const failed = await db.pendingEvents.get(`${alice}:txn-4`)
    expect(failed?.status).toBe('failed')
    expect(failed?.errorText).toBeDefined()
    expect(queue.isActive('txn-4')).toBe(false)
  })

  it('recordFailure increments retryCount and only fails after the limit', async () => {
    const queue = new PendingQueueService()
    await queue.create(alice, roomId, {}, 'txn-5')

    await queue.recordFailure(alice, 'txn-5', 'boom')
    expect((await db.pendingEvents.get(`${alice}:txn-5`))?.status).toBe('pending')
    expect((await db.pendingEvents.get(`${alice}:txn-5`))?.retryCount).toBe(1)

    await queue.recordFailure(alice, 'txn-5', 'boom')
    await queue.recordFailure(alice, 'txn-5', 'boom')
    const failed = await db.pendingEvents.get(`${alice}:txn-5`)
    expect(failed?.status).toBe('failed')
    expect(failed?.retryCount).toBe(3)
    expect(failed?.errorText).toBe('boom')
  })

  it('sendMessage without a client rejects', async () => {
    const queue = new PendingQueueService()
    await expect(queue.sendMessage(alice, roomId, { body: 'hi', msgtype: 'm.text' })).rejects.toThrow(
      'MatrixClient не инициализирован',
    )
  })

  it('sendMessage sends a room message via the SDK and returns the event id', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ event_id: '$1' })
    const makeTxnId = vi.fn(() => 'txn-1')
    const client = { sendMessage, makeTxnId } as unknown as MatrixClient
    const queue = new PendingQueueService(undefined, client)

    const eventId = await queue.sendMessage(alice, roomId, { body: 'hi', msgtype: 'm.text' })

    expect(eventId).toBe('$1')
    expect(makeTxnId).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(roomId, { body: 'hi', msgtype: 'm.text' }, 'txn-1')
    expect(queue.isActive('txn-1')).toBe(false)
    expect(await db.pendingEvents.get(`${alice}:txn-1`)).toBeUndefined()
    const synced = await db.events.get([alice, roomId, '$1'])
    expect(synced?.syncState).toBe('synced')
    expect(synced?.txnId).toBe('txn-1')
  })

  it('retry resends a failed event through the same SDK send path', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ event_id: '$9' })
    const client = { sendMessage, makeTxnId: vi.fn(() => 'txn-tmp') } as unknown as MatrixClient
    const queue = new PendingQueueService(undefined, client)
    await queue.create(alice, roomId, { body: 'hi', msgtype: 'm.text' }, 'txn-9')
    await queue.recordFailure(alice, 'txn-9', 'boom')
    await queue.recordFailure(alice, 'txn-9', 'boom')
    await queue.recordFailure(alice, 'txn-9', 'boom')

    await queue.retry(alice, 'txn-9')

    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage).toHaveBeenCalledWith(roomId, { body: 'hi', msgtype: 'm.text' }, 'txn-9')
    expect(queue.isActive('txn-9')).toBe(false)
    expect(await db.pendingEvents.get(`${alice}:txn-9`)).toBeUndefined()
    const synced = await db.events.get([alice, roomId, '$9'])
    expect(synced?.syncState).toBe('synced')
    expect(synced?.txnId).toBe('txn-9')
  })

  it('pushes an optimistic DTO into the store before touching the network', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ event_id: '$1' })
    const client = { sendMessage, makeTxnId: vi.fn(() => 'txn-1') } as unknown as MatrixClient
    const store = instantStore()
    const queue = new PendingQueueService(undefined, client, store)

    const eventId = await queue.sendMessage(alice, roomId, { body: 'hi there', msgtype: 'm.text' })

    expect(eventId).toBe('$1')
    expect(store.events).toHaveLength(1)
    expect(store.events[0]).toMatchObject({
      id: 'local-txn-1',
      txnId: 'txn-1',
      roomId,
      sender: alice,
      syncState: 'sending',
      body: 'hi there',
    })
  })

  it('marks the optimistic row as failed with an errorText when sending fails', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('network down'))
    const client = { sendMessage, makeTxnId: vi.fn(() => 'txn-1') } as unknown as MatrixClient
    const store = instantStore()
    const queue = new PendingQueueService(undefined, client, store)

    await expect(queue.sendMessage(alice, roomId, { body: 'hi', msgtype: 'm.text' })).rejects.toThrow(
      'network down',
    )

    const row = store.events.find((e) => e.txnId === 'txn-1')
    expect(row).toBeDefined()
    expect(row?.syncState).toBe('failed')
    expect(row?.errorText).toBe('network down')
  })

  it('retry flips a failed optimistic row back to sending without an errorText', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ event_id: '$9' })
    const client = { sendMessage, makeTxnId: vi.fn(() => 'txn-1') } as unknown as MatrixClient
    const store = instantStore()
    const queue = new PendingQueueService(1, client, store)

    await expect(queue.sendMessage(alice, roomId, { body: 'hi', msgtype: 'm.text' })).rejects.toThrow('boom')
    const failed = store.events.find((e) => e.txnId === 'txn-1')
    expect(failed?.syncState).toBe('failed')

    await queue.retry(alice, 'txn-1')

    const row = store.events.find((e) => e.txnId === 'txn-1')
    expect(row?.syncState).toBe('sending')
    expect(row?.errorText).toBeUndefined()
  })

  it('restore raises a pending row to active and a later echo can promote it', async () => {
    await db.pendingEvents.bulkAdd([
      { userAndTxnId: `${alice}:txn-r`, txnId: 'txn-r', userId: alice, roomId, content: { body: 'x' }, status: 'sending', createdAt: 1, retryCount: 0 },
    ])

    const store = instantStore()
    const queue = new PendingQueueService(undefined, undefined, store)
    await queue.restore()

    expect(queue.isActive('txn-r')).toBe(true)
    expect(store.events).toHaveLength(1)
    expect(store.events[0]).toMatchObject({ txnId: 'txn-r', syncState: 'sending' })

    await queue.promote(alice, roomId, 'txn-r', '$r', {
      originServerTs: 1000,
      sender: alice,
      type: 'm.room.message',
      content: { body: 'x' },
      isEncrypted: false,
    })

    expect(queue.isActive('txn-r')).toBe(false)
    expect(await db.pendingEvents.get(`${alice}:txn-r`)).toBeUndefined()
    const synced = await db.events.get([alice, roomId, '$r'])
    expect(synced?.syncState).toBe('synced')
    expect(synced?.txnId).toBe('txn-r')
  })

  it('restore lifts pending and failed rows into optimistic DTOs', async () => {
    await db.pendingEvents.bulkAdd([
      { userAndTxnId: `${alice}:txn-1`, txnId: 'txn-1', userId: alice, roomId, content: { body: 'a' }, status: 'pending', createdAt: 1, retryCount: 0 },
      { userAndTxnId: `${alice}:txn-2`, txnId: 'txn-2', userId: alice, roomId, content: { body: 'b' }, status: 'failed', createdAt: 2, retryCount: 3, errorText: 'boom' },
    ])

    const store = instantStore()
    const queue = new PendingQueueService(undefined, undefined, store)
    await queue.restore()

    expect(store.events).toHaveLength(2)
    const pending = store.events.find((e) => e.txnId === 'txn-1')
    expect(pending?.syncState).toBe('sending')
    expect(pending?.body).toBe('a')
    const failed = store.events.find((e) => e.txnId === 'txn-2')
    expect(failed?.syncState).toBe('failed')
    expect(failed?.errorText).toBe('boom')
  })
})
