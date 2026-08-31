import 'fake-indexeddb/auto'

import { mount, tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import RoomList from '$components/RoomList.svelte'
import { cryptoStore } from '$stores/cryptoStore.svelte'
import { roomStore } from '$stores/roomStore.svelte'
import { uiStore } from '$stores/uiStore.svelte'

function mountRoomList(): HTMLElement {
  const target = document.createElement('div')
  mount(RoomList, { target })
  return target
}

function warnButton(target: HTMLElement): HTMLElement | null {
  return target.querySelector('[aria-label="Verify this session"]')
}

function verifiedButton(target: HTMLElement): HTMLElement | null {
  return target.querySelector('[aria-label="Session verified"]')
}

describe('RoomList session-verification widget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    cryptoStore.reset()
    roomStore.rooms = []
    uiStore.reset()
    cryptoStore.statusLoaded = true
    cryptoStore.secretStorageReady = true
    cryptoStore.crossSigningReady = true
    cryptoStore.bannerDismissed = true
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is hidden when the session is verified', async () => {
    cryptoStore.deviceVerified = true
    const target = mountRoomList()
    await tick()
    expect(warnButton(target)).toBeNull()
    expect(verifiedButton(target)).toBeNull()
  })

  it('shows the warning pill while the current device is unverified', async () => {
    cryptoStore.deviceVerified = false
    const target = mountRoomList()
    await tick()
    expect(warnButton(target)).not.toBeNull()
    expect(verifiedButton(target)).toBeNull()
  })

  it('opens the recovery-key unlock dialog on press', async () => {
    cryptoStore.deviceVerified = false
    const target = mountRoomList()
    await tick()

    warnButton(target)?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await tick()

    expect(cryptoStore.unlockVisible).toBe(true)
    cryptoStore.cancelUnlock()
  })

  it('flashes the check mark and then unmounts once the session becomes verified', async () => {
    cryptoStore.deviceVerified = false
    const target = mountRoomList()
    await tick()
    expect(warnButton(target)).not.toBeNull()

    cryptoStore.deviceVerified = true
    await tick()
    const flash = verifiedButton(target)
    expect(flash).not.toBeNull()
    expect(warnButton(target)).toBeNull()

    vi.advanceTimersByTime(500)
    await tick()
    verifiedButton(target)?.dispatchEvent(new AnimationEvent('animationend'))
    await tick()

    expect(verifiedButton(target)).toBeNull()
    expect(warnButton(target)).toBeNull()
  })
})