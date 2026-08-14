# 03-REFERENCE-CODE.md
**Версия:** 2.2-CODE (Corrected & Verified)  
**Статус:** Архитектурный контракт  
**Подчиняется:** `00-PRINCIPLES.md`, `01-ARCHITECTURE.md`, `02-DATA-MODEL.md`

Этот документ определяет точные TypeScript-типы, DTO-интерфейсы, схему Dexie.js и сигнатуры базовых сервисов. ИИ-агенты и разработчики обязаны строго следовать описанным названиям полей, интерфейсам и паттернам.

---

## 1. Типы моделей базы данных (IndexedDB / Dexie)

```ts
export type SyncState = 'pending' | 'sending' | 'synced' | 'failed';
export type PendingStatus = 'pending' | 'sending' | 'failed';

export interface AccountModel {
  userId: string; // PK
  homeserver: string;
  deviceId: string;
  isPrimary: boolean;
  lastSyncToken?: string;
  refreshToken?: string; // Слайс 4 «Авторизация»: единственный токен в БД (Principles §3.2.1.1)
  // accessToken ЗАПРЕЩЕНО добавлять в эту модель (хранится только в RAM/sessionStorage)
}

export interface RoomModel {
  userAndRoomId: string; // PK: `${userId}:${roomId}`
  userId: string;
  roomId: string;
  membership: 'join' | 'invite' | 'leave' | 'ban';
  isDirect: boolean;
  unreadCount: number;
  highlightCount: number;
  lastEventTs: number;
  name?: string;
  avatarUrl?: string;
  summaryDto?: string; // JSON-serialized DTO summary
}

export interface EventModel {
  eventId: string; // компонент составного PK [userId+roomId+eventId]
  userId: string;
  roomId: string;
  originServerTs: number;
  sender: string;
  type: string;
  content: Record<string, unknown>; // Расшифрованный / подготовленный content
  txnId?: string;
  syncState: SyncState;
  isEncrypted: boolean;
  decryptionError?: string;
  prevBatchToken?: string;
  isGapBlock?: boolean;
}

export interface PendingEventModel {
  userAndTxnId: string; // PK: `${userId}:${txnId}`
  txnId: string;
  userId: string;
  roomId: string;
  content: Record<string, unknown>;
  status: PendingStatus;
  createdAt: number;
  retryCount: number;
  errorText?: string;
}

export interface TimelineGapModel {
  gapId: string; // PK: `${userId}:${roomId}:${eventId}`
  userId: string;
  roomId: string;
  eventId: string;
  prevBatchToken: string;
  createdAt: number;
}

```
## 2. Схема базы данных (Dexie Database Class)  
```
import Dexie, { type Table } from 'dexie';

export class AppDatabase extends Dexie {
  accounts!: Table<AccountModel, string>;
  rooms!: Table<RoomModel, string>;
  events!: Table<EventModel, [string, string, string]>;
  pendingEvents!: Table<PendingEventModel, string>;
  timelineGaps!: Table<TimelineGapModel, string>;

  constructor() {
    super('MatrixClientDB');

    // Единая статическая схема. Версионирование только через this.version(n)
    this.version(1).stores({
      accounts: 'userId',
      rooms: 'userAndRoomId, [userId+membership], [userId+unreadCount], lastEventTs',
      // Составной PK [userId+roomId+eventId]; индекс [userId+txnId] для поиска по транзакции
      events: '[userId+roomId+eventId], [userId+roomId+originServerTs], [userId+txnId], [userId+type]',
      pendingEvents: 'userAndTxnId, [userId+roomId], status, createdAt',
      timelineGaps: 'gapId, [userId+roomId]',
    });
  }
}

export const db = new AppDatabase();

```
## 3. UI DTO Interfaces (Иммутабельные данные для Svelte 5)  
Сырые объекты SDK запрещено передавать в UI. Все данные преобразуются в DTO.  
```
export interface EventDto {
  id: string; // eventId или txnId
  roomId: string;
  sender: string;
  originServerTs: number;
  type: string;
  body: string;
  formattedBody?: string; // САНИТИЗИРОВАТЬ перед рендером; `{@html}` напрямую запрещён (stored XSS)
  isEncrypted: boolean;
  syncState: SyncState;
  txnId?: string; // для optimistic-строки и замены эхом (Слайс 3)
  errorText?: string; // текст ошибки при syncState==='failed'
  decryptionError?: string;
  
  // Медиа метаданные
  mediaUrl?: string;
  aspectRatio?: number; // width / height
  
  // Связи (Reply / Thread Context)
  replyTo?: {
    eventId: string;
    sender: string;
    bodySummary: string;
  };
}

export interface RoomDto {
  id: string; // roomId
  name: string;
  avatarUrl?: string;
  unreadCount: number;
  highlightCount: number;
  lastEventTs: number;
  lastEventText?: string;
  isDirect: boolean;
}

```
## 4. Контракты ключевых сервисов (Service Interfaces)  
**4.1. AccountManager & Session**  
```
export interface IAccountManager {
  addAccount(account: AccountModel): Promise<void>;
  getActiveAccount(): Promise<AccountModel | null>;
  getAccessToken(userId: string): string | null; // Только из RAM / sessionStorage
  setAccessToken(userId: string, token: string): void;
  getRefreshToken(userId: string): Promise<string | null>; // Из accounts (IndexedDB) — Слайс 4
  setTokens(userId: string, tokens: { accessToken?: string; refreshToken?: string }): Promise<void>; // access → sessionStorage, refresh → accounts
  clearRefreshToken(userId: string): Promise<void>; // signOut: удаляет refreshToken из accounts
  switchAccount(userId: string): Promise<void>;
}
```
**4.2. Multi-Tab & Web Locks (multiTab.ts)**  
```
export interface IMultiTabService {
  initMasterLock(userId: string, deviceId: string): Promise<void>;
  isMaster(): boolean;
  requestTokenFromMaster(userId: string): Promise<string | null>;
  sendProxyCommand(command: string, payload: unknown): Promise<boolean>; // ACK wait 500ms
}

```
**4.3. E2EE Cold Start & Re-decryption (e2ee.ts)**  
```
export interface IE2EEService {
  // Порядок: createClient() -> initRustCrypto() -> setupReDecryption() -> startClient()
  initCrypto(userId: string, deviceId: string, accessToken: string, homeserver: string): Promise<void>;
  setupReDecryptionListener(callback: (decryptedEvents: EventDto[]) => void): void;
}

```
**4.4. Sync Filter Configuration (filters.ts)**  
```
export interface ISyncFilterService {
  // Расширенный фоновый фильтр для сохранности E2EE-сессий
  getLazyBackgroundFilter(): Record<string, unknown>;
}

```
**4.5. Promote Service (promote.ts)**  
```
export interface IPromoteService {
  // Атомарный promote из pendingEvents в events в рамках db.transaction('rw')
  // ВАЖНО: обязательные поля (originServerTs, sender, type, content, isEncrypted)
  // валидируются в рантайме перед записью — некорректные данные отклоняются.
  promotePendingToSynced(
    userId: string,
    roomId: string,
    txnId: string,
    eventId: string,
    syncedEvent: Partial<EventModel>
  ): Promise<void>;
}

```
**4.6. Batched Store Manager (batchedStore.svelte.ts)**  
```
export interface IBatchedStoreManager {
  pushEvents(events: EventDto[]): void;
  flushToUI(): void; // rAF в активной вкладке, setTimeout(0) в фоне
}

```
## 5. Эталонные шаблоны критических алгоритмов  
**5.1. Паттерн Атомарного Promote (Dual-Path)**  
```
export async function promotePendingToSynced(
  userId: string,
  roomId: string,
  txnId: string,
  eventId: string,
  syncedData: Partial<EventModel>
): Promise<void> {
  // Валидация обязательных полей в рантайме (недоверенные данные из сети)
  const required = ['originServerTs', 'sender', 'type', 'content', 'isEncrypted'];
  for (const field of required) {
    if (typeof syncedData[field as keyof EventModel] === 'undefined') {
      throw new TypeError(`promotePendingToSynced: required field "${field}" is missing`);
    }
  }
  const userAndTxnId = `${userId}:${txnId}`;

  await db.transaction('rw', [db.pendingEvents, db.events], async () => {
    // 1. Поиск и атомарное удаление из pending по составному PK
    const pending = await db.pendingEvents.get(userAndTxnId);
    if (pending) {
      await db.pendingEvents.delete(userAndTxnId);
    }
    
    // 2. Гарантированный put в events с составным PK [userId+roomId+eventId] (идемпотентно)
    await db.events.put({
      ...syncedData,
      eventId,
      userId,
      roomId,
      txnId,
      syncState: 'synced'
    } as EventModel);
  });
}

```
**5.2. Паттерн Cold Start Protocol**  
```
export async function initializeClientSession(
  userId: string, 
  deviceId: string, 
  homeserver: string,
  accessToken: string
) {
  // 1. Создание клиента с валидным accessToken
  const client = createClient({ baseUrl: homeserver, userId, deviceId, accessToken });
  
  // 2. Инициализация WASM Crypto с изолированным префиксом
  const storePrefix = `matrix-js-sdk:crypto:${userId}:${deviceId}`;
  await client.initRustCrypto({ storePrefix });
  
  // 3. Регистрация Re-decryption слушателя до запуска Sync
  client.on('Event.decrypted', (event: unknown) => {
    // Реактивная обработка запоздавших ключей Olm/Megolm
  });

  // 4. Запуск синка только ПОСЛЕ завершения криптографии
  await client.startClient({ initialSyncFilter: { /* ... */ } });
}

```
