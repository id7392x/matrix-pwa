<script lang="ts">
  import { roomStore } from '$stores/roomStore.svelte'
  import { uiStore } from '$stores/uiStore.svelte'

  import SecurityBanner from './crypto/SecurityBanner.svelte'
  import RoomListItem from './RoomListItem.svelte'

  // ponytail: neutral filter chips; wired to room folders (m.tag) in the folders slice.
  const chips = ['Все', 'Чаты', 'Контакты', 'Папки']
</script>

<div class="relative flex h-full w-full flex-col overflow-hidden">
  <header class="relative flex shrink-0 items-center justify-between px-4 py-2">
    <!-- ponytail: edit mode is a later slice; label present so the control is a11y-visible. -->
    <button
      class="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]/90 backdrop-blur-[16px]"
      aria-label="Edit chats"
      onclick={() => { /* wired in the rooms slice */ }}
    >
      Edit
    </button>
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
    <div class="flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] p-1 backdrop-blur-[16px]">
      <button
        class="flex size-8 items-center justify-center rounded-full text-[var(--text-primary)]/90 transition-colors hover:bg-white/10"
        aria-label="Mark all read"
        onclick={() => { /* wired in the rooms slice */ }}
      >
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button
        class="flex size-8 items-center justify-center rounded-full text-[var(--text-primary)]/90 transition-colors hover:bg-white/10"
        aria-label="New message"
        onclick={() => { /* wired in the rooms slice */ }}
      >
        <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
  </header>

  <SecurityBanner />

  <main class="min-h-0 flex-grow overflow-y-auto pb-40">
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

  <!-- Bottom controls overlay, per the stitched main screen: chips, tab bar, search FAB. -->
  <footer
    class="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-[var(--background)] from-70% via-[var(--background)]/90 to-transparent pb-6 pt-4"
  >
    <div
      class="no-scrollbar pointer-events-auto flex w-[calc(100%-2rem)] items-center gap-2 overflow-x-auto rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-3 py-1.5 backdrop-blur-[16px]"
    >
      {#each chips as chip, i (chip)}
        <!-- ponytail: static until the folders slice lands. -->
        <button
          class="whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors {i === 0
            ? 'bg-white/10 text-white'
            : 'text-[var(--text-primary)]/70 hover:bg-white/5'}"
          aria-label={`Filter: ${chip}`}
          onclick={() => { /* wired in the folders slice */ }}
        >
          {chip}
        </button>
      {/each}
    </div>
    <div class="pointer-events-auto flex items-center justify-center gap-2">
      <nav
        class="flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] px-2 py-1.5 shadow-xl backdrop-blur-[16px]"
        aria-label="Main navigation"
      >
        <!-- ponytail: contacts/settings screens are later slices. -->
        <button
          class="flex size-10 items-center justify-center rounded-full text-[var(--text-primary)]/70 transition-colors hover:bg-white/10"
          aria-label="Contacts"
          onclick={() => { /* wired in the contacts slice */ }}
        >
          <svg viewBox="0 0 20 20" class="size-6" fill="currentColor" aria-hidden="true">
            <path clip-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" fill-rule="evenodd"></path>
          </svg>
        </button>
        <button
          class="flex size-12 items-center justify-center rounded-full bg-[var(--accent-color)] text-white shadow-lg shadow-[var(--accent-color)]/30"
          aria-label="Chats"
          aria-current="page"
          onclick={() => uiStore.openRooms()}
        >
          <svg viewBox="0 0 20 20" class="size-6" fill="currentColor" aria-hidden="true">
            <path
              clip-rule="evenodd"
              d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z"
              fill-rule="evenodd"
            ></path>
          </svg>
        </button>
        <button
          class="flex size-10 items-center justify-center rounded-full text-[var(--text-primary)]/70 transition-colors hover:bg-white/10"
          aria-label="Settings"
          onclick={() => { /* wired in the settings slice */ }}
        >
          <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </nav>
      <!-- ponytail: search is a later slice; FAB placed per the stitched mock. -->
      <button
        class="flex size-12 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg)] text-[var(--text-primary)]/70 shadow-xl backdrop-blur-[16px]"
        aria-label="Search"
        onclick={() => { /* wired in the search slice */ }}
      >
        <svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  </footer>
</div>