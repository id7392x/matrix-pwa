import { batchedStore } from './batchedStore.svelte'

export type UiScreen = { name: 'login' } | { name: 'rooms' } | { name: 'room'; roomId: string }

const LOGIN_HASH = '#/login'
const ROOMS_HASH = '#/rooms'

function decodeRoomId(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function screenFromHash(hash: string): UiScreen {
  const path = hash.replace(/^#\/?/, '')
  if (path.startsWith('room/')) {
    return { name: 'room', roomId: decodeRoomId(path.slice('room/'.length)) }
  }
  if (path === 'rooms') return { name: 'rooms' }
  return { name: 'login' }
}

class UiStore {
  screen = $state<UiScreen>({ name: 'login' })
  private history: string[] = []
  private initialized = false

  init(): void {
    if (this.initialized || typeof window === 'undefined') return
    this.initialized = true
    this.applyHash(location.hash)
    window.addEventListener('hashchange', () => this.applyHash(location.hash))
  }

  openLogin(): void {
    this.go(LOGIN_HASH)
  }

  openRooms(): void {
    this.go(ROOMS_HASH)
  }

  openRoom(roomId: string): void {
    this.history.push(location.hash || LOGIN_HASH)
    this.go(`#/room/${encodeURIComponent(roomId)}`)
    batchedStore.resetBuffer()
  }

  back(): void {
    this.go(this.history.pop() ?? ROOMS_HASH)
  }

  reset(): void {
    this.screen = { name: 'login' }
    this.history = []
  }

  private go(hash: string): void {
    if (location.hash !== hash) location.hash = hash
    this.applyHash(hash)
  }

  private applyHash(hash: string): void {
    this.screen = screenFromHash(hash)
  }
}

export const uiStore = new UiStore()
