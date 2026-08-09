# Handoff — Matrix PWA (Svelte 5)

## Context

PWA Matrix-клиент на Svelte 5 (Runes), TS `strict`, Dexie.js 4, Vitest. Разработка ведётся по Roadmap v2.0 вертикальными слайсами `Crypto/Sync → IndexedDB → Runes-сторы → UI`. Все guardrails и требования — в `AGENTS.md` (прочитать первым).

## Репозиторий

- Рабочая директория: `/Users/macos/Documents/OpenCode/matrix-pwa`
- Рабочее дерево чистое, всё закоммичено. HEAD = `1b48ac8`.
- Требования/решения: `00-PRINCIPLES.md`, `01-ARCHITECTURE.md`, `02-DATA-MODEL.md`, `03-REFERENCE-CODE.md` (не дублируются здесь — см. эти файлы).

## Что сделано и закоммичено

| Коммит | Что |
|---|---|
| `2553b8e`, `c582197`, `1d3e4fe` | Stage 0: TS strict, алиасы `$lib/$storage/...`, Vitest, Tailwind glassmorphism, AGENTS.md guardrails |
| `d386b44` | Первый Dexie 4 schema + Web Locks wrapper (`src/storage/webLock.ts`) + первый room store |
| `1b48ac8` (HEAD) | Multi-account schema на составных ключах + `promotePendingToSynced` + миграция roomStore под новую модель |

### Детали HEAD-слайса (`1b48ac8`)

- `src/storage/db.ts` — модели с составными PK: `RoomModel.userAndRoomId`, `EventModel[userId+roomId+eventId]`, `PendingEventModel.userAndTxnId`, `TimelineGapModel.gapId`. `accessToken` намеренно отсутствует в `AccountModel` (только RAM/sessionStorage). Схема `version(1)`, индексы см. в файле.
- `src/storage/promote.ts` — `promotePendingToSynced(userId, roomId, txnId, eventId, syncedData)`: атомарно удаляет запись из `pendingEvents` и идемпотентно кладёт `EventModel` в `events` (внутри `db.transaction('rw', ...)`).
- `src/storage/db.test.ts` — полный контракт схемы (все таблицы, составные индексы, promote-семантика).
- `src/stores/roomStore.svelte.ts` (+ `roomStore.test.ts`) — мигрирован с `RoomRecord` на `RoomModel`; `sortedRooms` по `lastEventTs` desc, `updateUnread(userAndRoomId, count)`.
- `03-REFERENCE-CODE.md` — обновлён блок схемы БД.

### Текущее состояние проверок

Все зелёные (гейт коммита соблюдён): `pnpm run check` (0 errors), `pnpm test` (29/29), `pnpm run lint` (clean).

## Известные хвосты (deferred)

- `promotePendingToSynced` принимает `syncedData: Partial<EventModel>` с приведением `as EventModel` — нет runtime-валидации обязательных полей. Решится, когда появится реальный Sync-слой (matrix-js-sdk).
- Единая DB `MatrixClientDB` без версионирования на будущее — `version(2)` появятся при добавлении E2EE-полей.

## Вероятные следующие шаги (см. `01-ARCHITECTURE.md` / `02-DATA-MODEL.md`)

1. **Crypto/Sync слой**: подключение `matrix-js-sdk` + Vodozemac WASM, реальные `RoomModel`/`EventModel` из sync-ответов, вызов `promotePendingToSynced` из конвеера.
2. **Хранение токенов**: решить, где живёт `accessToken` (sessionStorage/RAM) — модель уже запрещает его в IndexedDB.
3. **UI-слайс**: экраны на Svelte 5 Runes поверх существующих сторов.

## Suggested skills

Загрузить через инструмент `skill` при начале соответствующей работы:

- `handoff` — если текущая сессия завершается и нужен следующий handoff.
- `detect-stack` — если окружение/стейк не совпадает с описанием выше (проверка фактов перед работой).
- `code-review` — для ревью изменений нового слайса относительно `main` до коммита.
- `diagnosing-bugs` — если падают тесты/чек/линт (диагностика вместо слепых правок).
- `boy-scout-rule` — при любом правке затронутого кода (AGENTS.md требует не выходить за blast radius слайса).
- `git-commit` — для финального коммита слайса (соблюдение гейта: check + test + lint зелёные).

## Чувствительные данные

В проекте и документе нет ключей/паролей/реальной PII — только плейсхолдеры (`@alice:example.org`, `example.org`). Не коммитить реальные `accessToken` (запрещено `AGENTS.md` и `02-DATA-MODEL.md`).
