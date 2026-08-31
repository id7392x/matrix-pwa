<script lang="ts">
  import { authStore } from '$stores/authStore.svelte'
  import { getActiveQueue } from '$sync/PendingQueueService'
  import { verificationStore } from '$stores/verificationStore.svelte'
  import type { EventDto } from '$types/dto'

  let { event, roomId }: { event: EventDto; roomId: string } = $props()

  const isOwn = $derived(event.sender === authStore.userId)
  // Verification of the sender is always possible; the shield only flags untrusted encrypted senders.
  const canVerify = $derived(!isOwn)
  const isUntrusted = $derived(event.isEncrypted && !isOwn && !verificationStore.isTrusted(event.sender))

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
    {#if isUntrusted}
      <svg
        data-shield
        class="h-4 w-4 text-amber-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-label="Sender not verified"
      >
        <title>Sender not verified</title>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    {/if}
    {#if statusLabel}
      <span data-status class="text-xs text-amber-400">{statusLabel}</span>
    {/if}
    <div class="ml-auto flex items-center gap-2">
      {#if canVerify}
        <button
          data-verify
          onclick={() => verificationStore.verifyUser(event.sender, roomId)}
          class="text-xs text-blue-400"
        >
          Verify
        </button>
      {/if}
      {#if event.syncState === 'failed' && event.txnId}
        <button
          data-retry
          onclick={retry}
          class="text-xs text-blue-400"
        >
          Retry
        </button>
      {/if}
    </div>
  </div>
  <p class="text-sm text-[var(--text-primary)]/90">{event.body}</p>
</div>
