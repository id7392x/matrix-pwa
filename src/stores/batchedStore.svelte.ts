import type { EventDto } from '$types/dto'

export type Scheduler = (fn: () => void) => number | undefined

function defaultScheduler(fn: () => void): number {
  const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
  // C16: one cancellable timer (~one frame) instead of a non-cancellable rAF
  return setTimeout(fn, hidden ? 0 : 16) as unknown as number
}

export class BatchedStoreManager {
  events = $state<EventDto[]>([])
  private buffer: EventDto[] = []
  private scheduled = false
  private flushHandle: number | undefined
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

  private queueEvent(event: EventDto): void {
    if (this.replaceByTxnId(event)) return
    // C9: upsert by event id so a repeat sync never duplicates nor drops the latest content.
    const bufferedIdx = this.buffer.findIndex((e) => e.id === event.id)
    if (bufferedIdx !== -1) {
      this.buffer[bufferedIdx] = event
      return
    }
    const deliveredIdx = this.events.findIndex((e) => e.id === event.id)
    if (deliveredIdx !== -1) {
      this.events[deliveredIdx] = event
      return
    }
    this.buffer.push(event)
  }

  private replaceByTxnId(event: EventDto): boolean {
    if (!event.txnId) return false
    const bufferedIdx = this.buffer.findIndex((e) => e.txnId === event.txnId)
    if (bufferedIdx !== -1) {
      this.buffer[bufferedIdx] = event
      return true
    }
    const deliveredIdx = this.events.findIndex((e) => e.txnId === event.txnId)
    if (deliveredIdx !== -1) {
      this.events[deliveredIdx] = event
      return true
    }
    return false
  }

  private scheduleFlush(): void {
    if (this.scheduled) return
    this.scheduled = true
    this.flushHandle = this.schedule(() => {
      this.scheduled = false
      this.flushHandle = undefined
      this.flushToUI()
    })
  }

  flushToUI(): void {
    if (this.buffer.length === 0) return
    this.events = [...this.events, ...this.buffer]
    this.buffer = []
  }

  resetBuffer(): void {
    this.cancelFlush()
    this.buffer = []
    this.scheduled = false
  }

  reset(): void {
    this.cancelFlush()
    this.buffer = []
    this.scheduled = false
    this.events = []
  }

  private cancelFlush(): void {
    if (this.flushHandle !== undefined) {
      clearTimeout(this.flushHandle)
      this.flushHandle = undefined
    }
  }
}

export const batchedStore = new BatchedStoreManager()
