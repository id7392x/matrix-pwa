# 04. Дорожная карта и ТЗ слайсов (Roadmap v2.0)

**Версия:** 1.0-ROADMAP
**Статус:** Рабочий план реализации
**Подчиняется:** `00-PRINCIPLES.md`, `01-ARCHITECTURE.md`, `02-DATA-MODEL.md`, `03-REFERENCE-CODE.md`
**Приоритет:** наименьший (конкретика каждого слайса имеет силу только в рамках его выполнения и не отменяет контракты вышестоящих документов).

---

## 1. Как читать документ

- Движение идёт **вертикальными слайсами**: один слайс — законченная сквозная фича от источника данных до UI (или до хранилища, если UI вне слайса).
- Порядок слайсов фиксирован: `Crypto/Sync → IndexedDB → Runes-сторы → UI` с делением на сквозные куски.
- Каждый слайс выполняется по TDD (падающий тест → реализация → зелёный → рефакторинг) и закрывается **гейтом**: `pnpm run check`, `pnpm test`, `pnpm run lint` — всё зелёное.
- Guardrails из `AGENTS.md` действуют всегда: никакого `any`, доступ к IndexedDB только через Dexie + Web Locks, сырые объекты SDK не попадают в UI, blast radius — только текущий слайс.

---

## 2. Статус

### Выполнено и закоммичено

| Слайс | Коммиты | Что сделано |
|---|---|---|
| Stage 0 — инфраструктура | `2553b8e`, `c582197`, `1d3e4fe` | TS strict, алиасы `$lib/$storage/...`, Vitest, Tailwind glassmorphism, AGENTS.md guardrails |
| Хранилище (схема + promote) | `d386b44`, `1b48ac8` | Dexie-схема с составными PK, `promotePendingToSynced`, `webLock.withLock`, room store |
| Доменный слой синхронизации | `92ae649` | `ISyncProvider`+мок, `SyncOrchestrator`, `PendingQueueService`, `BatchedStoreManager`, `AccountManager`, DTO-типы, `matrix-js-sdk` |
| DTO-граница комнат | `30d777f` | `roomStore` отдаёт UI только `RoomDto` (`toRoomDto`) |

### Текущее состояние проверок

`pnpm run check` — 0 errors, `pnpm test` — 50/50, `pnpm run lint` — clean.

---

## 3. Очередь слайсов

| # | Слайс | Зависимости | Статус |
|---|---|---|---|
| 1 | UI на моках (логин, комнаты, лента) | доменный слой, `RoomDto`-граница | **следующий** |
| 2 | `LegacySyncProvider` (реальный `/sync`) | слайс 1 | запланирован |
| 3 | Отправка сообщений (`/send` + dual-path) | слайсы 1–2 | запланирован |
| 4 | E2EE Cold Start + re-decryption | слайс 2 | запланирован |
| 5 | История, пагинация, retention, медиа-кэш | слайсы 2–3 | запланирован |
| 6 | Multi-tab (Master/Slave) + Lazy-sync | слайсы 2, 4 | запланирован |

---

## 4. Слайс 1 — UI на моках

### 4.1. Цель

Первый сквозной путь до UI: вход → список комнат → лента сообщений. Данные берутся с `MockSyncProvider` через готовый доменный слой; реальная сеть и E2EE — вне слайса.

### 4.2. Объём

**In scope**
- Экран входа: homeserver, userId, deviceId, accessToken → `AccountManager.addAccount` + `setAccessToken` (sessionStorage).
- Экран комнат: `roomStore.sortedRooms` (`RoomDto`), карточки комнаты, счётчик непрочитанного.
- Экран ленты: `batchedStore.events` (`EventDto`), рендер `m.room.message`, батч-доставка через `flushToUI`.
- Демо-запуск: подключение `MockSyncProvider` → `SyncOrchestrator` в старте приложения (dev-режим).
- Навигация на нативном `location.hash` без роутер-библиотеки: `#/login`, `#/rooms`, `#/room/:roomId` + слушатель `hashchange`. Кнопка «Назад» браузера и прямая ссылка на комнату работают с первого слайса (двухколоночный layout на desktop, одиночный на мобильном).

**Out of scope**
- Виртуализация списков: первые версии рендерят через `{#each}` (обоснование — мало данных на моках; виртуализация добавлена с реальным синком, слайс 2+).
- Реальная аутентификация/пароль: токен вводится вручную, никаких запросов к серверу.
- Отправка сообщений (слайс 3).
- E2EE, дешифровка, UTD (слайс 4) — в этом слайсе упоминания E2EE/UTD нет вообще.

### 4.3. Файлы

- `src/App.svelte` — корневой layout + рендер текущего экрана из `uiStore`.
- `src/components/ui/` — переиспользуемые (`GlassCard` уже есть).
- `src/components/LoginScreen.svelte`, `RoomList.svelte`, `RoomListItem.svelte`, `Timeline.svelte`, `TimelineItem.svelte`.
- `src/stores/uiStore.svelte.ts` — hash-driven навигация: читает/пишет `location.hash`, слушает `hashchange`; `#/login`, `#/rooms`, `#/room/:roomId`. Открытие комнаты = переход на `#/room/:id`.

### 4.4. TDD-контракт (тесты до реализации)

1. `uiStore`: `openRoom(roomId)`/`openLogin()` меняют текущий экран и синхронизируются с `location.hash`; переход «Назад» возвращает предыдущий экран; открытие комнаты чистит нерелевантный стейт.
2. Маппинг `RoomDto`→пропсы карточки: `lastEventTs` формат, fallback имени (уже покрыт `toRoomDto`).
3. `TimelineItem`: `EventDto.syncState==='sending'`/`'failed'` → индикатор статуса отправки.
4. Рендер-тест `LoginScreen`: сабмит вызывает `AccountManager.addAccount` + `setAccessToken` и переключает на комнаты.
5. Интеграция: `MockSyncProvider.start()` → `handleSync` → `roomStore` и `batchedStore` обновились (сквозной на happy-dom).

### 4.5. Приёмка (Definition of Done)

- [ ] Двухколоночный интерфейс (room list + timeline) на desktop, стыкующийся с glassmorphism-стилем.
- [ ] Логин с мока → открывается список комнат → открывается лента с сообщениями.
- [ ] Кнопка «Назад» браузера и прямая ссылка `#/room/!id` открывают комнату.
- [ ] Непрочитанное и сортировка по `lastEventTs` работают (поле `unreadCount` в карточке).
- [ ] События приходят одним батчем (rAF/setTimeout), без мерцания.
- [ ] Гейт: check/test/lint зелёные; коммит.

---

## 5. Слайс 2 — `LegacySyncProvider`

### 5.1. Цель

Заменить мок на реальный `/sync` через `matrix-js-sdk` без изменений в домене (контракт `ISyncProvider`, 01-АРХ §5).

### 5.2. Ключевые решения

- Адаптер: `matrix-js-sdk` события (`MatrixEvent`, `Room`) → сырые JSON-типы `SyncResponse`/`SyncRawEvent`/`SyncJoinedRoom` из `src/sync/ISyncProvider.ts`. Маппинг реальных полей (`m.room.name` state-событий, `m.direct` accountData) — ответственность провайдера.
- `createClient` без crypto (crypto подключается в слайсе 4).
- Авторизация: токен из `AccountManager.getAccessToken` (RAM/sessionStorage), в БД не попадает.
- Первый импорт `matrix-js-sdk` обязан проходить в Vitest (при необходимости — тестовый shim/`vi.mock`). WASM/vodozemac на этом слайсе не задействуется (`initRustCrypto` только в слайсе 4); Vite-воркеры заранее не конфигурируем.

### 5.3. TDD-контракт

1. Адаптер `MatrixRoom → SyncJoinedRoom`: имя из `m.room.name`, иначе из heroes/fallback; `unread_notifications` → счётчики.
2. `MatrixEvent → SyncRawEvent`: `txn_id` пробрасывается (для dual-path), `content` — сырой JSON.
3. Провайдер собирает `next_batch` из sync-ответа.

### 5.4. DoD

- [ ] Dev-режим работает против реального homeserver (например `matrix.org`), комнаты и события доезжают до UI.
- [ ] `ISyncProvider` не менялся.
- [ ] Гейт зелёный; коммит.

---

## 6. Слайс 3 — Отправка сообщений

### 6.1. Цель

Оптимистичная отправка с dual-path promote (02-DATA §4, §3): `PendingQueueService.create` → `/send` → ответ или эхо `/sync` → `promotePendingToSynced`.

### 6.2. Ключевые решения

- UI: поле ввода в `Timeline`, отправка → `PendingQueueService.create` → запись `pendingEvents` (статус `pending`) → отображение `EventDto.syncState==='sending'` → ответ сервера или эхо из `/sync` с `txn_id` → promote (только один раз).
- Ошибка: `recordFailure`, статус `failed` после лимита retry (3) + ручная повторная отправка.

### 6.3. TDD-контракт

1. `PendingQueueService.create` + эхо с `txn_id` → `SyncOrchestrator` делает promote, дубликата нет (уже частично покрыто).
2. Retry: `recordFailure` до лимита → `pending`; после → `failed` с `errorText`.
3. UI-тест: отправленное сообщение видно сразу (optimistic), индикатор статуса меняется на synced после эха.

### 6.4. DoD

- [ ] Сообщение уходит, не дожидаясь сервера; дубликат исключён (и ответ, и эхо).
- [ ] Ошибка отправки видна в UI с возможностью повтора.
- [ ] Гейт зелёный; коммит.

---

## 7. Слайс 4 — E2EE Cold Start + re-decryption

### 7.1. Цель

E2EE по 00-PRINCIPLES §3.3 и 01-АРХ §4: строгий порядок `createClient → initRustCrypto({storePrefix}) → startClient`, UTD-модель и реактивная re-decryption.

### 7.2. Ключевые решения

- storePrefix: `matrix-js-sdk:crypto:${userId}:${deviceId}` (изоляция на аккаунт+устройство, общий store запрещён).
- Обработка событий `/sync` — только после завершения `initRustCrypto`.
- UTD: Temporary (авто-запрос `m.room_key_request`) → Permanent через 30 сек без ответа (плашка в UI) → Re-decryption при приходе ключей (подписка `Event.decrypted` → повторный проход → обновление DTO через `BatchedStoreManager`).
- `EventModel.decryptionError`, `isEncrypted`, `content` уже расшифрованный — контракт готов (03 §1).
- `$crypto/e2ee.ts` — реализация `IE2EEService` (03 §4.3).
- Юнит-тесты crypto идут через мок `IE2EEService`/`MockRustCrypto` из `matrix-js-sdk`: WASM-бинарник и воркеры Rust Crypto не загружаются в среде Vitest/happy-dom, поэтому реальная интеграция проверяется вне юнит-тестов. Это обязательное требование слайса, а не опциональный хак.

### 7.3. TDD-контракт

1. Cold Start порядок: события не обрабатываются до готовности crypto (флаг готовности). Проверяется на моке `IE2EEService`.
2. UTD-переход: таймер 30с Temporary → Permanent. Проверяется на моке `IE2EEService`.
3. Re-decryption: приход ключа → событие со статусом UTD пере-расшифровывается и перепушивается в сторы. Проверяется на моке `IE2EEService`.

### 7.4. DoD

- [ ] Приватная комната расшифровывается по Cold Start Protocol.
- [ ] UTD-состояния отображаются и авто-перерасшифровываются.
- [ ] Cross-Signing/SAS/QR и Recovery Key — отдельные под-задачи слайса.
- [ ] Гейт зелёный; коммит.

---

## 8. Слайс 5 — История, retention, медиа-кэш

- Пагинация вверх через `timelineGaps` + `/messages` (02-DATA §2, `timelineGaps`).
- Retention: не более 300 последних событий на комнату, защита Reply/Thread (stub-снимки), приоритет текста над медиа.
- Media Cache: Cache Storage + LRU/FIFO, очистка по retention/квоте/`QuotaExceededError`.
- Виртуализация списков (закрывает хвост слайса 1).

---

## 9. Слайс 6 — Multi-tab + Lazy-sync

- Web Locks: ровно одна Master-вкладка на `userId+deviceId` (лок `matrix_master_${userId}_${deviceId}`), Slave читают из IndexedDB и проксируют команды через `BroadcastChannel` (nonce-handshake, ACK 500 мс).
- `IMultiTabService` (03 §4.2), перенос accessToken между вкладками только в RAM через handshake.
- Active/Lazy аккаунты: Lazy — polling 2–5 мин + sync при фокусе; filter обязан включать критические `to_device`-типы (00 §3.3.6).
- `ISyncFilterService` (03 §4.4), `filters.ts`.

---

## 10. Правила выполнения

1. Порядок слайсов не меняется без явного решения; каждый слайс начинается с TDD-тестов (§ 4–7).
2. Выход за blast radius слайса запрещён (AGENTS.md); правки прошлых слоёв — только если без них слайс невозможен, с фиксацией причины.
3. Каждый слайс заканчивается коммитом(ами) с зелёным гейтом и обновлением `HANDOFF.md`.
4. Расхождения с 00–03 фиксируются в этих документах, а не в коде-комментариях.

---

**Конец документа.**
