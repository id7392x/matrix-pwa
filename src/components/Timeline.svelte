<script lang="ts">
  import { batchedStore } from '$stores/batchedStore.svelte'
  import { authStore } from '$stores/authStore.svelte'
  import { roomStore } from '$stores/roomStore.svelte'
  import { verificationStore } from '$stores/verificationStore.svelte'
  import { getActiveQueue } from '$sync/PendingQueueService'
  import TimelineItem from './TimelineItem.svelte'

  let { roomId }: { roomId: string } = $props()
  let message = $state('')

  // C14: chronological, not insertion order (gap backfill / reconnect cycles arrive late)
  const events = $derived(
    batchedStore.events
      .filter((e) => e.roomId === roomId)
      .sort((a, b) => a.originServerTs - b.originServerTs),
  )
  const userId = $derived(authStore.userId)

  // Load cross-signing trust for every encrypted sender as it appears (once per session).
  $effect(() => {
    for (const sender of new Set(
      events
        .filter((e) => e.isEncrypted && e.sender !== userId)
        .map((e) => e.sender),
    )) {
      verificationStore.ensureTrust(sender)
    }
  })

  // The DM partner for the Verify CTA: the single other sender in a direct room.
  const dmPartner = $derived(
    roomStore.rooms.some((r) => r.id === roomId && r.isDirect)
      ? [...new Set(events.map((e) => e.sender).filter((s) => s !== userId))].at(0) ?? null
      : null,
  )
  const partnerNeedsVerification = $derived(dmPartner !== null && !verificationStore.isTrusted(dmPartner))

  async function sendMessage() {
    if (!message.trim() || !userId) return

    try {
      const queue = getActiveQueue()
      if (!queue) return
      await queue.sendMessage(userId, roomId, {
        body: message,
        msgtype: 'm.text',
      })
      message = ''
    } catch (error) {
      console.error('Failed to send message:', error)
    }
  }
</script>

<div class="flex h-full flex-1 flex-col gap-2 overflow-y-auto p-4">
  <div class="flex items-center justify-between">
    <h2 class="text-lg font-semibold text-[var(--text-primary)]">Messages</h2>
    {#if partnerNeedsVerification && dmPartner}
      <button
        onclick={() => verificationStore.verifyUser(dmPartner, roomId)}
        class="rounded-lg bg-[var(--accent-color)] px-3 py-1 text-xs font-semibold text-white"
      >
        Verify {dmPartner}
      </button>
      <button
        onclick={() => verificationStore.startQrShow(dmPartner, roomId)}
        class="ml-2 rounded-lg border border-[var(--glass-border)] bg-white/5 px-3 py-1 text-xs text-[var(--text-primary)] hover:bg-white/10"
      >
        QR code
      </button>
    {/if}
  </div>
  {#if events.length === 0}
    <p class="text-sm text-[var(--text-primary)]/60">No messages yet</p>
  {/if}
  {#each events as event (event.id)}
    <TimelineItem {event} {roomId} />
  {/each}

  <div class="mt-auto p-4">
    <input
      type="text"
      bind:value={message}
      placeholder="Type your message..."
      class="w-full p-2 border rounded"
      onkeydown={(e) => e.key === 'Enter' && sendMessage()}
    />
    <button
      onclick={sendMessage}
      class="mt-2 p-2 bg-blue-500 text-white rounded"
    >
      Send
    </button>
  </div>
</div>
