import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from 'svelte'

import LoginScreen from '$components/LoginScreen.svelte'
import { accountManager } from '$lib/accountManager'
import { startLegacySync } from '$lib/legacySync'
import { uiStore } from '$stores/uiStore.svelte'

vi.mock('$lib/legacySync', () => ({ startLegacySync: vi.fn().mockResolvedValue(undefined) }))

describe('LoginScreen', () => {
  beforeEach(() => {
    uiStore.reset()
    location.hash = ''
    vi.restoreAllMocks()
  })

  it('submits credentials via AccountManager and switches to rooms', async () => {
    const addSpy = vi.spyOn(accountManager, 'addAccount').mockResolvedValue(undefined)
    const tokenSpy = vi.spyOn(accountManager, 'setAccessToken').mockImplementation(() => {})

    const target = document.createElement('div')
    mount(LoginScreen, { target })

    const set = (selector: string, value: string): void => {
      const el = target.querySelector(selector) as HTMLInputElement
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set('input[name="userId"]', '@alice:example.org')
    set('input[name="accessToken"]', 'secret-token')
    set('input[name="homeserver"]', 'example.org')
    set('input[name="deviceId"]', 'DEV1')

    const form = target.querySelector('form')
    expect(form).not.toBeNull()
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith({
        userId: '@alice:example.org',
        homeserver: 'example.org',
        deviceId: 'DEV1',
        isPrimary: true,
      })
      expect(tokenSpy).toHaveBeenCalledWith('@alice:example.org', 'secret-token')
      expect(startLegacySync).toHaveBeenCalledWith('@alice:example.org')
      expect(uiStore.screen).toEqual({ name: 'rooms' })
    })
  })
})
