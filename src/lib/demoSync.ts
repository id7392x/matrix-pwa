import { batchedStore } from '$stores/batchedStore.svelte'
import type { SyncResponse } from '$sync/ISyncProvider'
import { MockSyncProvider } from '$sync/mockSyncProvider'
import { PendingQueueService } from '$sync/PendingQueueService'
import { SyncOrchestrator } from '$sync/SyncOrchestrator'

function demoFixtures(): SyncResponse[] {
  const now = Date.now()
  return [
    {
      next_batch: 'demo-1',
      rooms: {
        join: {
          '!general:example.org': {
            name: 'General',
            unread_notifications: { notification_count: 2, highlight_count: 1 },
            timeline: {
              prev_batch: 't0',
              events: [
                {
                  event_id: '$demo1',
                  origin_server_ts: now - 60_000,
                  sender: '@bob:example.org',
                  type: 'm.room.message',
                  content: { body: 'Hello everyone!' },
                },
                {
                  event_id: '$demo2',
                  origin_server_ts: now - 30_000,
                  sender: '@carol:example.org',
                  type: 'm.room.message',
                  content: { body: 'Welcome to the demo.' },
                },
              ],
            },
          },
          '!dm:example.org': {
            name: 'Direct',
            isDirect: true,
            timeline: {
              prev_batch: 't0',
              events: [
                {
                  event_id: '$demo3',
                  origin_server_ts: now - 5_000,
                  sender: '@bob:example.org',
                  type: 'm.room.message',
                  content: { body: 'hi alice' },
                },
              ],
            },
          },
        },
      },
    },
  ]
}

export function startDemoSync(userId: string): void {
  const provider = new MockSyncProvider(demoFixtures())
  const orchestrator = new SyncOrchestrator(userId, new PendingQueueService(), batchedStore)
  provider.onSync((sync) => orchestrator.handleSync(sync))
  provider.start().catch((error) => console.error('demo sync failed', error))
}
