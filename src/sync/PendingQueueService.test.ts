import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { db } from '$storage/db'
import { PendingQueueService } from './PendingQueueService'

const alice = '@alice:example.org'
const roomId = '!general:example.org'

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
})
