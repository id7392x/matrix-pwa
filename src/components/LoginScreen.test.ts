import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from 'svelte'

import LoginScreen from '$components/LoginScreen.svelte'
import { login } from '$lib/authService'
import { authStore } from '$stores/authStore.svelte'
import { uiStore } from '$stores/uiStore.svelte'

vi.mock('$lib/authService', () => ({ login: vi.fn() }))

describe('LoginScreen', () => {
  beforeEach(() => {
    uiStore.reset()
    authStore.reset()
    sessionStorage.clear()
    location.hash = ''
    vi.restoreAllMocks()
  })

  it('offers a password field and hides device/access token fields', async () => {
    const target = document.createElement('div')
    mount(LoginScreen, { target })

    expect(target.querySelector('input[name="password"]')).not.toBeNull()
    expect(target.querySelector('input[name="deviceId"]')).toBeNull()
    expect(target.querySelector('input[name="accessToken"]')).toBeNull()
  })

  it('submits the password via authService.login and switches to rooms', async () => {
    vi.spyOn(authStore, 'restoreSession').mockResolvedValue(true)
    const target = document.createElement('div')
    mount(LoginScreen, { target })

    const set = (selector: string, value: string): void => {
      const el = target.querySelector(selector) as HTMLInputElement
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set('input[name="userId"]', '@alice:example.org')
    set('input[name="password"]', 's3cret')
    set('input[name="homeserver"]', 'example.org')

    const form = target.querySelector('form')
    expect(form).not.toBeNull()
    form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      expect(login).toHaveBeenCalledWith('example.org', '@alice:example.org', 's3cret')
      expect(uiStore.screen).toEqual({ name: 'rooms' })
    })
  })

  it('shows an error when login fails and stays on the login screen', async () => {
    vi.mocked(login).mockRejectedValue(new Error('Invalid credentials'))
    const target = document.createElement('div')
    mount(LoginScreen, { target })

    const set = (selector: string, value: string): void => {
      const el = target.querySelector(selector) as HTMLInputElement
      el.value = value
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    set('input[name="userId"]', '@alice:example.org')
    set('input[name="password"]', 'wrong')
    set('input[name="homeserver"]', 'example.org')

    const form = target.querySelector('form')!
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      expect(target.textContent).toContain('Invalid credentials')
    })
    expect(uiStore.screen).toEqual({ name: 'login' })
  })
})