import { describe, expect, it, vi } from 'vitest'
import { mount } from 'svelte'

import RoomListItem from '$components/RoomListItem.svelte'
import type { RoomDto } from '$types/dto'

function makeRoom(overrides: Partial<RoomDto> = {}): RoomDto {
  return {
    id: '!room:example.org',
    name: 'Matrix HQ',
    unreadCount: 0,
    highlightCount: 0,
    lastEventTs: 0,
    isDirect: false,
    ...overrides,
  }
}

describe('RoomListItem', () => {
  it('renders initials avatar derived from the room name', () => {
    const target = document.createElement('div')
    mount(RoomListItem, { target, props: { room: makeRoom({ name: 'Matrix HQ' }) } })

    const avatar = target.querySelector('span[aria-hidden="true"]')
    expect(avatar?.textContent).toBe('MH')
  })

  it('falls back to a # marker for raw room-id names', () => {
    const target = document.createElement('div')
    mount(RoomListItem, { target, props: { room: makeRoom({ name: '!abc:example.org' }) } })

    expect(target.querySelector('span[aria-hidden="true"]')?.textContent).toBe('#')
  })

  it('shows the unread badge only when unreadCount > 0', () => {
    const target = document.createElement('div')
    mount(RoomListItem, { target, props: { room: makeRoom({ unreadCount: 3 }) } })
    expect(target.textContent).toContain('3')

    const clean = document.createElement('div')
    mount(RoomListItem, { target: clean, props: { room: makeRoom() } })
    expect(clean.textContent).not.toContain('unread')
  })

  it('calls onSelect with the room id on click', () => {
    const onSelect = vi.fn()
    const target = document.createElement('div')
    mount(RoomListItem, { target, props: { room: makeRoom(), onSelect } })

    target.querySelector('button')!.dispatchEvent(new Event('click', { bubbles: true }))
    expect(onSelect).toHaveBeenCalledWith('!room:example.org')
  })
})