<script lang="ts">
  import { getActiveQueue } from '$sync/PendingQueueService'
  import type { EventDto } from '$types/dto'

  let { event }: { event: EventDto } = $props()

  const statusLabel = $derived(
    event.decryptionError
      ? event.decryptionError.includes('permanent')
        ? 'Unable to decrypt (permanent)'
        : 'Unable to decrypt (temporary)'
      : event.syncState === 'sending'
        ? 'Sending...'
        : event.syncState === 'failed'
          ? 'Failed'
          : null,
  )

  async function retry() {
    if (!event.txnId) return
    const queue = getActiveQueue()
    await queue?.retry(event.sender, event.txnId)
  }
</script>

<div class="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
  <div class="flex items-center gap-2">
    <span class="text-sm font-medium text-[var(--text-primary)]">{event.sender}</span>
    {#if statusLabel}
      <span data-status class="text-xs text-amber-400">{statusLabel}</span>
    {/if}
    {#if event.syncState === 'failed' && event.txnId}
      <button
        data-retry
        onclick={retry}
        class="ml-auto text-xs text-blue-400 hover:underline"
      >
        Retry
      </button>
    {/if}
  </div>
  <p class="text-sm text-[var(--text-primary)]/90">{event.body}</p>
</div>
