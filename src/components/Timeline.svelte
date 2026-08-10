<script lang="ts">
  import { batchedStore } from '$stores/batchedStore.svelte'

  import TimelineItem from './TimelineItem.svelte'

  let { roomId }: { roomId: string } = $props()

  const events = $derived(batchedStore.events.filter((e) => e.roomId === roomId))
</script>

<div class="flex h-full flex-1 flex-col gap-2 overflow-y-auto p-4">
  <h2 class="text-lg font-semibold text-[var(--text-primary)]">Messages</h2>
  {#if events.length === 0}
    <p class="text-sm text-[var(--text-primary)]/60">No messages yet</p>
  {/if}
  {#each events as event (event.id)}
    <TimelineItem {event} />
  {/each}
</div>
