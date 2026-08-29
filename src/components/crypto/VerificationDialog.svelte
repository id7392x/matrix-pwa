<script lang="ts">
  import { verificationStore } from '$stores/verificationStore.svelte'
</script>

{#if verificationStore.dialogVisible}
  {@const session = verificationStore.session}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Verify user"
  >
    <div class="w-full max-w-md rounded-xl border border-[var(--glass-border)] bg-[#1c1917]/95 p-5">
      {#if session?.phase === 'emoji'}
        <h2 class="text-lg font-semibold text-[var(--text-primary)]">Verify chat</h2>
        {#if session.emojis.length > 0}
          <p class="mt-2 text-sm text-[var(--text-primary)]/80">Compare these emojis with {session.otherUserId}:</p>
          <div class="mt-3 grid grid-cols-4 gap-3">
            {#each session.emojis as [emoji, name] (emoji)}
              <div class="flex flex-col items-center gap-1 rounded-lg border border-[var(--glass-border)] bg-white/5 p-2">
                <span class="text-4xl" aria-hidden="true">{emoji}</span>
                <span class="text-center text-xs text-[var(--text-primary)]/70">{name}</span>
              </div>
            {/each}
          </div>
        {:else}
          <p class="mt-2 text-sm text-[var(--text-primary)]/80">Starting verification…</p>
        {/if}
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg border border-[var(--glass-border)] bg-white/5 px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-white/10"
            onclick={() => verificationStore.cancelVerification()}
          >
            Cancel
          </button>
          {#if session.emojis.length > 0}
            <button
              class="rounded-lg border border-red-400/40 bg-white/5 px-4 py-2 text-sm text-red-400 hover:bg-white/10"
              onclick={() => verificationStore.mismatchSas()}
            >
              They don't match
            </button>
            <button
              class="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white"
              onclick={() => verificationStore.confirmSas()}
            >
              They match
            </button>
          {/if}
        </div>
      {:else if session?.phase === 'done'}
        <h2 class="text-lg font-semibold text-[var(--text-primary)]">Verified</h2>
        <p class="mt-2 text-sm text-[var(--text-primary)]/80">
          You successfully verified {session.otherUserId}. Encrypted messages are now marked as trusted.
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white"
            onclick={() => verificationStore.closeDialog()}
          >
            Close
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}