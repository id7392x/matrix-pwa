import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from 'svelte'

import LoginScreen from '$components/LoginScreen.svelte'
import { login, discoverSsoProviders, ssoLogin } from '$lib/authService'
import { authStore } from '$stores/authStore.svelte'
import { uiStore } from '$stores/uiStore.svelte'

vi.mock('$lib/authService', () => ({
  login: vi.fn(),
  discoverSsoProviders: vi.fn(() => Promise.resolve([])),
  ssoLogin: vi.fn(),
}))

describe('LoginScreen', () => {
  beforeEach(() => {
    uiStore.reset()
    authStore.reset()
    sessionStorage.clear()
    location.hash = ''
    vi.restoreAllMocks()
    vi.mocked(discoverSsoProviders).mockResolvedValue([])
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

  it('displays SSO provider buttons when providers are discovered', async () => {
    vi.mocked(discoverSsoProviders).mockResolvedValue([
      { id: 'apple', name: 'Apple' },
      { id: 'google', name: 'Google' },
    ])
    const target = document.createElement('div')
    mount(LoginScreen, { target })

    await vi.waitFor(() => {
      expect(target.textContent).toContain('Sign in with Apple')
      expect(target.textContent).toContain('Sign in with Google')
    })
  })

  it('hides SSO section when no providers are discovered', async () => {
    vi.mocked(discoverSsoProviders).mockResolvedValue([])
    const target = document.createElement('div')
    mount(LoginScreen, { target })

    await vi.waitFor(() => {
      expect(target.textContent).not.toContain('Sign in with')
    })
  })

  it('clicking SSO button stores homeserver in sessionStorage and redirects', async () => {
    vi.mocked(discoverSsoProviders).mockResolvedValue([
      { id: 'apple', name: 'Apple' },
    ])
    vi.mocked(ssoLogin).mockReturnValue('https://matrix.org/sso/redirect/apple')
    const target = document.createElement('div')
    mount(LoginScreen, { target })

    await vi.waitFor(() => {
      expect(target.querySelector('button[type="button"]')).not.toBeNull()
    })

    const ssoButton = target.querySelector('button[type="button"]')!
    ssoButton.dispatchEvent(new Event('click', { bubbles: true }))

    expect(sessionStorage.getItem('sso_homeserver')).toBe('matrix.org')
    expect(ssoLogin).toHaveBeenCalledWith('matrix.org', 'apple', expect.any(String))
  })
})