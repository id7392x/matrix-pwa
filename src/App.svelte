<script lang="ts">
  import LoginScreen from '$components/LoginScreen.svelte'
  import RoomList from '$components/RoomList.svelte'
  import Timeline from '$components/Timeline.svelte'
  import PasswordPromptDialog from '$components/crypto/PasswordPromptDialog.svelte'
  import RecoveryKeyEntryDialog from '$components/crypto/RecoveryKeyEntryDialog.svelte'
  import RecoverySetupDialog from '$components/crypto/RecoverySetupDialog.svelte'
  import VerificationDialog from '$components/crypto/VerificationDialog.svelte'
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
{:else}
  <!-- Room list stays mounted beneath; the chat opens as a full-screen layer on
       top of it (activity overlay) and fades in — list state is preserved. -->
  <main class="relative h-screen">
    <RoomList />
    {#if screen.name === 'room'}
      {#key screen.roomId}
        <div class="absolute inset-0 z-10 animate-[chat-enter_0.22s_ease-out] bg-[var(--background)]">
          <Timeline roomId={screen.roomId} />
        </div>
      {/key}
    {/if}
  </main>
{/if}

<RecoverySetupDialog />
<RecoveryKeyEntryDialog />
<PasswordPromptDialog />
<VerificationDialog />
