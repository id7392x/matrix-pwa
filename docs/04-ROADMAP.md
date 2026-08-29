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
| Stage 0 — инфраструктура | `a033cc9`, `2eb8f02`, `633194d` | TS strict, алиасы `$lib/$storage/...`, Vitest, Tailwind glassmorphism, AGENTS.md guardrails |
| Хранилище (схема + promote) | `a0b1a58`, `098c8a5` | Dexie-схема с составными PK, `promotePendingToSynced`, `webLock.withLock`, room store |
| Доменный слой синхронизации | `629c6f4` | `ISyncProvider`+мок, `SyncOrchestrator`, `PendingQueueService`, `BatchedStoreManager`, `AccountManager`, DTO-типы, `matrix-js-sdk` |
| DTO-граница комнат | `6420734` | `roomStore` отдаёт UI только `RoomDto` (`toRoomDto`) |
| Слайс 1 — UI на моках | `57ddc4c` | `uiStore` (hash-навигация), `LoginScreen`, `RoomList`/`RoomListItem`, `Timeline`/`TimelineItem`, `App.svelte`, demo-sync `startDemoSync` |
| Хардненинг безопасности | `8991f36`, `502ff63` | runtime-валидация `promotePendingToSynced`, guard `decodeURIComponent` в `uiStore`, `isEncrypted` из типа события |
| Слайс 2 — `LegacySyncProvider` | `b31d7ea`, `44437f4`, `4d5123d`, `dd5a569`, `de0485a` | реальный `/sync` (адаптер `MatrixEvent`/`Room` → `SyncRawEvent`/`SyncJoinedRoom`), `startLegacySync`, restore сессии, https-fallback baseUrl, защита от malformed sync |
| Слайс 3 — Отправка сообщений | `4eba646` | `PendingQueueService.sendMessage` (client.sendMessage + dual-path promote по `txn_id`/`unsigned.transaction_id`), optimistic UI (`sending`→`synced`), `failed`+кнопка Retry, тxnId в `EventDto` |
| Слайс 4 — Авторизация | (см. §7.5) | вход по паролю (`authService.login`, `m.login.password` + `refresh_token`), auto-refresh через `tokenRefreshFunction` (ротация), `restoreSession` из refresh-токена, `LoginScreen` с полем пароля, `pendingQueue.restore()` + GC доставленных сирот, logout по `Session.logged_out` |
| Ревью-батч (фиксы по итогам ревью домена) | `2dd3072`, `6bcc411`, `aeb577e`, `409ea1d` | echo всегда promote (stale txnId не осиротит), `restore()` переотправляет pending, последний `lastEventTs` не затирается пустым timeline, per-event try/catch в `handleSync`, state-события не попадают в ленту, batchedStore upsert-by-id + отмена pending flush, история навигации чистится при logout, seed refresh-токена без deadlock, normalizeHomeserver (trim + trailing slash), единый `toEventDto`/`SyncState`, удаление мёртвого кода (`MockSyncProvider`, `GlassCard`, `switchAccount`, `getRefreshToken`, `roomStore.load/upsert/updateUnread`, `batchedStore.upsertByTxnId`) |

## 3. Очередь слайсов

| # | Слайс | Зависимости | Владелец | Статус |
|---|---|---|---|---|
| 1 | UI на моках (логин, комнаты, лента) | доменный слой, `RoomDto`-граница | общий | **выполнен** |
| 2 | `LegacySyncProvider` (реальный `/sync`) | слайс 1 | `<owner>` | **выполнен** |
| 3 | Отправка сообщений (`/send` + dual-path) | слайсы 1–2 | `<owner>` | **выполнен** |
| 4 | Авторизация: пароль + refresh-токен (+ SSO) | слайсы 1–3 | `<owner>` | **выполнен** (базовый пароль; SSO — подзадача) |
| 5 | E2EE Cold Start + re-decryption | слайсы 2, 4 | `<owner>` | **выполнен** |
| 6 | История, пагинация, retention, медиа-кэш | слайсы 2–4 | свободен | **следующий** |
| 7 | Multi-tab (Master/Slave) + Lazy-sync | слайсы 2, 4, 5 | свободен | запланирован |


- **Порядок следующих шагов:** Слайс 6 (история/пагинация/медиа, + DOMPurify/CSP до первого `{@html}`) → Слайс 7 (Multi-tab/Lazy-sync) → Дизайн-трек Д2 (адаптация под проект).

### 3.1. Дизайн-трек (горизонтальный, не вертикальный слайс)

| # | Задача | Статус |
|---|---|---|
| Д1 | Дизайн-референсы: генерация внешними ИИ-агентами (вне репозитория) | не начат |
| Д2 | Адаптация под проект: дизайн-токены, компонентная база, рестайл всех экранов | **ревью выполнено** (см. `docs/DESIGN.md`) |

- Горизонтален: трогает все экраны сразу, поэтому не входит в цепочку вертикальных слайсов 1–6 и не ограничен их blast radius; контракты 1–6 не меняет.
- Проводить при наличии базовых экранов (Слайс 1 ✓) и, желательно, реальных данных (после Слайса 2).
- DoD Д2: экраны соответствуют утверждённым референсам, дизайн-токены заведены в коде, гейт зелёный, коммит, обновление `HANDOFF-<ник>.md`.

**Ревью компонентов выполнено (2026-08-25):** найдены 4 критических (A1–A4) и 6 улучшений (I5–I10) в `LoginScreen`, `RoomList`, `RoomListItem`, `Timeline`, `TimelineItem`, `App.svelte`. Полный отчёт и план implementations — в `docs/DESIGN.md`.

---

## 4. Слайс 1 — UI на моках

### 4.1. Цель

Первый сквозной путь до UI: вход → список комнат → лента сообщений. Данные берутся с `MockSyncProvider` через готовый доменный слой; реальная сеть и E2EE — вне слайса.

### 4.2. Объём

**In scope**
- Экран входа: homeserver, userId, deviceId, accessToken → `AccountManager.addAccount` + `setAccessToken` (sessionStorage).
- Экран комнат: `roomStore.sortedRooms` (`RoomDto`), карточки комнаты, счётчик непрочитанного.
- Экран ленты: `batchedStore.events` (`EventDto`), рендер `m.room.message`, батч-доставка через `flushToUI`.
- Демо-запуск: подключение `MockSyncProvider` → `SyncOrchestrator` в старте приложения (dev-режим). *(удалён как мёртвый код в ревью-батче — демо идёт через `LegacySyncProvider`)*
- Навигация на нативном `location.hash` без роутер-библиотеки: `#/login`, `#/rooms`, `#/room/:roomId` + слушатель `hashchange`. Кнопка «Назад» браузера и прямая ссылка на комнату работают с первого слайса (двухколоночный layout на desktop, одиночный на мобильном).

**Out of scope**
- Виртуализация списков: первые версии рендерят через `{#each}` (обоснование — мало данных на моках; виртуализация добавлена с реальным синком, слайс 2+).
- Реальная аутентификация/пароль: токен вводится вручную, никаких запросов к серверу.
- Отправка сообщений (слайс 3).
- Авторизация по паролю/SSO и refresh-токен (слайс 4) — в этом слайсе токен вводится вручную.
- E2EE, дешифровка, UTD (слайс 5) — в этом слайсе упоминания E2EE/UTD нет вообще.

### 4.3. Файлы

- `src/App.svelte` — корневой layout + рендер текущего экрана из `uiStore`.
- `src/components/ui/` — переиспользуемые (`GlassCard` уже есть).
- `src/components/LoginScreen.svelte`, `RoomList.svelte`, `RoomListItem.svelte`, `Timeline.svelte`, `TimelineItem.svelte`.
- `src/stores/uiStore.svelte.ts` — hash-driven навигация: читает/пишет `location.hash`, слушает `hashchange`; `#/login`, `#/rooms`, `#/room/:roomId`. Открытие комнаты = переход на `#/room/:id`.

### 4.4. TDD-контракт (тесты до реализации)

1. `uiStore`: `openRoom(roomId)`/`openLogin()` меняют текущий экран и синхронизируются с `location.hash`; переход «Назад» возвращает предыдущий экран; открытие комнаты чистит нерелевантный стейт.
2. Маппинг `RoomDto`→пропсы карточки: `lastEventTs` формат, fallback имени (уже покрыт `toRoomDto`).
3. `TimelineItem`: `EventDto.syncState==='sending'`/`'failed'` → индикатор статуса отправки.
4. Рендер-тест `LoginScreen`: сабмит вызывает `authService.login` и переключает на комнаты.
5. Интеграция: `LegacySyncProvider.start()` → `handleSync` → `roomStore` и `batchedStore` обновились (сквозной на happy-dom). *(мок-интеграция удалена вместе с `MockSyncProvider`)*

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
- Зашифрованные события: `SyncOrchestrator` помечает `isEncrypted = raw.type === 'm.room.encrypted'` (контракт уже реализован); шифр-конверт `content` сохраняется как есть, дешифровка и замена конверта — Слайс 5.
- `createClient` без crypto (crypto подключается в слайсе 5).
- Авторизация: токен из `AccountManager.getAccessToken` (RAM/sessionStorage), в БД не попадает.
- Первый импорт `matrix-js-sdk` обязан проходить в Vitest (при необходимости — тестовый shim/`vi.mock`). WASM/vodozemac на этом слайсе не задействуется (`initRustCrypto` только в слайсе 5); Vite-воркеры заранее не конфигурируем.

### 5.3. TDD-контракт

1. Адаптер `MatrixRoom → SyncJoinedRoom`: имя из `m.room.name`, иначе из heroes/fallback; `unread_notifications` → счётчики.
2. `MatrixEvent → SyncRawEvent`: `txn_id` пробрасывается (для dual-path), `content` — сырой JSON.
3. Провайдер собирает `next_batch` из sync-ответа.
4. `SyncOrchestrator`: `m.room.encrypted` событие пишется с `isEncrypted: true` (и в БД, и в DTO), `body` пустой, конверт сохранён как есть.

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

## 7. Слайс 4 — Авторизация: пароль + refresh-токен (+ SSO)

### 7.1. Цель

Убрать ручной ввод токена из UI: вход по паролю через `m.login.password` (сервер сам отдаёт `user_id`, `device_id`, `access_token`, `refresh_token`), настройка auto-refresh access-токена через refresh-токен (ротация) и восстановление сессии после перезагрузки из refresh-токена — чтобы пользователю не приходилось вручную вытаскивать/обновлять токен.

### 7.2. Ключевые решения

- Вход: `client.loginRequest({ type: 'm.login.password', identifier: { type: 'm.id.user', user }, password })` — НЕ deprecated `loginWithPassword` (см. комментарий в SDK: обновляет клиент частично).
- `createClient` получает `accessToken` + `refreshToken` + `tokenRefreshFunction`: на 401/пред-истечении SDK сам вызывает рефреш (`client.refreshToken(refreshToken)` — ротация), мы пересохраняем новые `accessToken`/`refreshToken` (Dexie `accounts`) и возвращаем их.
- Хранение: `accessToken` — только RAM/sessionStorage (как сейчас); **`refreshToken` — в `AccountModel.refreshToken` (IndexedDB `accounts`)**, чтобы сессия переживала закрытие браузера. Пароль не хранится и не логируется.
- `authStore.restoreSession()`: если refresh-токен есть и живой → восстанавливаем сессию без ввода пароля; если протух → тихий `signOut` на экран логина.
- SSO (`m.login.sso` / `getSsoLoginUrl(redirectUrl, 'sso')` + `loginRequest({ type: 'm.login.token', token })`): будущая подзадача того же слайса (matrix.org поддерживает GitHub/Google/SSO). Реализуется ПОСЛЕ базового парольного флоу; UX: кнопка «Sign in via SSO» → редирект на HS → callback с `loginToken`.
- `LegacySyncProvider.start()` использует тот же `client`; редирект-флоу SSO требует настройки redirect URL (dev/prod).

### 7.3. TDD-контракт

1. `authService.login` (пароль): мок `/login` → вернулись токены, аккаунт сохранён в `accounts` с `refreshToken`, пароль нигде не сохранён.
2. Auto-refresh: `tokenRefreshFunction` вызывается при 401 → `client.refreshToken` → новые токены записаны в `accounts` и возвращены SDK.
3. `restoreSession` из refresh-токена: живой refresh → сессия восстановлена; протухший → `signOut`.
4. UI `LoginScreen`: поля `deviceId`/`accessToken` удалены, вместо них — пароль; submit → `authService.login`.
5. SSO (позже): `getSsoLoginUrl` возвращает корректный URL; exchange `loginToken` → `loginRequest(m.login.token)`.

### 7.4. DoD

- [x] Вход по паролю без ручного ввода токена; access/refresh токены получены от сервера.
- [x] Протухший access-токен продлевается автоматически (refresh-token ротация) — без ручного обновления.
- [x] Сессия восстанавливается после закрытия/перезагрузки браузера (refresh-токен в `accounts`).
- [ ] SSO-кнопка работает (подзадача, после базового пароля).
- [x] Гейт зелёный; коммит.

### 7.5. Итоги слайса

- `authService.ts`: `login(homeserver, userId, password)` через `client.loginRequest({ type: 'm.login.password', identifier: { type: 'm.id.user', user }, password, refresh_token: true })` (НЕ deprecated `loginWithPassword`); `makeTokenRefreshFunction(userId, () => client)` — `client.refreshToken` → `setTokens` (access → sessionStorage, refresh → accounts) → возвращает `{ accessToken, refreshToken, expiry }` для `TokenRefresher` SDK.
- `startLegacySync(userId, onLoggedOut?)`: `createClient({ accessToken?, refreshToken, tokenRefreshFunction })`; refresh-токен в клиенте позволяет восстанавливать сессию без accessToken (первый 401 → ротация); `Session.logged_out` → `onLoggedOut?.()` + `stopLegacySync`.
- `authStore.restoreSession()`: живой refresh/access → сессия восстановлена (isAuthenticated по userId); протухший refresh → `Session.logged_out` → тихий `signOut` (чистит refreshToken + `uiStore.openLogin`).
- `AccountModel.refreshToken` (IndexedDB `accounts`); accessToken — только sessionStorage (Principles §3.2.1, §3.2.2).
- Бонус P1: `await pendingQueue.restore()` в `startLegacySync` + GC сирот: удаляются `pendingEvents`, чей txnId неактивен и сообщение уже доставлено (есть в `events`).
- SSO (`m.login.sso`/`getSsoLoginUrl` + `m.login.token`) — открытая подзадача.
- Отклонение от аудита: в HANDOFF была формулировка «GC, где события нет в `events`»; реализовано наоборот (удаляются доставленные дубликаты, не трогая failed-строки для Retry) — иначе ломается кнопка Retry из Слайса 3. Расхождение зафиксировано здесь.

---

## 8. Слайс 5 — E2EE Cold Start + re-decryption

### 8.1. Цель

E2EE по 00-PRINCIPLES §3.3 и 01-АРХ §4: строгий порядок `createClient → initRustCrypto({cryptoDatabasePrefix}) → startClient`, UTD-модель и реактивная re-decryption.

### 8.2. Ключевые решения

- cryptoDatabasePrefix: `matrix-js-sdk:crypto:${userId}:${deviceId}` (изоляция на аккаунт+устройство, общий store запрещён).
- Обработка событий `/sync` — только после завершения `initRustCrypto`.
- Content-семантика зашифрованных событий: при `Event.decrypted` `EventModel.content` переписывается расшифрованным, `isEncrypted: true`, `decryptionError` при UTD. После расшифровки шифр-конверт (`m.room.encrypted` content) в `events` не хранится (минимизация персистенции).
- UTD: Temporary (авто-запрос `m.room_key_request`) → Permanent через 30 сек без ответа (плашка в UI) → Re-decryption при приходе ключей (подписка `Event.decrypted` → повторный проход → обновление DTO через `BatchedStoreManager`).
- `EventModel.decryptionError`, `isEncrypted`, `content` уже расшифрованный — контракт готов (03 §1).
- `$crypto/e2ee.ts` — реализация `IE2EEService` (03 §4.3).
- Юнит-тесты crypto идут через мок `IE2EEService`/`MockRustCrypto` из `matrix-js-sdk`: WASM-бинарник и воркеры Rust Crypto не загружаются в среде Vitest/happy-dom, поэтому реальная интеграция проверяется вне юнит-тестов. Это обязательное требование слайса, а не опциональный хак.

### 8.3. TDD-контракт

1. Cold Start порядок: события не обрабатываются до готовности crypto (флаг готовности). Проверяется на моке `IE2EEService`.
2. UTD-переход: таймер 30с Temporary → Permanent. Проверяется на моке `IE2EEService`.
3. Re-decryption: приход ключа → событие со статусом UTD пере-расшифровывается и перепушивается в сторы. Проверяется на моке `IE2EEService`.

### 8.4. DoD

- [x] Приватная комната расшифровывается по Cold Start Protocol (реализован флаг готовности + initRustCrypto).
- [x] UTD-состояния отображаются и авто-перерасшифровываются (таймер 30с, re-decryption через Event.decrypted).
- [x] Cross-Signing/SAS/QR и Recovery Key (5.1a bootstrap + recovery, 5.1b SAS, 5.1c QR). Документ UI/контрактов — `docs/05-UI-E2EE.md`.
- [x] Гейт зелёный (check/test/lint). коммит.

---

## 9. Слайс 6 — История, retention, медиа-кэш

- **Предусловие (до первого рендера `formattedBody`):** санитизация удалённого HTML через DOMPurify (03 §3) и внедрение строгого CSP по 01-АРХ §7 (prod-заголовки или prod-only `<meta>`, не статический CSP в dev — иначе ломается HMR). Рендер `{@html}` разрешён только после санитизации.
- Пагинация вверх через `timelineGaps` + `/messages` (02-DATA §2, `timelineGaps`).
- Retention: не более 300 последних событий на комнату, защита Reply/Thread (stub-снимки), приоритет текста над медиа.
- Media Cache: Cache Storage + LRU/FIFO, очистка по retention/квоте/`QuotaExceededError`.
- Виртуализация списков (закрывает хвост слайса 1).

---

## 10. Слайс 7 — Multi-tab + Lazy-sync

- Web Locks: ровно одна Master-вкладка на `userId+deviceId` (лок `matrix_master_${userId}_${deviceId}`), Slave читают из IndexedDB и проксируют команды через `BroadcastChannel` (nonce-handshake, ACK 500 мс).
- `IMultiTabService` (03 §4.2), перенос accessToken между вкладками только в RAM через handshake.
- Active/Lazy аккаунты: Lazy — polling 2–5 мин + sync при фокусе; filter обязан включать критические `to_device`-типы (00 §3.3.2).
- `ISyncFilterService` (03 §4.4), `filters.ts`.

---

## 11. Правила выполнения

1. Порядок слайсов не меняется без явного решения; каждый слайс начинается с TDD-тестов (§ 4–10).
2. Выход за blast radius слайса запрещён (AGENTS.md); правки прошлых слоёв — только если без них слайс невозможен, с фиксацией причины.
3. Каждый слайс заканчивается коммитом(ами) с зелёным гейтом и обновлением `HANDOFF-<ник>.md`.
4. Расхождения с 00–03 фиксируются в этих документах, а не в коде-комментариях.
5. Владелец слайса фиксируется в колонке «Владелец» (§3); переназначение — только по решению владельца репозитория.

### 11.1. Организация работы над слайсом (как шёл Слайс 5)

Крупный слайс дробится на **законченные кодовые куски**, каждый — по TDD (падающий тест → реализация → зелёный) и отдельным код-коммитом с зелёным гейтом на каждом:

- **Слайс 5 = 5.1a–5.1d:** 5.1a bootstrap cross-signing + recovery key → 5.1b SAS-верификация + trust-щитки → 5.1c QR show/scan → 5.1d документ UI-`docs/05-UI-E2EE.md` + обновление roadmap/HANDOFF. Каждый кусок автономен и сквозной (crypto → store → UI → тесты).
- **Паттерн «код + доки»:** код-коммиты (`feat`/`fix`) — от автора-владельца (при соглашении — с трейлером `Co-authored-by` для AI), доки-коммиты (`docs`) — отдельными коммитами. Код и доки не смешиваются в одном коммите. Правила — `COMMITS.md`.
- **Ревью перед закрытием:** после набора кусков запускается пак ревью-агентов (ponytail / SDK-API / безопасность / баги) по `origin/main..HEAD`; ключевые утверждения сверяются с исходниками SDK и кода. Найденные дефекты чинятся отдельным `fix`-коммитом, после чего слайс официально закрывается в §2/§8 и roadmap.
- Все расхождения с доки (например, «SDK-метод оказался публичным, каст не нужен») фиксируются в соответствующем доку (§3.4/3.5 05-UI-E2EE), а не в комментариях кода.

---

**Конец документа.**
