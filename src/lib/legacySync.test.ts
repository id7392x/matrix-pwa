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
import { batchedStore } from '$stores/batchedStore.svelte'
import { roomStore } from '$stores/roomStore.svelte'
import { LegacySyncProvider } from '$sync/legacySyncProvider'
import { PendingQueueService } from '$sync/PendingQueueService'
import { SyncOrchestrator } from '$sync/SyncOrchestrator'

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
    roomStore.reset()
    batchedStore.reset()
    vi.restoreAllMocks()
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
})