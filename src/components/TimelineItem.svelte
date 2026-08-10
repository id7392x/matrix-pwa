<script lang="ts">
  import type { EventDto } from '$types/dto'

  let { event }: { event: EventDto } = $props()

  const statusLabel = $derived(
    event.syncState === 'sending'
      ? 'Sending...'
      : event.syncState === 'failed'
        ? 'Failed'
        : null,
  )
</script>

<div class="rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-3">
  <div class="flex items-center gap-2">
    <span class="text-sm font-medium text-[var(--text-primary)]">{event.sender}</span>
    {#if statusLabel}
      <span data-status class="text-xs text-amber-400">{statusLabel}</span>
    {/if}
  </div>
  <p class="text-sm text-[var(--text-primary)]/90">{event.body}</p>
</div>
