import { db, type EventModel, type PendingEventModel } from '$storage/db'
import { promotePendingToSynced } from '$storage/promote'

const DEFAULT_RETRY_LIMIT = 3

export class PendingQueueService {
  private readonly activeTxnIds = new Set<string>()

  constructor(private readonly retryLimit: number = DEFAULT_RETRY_LIMIT) {}

  async restore(): Promise<void> {
    const rows = await db.pendingEvents.toArray()
    for (const row of rows) {
      let status = row.status
      if (row.status === 'sending') {
        if (row.retryCount >= this.retryLimit) {
          await db.pendingEvents.update(row.userAndTxnId, {
            status: 'failed',
            errorText: 'Превышен лимит попыток отправки',
          })
          status = 'failed'
        } else {
          await db.pendingEvents.update(row.userAndTxnId, { status: 'pending' })
          status = 'pending'
        }
      }
      if (status !== 'failed') {
        this.activeTxnIds.add(row.txnId)
      }
    }
  }

  async create(
    userId: string,
    roomId: string,
    content: Record<string, unknown>,
    txnId: string = crypto.randomUUID(),
  ): Promise<string> {
    const pending: PendingEventModel = {
      userAndTxnId: `${userId}:${txnId}`,
      txnId,
      userId,
      roomId,
      content,
      status: 'pending',
      createdAt: Date.now(),
      retryCount: 0,
    }
    await db.pendingEvents.add(pending)
    this.activeTxnIds.add(txnId)
    return txnId
  }

  isActive(txnId: string): boolean {
    return this.activeTxnIds.has(txnId)
  }

  async promote(
    userId: string,
    roomId: string,
    txnId: string,
    eventId: string,
    syncedData: Partial<EventModel>,
  ): Promise<void> {
    await promotePendingToSynced(userId, roomId, txnId, eventId, syncedData)
    this.activeTxnIds.delete(txnId)
  }

  async recordFailure(userId: string, txnId: string, errorText: string): Promise<void> {
    const userAndTxnId = `${userId}:${txnId}`
    const row = await db.pendingEvents.get(userAndTxnId)
    if (!row) return
    const retryCount = row.retryCount + 1
    if (retryCount >= this.retryLimit) {
      await db.pendingEvents.update(userAndTxnId, { status: 'failed', retryCount, errorText })
      this.activeTxnIds.delete(txnId)
    } else {
      await db.pendingEvents.update(userAndTxnId, { status: 'pending', retryCount })
    }
  }

  reset(): void {
    this.activeTxnIds.clear()
  }
}
