# 02. Модель данных и хранилище
**Версия:** 2.1-DATA
**Статус:** Основной документ по данным
**Подчиняется:** `00-PRINCIPLES.md`, `01-ARCHITECTURE.md`

Этот документ определяет точную модель данных, схему IndexedDB (Dexie), правила атомарных операций и политики очистки. Реализационный код вынесен в `03-REFERENCE-CODE.md`.

---

## 1. Общие принципы хранения

- Используется **единая статическая схема** Dexie для всех аккаунтов.
- Динамическое создание таблиц под комнаты запрещено.
- Primary Key никогда не мутируется.
- Все критические переходы состояния (особенно pending → synced) выполняются только внутри атомарных транзакций.
- `accessToken` в базе данных не хранится (см. Principles §3.2.1); `refreshToken` — хранится в `accounts.refreshToken` (Слайс 4).

---

## 2. Схема базы данных (Dexie)

### 2.1. Таблицы и ключевые поля

#### `accounts`
- **PK:** `userId`
- Важные поля: `homeserver`, `deviceId`, `isPrimary`, `lastSyncToken`, `refreshToken?`
- `accessToken` **запрещено** хранить в этой таблице (только RAM/sessionStorage, см. Principles §3.2.1); `refreshToken` — разрешено (Principles §3.2.2, Слайс 4 «Авторизация»).
- Пароль никогда не хранится.

#### `rooms`
- **PK:** `userAndRoomId` = `${userId}:${roomId}`
- Важные поля: `userId`, `roomId`, `membership`, `isDirect`, `unreadCount`, `highlightCount`, `lastEventTs`, `name`, `avatarUrl`, `summaryDto`
- Критические индексы: `[userId+membership]`, `[userId+unreadCount]`, `lastEventTs`

#### `events`
- **PK:** `[userId+roomId+eventId]` (составной)
- Важные поля: `userId`, `roomId`, `originServerTs`, `sender`, `type`, `content` (уже расшифрованный), `txnId?`, `syncState`, `isEncrypted`, `decryptionError?`, `prevBatchToken?`, `isGapBlock?`
- Критические индексы:
  - `[userId+roomId+originServerTs]` — основной для истории
  - `[userId+txnId]` — поиск оптимистичных сообщений
  - `[userId+type]`

#### `timelineGaps` (Маркеры разрыва истории)
- **PK:** `gapId` (`${userId}:${roomId}:${eventId}`)
- Важные поля: `userId`, `roomId`, `eventId`, `prevBatchToken`, `createdAt`
- Назначение: фиксация мест разрыва ленты (например, после долговременного оффлайна) для корректной пагинации вверх через серверный `/messages`.

#### `pendingEvents`
- **PK:** `userAndTxnId` = `${userId}:${txnId}` (`txnId` уникален в пределах пользователя)
- Важные поля: `userId`, `roomId`, `content`, `status` (`pending | sending | failed`), `createdAt`, `retryCount`, `errorText?`
- Индексы: `[userId+roomId]`, `status`, `createdAt`

---

## 3. Атомарный promote (pending → synced)

Это одна из самых критических операций. Нарушение атомарности или идемпотентности приводит к дубликатам сообщений.

### Обязательные правила
- Promote выполняется **только** внутри `db.transaction('rw', ...)`.
- Поддерживается dual-path: ответ `/send` **или** эхо из `/sync` с тем же `txnId`.
- Primary Key таблицы `events` — составной `[userId+roomId+eventId]`. Ни ключ целиком, ни компонент `eventId` не мутируется.
- Операция должна быть идемпотентной.

### Логика

```text
transaction {
  1. Пытаемся найти запись в pendingEvents по txnId
  2. Если запись есть — удаляем её
  3. Делаем put в events с составным PK [userId+roomId+eventId] (сохраняем txnId для связи)
  4. Если записи в pendingEvents уже нет — всё равно выполняем put в events (идемпотентность)
}
```

Обычный `put` в `events` для сообщений, у которых есть `txnId`, без прохождения через promote — запрещён.

---

## 4. PendingQueue и защита от гонок

### Назначение
- Гарантирует, что оптимистичное сообщение не продублируется, когда придёт и ответ `/send`, и эхо из `/sync`.

### Правила
- При создании оптимистичного сообщения:
  1. Генерируется `txnId`
  2. Запись сразу пишется в `pendingEvents` со статусом `pending`/`sending`
  3. `txnId` регистрируется в in-memory `PendingQueueService`
- При старте приложения `PendingQueueService` обязан восстановить активные `txnId` из таблицы `pendingEvents`.
- При обработке события из `/sync`:
  - Если у события есть `txnId` и он находится в активных — вызывается **только** promote.
  - Обычное добавление события в этом случае запрещено.
- Статус `failed` выставляется при окончательной ошибке отправки (после исчерпания retry).

---

## 5. Retention Policy и Media Cache

### Retention событий и ссылочная целостность
В таблице `events` для каждой комнаты хранится не более **300** последних событий (лимит может быть конфигурационным).
Очистка выполняется фоново после синка по индексу `[userId+roomId+originServerTs]`.
**Защита связей (Reply/Thread):** запрещено удалять события, если на них ссылаются существующие в базе свежие события (`m.relates_to`, `m.in_reply_to`, `thread_root`). Если родительское событие всё же вычищается, перед удалением создаётся упрощённый контекстный DTO-снимок (stub) для сохранения отображения цитаты в UI.
Текстовая история имеет приоритет над медиа.

### Media Cache
- Все медиа (аватары, изображения, видео, файлы) хранятся только в Cache Storage API.
- Обязательна LRU/FIFO-очистка.
- Очистка медиа запускается:
  - при срабатывании retention событий
  - при приближении к квоте хранилища
  - при `QuotaExceededError`
- Криптографические данные и текстовые сообщения через Media Cache не удаляются.

---

## 6. Важные ограничения

1. Primary Key таблицы `events` — составной `[userId+roomId+eventId]`. Никакой мутации ключа или компонента `eventId`.
2. `txnId` генерируется клиентом и должен быть уникальным.
3. Все операции, меняющие связь pending ↔ synced, только внутри `db.transaction('rw', ...)`.
4. Чтение истории комнаты всегда идёт через индекс `[userId+roomId+originServerTs]`.
5. Схема версионируется только через `this.version(n).stores(...)`.
6. При старте приложения все записи со статусом `sending` в `pendingEvents` должны переводиться в статус `pending` с перезапуском таймера отправки. Если `retryCount` превышает лимит (например, 3 попытки), статус переводится в `failed` с сохранением `errorText` для ручной повторной отправки пользователем.
7. `content` в таблице `events` хранится уже в расшифрованном и подготовленном к UI виде (DTO-уровень).

---

## 7. Связь с другими документами

- Точные TypeScript-интерфейсы и эталонная реализация схемы + promote → `03-REFERENCE-CODE.md`
- Высокоуровневые правила → `00-PRINCIPLES.md` и `01-ARCHITECTURE.md`

---

**Конец документа.**
