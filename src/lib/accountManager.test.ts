import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { db, type AccountModel } from '$storage/db'
import { AccountManager } from './accountManager'

const alice: AccountModel = {
  userId: '@alice:example.org',
  homeserver: 'example.org',
  deviceId: 'DEV1',
  isPrimary: true,
}

const bob: AccountModel = {
  userId: '@bob:example.org',
  homeserver: 'example.org',
  deviceId: 'DEV2',
  isPrimary: false,
}

function setup() {
  const manager = new AccountManager()
  return { manager }
}

describe('AccountManager', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    sessionStorage.clear()
  })

  it('upserts an account into the accounts table', async () => {
    const { manager } = setup()
    await manager.addAccount(alice)

    const row = await db.accounts.get(alice.userId)
    expect(row?.homeserver).toBe('example.org')
    expect(row?.isPrimary).toBe(true)
  })

  it('returns the active (isPrimary) account, or null when empty', async () => {
    const { manager } = setup()
    expect(await manager.getActiveAccount()).toBeNull()

    await manager.addAccount(alice)
    expect((await manager.getActiveAccount())?.userId).toBe(alice.userId)
  })

  it('a second primary account demotes the previous one', async () => {
    const { manager } = setup()
    await manager.addAccount(alice)
    await manager.addAccount({ ...bob, isPrimary: true })

    expect((await db.accounts.get(alice.userId))?.isPrimary).toBe(false)
    expect((await manager.getActiveAccount())?.userId).toBe(bob.userId)
  })

  it('switchAccount is removed; addAccount keeps exactly one primary', async () => {
    const { manager } = setup()
    await manager.addAccount(alice)
    await manager.addAccount({ ...bob, isPrimary: true })

    expect((await manager.getActiveAccount())?.userId).toBe(bob.userId)
    expect((await db.accounts.get(alice.userId))?.isPrimary).toBe(false)
    expect((await db.accounts.get(bob.userId))?.isPrimary).toBe(true)
  })

  it('keeps the access token in sessionStorage, never in the database', async () => {
    const { manager } = setup()
    await manager.addAccount(alice)
    manager.setAccessToken(alice.userId, 'secret-token')

    expect(manager.getAccessToken(alice.userId)).toBe('secret-token')
    expect(sessionStorage.getItem(`mx_token:${alice.userId}`)).toBe('secret-token')
    expect((await db.accounts.get(alice.userId))).not.toHaveProperty('accessToken')
  })

  it('returns null when no token is stored for the user', () => {
    const { manager } = setup()
    expect(manager.getAccessToken(alice.userId)).toBeNull()
  })
})
