import { db, type AccountModel } from '$storage/db'

const TOKEN_KEY = (userId: string) => `mx_token:${userId}`

export class AccountManager {
  async addAccount(account: AccountModel): Promise<void> {
    await db.transaction('rw', db.accounts, async () => {
      // C1: keep exactly one primary so a second login never restores the old account
      if (account.isPrimary) {
        await db.accounts.toCollection().modify({ isPrimary: false })
      }
      await db.accounts.put(account)
    })
  }

  async getActiveAccount(): Promise<AccountModel | null> {
    const accounts = await db.accounts.toArray()
    return accounts.find((a) => a.isPrimary) ?? null
  }

  getAccessToken(userId: string): string | null {
    return sessionStorage.getItem(TOKEN_KEY(userId))
  }

  setAccessToken(userId: string, token: string): void {
    sessionStorage.setItem(TOKEN_KEY(userId), token)
  }

  removeAccessToken(userId: string): void {
    sessionStorage.removeItem(TOKEN_KEY(userId))
  }

  async setTokens(
    userId: string,
    tokens: { accessToken?: string; refreshToken?: string },
  ): Promise<void> {
    if (tokens.accessToken !== undefined) this.setAccessToken(userId, tokens.accessToken)
    if (tokens.refreshToken !== undefined) {
      await db.accounts.update(userId, { refreshToken: tokens.refreshToken })
    }
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await db.accounts.where('userId').equals(userId).modify((account) => {
      delete account.refreshToken
    })
  }
}

export const accountManager = new AccountManager()
