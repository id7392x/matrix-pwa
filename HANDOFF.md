# Handoff — Matrix PWA (Svelte 5)

## Context

PWA Matrix-клиент на Svelte 5 (Runes), TS `strict`, Dexie.js 4, Vitest. Разработка ведётся по Roadmap v2.0 вертикальными слайсами `Crypto/Sync → IndexedDB → Runes-сторы → UI`. Все guardrails и требования — в `AGENTS.md` и `docs/` (`00-PRINCIPLES.md`, `01-ARCHITECTURE.md`, `02-DATA-MODEL.md`, `03-REFERENCE-CODE.md`).

## Репозиторий

- Рабочая директория: `/Users/macos/Documents/OpenCode/matrix-pwa`
- Рабочее дерево: есть незакоммиченные изменения доменного слоя (см. ниже), коммит не делался.
- HEAD до слайса: `1b48ac8`.

## Что сделано и закоммичено

| Коммит | Что |
|---|---|
| `2553b8e`, `c582197`, `1d3e4fe` | Stage 0: TS strict, алиасы `$lib/$storage/...`, Vitest, Tailwind glassmorphism, AGENTS.md guardrails |
| `d386b44` | Первый Dexie 4 schema + Web Locks wrapper (`src/storage/webLock.ts`) + первый room store |
| `1b48ac8` | Multi-account schema на составных ключах + `promotePendingToSynced` + миграция roomStore под новую модель |
| `e5be178` | HANDOFF.md + путь в AGENTS.md на `docs/` |

## Текущий слайс (не закоммичен) — Доменный слой синхронизации

Зависимость: добавлен `matrix-js-sdk` 42.1.0 (используется с E2EE-слайсом, см. ниже).

Новые файлы:

- `src/types/dto.ts` — `EventDto`, `RoomDto` (контракт 03-REFERENCE-CODE §3). `RoomDto` задействован: `roomStore` отдаёт UI только DTO (маппер `toRoomDto`, без `userId`/`userAndRoomId`/`membership`/`summaryDto`; `lastEventText` пока не заполняется).
- `src/stores/batchedStore.svelte.ts` — `BatchedStoreManager`: `pushEvents`/`flushToUI`, батч через rAF (активная вкладка) или `setTimeout(0)` (фон); `$state`-события для UI. Планировщик инжектится в конструктор (тесты).
- `src/sync/ISyncProvider.ts` — `ISyncProvider` (`start`/`stop`/`onSync`), сырые типы `SyncResponse`/`SyncRawEvent`/`SyncJoinedRoom` (JSON-форма, близкая к `/sync`). Замена на `LegacySyncProvider` не трогает домен (01-АРХ §5).
- `src/sync/mockSyncProvider.ts` — мок, отдаёт фикстуры последовательно на `start()`.
- `src/sync/PendingQueueService.ts` — оптимистичные сообщения: `create` (txnId → `pendingEvents` + active-set), `restore` при старте (sending→pending, retry>=3→failed), `isActive`, `promote` (атомарный dual-path через `promotePendingToSynced`), `recordFailure` (инкремент retry, fail на лимите 3).
- `src/sync/SyncOrchestrator.ts` — единственное место raw→DTO: комнаты → `RoomModel`, события → `EventModel`; эхо с активным `txnId` → только promote; DTO пушит в `BatchedStoreManager`.
- `src/lib/accountManager.ts` — `AccountManager` (§4.1): upsert аккаунтов, `getActiveAccount`, `switchAccount` (флип `isPrimary`), токен только в sessionStorage (ключ `mx_token:${userId}`, не в IndexedDB).

Тесты: `batchedStore.svelte.test.ts` (5), `PendingQueueService.test.ts` (5), `SyncOrchestrator.test.ts` (4), `accountManager.test.ts` (5), `roomStore.test.ts` (7, включая `toRoomDto`).

### Состояние проверок (гейт соблюдён)

`pnpm run check` — 0 errors, `pnpm test` — 50/50, `pnpm run lint` — clean.

## Известные хвосты (deferred)

- `promotePendingToSynced` принимает `Partial<EventModel>` без runtime-валидации обязательных полей.
- В этом слайсе только `join`-комнаты; invite/leave, пагинация вверх (`timelineGaps`), retention — не реализованы.
- `BatchedStoreManager` держит только события (`EventDto[]`); комнаты обновляются через `liveQuery` в `roomStore` и попадают в UI как `RoomDto` (DTO-граница закрыта). `messageStore`-обёртки нет и не нужно — `batchedStore.events` уже реактивен.
- `RoomDto.lastEventText` не выводится (требует чтения `db.events` на комнату) — добавить с UI-превью.
- `filters.ts` (lazy-фильтр) и `IMultiTabService` (handshake/ACK) — не реализованы.

## Вероятные следующие шаги

Подробная дорожная карта и ТЗ слайсов — в `docs/04-ROADMAP.md`. Кратко: следующий слайс — **UI на моках** (логин, комнаты, лента поверх `roomStore` + `batchedStore.events`), далее `LegacySyncProvider`, отправка сообщений, E2EE, multi-tab.

1. **UI-слайс**: экраны на Svelte 5 Runes поверх `roomStore` + `batchedStore.events`: список комнат, лента сообщений, логин через `AccountManager` + `MockSyncProvider`.
2. **LegacySyncProvider**: подключение реального `/sync` через `matrix-js-sdk` (адаптер сырых событий SDK → `SyncResponse`-совместимые типы), вызов `SyncOrchestrator.handleSync`.
3. **E2EE**: Cold Start Protocol (`createClient → initRustCrypto({storePrefix}) → startClient`), re-decryption, UTD-модель. `matrix-js-sdk` уже в зависимостях.
4. **Отправка сообщений**: `PendingQueueService.create` + реальный `/send` → `recordFailure`/`promote` по ответу.

## Suggested skills

Загрузить через инструмент `skill` при начале соответствующей работы:

- `handoff` — если текущая сессия завершается и нужен следующий handoff.
- `detect-stack` — если окружение/стейк не совпадает с описанием выше.
- `code-review` — ревью изменений слайса относительно `main` до коммита.
- `diagnosing-bugs` — если падают тесты/чек/линт.
- `boy-scout-rule` — при правках затронутого кода (blast radius слайса).
- `git-commit` — для финального коммита слайса (гейт: check + test + lint зелёные).

## Чувствительные данные

В проекте и документе нет ключей/паролей/реальной PII — только плейсхолдеры (`@alice:example.org`, `example.org`). Не коммитить реальные `accessToken` (запрещено `AGENTS.md` и `02-DATA-MODEL.md`).
