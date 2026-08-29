<script lang="ts">
  import { roomStore } from '$stores/roomStore.svelte'
  import { uiStore } from '$stores/uiStore.svelte'

  import SecurityBanner from './crypto/SecurityBanner.svelte'
  import RoomListItem from './RoomListItem.svelte'
</script>

<div class="flex h-full w-full flex-col gap-2 overflow-y-auto p-4">
  <h2 class="text-lg font-semibold text-[var(--text-primary)]">Rooms</h2>
  <SecurityBanner />
  {#if roomStore.sortedRooms.length === 0}
    <p class="text-sm text-[var(--text-primary)]/60">No rooms yet</p>
  {/if}
  {#each roomStore.sortedRooms as room (room.id)}
    <RoomListItem {room} onSelect={(id) => uiStore.openRoom(id)} />
  {/each}
</div>
