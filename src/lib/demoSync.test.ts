import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { startDemoSync } from '$lib/demoSync'
import { db } from '$storage/db'
import { batchedStore } from '$stores/batchedStore.svelte'
import { roomStore } from '$stores/roomStore.svelte'

describe('demo sync integration', () => {
  beforeEach(async () => {
    await db.rooms.clear()
    await db.events.clear()
    roomStore.reset()
    batchedStore.reset()
  })

  it('startDemoSync drives roomStore and batchedStore end to end', async () => {
    startDemoSync('@alice:example.org')

    await vi.waitFor(() => {
      expect(roomStore.sortedRooms).toHaveLength(2)
    })

    await vi.waitFor(() => {
      expect(batchedStore.events).toHaveLength(3)
    })
    expect(batchedStore.events.every((e) => e.roomId === '!general:example.org' || e.roomId === '!dm:example.org')).toBe(
      true,
    )
    expect(batchedStore.events[0].body).toBe('Hello everyone!')
  })
})
