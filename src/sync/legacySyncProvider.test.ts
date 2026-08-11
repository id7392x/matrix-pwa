import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ClientEvent,
  EventTimeline,
  EventType,
  KnownMembership,
  MatrixEvent,
  NotificationCountType,
  Room,
  SyncState,
  createClient,
  type MatrixClient,
} from 'matrix-js-sdk'

import type { SyncResponse } from './ISyncProvider'
import { LegacySyncProvider, toSyncJoinedRoom, toSyncRawEvent } from './legacySyncProvider'

const alice = '@alice:example.org'
const roomId = '!general:example.org'
const bob = '@bob:example.org'

function makeRoom(client: MatrixClient, id = roomId): Room {
  const room = new Room(id, client, alice)
  const timeline = room.getLiveTimeline()
  timeline.addEvent(
    new MatrixEvent({
      event_id: '$1',
      origin_server_ts: 1000,
      sender: bob,
      type: 'm.room.message',
      content: { body: 'hello' },
    }),
    { toStartOfTimeline: false, addToState: false },
  )
  timeline.setPaginationToken('t0', EventTimeline.BACKWARDS)
  room.updateMyMembership(KnownMembership.Join)
  return room
}

function makeNameEvent(name: string): MatrixEvent {
  return new MatrixEvent({
    event_id: '$name',
    origin_server_ts: 1,
    sender: alice,
    type: 'm.room.name',
    state_key: '',
    content: { name },
  })
}

describe('toSyncRawEvent', () => {
  it('maps a MatrixEvent to SyncRawEvent with raw content and txn_id', () => {
    const raw = toSyncRawEvent(
      new MatrixEvent({
        event_id: '$1',
        origin_server_ts: 1000,
        sender: bob,
        type: 'm.room.message',
        content: { body: 'hello', formatted_body: '<b>hello</b>' },
        txn_id: 'txn-1',
      }),
    )

    expect(raw).toEqual({
      event_id: '$1',
      origin_server_ts: 1000,
      sender: bob,
      type: 'm.room.message',
      content: { body: 'hello', formatted_body: '<b>hello</b>' },
      txn_id: 'txn-1',
    })
  })

  it('defaults to empty strings when id or sender are missing', () => {
    const raw = toSyncRawEvent(
      new MatrixEvent({ origin_server_ts: 5, type: 'm.room.message', content: {} }),
    )
    expect(raw.event_id).toBe('')
    expect(raw.sender).toBe('')
    expect(raw.txn_id).toBeUndefined()
  })
})

describe('toSyncJoinedRoom', () => {
  it('maps room name from m.room.name and unread counters', () => {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    const room = makeRoom(client)
    room.currentState.setStateEvents([makeNameEvent('General')])
    room.name = 'General'
    room.setUnread(NotificationCountType.Total, 2)
    room.setUnread(NotificationCountType.Highlight, 1)

    const joined = toSyncJoinedRoom(room, true)

    expect(joined.name).toBe('General')
    expect(joined.isDirect).toBe(true)
    expect(joined.unread_notifications).toEqual({ notification_count: 2, highlight_count: 1 })
    expect(joined.timeline?.prev_batch).toBe('t0')
    expect(joined.timeline?.events).toEqual([
      {
        event_id: '$1',
        origin_server_ts: 1000,
        sender: bob,
        type: 'm.room.message',
        content: { body: 'hello' },
      },
    ])
  })

  it('falls back to the room id for unnamed rooms and zero counters', () => {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    const room = makeRoom(client)
    room.name = ''

    const joined = toSyncJoinedRoom(room)

    expect(joined.name).toBe(roomId)
    expect(joined.isDirect).toBe(false)
    expect(joined.unread_notifications).toEqual({ notification_count: 0, highlight_count: 0 })
  })
})

describe('LegacySyncProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  async function setup(): Promise<MatrixClient> {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    vi.spyOn(client, 'startClient').mockResolvedValue(undefined)
    vi.spyOn(client, 'stopClient').mockImplementation(() => undefined)
    return client
  }

  async function startedProvider(
    client: MatrixClient,
  ): Promise<{ provider: LegacySyncProvider; listener: ReturnType<typeof vi.fn> }> {
    const provider = new LegacySyncProvider(client)
    const listener = vi.fn()
    provider.onSync(listener)
    await provider.start()
    return { provider, listener }
  }

  it('wires start/stop to the SDK client', async () => {
    const client = createClient({ baseUrl: 'https://matrix.org' })
    const start = vi.spyOn(client, 'startClient').mockResolvedValue(undefined)
    const stop = vi.spyOn(client, 'stopClient').mockImplementation(() => undefined)

    const provider = new LegacySyncProvider(client)
    await provider.start()
    expect(start).toHaveBeenCalledTimes(1)

    provider.stop()
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('assembles a SyncResponse with next_batch and joined rooms from the sync event', async () => {
    const client = await setup()
    const room = makeRoom(client)
    room.name = 'General'
    room.setUnread(NotificationCountType.Total, 2)
    room.setUnread(NotificationCountType.Highlight, 1)
    client.store.storeAccountDataEvents([
      new MatrixEvent({ type: EventType.Direct, content: { [alice]: [roomId] } }),
    ])
    await client.store.storeRoom(room)

    const { listener } = await startedProvider(client)

    client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared, {
      nextSyncToken: 'nb1',
    })

    const sync = listener.mock.calls[0][0] as SyncResponse
    expect(sync.next_batch).toBe('nb1')
    expect(sync.rooms.join[roomId]).toEqual({
      name: 'General',
      isDirect: true,
      unread_notifications: { notification_count: 2, highlight_count: 1 },
      timeline: {
        prev_batch: 't0',
        events: [
          {
            event_id: '$1',
            origin_server_ts: 1000,
            sender: bob,
            type: 'm.room.message',
            content: { body: 'hello' },
          },
        ],
      },
    })
  })

  it('ignores rooms the user has left', async () => {
    const client = await setup()
    const joined = makeRoom(client, '!joined:example.org')
    await client.store.storeRoom(joined)
    const left = makeRoom(client, '!left:example.org')
    left.updateMyMembership(KnownMembership.Leave)
    await client.store.storeRoom(left)

    const { listener } = await startedProvider(client)

    client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared, { nextSyncToken: 'nb1' })

    const sync = listener.mock.calls[0][0] as SyncResponse
    expect(Object.keys(sync.rooms.join)).toEqual(['!joined:example.org'])
  })

  it('emits the full room timeline again on every sync (dedupe happens downstream)', async () => {
    const client = await setup()
    const room = makeRoom(client)
    await client.store.storeRoom(room)

    const { listener } = await startedProvider(client)

    client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared, { nextSyncToken: 'nb1' })
    const first = listener.mock.calls[0][0] as SyncResponse
    expect(first.rooms.join[roomId].timeline?.events).toHaveLength(1)

    room
      .getLiveTimeline()
      .addEvent(
        new MatrixEvent({
          event_id: '$2',
          origin_server_ts: 2000,
          sender: bob,
          type: 'm.room.message',
          content: { body: 'second' },
        }),
        { toStartOfTimeline: false, addToState: false },
      )
    client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared, { nextSyncToken: 'nb2' })
    const second = listener.mock.calls[1][0] as SyncResponse
    expect(second.next_batch).toBe('nb2')
    expect(second.rooms.join[roomId].timeline?.events.map((e) => e.event_id)).toEqual(['$1', '$2'])

    client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared, { nextSyncToken: 'nb3' })
    const third = listener.mock.calls[2][0] as SyncResponse
    expect(third.rooms.join[roomId].timeline?.events.map((e) => e.event_id)).toEqual(['$1', '$2'])
  })

  it('emits joined rooms even when their timeline is empty', async () => {
    const client = await setup()
    const room = new Room(roomId, client, alice)
    room.updateMyMembership(KnownMembership.Join)
    await client.store.storeRoom(room)

    const { listener } = await startedProvider(client)

    client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared, { nextSyncToken: 'nb1' })

    const sync = listener.mock.calls[0][0] as SyncResponse
    expect(sync.rooms.join[roomId]).toEqual({
      name: roomId,
      isDirect: false,
      unread_notifications: { notification_count: 0, highlight_count: 0 },
      timeline: { prev_batch: '', events: [] },
    })
  })

  it('does nothing on sync states without a next batch token', async () => {
    const client = await setup()
    await client.store.storeRoom(makeRoom(client))

    const listener = vi.fn()
    new LegacySyncProvider(client).onSync(listener)

    client.emit(ClientEvent.Sync, SyncState.Reconnecting, null, {})
    expect(listener).not.toHaveBeenCalled()
  })

  it('ignores the Prepared emission of the first sync cycle (no double work)', async () => {
    const client = await setup()
    const room = makeRoom(client)
    await client.store.storeRoom(room)

    const { listener } = await startedProvider(client)

    client.emit(ClientEvent.Sync, SyncState.Prepared, null, { nextSyncToken: 'nb1' })
    client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared, {
      nextSyncToken: 'nb1',
    })

    expect(listener).toHaveBeenCalledTimes(1)
    expect((listener.mock.calls[0][0] as SyncResponse).next_batch).toBe('nb1')
  })

  it('survives malformed m.direct account data', async () => {
    const client = await setup()
    const room = makeRoom(client)
    await client.store.storeRoom(room)
    client.store.storeAccountDataEvents([
      new MatrixEvent({
        type: EventType.Direct,
        content: {
          [alice]: [roomId],
          [alice + '2']: 'not-an-array',
          [alice + '3']: ['@ok:example.org', 42],
        },
      }),
    ])

    const { listener } = await startedProvider(client)

    expect(() => {
      client.emit(ClientEvent.Sync, SyncState.Syncing, SyncState.Prepared, {
        nextSyncToken: 'nb1',
      })
    }).not.toThrow()

    const sync = listener.mock.calls[0][0] as SyncResponse
    expect(sync.rooms.join[roomId].isDirect).toBe(true)
  })
})