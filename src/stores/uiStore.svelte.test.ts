import { beforeEach, describe, expect, it } from 'vitest'

import { batchedStore } from '$stores/batchedStore.svelte'
import { uiStore } from '$stores/uiStore.svelte'
import type { EventDto } from '$types/dto'

function evt(id: string): EventDto {
  return {
    id,
    roomId: '!r:example.org',
    sender: '@alice:example.org',
    originServerTs: 1000,
    type: 'm.room.message',
    body: 'hello',
    isEncrypted: false,
    syncState: 'synced',
  }
}

describe('uiStore', () => {
  beforeEach(() => {
    uiStore.reset()
    uiStore.init()
    batchedStore.reset()
    location.hash = ''
  })

  it('openRoom switches to the room screen and syncs location.hash', () => {
    uiStore.openRoom('!a:example.org')
    expect(uiStore.screen).toEqual({ name: 'room', roomId: '!a:example.org' })
    expect(location.hash).toBe('#/room/!a%3Aexample.org')
  })

  it('openLogin switches back to the login screen and syncs the hash', () => {
    uiStore.openRoom('!a')
    uiStore.openLogin()
    expect(uiStore.screen).toEqual({ name: 'login' })
    expect(location.hash).toBe('#/login')
  })

  it('back returns to the previous screen', () => {
    uiStore.openRooms()
    uiStore.openRoom('!a')
    expect(uiStore.screen).toEqual({ name: 'room', roomId: '!a' })

    uiStore.back()

    expect(uiStore.screen).toEqual({ name: 'rooms' })
    expect(location.hash).toBe('#/rooms')
  })

  it('browser back (hashchange) restores the screen from the hash', () => {
    location.hash = '#/room/!b:example.org'
    window.dispatchEvent(new Event('hashchange'))
    expect(uiStore.screen).toEqual({ name: 'room', roomId: '!b:example.org' })
  })

  it('records the previous hash on browser navigation so in-app back stays coherent', () => {
    uiStore.openRoom('!a')
    const oldURL = `https://example.org${location.hash}`
    location.hash = '#/room/!c'
    window.dispatchEvent(new HashChangeEvent('hashchange', { oldURL, newURL: location.hash }))

    uiStore.back()

    expect(uiStore.screen).toEqual({ name: 'room', roomId: '!a' })
  })

  it('reset clears history so a stale back cannot cross accounts', () => {
    uiStore.openRooms()
    uiStore.openRoom('!a')
    uiStore.reset()

    expect(uiStore.screen).toEqual({ name: 'login' })
    uiStore.back()
    expect(uiStore.screen).toEqual({ name: 'login' })
  })

  it('does not crash on a malformed percent-encoded room id in the hash', () => {
    location.hash = '#/room/%zz'
    window.dispatchEvent(new Event('hashchange'))
    expect(uiStore.screen.name).toBe('room')
  })

  it('openRoom clears pending buffered timeline state', () => {
    batchedStore.pushEvents([evt('$buffered')])
    uiStore.openRoom('!a')
    batchedStore.flushToUI()
    expect(batchedStore.events).toHaveLength(0)
  })
})
