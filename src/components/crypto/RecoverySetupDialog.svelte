<script lang="ts">
  import { cryptoStore } from '$stores/cryptoStore.svelte'

  async function copyKey(): Promise<void> {
    try {
      await navigator.clipboard?.writeText(cryptoStore.setupRecoveryKey)
    } catch {
      // clipboard unavailable (non-secure context) — user can copy manually
    }
  }
</script>

{#if cryptoStore.setupVisible}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Set up recovery key"
  >
    <div class="w-full max-w-md rounded-xl border border-[var(--glass-border)] bg-[#1c1917]/95 p-5">
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">Set up encryption protection</h2>

      {#if cryptoStore.setupRecoveryKey}
        <p class="mt-2 text-sm text-[var(--text-primary)]/80">
          Save this recovery key somewhere safe. Without it you cannot restore encrypted messages on a new device.
        </p>
        <textarea
          readonly
          class="mt-3 h-24 w-full resize-none rounded-lg border border-[var(--glass-border)] bg-white/5 p-2 font-mono text-xs text-[var(--text-primary)]"
          value={cryptoStore.setupRecoveryKey}
        ></textarea>
        <button
          class="mt-2 rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-white/10"
          onclick={() => void copyKey()}
        >
          Copy
        </button>
      {:else}
        <p class="mt-2 text-sm text-[var(--text-primary)]/80">
          A new recovery key and cross-signing identity will be created on your account. Encrypted messages sent from
          this session will be protected immediately.
        </p>
      {/if}

      {#if cryptoStore.setupError}
        <p class="mt-2 text-sm text-red-400">{cryptoStore.setupError}</p>
      {/if}

      <div class="mt-4 flex justify-end gap-2">
        {#if cryptoStore.setupRecoveryKey}
          <button
            class="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white"
            onclick={() => cryptoStore.finishSetup()}
          >
            I saved it
          </button>
        {:else}
          {#if cryptoStore.setupBusy}
            <button disabled class="rounded-lg bg-[var(--accent-color)]/50 px-4 py-2 text-sm font-semibold text-white">
              Setting up…
            </button>
          {:else}
            <button
              class="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white"
              onclick={() => void cryptoStore.runSetup()}
            >
              Generate
            </button>
          {/if}
          <button
            class="rounded-lg border border-[var(--glass-border)] bg-white/5 px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-white/10"
            onclick={() => cryptoStore.closeSetup()}
          >
            Cancel
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}