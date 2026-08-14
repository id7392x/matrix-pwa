# Handoff — matrix-pwa (Svelte 5 Matrix-клиент)

> Общее состояние проекта + трек `<repo-owner>`. Трек `mtwave` — в `HANDOFF-MTWAVE.md`.
> Порядок входа: `AGENTS.md` → определить участника (ник назван? → `HANDOFF-<ник>.md`) → общее состояние в §1–3.

## 1. Общее состояние репозитория

- Репо: `/Users/macos/Documents/OpenCode/matrix-pwa`. Ветка `main`, **HEAD: `409ea1d`, 55 коммитов**, **частично запушен в `origin`** (`github.com/<repo-owner>/matrix-pwa`, **публичный**). Слайсы 2, 3 запушены; слайс 4 (авторизация) и ревью-батч (`2dd3072`, `6bcc411`, `aeb577e`, `409ea1d`) — локально, ждут пуша (6 коммитов). История подписана (SSH, GitHub: Verified) — код — автор `<repo-owner>` + ровно один трейлер `Co-authored-by: OpenCode <opencode-agent[bot]@users.noreply.github.com>`, доки — автор `OpenCode <opencode-agent[bot]@users.noreply.github.com>` без трейлера. Правила коммитов — в `COMMITS.md` (читать перед каждым коммитом).
- Гейт зелёный: `pnpm run check` 0 ошибок, `pnpm test` **136/136**, `pnpm run lint` чисто. Pre-commit хук (simple-git-hooks) прогоняется автоматически на каждом коммите.
- **GitHub Ruleset «Protect main»**: люди — только через PR (1 approval + статус-чек `gate` + signed commits); `<repo-owner>` — bypass на прямой push (проверено эмпирически: пуш проходит, лишь warning «Required status check 'gate' is expected»). ⚠️ Проверить вручную во вкладке Bypass: там должен быть ТОЛЬКО `<repo-owner>`.
- **GitHub Actions** (`acd2798`): гейт `pnpm check/test/lint` на push и pull_request.
- **Push-политика по трекам**: `<repo-owner>` — только локальные коммиты, пуш в `origin` после явного словесного подтверждения; `mtwave` — только свои feature-ветки (подробности — `AGENTS.md`).

## 2. Экскурсия по проекту (для новых участников)

### 2.1. Стек и структура

- PWA Matrix-клиент: **Svelte 5 (Runes), TypeScript strict, Vite, Tailwind CSS**.
- Хранилище и сеть: **Dexie.js 4 (IndexedDB)**, **Matrix JS SDK**, **Vodozemac WASM** (E2EE, Слайс 5).
- Алиасы: `$lib` (`src/lib`), `$components`, `$storage`, `$sync`, `$crypto`, `$stores`, `$types`.
- Документация-источники: `docs/00-PRINCIPLES.md`, `docs/01-ARCHITECTURE.md`, `docs/02-DATA-MODEL.md`, `docs/03-REFERENCE-CODE.md`, `docs/04-ROADMAP.md`.

### 2.2. Команды

- `pnpm run check` — svelte-check + tsc (линт/типы).
- `pnpm test` / `pnpm test:watch` — Vitest (сейчас 136/136).
- `pnpm run lint` — ESLint.
- `pnpm dev` — dev-сервер (`http://localhost:5173`); `pnpm build` / `pnpm preview` — сборка/предпросмотр.
- Гейт коммита: 100% зелёные `check` + `test` + `lint` (pre-commit хук гоняет сам).

### 2.3. Правила (кратко)

- TDD: падающий тест → минимальная реализация → рефакторинг; каждый слайс закрывается зелёным гейтом.
- Типизация: `any` запрещён; неизвестные данные — `unknown`.
- IndexedDB: только через Dexie.js + Web Locks API.
- Blast radius: код менять только в рамках текущего слайса.
- UI: только Svelte 5 Runes (`$state`/`$derived`/`$effect`).
- Формат коммитов, scopes, авторство, подписи — `COMMITS.md`.

### 2.4. Скиллы проекта (краткое описание и использование)

- `git-commit` — атомарный коммит по Conventional Commits (сообщение/сборка за агентом). Скажи «закоммить».
- `handoff` — фиксация состояния сессии в `HANDOFF-<ник>.md`. Вызывается в конце сессии.
- `ponytail` — ленивый минимализм: stdlib/нативное/уже установленное раньше новых зависимостей. Действует по умолчанию.
- `boy-scout-rule` — тронутый код оставить чище, чем застал. При правке существующих файлов.
- `code-review` — ревью изменений (стандарты + соответствие слайсу). Перед коммитом/PR по слайсу.
- `diagnosing-bugs` — диагностика падений/регрессий («диагностируй», «почему падает»).

### 2.5. Прогресс по слайсам (подробно — `docs/04-ROADMAP.md`)

| # | Слайс | Владелец | Статус |
|---|---|---|---|
| Stage 0–1 | инфраструктура, хранилище, домен, UI на моках | общий | выполнено |
| 2 | `LegacySyncProvider` (реальный `/sync`) | `<repo-owner>` | **выполнен** (`b31d7ea`, запушен) |
| 3 | Отправка сообщений (optimistic UI + dual-path + retry) | `<repo-owner>` | **выполнен** (`4eba646`, запушен) |
| 4 | Авторизация: пароль + refresh-токен (+ SSO) | `<repo-owner>` | **выполнен** (локально; базовый пароль, SSO — подзадача) |
| Ревью-батч | фиксы по итогам ревью домена (см. `04-ROADMAP.md`) | `<repo-owner>` | **выполнен** (локально, `2dd3072`–`409ea1d`) |
| 5 | E2EE Cold Start + re-decryption | `<repo-owner>` | **следующий** |
| 6 | История, пагинация, retention, медиа-кэш | свободен (кандидат — `mtwave`, решит сам) | запланирован |
| 7 | Multi-tab + Lazy-sync | свободен (кандидат — `mtwave`, решит сам) | запланирован |
| Дизайн-трек (Д1–Д2) | горизонтальный, не вертикальный слайс | свободен | не начат |

## 3. Общие знания (фактология, хвосты, нюансы)

- **WASM-миф:** ядро `matrix-js-sdk` НЕ тянет vodozemac/WASM; WASM грузится лениво через `initRustCrypto` (Слайс 5). Vite worker-конфиг заранее не нужен — YAGNI до Слайса 5. В prod-сборке `matrix_rust_crypto`/WASM-чанки эмитятся ленивыми ассетами (не скачиваются без `initRustCrypto`) — это ОК, не трогаем. Первый импорт `matrix-js-sdk` — в `src/lib/legacySync.ts` и `src/sync/legacySyncProvider.ts`.
- **SDK-нюансы v42:** `Room.isDirect` не существует — DM определяется через `m.direct` accountData (`client.getAccountData(EventType.Direct)`, см. `legacySyncProvider.directRoomIds`). Счётчики непрочитанного — через `room.setUnread`/`getUnreadNotificationCount(NotificationCountType.*)`; `room.name` уже содержит SDK-fallback heroes/roomId. Событие `ClientEvent.Sync` отдаёт `ISyncStateData` (`nextSyncToken`), сырых комнат там нет — комнаты берутся из `client.getRooms()` после обработки синка; релевантно состояние `Syncing` (каждый цикл `/sync`).
- **Эхо отправки:** канонический канал эха по спеке — `event.getUnsigned().transaction_id` (`event.getTxnId()` — только локальный фолбэк). Маппится в `legacySyncProvider.toSyncRawEvent` как `txn_id: event.getTxnId() ?? event.getUnsigned().transaction_id`; `SyncOrchestrator.upsertEvent` читает оба пути (`raw.unsigned?.transaction_id ?? raw.txn_id`).
- **Optimistic UI (Слайс 3):** `PendingQueueService.sendMessage` пушит в `batchedStore` optimistic DTO (`local-<txnId>`, `syncState:'sending'`) до сети; после `/send` флипается в `synced` сразу (C12), эхо из `/sync` с тем же `txnId` идемпотентно заменяет его. Ретраи: `retry()` разрешён при `retryCount > 0` (гейт `status !== 'failed'` был багом — отсекал `pending`-строки, исправлено). При дефолтном лимите 3 первый сбой → `pending` (count 1), UI показывает `failed` + кнопку Retry — это самосогласованно, расхождение UI↔DB статусов зафиксировано как техдолг.
- **Promote (C4):** `SyncOrchestrator.upsertEvent` выполняет promote по `txnId` всегда (без проверки активности очереди) — stale/восстановленная pending-строка не осиротит; `promotePendingToSynced` идемпотентен и делает put в `events`, даже если pending-записи уже нет.
- **CSP:** в коде нет ни одного `{@html}` — XSS-поверхности сейчас нет. `formatted_body` хранится в DTO/БД как есть и НЕ рендерится — санитизация (DOMPurify) и строгий CSP (01-АРХ §7) — обязательное предусловие Слайса 6 (перед первым `{@html}`); до этого не трогать.
- **Токены (Слайс 4):** `accessToken` — только RAM/sessionStorage (`mx_token:<userId>`, ключ — в `accountManager`), в БД запрещено (Principles §3.2.1). **`refreshToken` — реализован** в `accounts.refreshToken` (Principles §3.2.1.1). Пароль не хранится никогда.
- **Хвосты:** `SyncOrchestrator` принимает полный live-timeline комнаты каждый цикл и идемпотентно пишет (DB-PK дедупа). Дубликаты строк в UI предотвращает `batchedStore.pushEvents` (upsert-by-id) + `replaceByTxnId`. invite/leave, пагинация вверх, retention — будущие слайсы; `filters.ts` и `IMultiTabService` — Слайс 7; `activeQueues` (модульный глобал `getActiveQueue().at(-1)`) — рабочий для одного аккаунта, мульти-аккаунт (keyed by userId + unregister на stop) — техдолг слайса 7.
- **Техдолг после Слайса 3 (P1, из аудита):** `startLegacySync` НЕ вызывал `pendingQueue.restore()` — после релоада pending-строки не всплывали, а позднее эхо оставляло сирот в `pendingEvents`. **Решено в ревью-батче (C2/C7):** `restore()` вызывается в `startLegacySync` и переотправляет pending; GC чистит доставленные сироты (txnId неактивен + событие есть в `events`) с фильтром по `userId`.
- **Ручная проверка dev (не автоматизируется):** реальный `/sync` требует accessToken живого аккаунта — прогон против matrix.org делается в браузере вручную (`pnpm dev`, логин с токеном). Unit-покрытие цепи sync→stores есть в `legacySync.test.ts`, `legacySyncProvider.test.ts`, `SyncOrchestrator.test.ts`, `PendingQueueService.test.ts`.
- **Vitest-готча:** рендер-тесты Svelte требуют `resolve.conditions: ['browser']` в `vite.config.ts` — иначе `mount` из `svelte` резолвится в server-сборку (`lifecycle_function_unavailable`). Не удалять. Дополнительно: SDK `matrix-js-sdk` (ESM с directory-imports, напр. `../http-api`) в Node-резолве падает — обязателен `test.server.deps.inline: [/matrix-js-sdk/]` (Vite резолвит `.ts`/индексные импорты). Не удалять.
- **Репо публичное** — ничего лишнего в файлы/историю (в авторских строках только GitHub noreply, без личных email).

## 4. Трек `<repo-owner>` — следующий шаг: Слайс 5 — E2EE Cold Start (`docs/04-ROADMAP.md` §8)

Слайс 4 (Авторизация) выполнен локально: вход по паролю через `authService.login` (`m.login.password` + `refresh_token`), auto-refresh через `tokenRefreshFunction` (ротация, токены персистятся в `accounts`), `restoreSession` из refresh-токена без пароля, `LoginScreen` — поле пароля вместо ручного токена. DoD базового пароля закрыт; SSO (`m.login.sso`/`m.login.token`) — открытая подзадача.

**Ревью-батч (выполнен локально, `2dd3072`–`409ea1d`):** все HIGH- и medium-находки ревью домена закрыты — echo всегда promote, `restore()` переотправляет pending, GC сирот с фильтром по `userId`, последний `lastEventTs` не затирается, per-event try/catch, state-события вне ленты, upsert-by-id + отмена pending flush, история навигации чистится при logout, seed refresh-токена без deadlock, normalizeHomeserver hardening, единый `toEventDto`/`SyncState`, удаление мёртвого кода. Гейт: `check` 0 ошибок, `test` 136/136, `lint` чисто.

TDD-контракт Слайса 5 (04 §8.3):
1. Cold Start порядок: события не обрабатываются до готовности crypto (флаг готовности). Проверяется на моке `IE2EEService`.
2. UTD-переход: таймер 30с Temporary → Permanent. Проверяется на моке `IE2EEService`.
3. Re-decryption: приход ключа → UTD-событие пере-расшифровывается и перепушивается в сторы. Проверяется на моке `IE2EEService`.

Ключевые изменения:
- `src/crypto/e2ee.ts` — реализация `IE2EEService` (03 §4.3): строгий порядок `createClient → initRustCrypto({ storePrefix: matrix-js-sdk:crypto:${userId}:${deviceId} }) → startClient`; события `/sync` — только после готовности crypto.
- `storePrefix` — изоляция на аккаунт+устройство (00 §3.3.1).
- `EventModel.decryptionError`, `isEncrypted`, расшифрованный `content` — контракт уже готов.
- UTD: Temporary → Permanent (30 сек) → re-decryption через `Event.decrypted`.
- Юнит-тесты — через мок `IE2EEService`/`MockRustCrypto`; WASM/воркеры в Vitest не грузятся (04 §8.2).

### Техдолг и хвосты после Слайса 4

- **SSO** (`getSsoLoginUrl` + `m.login.token`) — подзадача Слайса 4, не реализована.
- **GC сирот:** отклонение от формулировки аудита — удаляются доставленные дубликаты (`txnId` неактивен + событие ЕСТЬ в `events`), а не наоборот; иначе ломается Retry из Слайса 3. Зафиксировано в `04-ROADMAP.md` §7.5.
- **`isAuthenticated`** теперь определяется по `userId` (refresh-only сессия считается аутентифицированной); `accessToken` при restore из refresh может быть `null` до первого рефреша.
- **`RoomDto.lastEventText`** удалён (не использовался); превью ленты — со Слайсом 6 (требует запроса `db.events` по комнате).
- **Мульти-аккаунт:** `roomStore` показывает комнаты всех аккаунтов (без фильтра по `userId`) и `activeQueues` — модульный глобал (`getActiveQueue().at(-1)`); по решению ревью это осознанно отложено до реального мульти-аккаунта (Слайс 7), а не фиксится сейчас.

## 5. Трек `mtwave`

Не подключён — активной работы нет. Вход: «я mtwave» (см. `AGENTS.md` «Участники и вход», `HANDOFF-MTWAVE.md`).
