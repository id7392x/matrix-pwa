<script lang="ts">
  import { roomStore } from '$stores/roomStore.svelte'
  import { uiStore } from '$stores/uiStore.svelte'

  import SecurityBanner from './crypto/SecurityBanner.svelte'
  import RoomListItem from './RoomListItem.svelte'
</script>

<div class="flex h-full w-full flex-col overflow-hidden">
  <header class="relative flex shrink-0 items-center justify-between px-4 py-2">
    <h2
      class="absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 text-lg font-semibold text-[var(--text-primary)]"
    >
      <svg viewBox="0 0 20 20" class="size-4 text-[var(--text-primary)]/60" fill="currentColor" aria-hidden="true">
        <path
          clip-rule="evenodd"
          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
          fill-rule="evenodd"
        ></path>
      </svg>
      Chats
    </h2>
    <div class="ml-auto flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1 backdrop-blur-[16px]">
      <button
        class="flex size-8 items-center justify-center rounded-full text-[var(--text-primary)]/90 transition-colors hover:bg-white/10"
        aria-label="Search"
        onclick={() => { /* wired in the search slice */ }}
      >
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.35-4.35" stroke-linecap="round" />
        </svg>
      </button>
      <button
        class="flex size-8 items-center justify-center rounded-full text-[var(--text-primary)]/90 transition-colors hover:bg-white/10"
        aria-label="New message"
        onclick={() => { /* wired in the rooms slice */ }}
      >
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </header>

  <SecurityBanner />

  <main class="min-h-0 flex-grow overflow-y-auto pb-6">
    {#if roomStore.sortedRooms.length === 0}
      <p class="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-[var(--text-primary)]/50">
        <svg viewBox="0 0 24 24" class="size-8" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M8 12h8m-8-4h5M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" stroke-linejoin="round" />
        </svg>
        No chats yet
      </p>
    {/if}
    <ul class="flex flex-col" role="list">
      {#each roomStore.sortedRooms as room (room.id)}
        <RoomListItem {room} onSelect={(id) => uiStore.openRoom(id)} />
      {/each}
    </ul>
  </main>
</div>