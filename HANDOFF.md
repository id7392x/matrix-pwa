# Handoff — matrix-pwa (Svelte 5 Matrix-клиент)

> Общее состояние проекта + трек `<repo-owner>`. Треки контрибьюторов — в `HANDOFF-<ник>.md`.
> Порядок входа: `AGENTS.md` → определить участника (ник назван? → `HANDOFF-<ник>.md`) → общее состояние в §1–3.

## 1. Общее состояние репозитория

- Репо: `/Users/macos/Documents/OpenCode/matrix-pwa`. Ветка `main`, **HEAD: `edd00e7`, 70 коммитов**, **запушено в `origin`** (`github.com/<repo-owner>/matrix-pwa`, **публичный**). Все коммиты подписаны SSH (GitHub: Verified). История переписана: `id7392x` вычищен из .md файлов, author/committer fields сохранены. Правила коммитов — в `COMMITS.md` (читать перед каждым коммитом).
- Гейт зелёный: `pnpm run check` 0 ошибок, `pnpm test` **167/167**, `pnpm run lint` чисто. Pre-commit хук (simple-git-hooks) прогоняется автоматически на каждом коммите.
- **GitHub Ruleset «Protect main»**: люди — только через PR (1 approval + статус-чек `gate` + signed commits); `<repo-owner>` — bypass на прямой push. ⚠️ Проверить вручную во вкладке Bypass: там должен быть ТОЛЬКО `<repo-owner>`.
- **GitHub Actions** (`acd2798`): гейт `pnpm check/test/lint` на push и pull_request.
- **Push-политика по трекам**: `<repo-owner>` — только локальные коммиты, пуш в `origin` после явного словесного подтверждения; контрибьюторы — только свои feature-ветки (подробности — `COMMITS.md`, `CONTRIBUTING.md`).

## 2. Экскурсия по проекту (для новых участников)

### 2.1. Стек и структура

Стек — `AGENTS.md` §Стек. Алиасы: `$lib` (`src/lib`), `$components`, `$storage`, `$sync`, `$crypto`, `$stores`, `$types`.
Документация-источники: `docs/00-PRINCIPLES.md`, `docs/01-ARCHITECTURE.md`, `docs/02-DATA-MODEL.md`, `docs/03-REFERENCE-CODE.md`, `docs/04-ROADMAP.md`.

### 2.2. Команды и правила

Команды и guardrails — в `AGENTS.md`. Сжато: `check` + `test` + `lint` = гейт (100% зелёный перед коммитом). Формат, scopes, авторство — `COMMITS.md`.
- После UI-изменений: проверь в браузере (`openchamber_web → browser.*`) если dev-сервер запущен.

### 2.3. Скиллы проекта

Активные скиллы: `git-commit`, `ponytail` (по умолчанию), `boy-scout-rule`, `code-review`, `detect-stack`, `writing-for-agents`, `solid`, `separation-of-concerns`, `e2ee` (проектный, `.opencode/skills/e2ee/`).

### 2.4. Прогресс по слайсам (подробно — `docs/04-ROADMAP.md`)

| # | Слайс | Владелец | Статус |
|---|---|---|---|
| Stage 0–1 | инфраструктура, хранилище, домен, UI на моках | общий | выполнено |
| 2 | `LegacySyncProvider` (реальный `/sync`) | `<repo-owner>` | **выполнен** (`b31d7ea`, запушен) |
| 3 | Отправка сообщений (optimistic UI + dual-path + retry) | `<repo-owner>` | **выполнен** (`4eba646`, запушен) |
| 4 | Авторизация: пароль + refresh-токен (+ SSO) | `<repo-owner>` | **выполнен** (локально; базовый пароль, SSO — подзадача) |
| Ревью-батч | фиксы по итогам ревью домена (см. `04-ROADMAP.md`) | `<repo-owner>` | **выполнен** (локально, `2dd3072`–`409ea1d`) |
| 5 | E2EE Cold Start + re-decryption | `<repo-owner>` | **следующий** |
| 6 | История, пагинация, retention, медиа-кэш | свободен | запланирован |
| 7 | Multi-tab + Lazy-sync | свободен | запланирован |
| Дизайн-трек (Д1–Д2) | горизонтальный, не вертикальный слайс | свободен | **ревью выполнено** (см. `docs/DESIGN.md`)

## 3. Общие знания (фактология, хвосты, нюансы)

- **WASM-миф:** ядро `matrix-js-sdk` НЕ тянет vodozemac/WASM; WASM грузится лениво через `initRustCrypto` (Слайс 5). Vite worker-конфиг заранее не нужен — YAGNI до Слайса 5. В prod-сборке `matrix_rust_crypto`/WASM-чанки эмитятся ленивыми ассетами (не скачиваются без `initRustCrypto`) — это ОК, не трогаем. Первый импорт `matrix-js-sdk` — в `src/lib/legacySync.ts` и `src/sync/legacySyncProvider.ts`.
- **SDK-нюансы v42:** `Room.isDirect` не существует — DM определяется через `m.direct` accountData (`client.getAccountData(EventType.Direct)`, см. `legacySyncProvider.directRoomIds`). Счётчики непрочитанного — через `room.setUnread`/`getUnreadNotificationCount(NotificationCountType.*)`; `room.name` уже содержит SDK-fallback heroes/roomId. Событие `ClientEvent.Sync` отдаёт `ISyncStateData` (`nextSyncToken`), сырых комнат там нет — комнаты берутся из `client.getRooms()` после обработки синка; релевантно состояние `Syncing` (каждый цикл `/sync`).
- **Эхо отправки:** канонический канал эха по спеке — `event.getUnsigned().transaction_id` (`event.getTxnId()` — только локальный фолбэк). Маппится в `legacySyncProvider.toSyncRawEvent` как `txn_id: event.getTxnId() ?? event.getUnsigned().transaction_id`; `SyncOrchestrator.upsertEvent` читает оба пути (`raw.unsigned?.transaction_id ?? raw.txn_id`).
- **Optimistic UI (Слайс 3):** `PendingQueueService.sendMessage` пушит в `batchedStore` optimistic DTO (`local-<txnId>`, `syncState:'sending'`) до сети; после `/send` флипается в `synced` сразу (C12), эхо из `/sync` с тем же `txnId` идемпотентно заменяет его. Ретраи: `retry()` разрешён при `retryCount > 0` (гейт `status !== 'failed'` был багом — отсекал `pending`-строки, исправлено). При дефолтном лимите 3 первый сбой → `pending` (count 1), UI показывает `failed` + кнопку Retry — это самосогласованно, расхождение UI↔DB статусов зафиксировано как техдолг.
- **Promote (C4):** `SyncOrchestrator.upsertEvent` выполняет promote по `txnId` всегда (без проверки активности очереди) — stale/восстановленная pending-строка не осиротит; `promotePendingToSynced` идемпотентен и делает put в `events`, даже если pending-записи уже нет.
- **CSP:** в коде нет ни одного `{@html}` — XSS-поверхности сейчас нет. `formatted_body` хранится в DTO/БД как есть и НЕ рендерится — санитизация (DOMPurify) и строгий CSP (01-АРХ §7) — обязательное предусловие Слайса 6 (перед первым `{@html}`); до этого не трогать.
- **Токены (Слайс 4):** `accessToken` — только RAM/sessionStorage (`mx_token:<userId>`, ключ — в `accountManager`), в БД запрещено (Principles §3.2.1). **`refreshToken` — реализован** в `accounts.refreshToken` (Principles §3.2.1.1). Пароль не хранится никогда. **OIDC SSO реализован** — matrix.org использует делегированный OIDC (MSC3824/MSC3861), авторизация через `/authorize` + PKCE + динамическая регистрация клиентов. `application_type: "native"` для http:// origins (RFC 8252 §7.3). Хранилище OAuth2-клиентов в `oauthClients`. Токены не попадают в IndexedDB — только в sessionStorage.
- **Хвосты:** `SyncOrchestrator` принимает полный live-timeline комнаты каждый цикл и идемпотентно пишет (DB-PK дедупа). Дубликаты строк в UI предотвращает `batchedStore.pushEvents` (upsert-by-id) + `replaceByTxnId`. invite/leave, пагинация вверх, retention — будущие слайсы; `filters.ts` и `IMultiTabService` — Слайс 7; `activeQueues` (модульный глобал `getActiveQueue().at(-1)`) — рабочий для одного аккаунта, мульти-аккаунт (keyed by userId + unregister на stop) — техдолг слайса 7.
- **Техдолг после Слайса 3 (P1, из аудита):** `startLegacySync` НЕ вызывал `pendingQueue.restore()` — после релоада pending-строки не всплывали, а позднее эхо оставляло сирот в `pendingEvents`. **Решено в ревью-батче (C2/C7):** `restore()` вызывается в `startLegacySync` и переотправляет pending; GC чистит доставленные сироты (txnId неактивен + событие есть в `events`) с фильтром по `userId`.
- **Ручная проверка dev (не автоматизируется):** реальный `/sync` требует accessToken живого аккаунта — прогон против matrix.org делается в браузере вручную (`pnpm dev`, логин с токеном). Unit-покрытие цепи sync→stores есть в `legacySync.test.ts`, `legacySyncProvider.test.ts`, `SyncOrchestrator.test.ts`, `PendingQueueService.test.ts`.
- **Vitest-готча:** рендер-тесты Svelte требуют `resolve.conditions: ['browser']` в `vite.config.ts` — иначе `mount` из `svelte` резолвится в server-сборку (`lifecycle_function_unavailable`). Не удалять. Дополнительно: SDK `matrix-js-sdk` (ESM с directory-imports, напр. `../http-api`) в Node-резолве падает — обязателен `test.server.deps.inline: [/matrix-js-sdk/]` (Vite резолвит `.ts`/индексные импорты). Не удалять.
- **Репо публичное** — ничего лишнего в файлы/историю (в авторских строках только GitHub noreply, без личных email).

## 4. Дизайн-ревью (выполнено 2026-08-25)

**Ревью компонентов выполнено:** найдены 4 критических (A1–A4) и 6 улучшений (I5–I10) в `LoginScreen`, `RoomList`, `RoomListItem`, `Timeline`, `TimelineItem`, `App.svelte`.

**Критические:**
- A1: No ARIA labels / screen reader support
- A2: Insufficient touch target sizes (44x44pt mobile)
- A3: Timeline uses raw Tailwind (inconsistent with glassmorphism)
- A4: No focus states visible

**Улучшения:**
- I5: No loading states
- I6: No hover/focus feedback на карточках
- I7: No dark/light mode support
- I8: No safe area handling
- I9: Typography scale absent
- I10: No empty state design

**План implementation — `docs/DESIGN.md`:** Phase 1 (Design Token System) → Phase 2 (Dark/Light Mode) → Phase 3 (Accessibility Fixes) → Phase 4 (Component Updates) → Phase 5 (Empty & Loading States).

**Статус:** ревью готово, план в `docs/DESIGN.md`. Ожидает подтверждения на implementation.

## 5. Трек `<repo-owner>` — следующий шаг: Слайс 5 — E2EE Cold Start (`docs/04-ROADMAP.md` §8)

**Выполнено (сводка):** слайсы 1–4, ревью-батч (`2dd3072`–`409ea1d`), sync race fix (`ea53bf3`), e2ee echo dedup (`2ce4902`), OIDC SSO (`a8987b8`–`275b946`) — все запушены, гейт зелёный.

**Техдолг:** SSO `m.login.token` (подзадача 4), мульти-аккаунт (отложено до 7), e2ee echo dedup race (известная async гонка).

**Слайс 5 — E2EE Cold Start:** см. `docs/04-ROADMAP.md` §8, skill `e2ee` (`.opencode/skills/e2ee/SKILL.md`).
- TDD-контракт: Cold Start ordering → UTD temp→perm (30с) → re-decryption приход ключа.
- Ключевой файл: `src/crypto/e2ee.ts` (реализация `IE2EEService`).
- storePrefix: `matrix-js-sdk:crypto:${userId}:${deviceId}` (изоляция на аккаунт+устройство).
- WASM не грузится в Vitest — тесты через `MockRustCrypto` / mock `IE2EEService`.
- DoD: приватная комната расшифровывается по Cold Start; UTD отображаются и авто-перерасшифровываются; Cross-Signing/SAS/QR/Recovery Key — подзадачи слайса.

