<script lang="ts">
  import { accountManager } from '$lib/accountManager'
  import { startLegacySync } from '$lib/legacySync'
  import { authStore } from '$stores/authStore.svelte'
  import { uiStore } from '$stores/uiStore.svelte'

  let homeserver = $state('matrix.org')
  let userId = $state('')
  let deviceId = $state('')
  let accessToken = $state('')
  let error = $state<string | null>(null)

  async function handleSubmit(): Promise<void> {
    error = null
    const trimmedUserId = userId.trim()
    const trimmedToken = accessToken.trim()
    if (!trimmedUserId || !trimmedToken) {
      error = 'userId and accessToken are required'
      return
    }
    await accountManager.addAccount({ userId: trimmedUserId, homeserver, deviceId, isPrimary: true })
    accountManager.setAccessToken(trimmedUserId, trimmedToken)
    authStore.signIn(trimmedUserId, deviceId, homeserver, trimmedToken)
    void startLegacySync(trimmedUserId).catch((error) => {
      console.error('legacy sync start failed', error)
    })
    uiStore.openRooms()
  }
</script>

<form
  class="flex w-full max-w-md flex-col gap-4"
  onsubmit={(e) => {
    e.preventDefault()
    void handleSubmit()
  }}
>
  <h1 class="text-2xl font-semibold text-[var(--text-primary)]">Sign in to Matrix</h1>

  <label class="flex flex-col gap-1">
    <span class="text-xs text-[var(--text-primary)]/70">Homeserver</span>
    <input
      name="homeserver"
      bind:value={homeserver}
      class="rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)]"
    />
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-xs text-[var(--text-primary)]/70">User ID</span>
    <input
      name="userId"
      bind:value={userId}
      class="rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)]"
    />
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-xs text-[var(--text-primary)]/70">Device ID</span>
    <input
      name="deviceId"
      bind:value={deviceId}
      class="rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)]"
    />
  </label>

  <label class="flex flex-col gap-1">
    <span class="text-xs text-[var(--text-primary)]/70">Access token</span>
    <input
      name="accessToken"
      type="password"
      bind:value={accessToken}
      class="rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-2 text-sm text-[var(--text-primary)]"
    />
  </label>

  {#if error}
    <p class="text-sm text-red-400">{error}</p>
  {/if}

  <button
    type="submit"
    class="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white"
  >
    Sign in
  </button>
</form>
