import { createClient } from 'matrix-js-sdk'

import { accountManager } from '$lib/accountManager'
import { batchedStore } from '$stores/batchedStore.svelte'
import { LegacySyncProvider } from '$sync/legacySyncProvider'
import { PendingQueueService } from '$sync/PendingQueueService'
import { SyncOrchestrator } from '$sync/SyncOrchestrator'

export type LegacySyncHandle = { stop: () => void }

const activeSyncs = new Map<string, () => void>()

export async function startLegacySync(userId: string): Promise<LegacySyncHandle> {
  const account = await accountManager.getActiveAccount()
  const accessToken = accountManager.getAccessToken(userId)
  if (!account || !accessToken) return { stop: () => undefined }

  const running = activeSyncs.get(userId)
  if (running) running()

  const homeserver = account.homeserver.includes('://')
    ? account.homeserver
    : `https://${account.homeserver}`
  const client = createClient({
    baseUrl: homeserver,
    userId,
    deviceId: account.deviceId,
    accessToken,
  })
  const orchestrator = new SyncOrchestrator(userId, new PendingQueueService(), batchedStore)
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