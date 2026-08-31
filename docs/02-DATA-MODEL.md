# 02. Модель данных и хранилище
**Версия:** 2.2-DATA
**Статус:** Основной документ по данным
**Подчиняется:** `00-PRINCIPLES.md`, `01-ARCHITECTURE.md`

Этот документ определяет модель данных, **правила** атомарных операций и политики очистки. Точные TypeScript-интерфейсы и схема Dexie **в коде**: `src/storage/db.ts` (модели `AccountModel`/`RoomModel`/`EventModel`/`PendingEventModel`/`TimelineGapModel`, класс `AppDatabase`). Схема — единственный источник правды, версионируется через `this.version(n)`.

---

## 1. Общие принципы хранения

- Единая статическая схема Dexie для всех аккаунтов. Динамическое создание таблиц под комнаты запрещено.
- Primary Key никогда не мутируется.
- Все критические переходы состояния (особенно pending → synced) — только внутри атомарных транзакций.
- `accessToken` в базе не хранится (Principles §3.2.1); `refreshToken` — в `accounts.refreshToken` (Слайс 4).
- Точная схема таблиц/индексов — в `src/storage/db.ts`, не дублируется здесь.

---

## 2. Таблицы и ключевые поля (концепция)

Полные интерфейсы и индексы — в `src/storage/db.ts`. Назначение и ключи:

| Таблица | PK | Назначение |
|---|---|---|
| `accounts` | `userId` | аккаунт: homeserver, deviceId, isPrimary, lastSyncToken, refreshToken (Слайс 4) |
| `rooms` | `userAndRoomId` = `${userId}:${roomId}` | комната: membership, isDirect, unread/highlight, lastEventTs, name/avatar, lastMessage, dmPartner |
| `events` | `[userId+roomId+eventId]` (составной) | событие: originServerTs, sender, type, content (расшифрованный), txnId?, syncState, isEncrypted, decryptionError? |
| `pendingEvents` | `userAndTxnId` = `${userId}:${txnId}` | оптимистичное сообщение: content, status (pending/sending/failed), createdAt, retryCount, errorText? |
| `timelineGaps` | `gapId` = `${userId}:${roomId}:${eventId}` | маркер разрыва истории для пагинации вверх через `/messages` |

---

## 3. Атомарный promote (pending → synced)

Одна из самых критических операций. Нарушение атомарности или идемпотентности → дубликаты сообщений.

### Обязательные правила
- Promote выполняется **только** внутри `db.transaction('rw', [pendingEvents, events])`.
- Dual-path: ответ `/send` **или** эхо из `/sync` с тем же `txnId`.
- PK `events` — составной `[userId+roomId+eventId]`; ни ключ, ни `eventId` не мутируются.
- Операция идемпотентна.

### Логика
```text
transaction {
  1. Найти запись в pendingEvents по txnId
  2. Если есть — удалить её
  3. put в events с составным PK (сохранить txnId для связи)
  4. Если pending-записи нет — всё равно put (идемпотентность)
}
```

Обычный `put` в `events` для сообщений с `txnId` без promote — запрещён.

> Эталонная реализация: `src/storage/promote.ts` (`promotePendingToSynced`) + тесты `src/storage/db.test.ts`.

---

## 4. PendingQueue и защита от гонок

### Назначение
Гарантирует, что оптимистичное сообщение не продублируется, когда придут и ответ `/send`, и эхо из `/sync`.

### Правила
- При создании оптимистичного сообщения: генерируется `txnId`, запись сразу в `pendingEvents` (status pending/sending), `txnId` регистрируется в in-memory `PendingQueueService`.
- При старте приложения `PendingQueueService` обязан восстановить активные `txnId` из `pendingEvents`.
- При обработке события из `/sync`: если у события есть `txnId` и он в активных — вызывается **только** promote; обычное добавление запрещено.
- Статус `failed` — при окончательной ошибке (после исчерпания retry).

---

## 5. Retention Policy и Media Cache

### Retention событий и ссылочная целостность
- В `events` на комнату хранится не более **300** последних событий (лимит конфигурируемый).
- Очистка — фоново после синка по индексу `[userId+roomId+originServerTs]`.
- **Защита связей (Reply/Thread):** запрещено удалять события, на которые ссылаются свежие (`m.relates_to`, `m.in_reply_to`, `thread_root`). Если родителя всё же вычищаем — перед удалением создать упрощённый stub-DTO-снимок (сохранить отображение цитаты).
- Текстовая история приоритетна над медиа.

### Media Cache
- Все медиа (аватары, изображения, видео, файлы) — только в Cache Storage API.
- Обязательна LRU/FIFO-очистка.
- Запуск очистки: при retention-событиях, при приближении к квоте, при `QuotaExceededError`.
- Криптоданные и текст через Media Cache не удаляются.

---

## 6. Важные ограничения

1. PK `events` — составной `[userId+roomId+eventId]`; никакой мутации ключа/`eventId`.
2. `txnId` генерируется клиентом, уникален.
3. Все операции pending↔synced — только в `db.transaction('rw', ...)`.
4. Чтение истории — через индекс `[userId+roomId+originServerTs]`.
5. Схема версионируется только через `this.version(n)`.
6. При старте: записи `sending` в `pendingEvents` → `pending` с перезапуском таймера; `retryCount` > лимита (3) → `failed` с `errorText` для ручного Retry.
7. `content` в `events` — уже расшифрованный и подготовленный DTO-контент.

---

## 7. Связь с другими документами

- Точные TS-типы и схема Dexie → код `src/storage/db.ts`, `src/types/dto.ts`.
- Правила данных → `00-PRINCIPLES.md`, `01-ARCHITECTURE.md`.
- Эталоны алгоритмов → код + codebase-memory граф.

---

**Конец документа.**
