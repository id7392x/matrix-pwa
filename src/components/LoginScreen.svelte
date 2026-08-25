<script lang="ts">
  import { onMount } from 'svelte'
  import {
    login,
    discoverSsoProviders,
    ssoLogin,
    discoverOidcAuth,
    oidcLogin,
    type SsoProvider,
  } from '$lib/authService'
  import type { ValidatedAuthMetadata } from 'matrix-js-sdk/lib/oauth'
  import { authStore } from '$stores/authStore.svelte'
  import { uiStore } from '$stores/uiStore.svelte'

  let homeserver = $state('matrix.org')
  let userId = $state('')
  let password = $state('')
  let error = $state<string | null>(null)
  let ssoProviders = $state<SsoProvider[]>([])
  let oidcMetadata = $state<ValidatedAuthMetadata | null>(null)

  onMount(async () => {
    const [providers, oidc] = await Promise.all([
      discoverSsoProviders(homeserver),
      discoverOidcAuth(homeserver),
    ])
    ssoProviders = providers
    oidcMetadata = oidc
  })

  async function handleSubmit(): Promise<void> {
    error = null
    const trimmedUserId = userId.trim()
    if (!trimmedUserId || !password) {
      error = 'userId and password are required'
      return
    }
    try {
      await login(homeserver, trimmedUserId, password)
      const restored = await authStore.restoreSession()
      if (!restored) throw new Error('Session could not be restored')
      uiStore.openRooms()
    } catch (loginError) {
      error = loginError instanceof Error ? loginError.message : 'Login failed'
    }
  }

  function handleSso(idpId: string): void {
    sessionStorage.setItem('sso_homeserver', homeserver)
    const redirectUrl = location.origin + location.pathname
    const url = ssoLogin(homeserver, idpId, redirectUrl)
    window.location.href = url
  }

  async function handleOidc(): Promise<void> {
    if (!oidcMetadata) return
    error = null
    try {
      const redirectUrl = location.origin + location.pathname
      const url = await oidcLogin(homeserver, oidcMetadata, redirectUrl)
      window.location.href = url
    } catch (oidcError) {
      error = oidcError instanceof Error ? oidcError.message : 'OIDC login failed'
    }
  }
</script>

<div class="flex w-full max-w-md flex-col gap-4">
  <form
    class="flex flex-col gap-4"
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
      <span class="text-xs text-[var(--text-primary)]/70">Password</span>
      <input
        name="password"
        type="password"
        bind:value={password}
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

  {#if oidcMetadata || ssoProviders.length > 0}
    <div class="flex items-center gap-3">
      <hr class="flex-1 border-[var(--glass-border)]" />
      <span class="text-xs text-[var(--text-primary)]/50">or</span>
      <hr class="flex-1 border-[var(--glass-border)]" />
    </div>

    <div class="flex flex-col gap-2">
      {#if oidcMetadata}
        <button
          type="button"
          onclick={() => void handleOidc()}
          class="flex items-center justify-center gap-2 rounded-lg border border-[var(--glass-border)] bg-white/5 px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-white/10"
        >
          Sign in with SSO
        </button>
      {/if}

      {#each ssoProviders as provider (provider.id)}
        <button
          type="button"
          onclick={() => handleSso(provider.id)}
          class="flex items-center justify-center gap-2 rounded-lg border border-[var(--glass-border)] bg-white/5 px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-white/10"
        >
          Sign in with {provider.name}
        </button>
      {/each}
    </div>
  {/if}
</div>
