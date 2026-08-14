import { createClient, HttpApiEvent } from 'matrix-js-sdk'

import { accountManager } from '$lib/accountManager'
import { makeTokenRefreshFunction, normalizeHomeserver, refreshAccessTokens } from '$lib/authService'
import { db } from '$storage/db'
import { batchedStore } from '$stores/batchedStore.svelte'
import { LegacySyncProvider } from '$sync/legacySyncProvider'
import { PendingQueueService, registerQueue, unregisterQueue } from '$sync/PendingQueueService'
import { SyncOrchestrator } from '$sync/SyncOrchestrator'

export type LegacySyncHandle = { stop: () => void }

const activeSyncs = new Map<string, () => void>()

async function gcDeliveredPending(userId: string, queue: PendingQueueService): Promise<void> {
  const rows = await db.pendingEvents.where('userId').equals(userId).toArray()
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
  // C5/C6: claim the slot synchronously so a concurrent start cancels this one and
  // stopLegacySync can abort an in-flight start before the sync loop begins.
  let cancelled = false
  let stop: (() => void) | undefined
  const cancel = (): void => {
    cancelled = true
    stop?.()
  }
  activeSyncs.get(userId)?.()
  activeSyncs.set(userId, cancel)

  const noop = (): void => undefined
  try {
    const account = await db.accounts.get(userId)
    const accessToken = accountManager.getAccessToken(userId)
    if (!account || (!accessToken && !account.refreshToken)) return { stop: noop }
    if (cancelled) return { stop: noop }

    const client = createClient({
      baseUrl: normalizeHomeserver(account.homeserver),
      userId,
      deviceId: account.deviceId,
      accessToken: accessToken ?? undefined,
      refreshToken: account.refreshToken,
      tokenRefreshFunction: makeTokenRefreshFunction(userId, () => client),
    })

    // SDK-2: a reload leaves sessionStorage empty, so seed the access token from
    // the refresh token before the first authenticated request.
    if (!accessToken && account.refreshToken) {
      const refreshed = await refreshAccessTokens(client, account.refreshToken)
      client.setAccessToken(refreshed.access_token)
      await accountManager.setTokens(userId, {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
      })
    }

    client.on(HttpApiEvent.SessionLoggedOut, () => {
      onLoggedOut?.()
      stopLegacySync(userId)
    })

    const pendingQueue = new PendingQueueService(undefined, client, batchedStore)
    registerQueue(pendingQueue)
    await pendingQueue.restore(userId)
    await gcDeliveredPending(userId, pendingQueue)
    if (cancelled) return { stop: noop }

    const orchestrator = new SyncOrchestrator(userId, pendingQueue, batchedStore)
    const provider = new LegacySyncProvider(client)
    provider.onSync((sync) => orchestrator.handleSync(sync))
    await provider.start()
    if (cancelled) {
      provider.stop()
      return { stop: noop }
    }

    stop = () => {
      if (activeSyncs.get(userId) !== stop) return
      unregisterQueue(pendingQueue)
      provider.stop()
      activeSyncs.delete(userId)
    }
    activeSyncs.set(userId, stop)
    return { stop }
  } catch (error) {
    activeSyncs.delete(userId)
    throw error
  }
}

export function stopLegacySync(userId: string): void {
  activeSyncs.get(userId)?.()
}