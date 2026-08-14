import { describe, expect, it, vi } from 'vitest'
import { mount } from 'svelte'

import TimelineItem from '$components/TimelineItem.svelte'
import { PendingQueueService, registerQueue } from '$sync/PendingQueueService'
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
  mount(TimelineItem, { target, props: { event } })
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
    expect(el.querySelector('[data-retry]')).not.toBeNull()
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
