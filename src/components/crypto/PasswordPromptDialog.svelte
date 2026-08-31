<script lang="ts">
  import { cryptoStore } from '$stores/cryptoStore.svelte'

  let password = $state('')
</script>

{#if cryptoStore.passwordVisible}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Confirm your password"
  >
    <form
      class="w-full max-w-md rounded-xl border border-[var(--glass-border)] bg-[#1c1917]/95 p-5"
      onsubmit={(e) => {
        e.preventDefault()
        cryptoStore.submitPassword(password)
        password = ''
      }}
    >
      <h2 class="text-lg font-semibold text-[var(--text-primary)]">Confirm your password</h2>
      <p class="mt-2 text-sm text-[var(--text-primary)]/80">
        Needed to upload your new device signing keys. It is used once and never stored.
      </p>
      <input
        type="password"
        bind:value={password}
        placeholder="Password"
        class="mt-3 w-full rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)]"
      />
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-[var(--glass-border)] bg-white/5 px-4 py-2 text-sm text-[var(--text-primary)]"
          onclick={() => {
            cryptoStore.cancelPassword()
            password = ''
          }}
        >
          Cancel
        </button>
        <button type="submit" class="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white">
          Confirm
        </button>
      </div>
    </form>
  </div>
{/if}