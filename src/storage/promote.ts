import { db, type EventModel } from './db'

export async function promotePendingToSynced(
  userId: string,
  roomId: string,
  txnId: string,
  eventId: string,
  syncedData: Partial<EventModel>,
): Promise<void> {
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
