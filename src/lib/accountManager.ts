import { db, type AccountModel } from '$storage/db'

const TOKEN_KEY = (userId: string) => `mx_token:${userId}`

export class AccountManager {
  async addAccount(account: AccountModel): Promise<void> {
    await db.accounts.put(account)
  }

  async getActiveAccount(): Promise<AccountModel | null> {
    const accounts = await db.accounts.toArray()
    return accounts.find((a) => a.isPrimary) ?? null
  }

  async switchAccount(userId: string): Promise<void> {
    await db.accounts.toCollection().modify({ isPrimary: false })
    await db.accounts.update(userId, { isPrimary: true })
  }

  getAccessToken(userId: string): string | null {
    return sessionStorage.getItem(TOKEN_KEY(userId))
  }

  setAccessToken(userId: string, token: string): void {
    sessionStorage.setItem(TOKEN_KEY(userId), token)
  }
}
