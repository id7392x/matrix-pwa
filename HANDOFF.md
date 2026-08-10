# Handoff — matrix-pwa (Svelte 5 Matrix-клиент)

> Для свежего агента. Полные требования и решения — в `AGENTS.md` и `docs/00–04`; этот документ описывает только состояние, нюансы и следующие шаги, которых нет в артефактах.

## Состояние репозитория

- Репо: `/Users/macos/Documents/OpenCode/matrix-pwa`. Ветка `main`, запушена в `origin` (`github.com/<repo-owner>/matrix-pwa`, **публичный**). HEAD: `6ff324c`. История переписана и подписана (SSH, GitHub: Verified): **31 коммит** — код — автор `<repo-owner>` + ровно один трейлер `Co-authored-by: OpenCode <opencode-agent[bot]@users.noreply.github.com>`, доки — автор `OpenCode <opencode-agent[bot]@users.noreply.github.com>` без трейлера. Правила коммитов — в `COMMITS.md` (обязателен к прочтению перед каждым коммитом).
- Гейт зелёный: `pnpm run check` 0 ошибок, `pnpm test` 68/68, `pnpm run lint` чисто. Pre-commit хук (simple-git-hooks) прогоняется автоматически на каждом коммите.
- **GitHub Ruleset «Protect main»**: люди — только через PR (1 approval + статус-чек `gate` + signed commits); `<repo-owner>` — bypass на прямой push (проверено эмпирически: прямой пуш агента проходит, лишь warning «Required status check 'gate' is expected»). ⚠️ Проверить вручную во вкладке Bypass: там должен быть ТОЛЬКО `<repo-owner>`, не «Everyone/All members».
- **GitHub Actions** (`acd2798`): гейт `pnpm check/test/lint` на push и pull_request.
- **Push-политика агента: только локальные коммиты.** Пуш в `origin` — исключительно после явного словесного подтверждения пользователя («пушь», «да»). Наличие bypass прав не отменяет это процессное правило.

## Что было сделано (детали — в коммитах)

1. **Слайс 1 «UI на моках»** (`57ddc4c`). Сквозной путь до UI поверх доменного слоя: `uiStore` (hash-навигация), `LoginScreen`, `RoomList`/`RoomListItem`, `Timeline`/`TimelineItem`, `App.svelte`, `startDemoSync`. Критичная Vitest-готча — `resolve.conditions: ['browser']` в `vite.config.ts` (см. «Нюансы»).
2. **Хардненинг безопасности** (`8991f36`, `502ff63`, `ee538d6`, `5050bcf`):
   - `promotePendingToSynced` — runtime-валидация обязательных полей (`originServerTs`, `sender`, `type`, `content`, `isEncrypted`): некорректные данные из сети отклоняются `TypeError` ДО транзакции, pendingEvents не трогаются.
   - `uiStore` — `decodeURIComponent` под try/catch: кривой hash (`#/room/%zz`) не роняет приложение.
   - `demoSync` — `.catch` на `provider.start()`.
   - **`SyncOrchestrator` — `isEncrypted = raw.type === 'm.room.encrypted'`** (закрывает баг до первого реального синка; ТЗ Слайса 2, уже реализовано и покрыто тестом — не трогать).
   - `docs/03`: `payload: any` → `unknown`, валидация promote, запрет `{@html}` без санитизации `formattedBody`.
   - `docs/04` (roadmap): счётчик 68/68; Слайсы 2 (isEncrypted + конверт), 4 (content-семантика), 5 (DOMPurify + CSP) уточнены.
3. **Мета/CI/онбординг** (`acd2798`, `422ea17`, `9311268`, `920a4cb`, `6ff324c`):
   - GitHub Actions гейт на push и PR; `CONTRIBUTING.md` + `.env.example` — онбординг разработчика.
   - Git-identity: обе роли используют GitHub noreply-email (PII-политика, `920a4cb`).
   - Ruleset «Protect main» + bypass только для `<repo-owner>`; `COMMITS.md` — таблица авторства для третьего автора и PR-workflow.

## Следующий шаг — Слайс 2 `LegacySyncProvider` (`docs/04-ROADMAP.md` §5)

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

DoD: dev против реального homeserver (matrix.org), комнаты и события доезжают до UI; `ISyncProvider` не менялся; гейт зелёный; **локальный коммит; пуш — только после словесного подтверждения пользователя**; обновить HANDOFF.

## Фактология (накопленная)

- **WASM-миф:** ядро `matrix-js-sdk` НЕ тянет vodozemac/WASM; WASM грузится лениво через `initRustCrypto` (Слайс 4). Vite worker-конфиг заранее не нужен — YAGNI до Слайса 4. Реальная забота Слайса 2 — первый импорт SDK в happy-dom (shim/`vi.mock` при необходимости).
- **CSP:** в коде нет ни одного `{@html}` — XSS-поверхности сейчас нет. Внедрение строгого CSP (01-АРХ §7) — предусловие Слайса 5 (prod-only `<meta>`, не статический в dev — ломает HMR). До Слайса 5 не трогать.
- **`RoomDto.lastEventText`** осознанно НЕ заполняется (нужен запрос `db.events` по комнате) — отложено до слайса с превью ленты.

## Известные хвосты (deferred)

- В домене только `join`-комнаты; invite/leave, пагинация вверх (`timelineGaps`), retention — не реализованы (будущие слайсы).
- `filters.ts` (lazy-фильтр) и `IMultiTabService` (handshake/ACK) — не реализованы (Слайс 6).
- `RoomDto.lastEventText` не заполняется в `toRoomDto` — нужен запрос `db.events` по комнате; заполнить вместе с UI-превью ленты.
- Токены: только RAM/sessionStorage (модель `AccountModel` прямо запрещает хранение токена в БД) — так и задумано, не менять.

## Нюансы проекта

- **Репо публичное** — всё содержимое (в т.ч. `HANDOFF.md`, `AGENTS.md`, `COMMITS.md`, история коммитов) видимо любому. Не включать ничего, чего не должно быть публичным.
- **Push-политика:** коммить можно свободно (локально), но **пуш — только после явного словесного «да»** от пользователя. Не пушить «по умолчанию» в конце сессии.
- `matrix-js-sdk` установлен, но в `src/` **ещё не импортируется** (первый импорт случится на Слайсе 2).
- **Vitest-готча:** рендер-тесты Svelte требуют `resolve.conditions: ['browser']` в `vite.config.ts` — иначе `mount` из `svelte` резолвится в server-сборку (`lifecycle_function_unavailable`). Не удалять.
- Инварианты: `any` запрещён, IndexedDB только через Dexie, SDK-объекты не проходят в UI (DTO-граница `docs/01` §6), accessToken только RAM/sessionStorage.
- Хранилище тестов: `fake-indexeddb`, среда `happy-dom`.
- Полезные команды: `pnpm run check`, `pnpm test`, `pnpm run lint`, `pnpm dev`.

## Suggested skills

Следующей сессии (Слайс 2, первый импорт SDK и сетевой код):

- `git-commit` — атомарные локальные коммиты; помнить про автоматический pre-commit гейт, правила авторства в `COMMITS.md` и **запрет на push без подтверждения**.
- `code-review` — по окончании слайса прогнать ревью изменений (стандарты + соответствие `docs/04` §5).
- `ponytail` — проект держит ленивый минимальный стиль; перед новыми зависимостями перепроверять необходимость.
- `boy-scout-rule` — при касании существующих файлов домена/сторов.

## Redacted

Локальные пути за пределами репозитория не включены. Секретов (ключи, токены, пароли, accessToken) в сессии не было. GitHub noreply-адреса в авторстве коммитов — по решению `COMMITS.md` намеренно публичны; настоящих личных email в репозитории нет.
