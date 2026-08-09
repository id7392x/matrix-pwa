import 'fake-indexeddb/auto'

import { describe, expect, it } from 'vitest'

import { BatchedStoreManager, type Scheduler } from './batchedStore.svelte'
import type { EventDto } from '$types/dto'

function evt(id: string): EventDto {
  return {
    id,
    roomId: '!r:example.org',
    sender: '@alice:example.org',
    originServerTs: 1000,
    type: 'm.room.message',
    body: 'hello',
    isEncrypted: false,
    syncState: 'synced',
  }
}

function manualScheduler(): Scheduler {
  return () => {
    // no-op: flush only happens when flushToUI() is called explicitly
  }
}

function instantScheduler(): Scheduler {
  return (fn: () => void) => {
    fn()
  }
}

describe('BatchedStoreManager', () => {
  it('buffers pushed events until flushToUI delivers them as one batch', () => {
    const manager = new BatchedStoreManager(manualScheduler())
    manager.pushEvents([evt('$1')])
    manager.pushEvents([evt('$2'), evt('$3')])

    expect(manager.events).toHaveLength(0)

    manager.flushToUI()
    expect(manager.events.map((e) => e.id)).toEqual(['$1', '$2', '$3'])
  })

  it('auto-flushes after a scheduled tick', () => {
    const manager = new BatchedStoreManager(instantScheduler())
    manager.pushEvents([evt('$1')])
    expect(manager.events.map((e) => e.id)).toEqual(['$1'])
  })

  it('is a no-op when flushing an empty buffer', () => {
    const manager = new BatchedStoreManager(instantScheduler())
    manager.flushToUI()
    expect(manager.events).toHaveLength(0)
  })

  it('accumulates consecutive pushes across multiple flushes without losing events', () => {
    const manager = new BatchedStoreManager(instantScheduler())
    manager.pushEvents([evt('$1')])
    manager.flushToUI()
    manager.pushEvents([evt('$2')])
    manager.flushToUI()

    expect(manager.events.map((e) => e.id)).toEqual(['$1', '$2'])
  })

  it('reset clears delivered events', () => {
    const manager = new BatchedStoreManager(instantScheduler())
    manager.pushEvents([evt('$1')])
    manager.flushToUI()
    manager.reset()
    expect(manager.events).toHaveLength(0)
  })
})
