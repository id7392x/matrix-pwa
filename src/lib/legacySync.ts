import { createClient, HttpApiEvent } from 'matrix-js-sdk'

import { accountManager } from '$lib/accountManager'
import { makeTokenRefreshFunction } from '$lib/authService'
import { db } from '$storage/db'
import { batchedStore } from '$stores/batchedStore.svelte'
import { LegacySyncProvider } from '$sync/legacySyncProvider'
import { PendingQueueService, registerQueue } from '$sync/PendingQueueService'
import { SyncOrchestrator } from '$sync/SyncOrchestrator'

export type LegacySyncHandle = { stop: () => void }

const activeSyncs = new Map<string, () => void>()

async function gcDeliveredPending(userId: string, queue: PendingQueueService): Promise<void> {
  const rows = await db.pendingEvents.toArray()
  for (const row of rows) {
    if (queue.isActive(row.txnId)) continue
    const delivered = await db.events
      .where('[userId+txnId]')
      .equals([userId, row.txnId])
      .count()
    if (delivered > 0) {
      await db.pendingEvents.delete(row.userAndTxnId)
    }
  }
}

export async function startLegacySync(
  userId: string,
  onLoggedOut?: () => void,
): Promise<LegacySyncHandle> {
  const account = await accountManager.getActiveAccount()
  const accessToken = accountManager.getAccessToken(userId)
  if (!account || (!accessToken && !account.refreshToken)) return { stop: () => undefined }

  const running = activeSyncs.get(userId)
  if (running) running()

  const homeserver = account.homeserver.includes('://')
    ? account.homeserver
    : `https://${account.homeserver}`
  const client = createClient({
    baseUrl: homeserver,
    userId,
    deviceId: account.deviceId,
    accessToken: accessToken ?? undefined,
    refreshToken: account.refreshToken,
    tokenRefreshFunction: makeTokenRefreshFunction(userId, () => client),
  })
  client.on(HttpApiEvent.SessionLoggedOut, () => {
    onLoggedOut?.()
    stopLegacySync(userId)
  })

  const pendingQueue = new PendingQueueService(undefined, client, batchedStore)
  registerQueue(pendingQueue)
  await pendingQueue.restore()
  await gcDeliveredPending(userId, pendingQueue)
  const orchestrator = new SyncOrchestrator(userId, pendingQueue, batchedStore)
  const provider = new LegacySyncProvider(client)
  provider.onSync((sync) => orchestrator.handleSync(sync))
  await provider.start()

  const stop = () => {
    if (activeSyncs.get(userId) !== stop) return
    provider.stop()
    activeSyncs.delete(userId)
  }
  activeSyncs.set(userId, stop)
  return { stop }
}

export function stopLegacySync(userId: string): void {
  activeSyncs.get(userId)?.()
}
