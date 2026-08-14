import type { EventDto } from '$types/dto'

export type Scheduler = (fn: () => void) => void

function defaultScheduler(fn: () => void): void {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  if (!hidden && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => fn())
  } else {
    setTimeout(fn, 0)
  }
}

export class BatchedStoreManager {
  events = $state<EventDto[]>([])
  private buffer: EventDto[] = []
  private pushedIds: Record<string, true> = {}
  private scheduled = false
  private readonly schedule: Scheduler

  constructor(schedule: Scheduler = defaultScheduler) {
    this.schedule = schedule
  }

  pushEvents(events: EventDto[]): void {
    for (const event of events) {
      this.queueEvent(event)
    }
    this.scheduleFlush()
  }

  upsertByTxnId(event: EventDto): void {
    this.queueEvent(event)
    this.scheduleFlush()
  }

  private queueEvent(event: EventDto): void {
    if (this.replaceByTxnId(event)) return
    if (this.pushedIds[event.id]) return
    this.pushedIds[event.id] = true
    this.buffer.push(event)
  }

  private replaceByTxnId(event: EventDto): boolean {
    if (!event.txnId) return false
    const bufferedIdx = this.buffer.findIndex((e) => e.txnId === event.txnId)
    if (bufferedIdx !== -1) {
      this.buffer[bufferedIdx] = event
      this.pushedIds[event.id] = true
      return true
    }
    const deliveredIdx = this.events.findIndex((e) => e.txnId === event.txnId)
    if (deliveredIdx !== -1) {
      this.events[deliveredIdx] = event
      this.pushedIds[event.id] = true
      return true
    }
    return false
  }

  private scheduleFlush(): void {
    if (this.scheduled) return
    this.scheduled = true
    this.schedule(() => {
      this.scheduled = false
      this.flushToUI()
    })
  }

  flushToUI(): void {
    if (this.buffer.length === 0) return
    this.events = [...this.events, ...this.buffer]
    this.buffer = []
  }

  resetBuffer(): void {
    this.buffer = []
    this.scheduled = false
  }

  reset(): void {
    this.buffer = []
    this.scheduled = false
    this.pushedIds = {}
    this.events = []
  }
}

export const batchedStore = new BatchedStoreManager()
