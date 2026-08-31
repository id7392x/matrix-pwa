<script lang="ts">
  import { cryptoStore } from '$stores/cryptoStore.svelte'

  let recoveryKey = $state('')

  async function submit(): Promise<void> {
    await cryptoStore.submitUnlockKey(recoveryKey.trim())
    if (!cryptoStore.unlockVisible) recoveryKey = ''
  }
</script>

{#if cryptoStore.unlockVisible}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Enter recovery key"
  >
    <form
      class="w-full max-w-md rounded-xl border border-[var(--glass-border)] bg-[#1c1917]/95 p-5"
      onsubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">Enter your recovery key</h2>
      <p class="mt-2 text-sm text-[var(--text-primary)]/80">
        The recovery key unlocks encrypted messages on this device.
      </p>
      <input
        type="password"
        bind:value={recoveryKey}
        placeholder="Recovery key"
        class="mt-3 w-full rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)]"
      />
      {#if cryptoStore.unlockError}
        <p class="mt-2 text-sm text-red-400">{cryptoStore.unlockError}</p>
      {/if}
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-[var(--glass-border)] bg-white/5 px-4 py-2 text-sm text-[var(--text-primary)]"
          onclick={() => cryptoStore.cancelUnlock()}
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white"
        >
          Unlock
        </button>
      </div>
    </form>
  </div>
{/if}