# Handoff — matrix-pwa (Svelte 5 Matrix-клиент)

> Общее состояние проекта + трек `<repo-owner>`. Трек `mtwave` — в `HANDOFF-MTWAVE.md`.
> Порядок входа: `AGENTS.md` → определить участника (ник назван? → `HANDOFF-<ник>.md`) → общее состояние в §1–3.

## 1. Общее состояние репозитория

- Репо: `/Users/macos/Documents/OpenCode/matrix-pwa`. Ветка `main`, **локальный HEAD: `b31d7ea`, 39 коммитов**; Слайс 2 закоммичен локально. `origin` (`github.com/<repo-owner>/matrix-pwa`, **публичный**) отстаёт — пуш только после подтверждения. История переписана и подписана (SSH, GitHub: Verified) — код — автор `<repo-owner>` + ровно один трейлер `Co-authored-by: OpenCode <opencode-agent[bot]@users.noreply.github.com>`, доки — автор `OpenCode <opencode-agent[bot]@users.noreply.github.com>` без трейлера. Правила коммитов — в `COMMITS.md` (читать перед каждым коммитом).
- Гейт зелёный: `pnpm run check` 0 ошибок, `pnpm test` 79/79, `pnpm run lint` чисто, `pnpm run build` собирается. Pre-commit хук (simple-git-hooks) прогоняется автоматически на каждом коммите.
- **GitHub Ruleset «Protect main»**: люди — только через PR (1 approval + статус-чек `gate` + signed commits); `<repo-owner>` — bypass на прямой push (проверено эмпирически: пуш проходит, лишь warning «Required status check 'gate' is expected»). ⚠️ Проверить вручную во вкладке Bypass: там должен быть ТОЛЬКО `<repo-owner>`.
- **GitHub Actions** (`acd2798`): гейт `pnpm check/test/lint` на push и pull_request.
- **Push-политика по трекам**: `<repo-owner>` — только локальные коммиты, пуш в `origin` после явного словесного подтверждения; `mtwave` — только свои feature-ветки (подробности — `AGENTS.md`).

## 2. Экскурсия по проекту (для новых участников)

### 2.1. Стек и структура

- PWA Matrix-клиент: **Svelte 5 (Runes), TypeScript strict, Vite, Tailwind CSS**.
- Хранилище и сеть: **Dexie.js 4 (IndexedDB)**, **Matrix JS SDK**, **Vodozemac WASM** (E2EE, Слайс 4).
- Алиасы: `$lib` (`src/lib`), `$components`, `$storage`, `$sync`, `$crypto`, `$stores`, `$types`.
- Документация-источники: `docs/00-PRINCIPLES.md`, `docs/01-ARCHITECTURE.md`, `docs/02-DATA-MODEL.md`, `docs/03-REFERENCE-CODE.md`, `docs/04-ROADMAP.md`.

### 2.2. Команды

- `pnpm run check` — svelte-check + tsc (линт/типы).
- `pnpm test` / `pnpm test:watch` — Vitest (сейчас 68/68).
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
| 2 | `LegacySyncProvider` (реальный `/sync`) | `<repo-owner>` | **выполнен** (`b31d7ea`) |
| 3 | Отправка сообщений (dual-path) | `<repo-owner>` | **следующий** |
| 4 | E2EE Cold Start + re-decryption | `<repo-owner>` | запланирован |
| 5 | История, пагинация, retention, медиа-кэш | свободен (кандидат — `mtwave`, решит сам) | запланирован |
| 6 | Multi-tab + Lazy-sync | свободен (кандидат — `mtwave`, решит сам) | запланирован |
| Дизайн-трек (Д1–Д2) | горизонтальный, не вертикальный слайс | свободен | не начат |

## 3. Общие знания (фактология, хвосты, нюансы)

- **WASM-миф:** ядро `matrix-js-sdk` НЕ тянет vodozemac/WASM; WASM грузится лениво через `initRustCrypto` (Слайс 4). Vite worker-конфиг заранее не нужен — YAGNI до Слайса 4. В prod-сборке Slice 2 `matrix_rust_crypto`/WASM-чанки эмитятся ленивыми ассетами (не скачиваются без `initRustCrypto`) — это ОК, не трогаем. Первый импорт `matrix-js-sdk` — в `src/lib/legacySync.ts` и `src/sync/legacySyncProvider.ts` (Слайс 2).
- **SDK-нюансы v42:** `Room.isDirect` не существует — DM определяется через `m.direct` accountData (`client.getAccountData(EventType.Direct)`, см. `legacySyncProvider.directRoomIds`). Счётчики непрочитанного — через `room.setUnread`/`getUnreadNotificationCount(NotificationCountType.*)`; `room.name` уже содержит SDK-fallback heroes/roomId. Событие `ClientEvent.Sync` отдаёт `ISyncStateData` (`nextSyncToken`), сырых комнат там нет — комнаты берутся из `client.getRooms()` после обработки синка; релевантно состояние `Syncing` (каждый цикл `/sync`).
- **CSP:** в коде нет ни одного `{@html}` — XSS-поверхности сейчас нет. Строгий CSP (01-АРХ §7) — предусловие Слайса 5 (prod-only `<meta>`, не в dev — ломает HMR). До Слайса 5 не трогать.
- **`RoomDto.lastEventText`** осознанно НЕ заполняется (нужен запрос `db.events` по комнате) — со слайсом превью ленты.
- **Хвосты:** `SyncOrchestrator` принимает полный live-timeline комнаты каждый цикл и идемпотентно пишет (DB-PK дедупа). Дубликаты строк в UI предотвращает `batchedStore.pushEvents` (idempotent по `event.id`) — это вынужденная правка прошлого слоя (roadmap §10.2), причина зафиксирована в коммите `b31d7ea`. invite/leave, пагинация вверх, retention — будущие слайсы; `filters.ts` и `IMultiTabService` — Слайс 6; токены только RAM/sessionStorage (модель `AccountModel` запрещает токен в БД) — так задумано.
- **Ручная проверка dev (не автоматизируется):** реальный `/sync` требует accessToken живого аккаунта — прогон против matrix.org делается в браузере вручную (`pnpm dev`, логин с токеном). Unit-покрытие цепи sync→stores есть в `legacySync.test.ts` и `legacySyncProvider.test.ts`.
- **Vitest-готча:** рендер-тесты Svelte требуют `resolve.conditions: ['browser']` в `vite.config.ts` — иначе `mount` из `svelte` резолвится в server-сборку (`lifecycle_function_unavailable`). Не удалять. Дополнительно: SDK `matrix-js-sdk` (ESM с directory-imports, напр. `../http-api`) в Node-резолве падает — обязателен `test.server.deps.inline: [/matrix-js-sdk/]` (Vite резолвит `.ts`/индексные импорты). Не удалять.
- **Репо публичное** — ничего лишнего в файлы/историю (в авторских строках только GitHub noreply, без личных email).

## 4. Трек `<repo-owner>` — следующий шаг: Слайс 3 — отправка сообщений (`docs/04-ROADMAP.md` §6)

Слайс 2 выполнен: `LegacySyncProvider` + адаптеры (`legacySyncProvider.ts`), `startLegacySync` (`legacySync.ts`), интеграция в `LoginScreen`, `batchedStore` идемпотентен по `event.id`; гейт зелёный, коммит `b31d7ea`, обновлён HANDOFF. DoD Слайса 2: осталась только ручная проверка против реального homeserver (нужен живой accessToken) + ревью `code-review` перед PR.

Цель Слайса 3: оптимистичная отправка с dual-path promote (02-DATA §4, §3): `PendingQueueService.create` → `/send` → ответ или эхо `/sync` → `promotePendingToSynced`. UI: поле ввода в `Timeline`; статусы `sending`/`failed` в `EventDto.syncState`; retry (3) + ручной повтор. Базовый dual-path promote в `SyncOrchestrator` уже есть и покрыт тестами — Слайс 3 добирает сетевой `/send` и UI.

TDD-контракт (04 §6.3):
1. `PendingQueueService.create` + эхо `txn_id` → promote, дубликата нет (частично покрыто).
2. Retry: `recordFailure` до лимита → `pending`; после → `failed` с `errorText`.
3. UI-тест: отправленное видно сразу (optimistic), статус → `synced` после эха.

Что уже готово для Слайса 3:
- `LegacySyncProvider` умеет доставлять события (в т.ч. эхо с `txn_id`) из реального `/sync` в `SyncOrchestrator` (благодаря `toSyncRawEvent.txn_id` passthrough).
- `START` точка входа: `startLegacySync` — добавить `/send` вызов (client.sendTextMessage/от клиента) и обработку ответа (promote по `event_id`).

## 5. Трек `mtwave`

Не подключён — активной работы нет. Вход: «я mtwave» (см. `AGENTS.md` «Участники и вход», `HANDOFF-MTWAVE.md`).
