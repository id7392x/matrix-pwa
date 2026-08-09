import { afterEach, describe, expect, it } from 'vitest'

import { withLock } from './webLock'

describe('withLock', () => {
  const originalLocks = navigator.locks

  afterEach(() => {
    Object.defineProperty(navigator, 'locks', { value: originalLocks, configurable: true })
  })

  it('runs the callback without a lock when Web Locks API is unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { value: undefined, configurable: true })
    await expect(withLock('test', async () => 42)).resolves.toBe(42)
  })

  it('acquires the named lock when Web Locks API is available', async () => {
    const requests: string[] = []
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: async (name: string, cb: () => Promise<number>) => {
          requests.push(name)
          return cb()
        },
      },
    })
    await expect(withLock('matrix_master_@alice:example.org_DEV1', async () => 7)).resolves.toBe(7)
    expect(requests).toEqual(['matrix_master_@alice:example.org_DEV1'])
  })
})
