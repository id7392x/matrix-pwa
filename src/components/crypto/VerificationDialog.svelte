<script lang="ts">
  import jsQR from 'jsqr'
  import { renderSVG } from 'uqr'
  import { verificationStore } from '$stores/verificationStore.svelte'

  let mode = $state<'show' | 'scan'>('show')
  let qrSvg = $state('')
  let scanning = $state(false)
  let scanError = $state('')
  let rafId = 0
  let stream: MediaStream | undefined
  let video = $state<HTMLVideoElement>()

  // QR image for the "show" pane, rendered on demand from the session's QR text.
  $effect(() => {
    const session = verificationStore.session
    if (session?.phase === 'qr' && session.qrText && !qrSvg) {
      try {
        qrSvg = renderSVG(session.qrText, { pixelSize: 8 })
      } catch {
        qrSvg = ''
      }
    }
  })

  // When the dialog hides, stop the camera loop and reset local state.
  $effect(() => {
    if (!verificationStore.dialogVisible) {
      stopScan()
      qrSvg = ''
      mode = 'show'
    }
  })

  function stopScan(): void {
    cancelAnimationFrame(rafId)
    stream?.getTracks().forEach((track) => track.stop())
    stream = undefined
    scanning = false
  }

  async function startScan(): Promise<void> {
    scanError = ''
    if (!navigator.mediaDevices?.getUserMedia || !video) {
      scanError = 'Камера недоступна. Дайте разрешение или используйте «Показать мой код».'
      return
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      if (!video) return
      video.srcObject = stream
      await video.play()
      scanning = true
      tick()
    } catch {
      stopScan()
      scanError = 'Камера недоступна. Дайте разрешение или используйте «Показать мой код».'
    }
  }

  function tick(): void {
    if (!scanning || !video || video.readyState !== video.HAVE_ENOUGH_DATA) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      rafId = requestAnimationFrame(tick)
      return
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(image.data, image.width, image.height)
    if (code?.data) {
      stopScan()
      const session = verificationStore.session
      if (session) {
        verificationStore.scanQr(session.otherUserId, session.roomId ?? '', code.data)
      }
      return
    }
    rafId = requestAnimationFrame(tick)
  }
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
      {:else if session?.phase === 'qr'}
        <h2 class="text-lg font-semibold text-[var(--text-primary)]">Verify chat</h2>
        {#if !session.qrText}
          <p class="mt-2 text-sm text-[var(--text-primary)]/80">Starting verification…</p>
        {/if}
        <div class="mt-2 flex gap-2">
          <button
            class="rounded-lg px-3 py-1.5 text-sm {mode === 'show'
              ? 'bg-[var(--accent-color)] font-semibold text-white'
              : 'border border-[var(--glass-border)] bg-white/5 text-[var(--text-primary)] hover:bg-white/10'}"
            onclick={() => (mode = 'show')}
          >
            Show my code
          </button>
          <button
            class="rounded-lg px-3 py-1.5 text-sm {mode === 'scan'
              ? 'bg-[var(--accent-color)] font-semibold text-white'
              : 'border border-[var(--glass-border)] bg-white/5 text-[var(--text-primary)] hover:bg-white/10'}"
            onclick={() => (mode = 'scan')}
          >
            Scan a code
          </button>
        </div>
        {#if mode === 'show'}
          <div class="mt-3 flex flex-col items-center gap-2">
            {#if qrSvg}
              <div
                class="h-64 w-64 rounded-lg border border-[var(--glass-border)] bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
              >
                <!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG is generated by uqr from encoded modules, user text is never embedded as markup -->
              {@html qrSvg}
              </div>
            {:else}
              <div class="flex h-64 w-64 items-center justify-center rounded-lg border border-[var(--glass-border)] bg-white/5">
                <span class="text-sm text-[var(--text-primary)]/60">Generating QR code…</span>
              </div>
            {/if}
            {#if session.callbacks}
              <p class="text-sm text-[var(--text-primary)]/80">{session.otherUserId} scanned the code. Does it match?</p>
            {:else}
              <p class="text-center text-sm text-[var(--text-primary)]/80">
                Have {session.otherUserId} scan this code from their app.
              </p>
            {/if}
          </div>
        {:else}
          <div class="mt-3 flex flex-col items-center gap-2">
            <video
              bind:this={video}
              autoplay
              muted
              playsinline
              class="h-64 w-64 rounded-lg border border-[var(--glass-border)] bg-black object-cover"
            ></video>
            {#if scanError}
              <p class="text-sm text-red-400">{scanError}</p>
            {:else if scanning}
              <p class="text-sm text-[var(--text-primary)]/80">Point the camera at {session.otherUserId}'s code…</p>
            {:else}
              <button
                class="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white"
                onclick={() => void startScan()}
              >
                Start camera
              </button>
            {/if}
          </div>
        {/if}
        <div class="mt-4 flex justify-end gap-2">
          <button
            class="rounded-lg border border-[var(--glass-border)] bg-white/5 px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-white/10"
            onclick={() => verificationStore.cancelVerification()}
          >
            Cancel
          </button>
          {#if session.callbacks}
            <button
              class="rounded-lg bg-[var(--accent-color)] px-4 py-2 text-sm font-semibold text-white"
              onclick={() => verificationStore.confirmQr()}
            >
              Confirmed
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