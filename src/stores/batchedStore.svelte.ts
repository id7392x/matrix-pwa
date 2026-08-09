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
  private scheduled = false
  private readonly schedule: Scheduler

  constructor(schedule: Scheduler = defaultScheduler) {
    this.schedule = schedule
  }

  pushEvents(events: EventDto[]): void {
    this.buffer.push(...events)
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

  reset(): void {
    this.buffer = []
    this.scheduled = false
    this.events = []
  }
}
