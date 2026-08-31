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
  let showPassword = $state(false)
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

<div class="relative flex w-full max-w-md flex-col gap-6">
  <!-- Decorative gradient blobs behind the card (liquid-glass background). -->
  <div
    aria-hidden="true"
    class="pointer-events-none absolute -top-24 left-1/2 -z-10 size-72 -translate-x-[120%] rounded-full bg-primary/30 blur-3xl"
  ></div>
  <div
    aria-hidden="true"
    class="pointer-events-none absolute -top-24 left-1/2 -z-10 size-72 translate-x-1/4 rounded-full bg-[#0a84ff]/20 blur-3xl"
  ></div>

  <div class="glass-panel flex flex-col gap-6 rounded-[2rem] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]">
    <header class="flex flex-col items-center gap-3">
      <div
        class="flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/80 to-[#0a84ff]/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
      >
        <svg viewBox="0 0 24 24" class="size-7 text-white" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" stroke-linejoin="round" />
          <path d="M9.5 12l1.8 1.8 3.4-3.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h1 class="text-2xl font-semibold text-[var(--text-primary)]">Sign in</h1>
      <p class="-mt-1 text-sm text-[var(--text-primary)]/60">Welcome back. Enter your credentials to continue.</p>
    </header>

    <form
      class="flex flex-col gap-4"
      onsubmit={(e) => {
        e.preventDefault()
        void handleSubmit()
      }}
    >
      <label class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-[var(--text-primary)]/70">Homeserver</span>
        <input
          name="homeserver"
          bind:value={homeserver}
          aria-invalid={error ? 'true' : undefined}
          class="rounded-2xl border border-[var(--glass-border)] bg-white/5 px-4 py-3.5 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/40 {error ? 'border-red-500/70' : ''}"
        />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-[var(--text-primary)]/70">User ID</span>
        <input
          name="userId"
          bind:value={userId}
          placeholder="@user:server.com"
          aria-invalid={error ? 'true' : undefined}
          class="rounded-2xl border border-[var(--glass-border)] bg-white/5 px-4 py-3.5 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-primary)]/40 focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/40 {error ? 'border-red-500/70' : ''}"
        />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-xs font-medium text-[var(--text-primary)]/70">Password</span>
        <div class="relative">
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            aria-invalid={error ? 'true' : undefined}
            class="w-full rounded-2xl border border-[var(--glass-border)] bg-white/5 px-4 py-3.5 pr-12 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-color)] focus:ring-2 focus:ring-[var(--accent-color)]/40 {error ? 'border-red-500/70' : ''}"
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            onclick={() => (showPassword = !showPassword)}
            class="absolute inset-y-0 right-1 flex w-11 items-center justify-center text-[var(--text-primary)]/50 hover:text-[var(--text-primary)]"
          >
            {#if showPassword}
              <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M3 3l18 18" stroke-linecap="round" />
                <path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5.5 0 9 4.5 9 7a9.6 9.6 0 0 1-2.3 3.4M6.6 6.6A9.5 9.5 0 0 0 3 12c0 2.5 3.5 7 9 7 1.4 0 2.8-.3 4-.9" stroke-linecap="round" />
                <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke-linecap="round" />
              </svg>
            {:else}
              <svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M3 12c0 2.5 3.5 7 9 7s9-4.5 9-7-3.5-7-9-7-9 4.5-9 7z" stroke-linejoin="round" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            {/if}
          </button>
        </div>
      </label>

      {#if error}
        <p role="alert" class="text-sm text-red-400">{error}</p>
      {/if}

      <button
        type="submit"
        class="mt-1 h-14 rounded-full bg-[var(--accent-color)] text-base font-semibold text-white shadow-[0_8px_24px_rgba(0,122,255,0.35)] transition hover:bg-[#0a84ff] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/50"
      >
        Sign in
      </button>
    </form>

    {#if oidcMetadata || ssoProviders.length > 0}
      <div class="flex items-center gap-3">
        <hr class="flex-1 border-[var(--glass-border)]" />
        <span class="text-xs text-[var(--text-primary)]/50">or sign in with</span>
        <hr class="flex-1 border-[var(--glass-border)]" />
      </div>

      <div class="flex flex-col gap-2">
        {#if oidcMetadata}
          <button
            type="button"
            onclick={() => void handleOidc()}
            class="flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--glass-border)] bg-white/5 px-4 text-sm font-medium text-[var(--text-primary)] transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/50"
          >
            Sign in with SSO
          </button>
        {/if}

        {#each ssoProviders as provider (provider.id)}
          <button
            type="button"
            onclick={() => handleSso(provider.id)}
            class="flex h-12 items-center justify-center gap-2 rounded-full border border-[var(--glass-border)] bg-white/5 px-4 text-sm font-medium text-[var(--text-primary)] transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/50"
          >
            Sign in with {provider.name}
          </button>
        {/each}
      </div>
    {/if}

    <p class="flex items-center justify-center gap-1.5 text-center text-xs text-[var(--text-primary)]/40">
      <svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" stroke-linejoin="round" />
      </svg>
      Your password and messages are encrypted end-to-end and never stored on this device.
    </p>
  </div>
</div>