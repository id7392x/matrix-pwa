<script lang="ts">
  import { batchedStore } from '$stores/batchedStore.svelte'
  import { authStore } from '$stores/authStore.svelte'
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
  <h2 class="text-lg font-semibold text-[var(--text-primary)]">Messages</h2>
  {#if events.length === 0}
    <p class="text-sm text-[var(--text-primary)]/60">No messages yet</p>
  {/if}
  {#each events as event (event.id)}
    <TimelineItem {event} />
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
