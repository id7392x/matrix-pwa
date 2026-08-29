<script lang="ts">
  import { cryptoStore } from '$stores/cryptoStore.svelte'
</script>

{#if cryptoStore.showBanner}
  <div class="flex flex-col gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3">
    <div class="flex items-center justify-between gap-2">
      <p class="text-sm font-medium text-amber-200">End-to-end encryption protection is not set up</p>
      <button
        class="rounded p-1 text-amber-200/70 hover:text-amber-200"
        onclick={() => void cryptoStore.dismissBanner()}
        aria-label="Dismiss security notice"
      >
        ×
      </button>
    </div>
    <div class="flex flex-wrap gap-2">
      <button
        class="rounded-lg bg-[var(--accent-color)] px-3 py-1.5 text-xs font-semibold text-white"
        onclick={() => cryptoStore.openSetup()}
      >
        Set up protection
      </button>
      <button
        class="rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-1.5 text-xs text-[var(--text-primary)] hover:bg-white/10"
        onclick={() => cryptoStore.openUnlock()}
      >
        I have a recovery key
      </button>
    </div>
  </div>
{/if}