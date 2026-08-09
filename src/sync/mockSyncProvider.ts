import type { ISyncProvider, SyncListener, SyncResponse } from './ISyncProvider'

export class MockSyncProvider implements ISyncProvider {
  private listeners: SyncListener[] = []
  started = false

  constructor(private readonly fixtures: SyncResponse[]) {}

  onSync(listener: SyncListener): void {
    this.listeners.push(listener)
  }

  async start(): Promise<void> {
    this.started = true
    for (const fixture of this.fixtures) {
      for (const listener of this.listeners) {
        await listener(fixture)
      }
    }
  }

  stop(): void {
    this.started = false
  }

  emit(sync: SyncResponse): void {
    for (const listener of this.listeners) {
      void listener(sync)
    }
  }
}
