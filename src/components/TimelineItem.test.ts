import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from 'svelte'

import TimelineItem from '$components/TimelineItem.svelte'
import { PendingQueueService, registerQueue } from '$sync/PendingQueueService'
import { authStore } from '$stores/authStore.svelte'
import { verificationStore } from '$stores/verificationStore.svelte'
import type { EventDto } from '$types/dto'

function evt(overrides: Partial<EventDto> = {}): EventDto {
  return {
    id: '$1',
    roomId: '!r:example.org',
    sender: '@alice:example.org',
    originServerTs: 1000,
    type: 'm.room.message',
    body: 'hello',
    isEncrypted: false,
    syncState: 'synced',
    ...overrides,
  }
}

function render(event: EventDto): HTMLElement {
  const target = document.createElement('div')
  mount(TimelineItem, { target, props: { event, roomId: '!r:example.org' } })
  return target
}

describe('TimelineItem', () => {
  it('shows a sending indicator while the event is sending', () => {
    const el = render(evt({ syncState: 'sending' }))
    expect(el.querySelector('[data-status]')?.textContent).toBe('Sending...')
  })

  it('shows a failure indicator for a failed event', () => {
    const el = render(evt({ syncState: 'failed' }))
    expect(el.querySelector('[data-status]')?.textContent).toBe('Failed')
  })

  it('renders no status indicator for synced events', () => {
    const el = render(evt())
    expect(el.querySelector('[data-status]')).toBeNull()
  })

  it('renders the message body and sender', () => {
    const el = render(evt({ body: 'hi', sender: '@bob:example.org' }))
    expect(el.textContent).toContain('hi')
    expect(el.textContent).toContain('@bob:example.org')
  })

  it('renders a retry button for a failed event carrying a txnId', () => {
    const el = render(evt({ syncState: 'failed', txnId: 'txn-1' }))
    expect(el.querySelector('[data-retry]')).toBeTruthy()
  })

  it('shows decryption error status when event has decryptionError', () => {
    const el = render(evt({ decryptionError: 'Unable to decrypt: keys not found' }))
    expect(el.querySelector('[data-status]')?.textContent).toContain('Unable to decrypt')
  })

  it('shows permanent decryption error status when permanent', () => {
    const el = render(evt({ decryptionError: 'Unable to decrypt: keys not found (permanent)' }))
    expect(el.querySelector('[data-status]')?.textContent).toContain('Unable to decrypt (permanent)')
  })

  it('does not show decryption error for synced event without decryptionError', () => {
    const el = render(evt())
    expect(el.querySelector('[data-status]')).toBeNull()
  })

  it('shows decryption error before sending status when both present', () => {
    const el = render(evt({ syncState: 'sending', decryptionError: 'Unable to decrypt: keys not found' }))
    expect(el.querySelector('[data-status]')?.textContent).toContain('Unable to decrypt')
  })

  it('renders no retry button for a failed event without a txnId', () => {
    const el = render(evt({ syncState: 'failed' }))
    expect(el.querySelector('[data-retry]')).toBeNull()
  })

  it('retry button calls queue.retry with the sender and txnId', async () => {
    const queue = new PendingQueueService()
    registerQueue(queue)
    const retry = vi.spyOn(queue, 'retry').mockResolvedValue(undefined)

    const el = render(evt({ syncState: 'failed', txnId: 'txn-1', sender: '@alice:example.org' }))
    const button = el.querySelector('[data-retry]') as HTMLButtonElement
    button.click()

    await vi.waitFor(() => expect(retry).toHaveBeenCalledWith('@alice:example.org', 'txn-1'))
  })
})

describe('TimelineItem verification', () => {
  beforeEach(() => {
    authStore.userId = '@me:example.org'
    verificationStore.reset()
  })

  it('renders a Verify button for a foreign encrypted sender', () => {
    const el = render(evt({ isEncrypted: true, sender: '@alice:example.org' }))
    expect(el.querySelector('[data-verify]')).toBeTruthy()
  })

  it('renders a Verify button even when the sender is already trusted', () => {
    verificationStore.trust.set('@alice:example.org', true)
    const el = render(evt({ isEncrypted: true, sender: '@alice:example.org' }))
    expect(el.querySelector('[data-verify]')).toBeTruthy()
  })

  it('renders a Verify button for a foreign unencrypted sender', () => {
    const el = render(evt({ sender: '@alice:example.org' }))
    expect(el.querySelector('[data-verify]')).toBeTruthy()
  })

  it('does not render a Verify button for the user\'s own message', () => {
    const el = render(evt({ sender: '@me:example.org' }))
    expect(el.querySelector('[data-verify]')).toBeNull()
  })

  it('does not render the untrusted shield for the user\'s own message', () => {
    const el = render(evt({ isEncrypted: true, sender: '@me:example.org' }))
    expect(el.querySelector('[data-shield]')).toBeNull()
  })

  it('Verify button calls verificationStore.verifyUser with the sender and roomId', () => {
    const verifyUser = vi.spyOn(verificationStore, 'verifyUser')
    const el = render(evt({ isEncrypted: true, sender: '@alice:example.org' }))
    const button = el.querySelector('[data-verify]') as HTMLButtonElement
    button.click()

    expect(verifyUser).toHaveBeenCalledWith('@alice:example.org', '!r:example.org')
  })
})
