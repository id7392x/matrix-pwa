import { db, type EventModel } from './db'

const REQUIRED_FIELDS = [
  ['originServerTs', 'number'],
  ['sender', 'string'],
  ['type', 'string'],
  ['content', 'object'],
  ['isEncrypted', 'boolean'],
] as const satisfies ReadonlyArray<readonly [keyof EventModel, string]>

function assertValidSyncedData(data: Partial<EventModel>): void {
  for (const [field, kind] of REQUIRED_FIELDS) {
    const value = data[field]
    const valid = kind === 'object' ? typeof value === 'object' && value !== null : typeof value === kind
    if (!valid) {
      throw new TypeError(`promotePendingToSynced: required field "${String(field)}" is missing or has invalid type`)
    }
  }
}

export async function promotePendingToSynced(
  userId: string,
  roomId: string,
  txnId: string,
  eventId: string,
  syncedData: Partial<EventModel>,
): Promise<void> {
  assertValidSyncedData(syncedData)
  const userAndTxnId = `${userId}:${txnId}`

  await db.transaction('rw', [db.pendingEvents, db.events], async () => {
    // 1. Поиск и атомарное удаление из pending по составному PK
    const pending = await db.pendingEvents.get(userAndTxnId)
    if (pending) {
      await db.pendingEvents.delete(userAndTxnId)
    }

    // 2. Гарантированный put в events с составным PK [userId+roomId+eventId] (идемпотентно)
    await db.events.put({
      ...syncedData,
      eventId,
      userId,
      roomId,
      txnId,
      syncState: 'synced',
    } as EventModel)
  })
}
