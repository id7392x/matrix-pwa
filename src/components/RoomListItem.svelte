<script lang="ts">
  import { formatLastEventTs, previewText } from '$lib/format'
  import type { RoomDto } from '$types/dto'

  let { room, onSelect }: { room: RoomDto; onSelect?: (roomId: string) => void } = $props()

  const palette = ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#ffcc00', '#5ac8fa', '#ff2d55']

  function hash(input: string): number {
    let h = 0
    for (let i = 0; i < input.length; i++) h = (Math.imul(31, h) + input.charCodeAt(i)) | 0
    return Math.abs(h)
  }

  function initials(name: string): string {
    const clean = name.startsWith('!') ? '#' : name
    const parts = clean.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }

  const color = $derived(palette[hash(room.name) % palette.length])
  const time = $derived(formatLastEventTs(room.lastEventTs))
  const preview = $derived(room.lastMessage ? previewText(room.lastMessage) : '')
</script>

<li>
  <button
    class="flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent-color)]/40"
    aria-label={[room.name, time, preview, room.unreadCount > 0 ? `${room.unreadCount} unread` : '']
      .filter(Boolean)
      .join(', ')}
    onclick={() => onSelect?.(room.id)}
  >
    {#if room.avatarUrl}
      <img src={room.avatarUrl} alt="" class="size-14 shrink-0 rounded-full object-cover" />
    {:else}
      <span
        class="flex size-14 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style:background={color}
        aria-hidden="true"
      >
        {initials(room.name)}
      </span>
    {/if}

    <span class="flex min-w-0 flex-grow flex-col justify-center border-b border-white/10 pb-2">
      <span class="mb-0.5 flex items-baseline justify-between">
        <span class="truncate font-semibold text-[var(--text-primary)]">{room.name}</span>
        <span class="ml-2 shrink-0 text-xs text-[var(--text-primary)]/50">{time}</span>
      </span>
      <span class="flex items-center justify-between gap-2">
        {#if room.lastMessage}
          <span class="truncate text-sm text-[var(--text-primary)]/50">{preview}</span>
        {/if}
        {#if room.unreadCount > 0}
          <span
            class="flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent-color)] px-1.5 text-xs font-semibold text-white"
          >
            {room.unreadCount}
          </span>
        {/if}
      </span>
    </span>
  </button>
</li>