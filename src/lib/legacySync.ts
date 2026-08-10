import { createClient } from 'matrix-js-sdk'

import { accountManager } from '$lib/accountManager'
import { batchedStore } from '$stores/batchedStore.svelte'
import { LegacySyncProvider } from '$sync/legacySyncProvider'
import { PendingQueueService } from '$sync/PendingQueueService'
import { SyncOrchestrator } from '$sync/SyncOrchestrator'

export async function startLegacySync(userId: string): Promise<void> {
  const account = await accountManager.getActiveAccount()
  const accessToken = accountManager.getAccessToken(userId)
  if (!account || !accessToken) return

  const client = createClient({
    baseUrl: account.homeserver,
    userId,
    deviceId: account.deviceId,
    accessToken,
  })
  const orchestrator = new SyncOrchestrator(userId, new PendingQueueService(), batchedStore)
  const provider = new LegacySyncProvider(client)
  provider.onSync((sync) => orchestrator.handleSync(sync))
  await provider.start()
}