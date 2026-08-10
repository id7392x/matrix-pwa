import { describe, expect, it } from 'vitest'
import { mount } from 'svelte'

import TimelineItem from '$components/TimelineItem.svelte'
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
})
