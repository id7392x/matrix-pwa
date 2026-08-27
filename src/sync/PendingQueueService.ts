import { db, type PendingEventModel } from '$storage/db'
import { promotePendingToSynced } from '$storage/promote'
import type { BatchedStoreManager } from '$stores/batchedStore.svelte'
import { toEventDto } from '$types/dto'
import type { MatrixClient, TimelineEvents } from 'matrix-js-sdk'

const DEFAULT_RETRY_LIMIT = 3

const activeQueues: PendingQueueService[] = []

export function getActiveQueue(): PendingQueueService | undefined {
  return activeQueues.at(-1)
}

export function registerQueue(queue: PendingQueueService): void {
  activeQueues.push(queue)
}

export function unregisterQueue(queue: PendingQueueService): void {
  const index = activeQueues.indexOf(queue)
  if (index !== -1) activeQueues.splice(index, 1)
}

export class PendingQueueService {
  private readonly activeTxnIds = new Set<string>()

  constructor(
    private readonly retryLimit: number = DEFAULT_RETRY_LIMIT,
    private readonly client?: MatrixClient,
    private readonly store?: BatchedStoreManager,
  ) {}

  async restore(userId: string): Promise<void> {
    const rows = await db.pendingEvents.where('userId').equals(userId).toArray()
    for (const row of rows) {
      let status = row.status
      if (row.status === 'sending') {
        if (row.retryCount >= this.retryLimit) {
          await db.pendingEvents.update(row.userAndTxnId, {
            status: 'failed',
            errorText: 'Превышен лимит попыток отправки',
            retryCount: this.retryLimit,
          })
          status = 'failed'
        } else {
          await db.pendingEvents.update(row.userAndTxnId, { status: 'pending' })
          status = 'pending'
        }
      }
      if (status === 'failed') {
        this.publishOptimistic(
          row.userId,
          row.roomId,
          row.content,
          row.txnId,
          'failed',
          status === 'failed' ? row.errorText : undefined,
        )
        continue
      }
      this.activeTxnIds.add(row.txnId)
      this.publishOptimistic(row.userId, row.roomId, row.content, row.txnId, 'sending')
      // C7: actually resend restored events, not just show them optimistically.
      if (!this.client) continue
      try {
        await this.sendAndPromote(row.userId, row.roomId, row.content, row.txnId)
        this.activeTxnIds.delete(row.txnId)
      } catch (error) {
        await this.recordFailure(row.userId, row.txnId, error)
        this.publishOptimistic(
          row.userId,
          row.roomId,
          row.content,
          row.txnId,
          'failed',
          this.errorMessage(error),
        )
      }
    }
  }

  async sendMessage(
    userId: string,
    roomId: string,
    content: Record<string, unknown>,
  ): Promise<string> {
    if (!this.client) throw new Error('MatrixClient не инициализирован')

    const txnId = this.client.makeTxnId()
    const pending: PendingEventModel = {
      userAndTxnId: `${userId}:${txnId}`,
      txnId,
      userId,
      roomId,
      content,
      status: 'sending',
      createdAt: Date.now(),
      retryCount: 0,
    }
    await db.pendingEvents.add(pending)
    this.activeTxnIds.add(txnId)
    this.publishOptimistic(userId, roomId, content, txnId, 'sending')

    try {
      const eventId = await this.sendAndPromote(userId, roomId, content, txnId)
      this.activeTxnIds.delete(txnId)
      return eventId
    } catch (error) {
      await this.recordFailure(userId, txnId, error)
      this.publishOptimistic(userId, roomId, content, txnId, 'failed', this.errorMessage(error))
      throw error
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
    syncedData: {
      originServerTs: number
      sender: string
      type: string
      content: Record<string, unknown>
      isEncrypted: boolean
    },
  ): Promise<void> {
    await promotePendingToSynced(userId, roomId, txnId, eventId, syncedData)
    this.activeTxnIds.delete(txnId)
  }

  async recordFailure(userId: string, txnId: string, error: unknown): Promise<void> {
    const userAndTxnId = `${userId}:${txnId}`
    const pending = await db.pendingEvents.get(userAndTxnId)
    if (!pending) return

    const retryCount = pending.retryCount + 1
    const status = retryCount >= this.retryLimit ? 'failed' : 'pending'
    const errorText = this.errorMessage(error)

    await db.pendingEvents.update(userAndTxnId, {
      status,
      retryCount,
      errorText: status === 'failed' ? errorText : undefined,
    })

    if (status === 'failed') {
      this.activeTxnIds.delete(txnId)
    }
  }

  async retry(userId: string, txnId: string): Promise<void> {
    const userAndTxnId = `${userId}:${txnId}`
    const pending = await db.pendingEvents.get(userAndTxnId)
    if (!pending || pending.retryCount === 0) return

    await db.pendingEvents.update(userAndTxnId, {
      status: 'pending',
      retryCount: 0,
      errorText: undefined,
    })
    this.activeTxnIds.add(txnId)
    this.publishOptimistic(userId, pending.roomId, pending.content, txnId, 'sending')

    if (!this.client) return

    try {
      await this.sendAndPromote(userId, pending.roomId, pending.content, txnId)
      this.activeTxnIds.delete(txnId)
    } catch (error) {
      await this.recordFailure(userId, txnId, error)
      this.publishOptimistic(
        userId,
        pending.roomId,
        pending.content,
        txnId,
        'failed',
        this.errorMessage(error),
      )
    }
  }

  private async sendAndPromote(
    userId: string,
    roomId: string,
    content: Record<string, unknown>,
    txnId: string,
  ): Promise<string> {
    if (!this.client) throw new Error('MatrixClient не инициализирован')
    const response = await this.client.sendMessage(
      roomId,
      content as unknown as TimelineEvents['m.room.message'],
      txnId,
    )
    await promotePendingToSynced(userId, roomId, txnId, response.event_id, {
      originServerTs: Date.now(),
      sender: userId,
      type: 'm.room.message',
      content,
      isEncrypted: this.client.isRoomEncrypted(roomId),
    })
    // C12: flip the optimistic bubble to synced right away instead of waiting
    // for the /sync echo (idempotent with the later echo via replaceByTxnId).
    this.publishOptimistic(userId, roomId, content, txnId, 'synced')
    return response.event_id
  }

  private publishOptimistic(
    userId: string,
    roomId: string,
    content: Record<string, unknown>,
    txnId: string,
    syncState: 'sending' | 'failed' | 'synced',
    errorText?: string,
  ): void {
    if (!this.store) return
    this.store.pushEvents([
      toEventDto({
        id: `local-${txnId}`,
        roomId,
        sender: userId,
        originServerTs: Date.now(),
        type: 'm.room.message',
        content,
        syncState,
        txnId,
        errorText,
      }),
    ])
  }

  private errorMessage(error: unknown): string {
    return typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : 'Неизвестная ошибка'
  }
}
