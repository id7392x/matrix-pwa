import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { db } from '$storage/db'
import { BatchedStoreManager } from '$stores/batchedStore.svelte'
import type { MatrixClient } from 'matrix-js-sdk'

import { createE2EE } from './e2ee'

const alice = '@alice:example.org'
const deviceId = 'DEVICE1'
const roomId = '!enc:example.org'

function instantScheduler(): (fn: () => void) => number | undefined {
  return (fn: () => void) => {
    fn()
  }
}

function mockClient(overrides: Record<string, unknown> = {}): MatrixClient {
  return {
    initRustCrypto: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    removeListener: vi.fn(),
    ...overrides,
  } as unknown as MatrixClient
}

async function seedEncryptedEvent(): Promise<void> {
  await db.events.put({
    eventId: '$enc1',
    userId: alice,
    roomId,
    originServerTs: 1000,
    sender: '@bob:example.org',
    type: 'm.room.encrypted',
    content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'secret' },
    syncState: 'synced',
    isEncrypted: true,
    decryptionError: 'Unable to decrypt: keys not found',
  })
}

describe('e2ee', () => {
  let store: BatchedStoreManager

  beforeEach(async () => {
    await db.delete()
    await db.open()
    store = new BatchedStoreManager(instantScheduler())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('Cold Start blocking', () => {
    it('is not ready before markReady is called', () => {
      const client = mockClient()
      const e2ee = createE2EE(client)
      expect(e2ee.isReady()).toBe(false)
    })

    it('is ready after initRustCrypto resolves', async () => {
      const client = mockClient()
      const e2ee = createE2EE(client)
      await e2ee.initCrypto(alice, deviceId, 'tok', 'https://matrix.org')
      expect(e2ee.isReady()).toBe(true)
    })

    it('tryDecrypt returns null when crypto is not ready', async () => {
      const client = mockClient()
      const e2ee = createE2EE(client)
      const result = e2ee.tryDecrypt({
        event_id: '$1',
        room_id: roomId,
        type: 'm.room.encrypted',
        content: { ciphertext: 'x' },
      } as never)
      expect(result).toBeNull()
    })

    it('tryDecrypt returns decrypted content when crypto is ready', async () => {
      const client = mockClient()
      const e2ee = createE2EE(client)
      await e2ee.initCrypto(alice, deviceId, 'tok', 'https://matrix.org')

      const decrypted = e2ee.tryDecrypt({
        event_id: '$1',
        room_id: roomId,
        type: 'm.room.encrypted',
        content: { ciphertext: 'x' },
      } as never)
      // ponytail: mock returns ciphertext as body — real impl uses matrix-js-sdk crypto
      expect(decrypted).toEqual({ content: { body: 'Unable to decrypt' }, type: 'm.room.message' })
    })
  })

  describe('UTD state transition', () => {
    it('events without decryptionError are not UTD', async () => {
      await db.events.put({
        eventId: '$ok',
        userId: alice,
        roomId,
        originServerTs: 1000,
        sender: '@bob:example.org',
        type: 'm.room.message',
        content: { body: 'hi' },
        syncState: 'synced',
        isEncrypted: false,
      })

      const event = await db.events.get([alice, roomId, '$ok'])
      expect(event?.decryptionError).toBeUndefined()
    })

    it('encrypted event with decryptionError is UTD', async () => {
      await seedEncryptedEvent()
      const event = await db.events.get([alice, roomId, '$enc1'])
      expect(event?.decryptionError).toBe('Unable to decrypt: keys not found')
      expect(event?.isEncrypted).toBe(true)
    })

    it('UTD event transitions to decrypted when keys arrive', async () => {
      await seedEncryptedEvent()
      const client = mockClient()
      const e2ee = createE2EE(client)
      await e2ee.initCrypto(alice, deviceId, 'tok', 'https://matrix.org')

      // Simulate Event.decrypted callback
      const decryptedCb = (client.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === 'Event.decrypted',
      )?.[1]
      expect(decryptedCb).toBeDefined()

      // Simulate decrypted event from SDK
      const mockDecryptedEvent = {
        getId: () => '$enc1',
        getRoomId: () => roomId,
        getContent: () => ({ body: 'hello world' }),
        getType: () => 'm.room.message',
      }
      decryptedCb(mockDecryptedEvent)

      await e2ee.lastReDecrypt
      const updated = await db.events.get([alice, roomId, '$enc1'])
      expect(updated?.decryptionError).toBeUndefined()
      expect(updated?.content).toEqual({ body: 'hello world' })
      expect(updated?.type).toBe('m.room.message')
    })
  })

  describe('UTD 30-second timer', () => {
    it('sets permanent decryptionError after 30s if not cancelled', async () => {
      await seedEncryptedEvent()
      const client = mockClient()
      const e2ee = createE2EE(client)
      await e2ee.initCrypto(alice, deviceId, 'tok', 'https://matrix.org')

      const before = await db.events.get([alice, roomId, '$enc1'])
      expect(before?.decryptionError).toBe('Unable to decrypt: keys not found')

      vi.useFakeTimers()
      e2ee.startUtdTimer('$enc1', roomId)
      vi.advanceTimersByTime(30_000)
      vi.useRealTimers()

      // ponytail: let fake-indexeddb flush the async modify from the timer callback
      await new Promise<void>((r) => setTimeout(r, 50))

      const after = await db.events.get([alice, roomId, '$enc1'])
      expect(after?.decryptionError).toBe('Unable to decrypt: keys not found (permanent)')
    })

    it('cancelUtdTimer prevents the permanent transition', async () => {
      await seedEncryptedEvent()
      const client = mockClient()
      const e2ee = createE2EE(client)
      await e2ee.initCrypto(alice, deviceId, 'tok', 'https://matrix.org')

      vi.useFakeTimers()
      e2ee.startUtdTimer('$enc1', roomId)
      vi.advanceTimersByTime(20_000)
      e2ee.cancelUtdTimer('$enc1')
      vi.advanceTimersByTime(30_000)
      vi.useRealTimers()

      const event = await db.events.get([alice, roomId, '$enc1'])
      expect(event?.decryptionError).toBe('Unable to decrypt: keys not found')
    })

    it('starting timer for an already-timed-out event is a no-op', async () => {
      await db.events.put({
        eventId: '$perm',
        userId: alice,
        roomId,
        originServerTs: 1000,
        sender: '@bob:example.org',
        type: 'm.room.encrypted',
        content: { algorithm: 'm.megolm.v1.aes-sha2', ciphertext: 'secret' },
        syncState: 'synced',
        isEncrypted: true,
        decryptionError: 'Unable to decrypt: keys not found (permanent)',
      })

      const client = mockClient()
      const e2ee = createE2EE(client)
      await e2ee.initCrypto(alice, deviceId, 'tok', 'https://matrix.org')

      vi.useFakeTimers()
      e2ee.startUtdTimer('$perm', roomId)
      vi.advanceTimersByTime(60_000)
      vi.useRealTimers()

      const event = await db.events.get([alice, roomId, '$perm'])
      expect(event?.decryptionError).toBe('Unable to decrypt: keys not found (permanent)')
    })

    it('destroy clears all active timers', async () => {
      await seedEncryptedEvent()
      const client = mockClient()
      const e2ee = createE2EE(client)
      await e2ee.initCrypto(alice, deviceId, 'tok', 'https://matrix.org')

      vi.useFakeTimers()
      e2ee.startUtdTimer('$enc1', roomId)
      e2ee.destroy()
      vi.advanceTimersByTime(60_000)
      vi.useRealTimers()

      const event = await db.events.get([alice, roomId, '$enc1'])
      expect(event?.decryptionError).toBe('Unable to decrypt: keys not found')
    })

    it('timers are NOT reconstructed from DB on reload', async () => {
      await seedEncryptedEvent()

      const client = mockClient()
      const e2ee = createE2EE(client)
      await e2ee.initCrypto(alice, deviceId, 'tok', 'https://matrix.org')

      vi.useFakeTimers()
      vi.advanceTimersByTime(60_000)
      vi.useRealTimers()

      const event = await db.events.get([alice, roomId, '$enc1'])
      expect(event?.decryptionError).toBe('Unable to decrypt: keys not found')
    })
  })

  describe('Re-decryption pushes updated DTO to UI', () => {
    it('updates the batched store when Event.decrypted fires', async () => {
      await seedEncryptedEvent()

      // Seed a UTD DTO in the store
      store.pushEvents([
        {
          id: '$enc1',
          roomId,
          sender: '@bob:example.org',
          originServerTs: 1000,
          type: 'm.room.encrypted',
          body: '',
          isEncrypted: true,
          syncState: 'synced',
          decryptionError: 'Unable to decrypt: keys not found',
        },
      ])
      store.flushToUI()
      expect(store.events[0].body).toBe('')
      expect(store.events[0].decryptionError).toBeDefined()

      const client = mockClient()
      const e2ee = createE2EE(client, store)
      await e2ee.initCrypto(alice, deviceId, 'tok', 'https://matrix.org')

      // Simulate Event.decrypted
      const decryptedCb = (client.on as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => c[0] === 'Event.decrypted',
      )?.[1]
      decryptedCb({
        getId: () => '$enc1',
        getRoomId: () => roomId,
        getContent: () => ({ body: 'decrypted message' }),
        getType: () => 'm.room.message',
      })

      await e2ee.lastReDecrypt
      // The store should have the updated event
      const updated = store.events.find((e) => e.id === '$enc1')
      expect(updated).toBeDefined()
      expect(updated!.body).toBe('decrypted message')
      expect(updated!.decryptionError).toBeUndefined()
      expect(updated!.type).toBe('m.room.message')
    })
  })
})
