import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ClientEvent,
  KnownMembership,
  MatrixEvent,
  Room,
  SyncState,
  createClient,
  type MatrixClient,
} from 'matrix-js-sdk'

import { db } from '$storage/db'
import { accountManager } from '$lib/accountManager'
import { startLegacySync, stopLegacySync } from '$lib/legacySync'
import { batchedStore } from '$stores/batchedStore.svelte'
import { roomStore } from '$stores/roomStore.svelte'
import { LegacySyncProvider } from '$sync/legacySyncProvider'
import { PendingQueueService } from '$sync/PendingQueueService'
import { SyncOrchestrator } from '$sync/SyncOrchestrator'

vi.mock('matrix-js-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('matrix-js-sdk')>()
  return {
    ...actual,
    createClient: vi.fn((opts: Parameters<typeof actual.createClient>[0]) => {
      const client = actual.createClient(opts)
      vi.spyOn(client, 'startClient').mockResolvedValue(undefined)
      return client
    }),
  }
})

const alice = '@alice:example.org'
const roomId = '!general:example.org'

function makeRoom(client: MatrixClient): Room {
  const room = new Room(roomId, client, alice)
  room.name = 'General'
  const timeline = room.getLiveTimeline()
  timeline.addEvent(
    new MatrixEvent({
      event_id: '$1',
      origin_server_ts: 1000,
      sender: '@bob:example.org',
      type: 'm.room.message',
      content: { body: 'Hello everyone!' },
    }),
    { toStartOfTimeline: false, addToState: false },
  )
  room.updateMyMembership(KnownMembership.Join)
  return room
}

describe('legacy sync integration', () => {
  beforeEach(async () => {
    await db.rooms.clear()
    await db.events.clear()
    await db.pendingEvents.clear()
    await db.accounts.clear()
    roomStore.reset()
    batchedStore.reset()
    vi.restoreAllMocks()
    vi.mocked(createClient).mockClear()
  })

  it('drives roomStore and batchedStore end to end from a sync event', async () => {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    vi.spyOn(client, 'startClient').mockResolvedValue(undefined)
    await client.store.storeRoom(makeRoom(client))

    const orchestrator = new SyncOrchestrator(alice, new PendingQueueService(), batchedStore)
    const provider = new LegacySyncProvider(client)
    provider.onSync((sync) => orchestrator.handleSync(sync))
    await provider.start()

    client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared, {
      nextSyncToken: 'nb1',
    })

    await vi.waitFor(() => {
      expect(roomStore.sortedRooms).toHaveLength(1)
    })
    expect(roomStore.sortedRooms[0].name).toBe('General')

    await vi.waitFor(() => {
      expect(batchedStore.events).toHaveLength(1)
    })
    expect(batchedStore.events[0].body).toBe('Hello everyone!')

    client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared, {
      nextSyncToken: 'nb2',
    })
    await vi.waitFor(() => {
      expect(batchedStore.events).toHaveLength(1)
    })
  })

  async function seedSession(): Promise<void> {
    await db.accounts.add({
      userId: alice,
      homeserver: 'https://matrix.org',
      deviceId: 'DEV1',
      isPrimary: true,
    })
    accountManager.setAccessToken(alice, 'secret-token')
  }

  it('stops the previous sync client when starting again for the same user', async () => {
    await seedSession()

    await startLegacySync(alice)
    const firstClient = vi.mocked(createClient).mock.results[0]?.value as MatrixClient
    const firstStop = vi.spyOn(firstClient, 'stopClient')

    await startLegacySync(alice)
    expect(firstStop).toHaveBeenCalledTimes(1)
  })

  it('stopLegacySync stops the active sync for a user', async () => {
    await seedSession()

    const handle = await startLegacySync(alice)
    const client = vi.mocked(createClient).mock.results[0]?.value as MatrixClient
    const stop = vi.spyOn(client, 'stopClient')

    stopLegacySync(alice)
    expect(stop).toHaveBeenCalledTimes(1)

    handle.stop()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('returns a no-op handle when no session exists', async () => {
    const handle = await startLegacySync(alice)
    expect(() => handle.stop()).not.toThrow()
  })
})