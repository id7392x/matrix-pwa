<script lang="ts">
  import { formatLastEventTs } from '$lib/format'
  import type { RoomDto } from '$types/dto'

  let { room, onSelect }: { room: RoomDto; onSelect?: (roomId: string) => void } = $props()
</script>

<button
  class="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-3 text-left"
  onclick={() => onSelect?.(room.id)}
>
  <span class="truncate text-sm font-medium text-[var(--text-primary)]">{room.name}</span>
  <span class="flex shrink-0 items-center gap-2">
    <span class="text-xs text-[var(--text-primary)]/60">{formatLastEventTs(room.lastEventTs)}</span>
    {#if room.unreadCount > 0}
      <span
        class="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-color)] px-1.5 text-xs font-semibold text-white"
      >
        {room.unreadCount}
      </span>
    {/if}
  </span>
</button>
