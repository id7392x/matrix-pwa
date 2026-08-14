# Handoff — matrix-pwa (Svelte 5 Matrix-клиент)

> Общее состояние проекта + трек `<repo-owner>`. Трек `mtwave` — в `HANDOFF-MTWAVE.md`.
> Порядок входа: `AGENTS.md` → определить участника (ник назван? → `HANDOFF-<ник>.md`) → общее состояние в §1–3.

## 1. Общее состояние репозитория

- Репо: `/Users/macos/Documents/OpenCode/matrix-pwa`. Ветка `main`, **HEAD: `4eba646`, 45 коммитов**, **запушен в `origin`** (`github.com/<repo-owner>/matrix-pwa`, **публичный**). Слайсы 2 и 3 выполнены и запушены. История подписана (SSH, GitHub: Verified) — код — автор `<repo-owner>` + ровно один трейлер `Co-authored-by: OpenCode <opencode-agent[bot]@users.noreply.github.com>`, доки — автор `OpenCode <opencode-agent[bot]@users.noreply.github.com>` без трейлера. Правила коммитов — в `COMMITS.md` (читать перед каждым коммитом).
- Гейт зелёный: `pnpm run check` 0 ошибок, `pnpm test` **105/105**, `pnpm run lint` чисто. Pre-commit хук (simple-git-hooks) прогоняется автоматически на каждом коммите.
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
- `pnpm test` / `pnpm test:watch` — Vitest (сейчас 105/105).
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
| 4 | Авторизация: пароль + refresh-токен (+ SSO) | `<repo-owner>` | **следующий** |
| 5 | E2EE Cold Start + re-decryption | `<repo-owner>` | запланирован |
| 6 | История, пагинация, retention, медиа-кэш | свободен (кандидат — `mtwave`, решит сам) | запланирован |
| 7 | Multi-tab + Lazy-sync | свободен (кандидат — `mtwave`, решит сам) | запланирован |
| Дизайн-трек (Д1–Д2) | горизонтальный, не вертикальный слайс | свободен | не начат |

## 3. Общие знания (фактология, хвосты, нюансы)

- **WASM-миф:** ядро `matrix-js-sdk` НЕ тянет vodozemac/WASM; WASM грузится лениво через `initRustCrypto` (Слайс 5). Vite worker-конфиг заранее не нужен — YAGNI до Слайса 5. В prod-сборке `matrix_rust_crypto`/WASM-чанки эмитятся ленивыми ассетами (не скачиваются без `initRustCrypto`) — это ОК, не трогаем. Первый импорт `matrix-js-sdk` — в `src/lib/legacySync.ts` и `src/sync/legacySyncProvider.ts`.
- **SDK-нюансы v42:** `Room.isDirect` не существует — DM определяется через `m.direct` accountData (`client.getAccountData(EventType.Direct)`, см. `legacySyncProvider.directRoomIds`). Счётчики непрочитанного — через `room.setUnread`/`getUnreadNotificationCount(NotificationCountType.*)`; `room.name` уже содержит SDK-fallback heroes/roomId. Событие `ClientEvent.Sync` отдаёт `ISyncStateData` (`nextSyncToken`), сырых комнат там нет — комнаты берутся из `client.getRooms()` после обработки синка; релевантно состояние `Syncing` (каждый цикл `/sync`).
- **Эхо отправки:** канонический канал эха по спеке — `event.getUnsigned().transaction_id` (`event.getTxnId()` — только локальный фолбэк). Маппится в `legacySyncProvider.toSyncRawEvent` как `txn_id: event.getTxnId() ?? event.getUnsigned().transaction_id`; `SyncOrchestrator.upsertEvent` читает оба пути (`raw.unsigned?.transaction_id ?? raw.txn_id`).
- **Optimistic UI (Слайс 3):** `PendingQueueService.sendMessage` пушит в `batchedStore` optimistic DTO (`local-<txnId>`, `syncState:'sending'`) до сети; эхо из `/sync` с тем же `txnId` заменяет его через `batchedStore.upsertByTxnId`. Ретраи: `retry()` разрешён при `retryCount > 0` (гейт `status !== 'failed'` был багом — отсекал `pending`-строки, исправлено). При дефолтном лимите 3 первый сбой → `pending` (count 1), UI показывает `failed` + кнопку Retry — это самосогласованно, расхождение UI↔DB статусов зафиксировано как техдолг.
- **CSP:** в коде нет ни одного `{@html}` — XSS-поверхности сейчас нет. `formatted_body` хранится в DTO/БД как есть и НЕ рендерится — санитизация (DOMPurify) и строгий CSP (01-АРХ §7) — обязательное предусловие Слайса 6 (перед первым `{@html}`); до этого не трогать.
- **Токены (Слайс 4):** `accessToken` — только RAM/sessionStorage (`mx_token:<userId>`), в БД запрещено (Principles §3.2.1). **`refreshToken` — планируемое исключение** в `accounts.refreshToken` (Principles §3.2.1.1) — нужно добавить поле в `AccountModel` и `db.ts` при реализации слайса 4. Пароль не хранится никогда.
- **`RoomDto.lastEventText`** осознанно НЕ заполняется (нужен запрос `db.events` по комнате) — со слайсом превью ленты.
- **Хвосты:** `SyncOrchestrator` принимает полный live-timeline комнаты каждый цикл и идемпотентно пишет (DB-PK дедупа). Дубликаты строк в UI предотвращает `batchedStore.pushEvents` (idempotent по `event.id`) + `upsertByTxnId`. invite/leave, пагинация вверх, retention — будущие слайсы; `filters.ts` и `IMultiTabService` — Слайс 7; `activeQueues` (модульный глобал `getActiveQueue().at(-1)`) — рабочий для одного аккаунта, мульти-аккаунт (keyed by userId + unregister на stop) — техдолг слайса 7.
- **Техдолг после Слайса 3 (P1, из аудита):** `startLegacySync` НЕ вызывает `pendingQueue.restore()` — после релоада pending-строки не всплывают, а позднее эхо оставляет сирот в `pendingEvents` (GC сирот — тоже P1). План: `await pendingQueue.restore()` в `startLegacySync` + удаление `pendingEvents`, где txnId неактивен и события нет в `events` — сделать в Слайсе 4 (авторизация) или отдельным фиксом.
- **Ручная проверка dev (не автоматизируется):** реальный `/sync` требует accessToken живого аккаунта — прогон против matrix.org делается в браузере вручную (`pnpm dev`, логин с токеном). Unit-покрытие цепи sync→stores есть в `legacySync.test.ts`, `legacySyncProvider.test.ts`, `SyncOrchestrator.test.ts`, `PendingQueueService.test.ts`.
- **Vitest-готча:** рендер-тесты Svelte требуют `resolve.conditions: ['browser']` в `vite.config.ts` — иначе `mount` из `svelte` резолвится в server-сборку (`lifecycle_function_unavailable`). Не удалять. Дополнительно: SDK `matrix-js-sdk` (ESM с directory-imports, напр. `../http-api`) в Node-резолве падает — обязателен `test.server.deps.inline: [/matrix-js-sdk/]` (Vite резолвит `.ts`/индексные импорты). Не удалять.
- **Репо публичное** — ничего лишнего в файлы/историю (в авторских строках только GitHub noreply, без личных email).

## 4. Трек `<repo-owner>` — следующий шаг: Слайс 4 — Авторизация (`docs/04-ROADMAP.md` §7)

Слайсы 2 и 3 выполнены и запушены в `origin` (`b31d7ea`, `4eba646`). DoD Слайса 3 закрыт: optimistic UI (sending→synced через эхо), `failed` + кнопка Retry, дубликат исключён (dual-path promote), гейт зелёный, 105/105 тестов.

Цель Слайса 4: убрать ручной ввод/обновление токена. Сейчас пользователь вставляет вручную `deviceId`/`accessToken` в `LoginScreen`; когда токен протухает — SDK выдаёт `M_UNKNOWN_TOKEN` «Unable to refresh token - no refresh token or refresh function» (потому что `createClient` создаётся без `refreshToken`/`tokenRefreshFunction`, `legacySync.ts:24`).

TDD-контракт (04 §7.3):
1. `authService.login` (пароль, `m.login.password` через `client.loginRequest`, НЕ deprecated `loginWithPassword`): аккаунт сохранён с `refreshToken`, пароль не в БД/логах.
2. Auto-refresh: `tokenRefreshFunction` в `createClient` → на 401/пред-истечении `client.refreshToken(refreshToken)` (ротация) → новые токены персистятся в `accounts`.
3. `authStore.restoreSession()`: живой refresh-токен → сессия восстановлена без пароля; протухший → тихий `signOut`.
4. UI `LoginScreen`: удалить поля `deviceId`/`accessToken`, добавить пароль; submit → `authService.login`.
5. SSO (`m.login.sso`, `getSsoLoginUrl(redirectUrl, 'sso')` + `loginRequest({type:'m.login.token'})`) — подзадача ПОСЛЕ базового пароля.

Ключевые изменения:
- `src/storage/db.ts`: добавить `refreshToken?: string` в `AccountModel` (обновить контракт в `docs/03-REFERENCE-CODE.md`, уже актуализирован).
- `src/lib/accountManager.ts`: `getRefreshToken`/`setTokens` (access → sessionStorage, refresh → accounts).
- `src/lib/authService.ts` (new): `login(homeserver, userId, password)` → `loginRequest` → персист.
- `src/lib/legacySync.ts`: `createClient({ accessToken, refreshToken, tokenRefreshFunction })`.
- `src/stores/authStore.svelte.ts`: `restoreSession()` из refresh; `signOut()` — чистить refresh.
- `src/components/LoginScreen.svelte`: форма пароля.
- Бонус (P1 из аудита): `await pendingQueue.restore()` в `startLegacySync` + GC сирот `pendingEvents`.

Порядок слайса: TDD (тесты на контракты 1–4) → реализация → гейт → коммит `feat(auth): ...` (автор `<repo-owner>` + трейлер), доки отдельным `docs(...)`.

## 5. Трек `mtwave`

Не подключён — активной работы нет. Вход: «я mtwave» (см. `AGENTS.md` «Участники и вход», `HANDOFF-MTWAVE.md`).
