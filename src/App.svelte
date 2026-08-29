<script lang="ts">
  import LoginScreen from '$components/LoginScreen.svelte'
  import RoomList from '$components/RoomList.svelte'
  import Timeline from '$components/Timeline.svelte'
  import PasswordPromptDialog from '$components/crypto/PasswordPromptDialog.svelte'
  import RecoveryKeyEntryDialog from '$components/crypto/RecoveryKeyEntryDialog.svelte'
  import RecoverySetupDialog from '$components/crypto/RecoverySetupDialog.svelte'
  import { authStore } from '$stores/authStore.svelte'
  import { uiStore } from '$stores/uiStore.svelte'

  uiStore.init()

  void (async () => {
    try {
      const ssoHandled = await authStore.handleSsoCallback()
      if (ssoHandled) { uiStore.openRooms(); return }
      const restored = await authStore.restoreSession()
      if (restored && uiStore.screen.name === 'login') uiStore.openRooms()
    } catch (err) {
      console.error('auth init failed', err)
    }
  })()

  const screen = $derived(uiStore.screen)
</script>

{#if screen.name === 'login'}
  <main class="flex h-screen items-center justify-center p-4">
    <LoginScreen />
  </main>
{:else if screen.name === 'rooms'}
  <main class="h-screen">
    <RoomList />
  </main>
{:else}
  <main class="flex h-screen">
    <section class="hidden w-80 border-r border-[var(--glass-border)] md:block">
      <RoomList />
    </section>
    <Timeline roomId={screen.roomId} />
  </main>
{/if}

<RecoverySetupDialog />
<RecoveryKeyEntryDialog />
<PasswordPromptDialog />
