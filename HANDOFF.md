# Handoff — matrix-pwa (Svelte 5 Matrix-клиент)

> Общее состояние проекта + трек `<repo-owner>`. Трек `mtwave` — в `HANDOFF-MTWAVE.md`.
> Порядок входа: `AGENTS.md` → определить участника (ник назван? → `HANDOFF-<ник>.md`) → общее состояние в §1–3.

## 1. Общее состояние репозитория

- Репо: `/Users/macos/Documents/OpenCode/matrix-pwa`. Ветка `main`, запушена в `origin` (`github.com/<repo-owner>/matrix-pwa`, **публичный**). HEAD: `6ff324c`. История переписана и подписана (SSH, GitHub: Verified): **31 коммит** — код — автор `<repo-owner>` + ровно один трейлер `Co-authored-by: OpenCode <opencode-agent[bot]@users.noreply.github.com>`, доки — автор `OpenCode <opencode-agent[bot]@users.noreply.github.com>` без трейлера. Правила коммитов — в `COMMITS.md` (читать перед каждым коммитом).
- Гейт зелёный: `pnpm run check` 0 ошибок, `pnpm test` 68/68, `pnpm run lint` чисто. Pre-commit хук (simple-git-hooks) прогоняется автоматически на каждом коммите.
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
| 2 | `LegacySyncProvider` (реальный `/sync`) | `<repo-owner>` | **следующий** |
| 3 | Отправка сообщений (dual-path) | `<repo-owner>` | запланирован |
| 4 | E2EE Cold Start + re-decryption | `<repo-owner>` | запланирован |
| 5 | История, пагинация, retention, медиа-кэш | свободен (кандидат — `mtwave`, решит сам) | запланирован |
| 6 | Multi-tab + Lazy-sync | свободен (кандидат — `mtwave`, решит сам) | запланирован |
| Дизайн-трек (Д1–Д2) | горизонтальный, не вертикальный слайс | свободен | не начат |

## 3. Общие знания (фактология, хвосты, нюансы)

- **WASM-миф:** ядро `matrix-js-sdk` НЕ тянет vodozemac/WASM; WASM грузится лениво через `initRustCrypto` (Слайс 4). Vite worker-конфиг заранее не нужен — YAGNI до Слайса 4. Реальная забота Слайса 2 — первый импорт SDK в happy-dom (shim/`vi.mock` при необходимости).
- **CSP:** в коде нет ни одного `{@html}` — XSS-поверхности сейчас нет. Строгий CSP (01-АРХ §7) — предусловие Слайса 5 (prod-only `<meta>`, не в dev — ломает HMR). До Слайса 5 не трогать.
- **`RoomDto.lastEventText`** осознанно НЕ заполняется (нужен запрос `db.events` по комнате) — со слайсом превью ленты.
- **Хвосты:** в домене только `join`-комнаты (invite/leave, пагинация вверх, retention — будущие слайсы); `filters.ts` и `IMultiTabService` — Слайс 6; токены только RAM/sessionStorage (модель `AccountModel` запрещает токен в БД) — так задумано.
- **Vitest-готча:** рендер-тесты Svelte требуют `resolve.conditions: ['browser']` в `vite.config.ts` — иначе `mount` из `svelte` резолвится в server-сборку (`lifecycle_function_unavailable`). Не удалять.
- **Репо публичное** — ничего лишнего в файлы/историю (в авторских строках только GitHub noreply, без личных email).
- `matrix-js-sdk` установлен, но в `src/` ещё не импортируется (первый импорт — Слайс 2).

## 4. Трек `<repo-owner>` — следующий шаг: Слайс 2 `LegacySyncProvider` (`docs/04-ROADMAP.md` §5)

Цель: заменить мок на реальный `/sync` через `matrix-js-sdk` без изменений в домене (контракт `ISyncProvider`, 01-АРХ §5).

TDD-контракт:
1. Адаптер `MatrixRoom → SyncJoinedRoom`: имя из `m.room.name`, иначе из heroes/fallback; `unread_notifications` → счётчики.
2. `MatrixEvent → SyncRawEvent`: `txn_id` пробрасывается (для dual-path), `content` — сырой JSON.
3. Провайдер собирает `next_batch` из sync-ответа.
4. `SyncOrchestrator`: `m.room.encrypted` → `isEncrypted: true` (уже реализовано и покрыто тестом — не трогать).

Что уже готово:
- `ISyncProvider`/`SyncRawEvent`/`SyncJoinedRoom`/`SyncResponse` — контракт провайдера, мок реализует его полностью.
- `LoginScreen` принимает homeserver/userId/deviceId/accessToken → `AccountManager` (RAM/sessionStorage); токен из `AccountManager.getAccessToken` — источник для `createClient`.
- `startDemoSync` в `src/lib/demoSync.ts` — точка замены: станет `startLegacySync` (реальный клиент).
- Vitest умеет рендерить Svelte (`resolve.conditions: ['browser']`).

DoD: dev против реального homeserver (matrix.org), комнаты и события доезжают до UI; `ISyncProvider` не менялся; гейт зелёный; **локальный коммит; пуш — только после словесного подтверждения**; обновить HANDOFF.

## 5. Трек `mtwave`

Не подключён — активной работы нет. Вход: «я mtwave» (см. `AGENTS.md` «Участники и вход», `HANDOFF-MTWAVE.md`).
