# Handoff — matrix-pwa (Svelte 5 Matrix-клиент)

> Общее состояние проекта + трек `<repo-owner>`. Треки контрибьюторов — в `HANDOFF-<ник>.md`.
> Порядок входа: `AGENTS.md` → определить участника (ник назван? → `HANDOFF-<ник>.md`) → общее состояние в §1–3.

## 1. Общее состояние репозитория

- Репо: `/Users/macos/Documents/OpenCode/matrix-pwa`. Ветка `main`, **HEAD: `683dceb`**, **в `origin` запушено юзером**: `1c776b8` (roadmap), `282dfa1` (LICENSE AGPL-3.0), `a7b838e` (README EN). ⚠️ **15 коммитов впереди `origin` (локальные, пуш по явному подтверждению):** verify-UI `acf5106`, `fd68626`; e2ee-фикс `05a12fe`; доки `db99e57`, `6d2c47c`, `a61c4c1`, `493f3aa`, `356e845`, `8a9621b`; UI-пуш `380f576`–`683dceb` (см. ниже). Все коммиты подписаны SSH (GitHub: Verified). История переписана: `id7392x` вычищен из .md файлов, author/committer fields сохранены. Правила коммитов — в `COMMITS.md` (читать перед каждым коммитом).
- Гейт зелёный: `pnpm run check` 0 ошибок, `pnpm test` **302/302** (21 файл), `pnpm run lint` чисто. Pre-commit хук (simple-git-hooks) прогоняется автоматически на каждом коммите.
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
| 5 | E2EE Cold Start + re-decryption | `<repo-owner>` | **выполнен** (локально; см. §5) |
| 6 | История, пагинация, retention, медиа-кэш | свободен | **следующий** |
| 7 | Multi-tab + Lazy-sync | свободен | запланирован |
| Дизайн-трек (Д1–Д2) | горизонтальный, не вертикальный слайс | свободен | **ревью выполнено** (см. `docs/DESIGN.md`); **UI-пуш идёт** по `DESIGN.md` §8: токены (380f576) → Вход (66da661) → **главный экран** (`c5b8f54`+`ccc4f14`: аватары, превью, нижняя панель) → **интерактив** (`683dceb`: верификация сессии, press-фидбек, резиновые чипы, навбар 48px) → дальше переписка |

## 3. Общие знания (фактология, хвосты, нюансы)

- **WASM-миф:** ядро `matrix-js-sdk` НЕ тянет vodozemac/WASM; WASM грузится лениво через `initRustCrypto` (Слайс 5). Vite worker-конфиг заранее не нужен — YAGNI до Слайса 5. В prod-сборке `matrix_rust_crypto`/WASM-чанки эмитятся ленивыми ассетами (не скачиваются без `initRustCrypto`) — это ОК, не трогаем. Первый импорт `matrix-js-sdk` — в `src/lib/legacySync.ts` и `src/sync/legacySyncProvider.ts`.
- **SDK-нюансы v42:** `Room.isDirect` не существует — DM определяется через `m.direct` accountData (`client.getAccountData(EventType.Direct)`, см. `legacySyncProvider.directRoomIds`). Счётчики непрочитанного — через `room.setUnread`/`getUnreadNotificationCount(NotificationCountType.*)`; `room.name` уже содержит SDK-fallback heroes/roomId. Событие `ClientEvent.Sync` отдаёт `ISyncStateData` (`nextSyncToken`), сырых комнат там нет — комнаты берутся из `client.getRooms()` после обработки синка; релевантно состояние `Syncing` (каждый цикл `/sync`).
- **Эхо отправки:** канонический канал эха по спеке — `event.getUnsigned().transaction_id` (`event.getTxnId()` — только локальный фолбэк). Маппится в `legacySyncProvider.toSyncRawEvent` как `txn_id: event.getTxnId() ?? event.getUnsigned().transaction_id`; `SyncOrchestrator.upsertEvent` читает оба пути (`raw.unsigned?.transaction_id ?? raw.txn_id`).
- **Optimistic UI (Слайс 3):** `PendingQueueService.sendMessage` пушит в `batchedStore` optimistic DTO (`local-<txnId>`, `syncState:'sending'`) до сети; после `/send` флипается в `synced` сразу (C12), эхо из `/sync` с тем же `txnId` идемпотентно заменяет его. Ретраи: `retry()` разрешён при `retryCount > 0` (гейт `status !== 'failed'` был багом — отсекал `pending`-строки, исправлено). При дефолтном лимите 3 первый сбой → `pending` (count 1), UI показывает `failed` + кнопку Retry — это самосогласованно, расхождение UI↔DB статусов зафиксировано как техдолг.
- **Promote (C4):** `SyncOrchestrator.upsertEvent` выполняет promote по `txnId` всегда (без проверки активности очереди) — stale/восстановленная pending-строка не осиротит; `promotePendingToSynced` идемпотентен и делает put в `events`, даже если pending-записи уже нет.
- **CSP:** в коде нет ни одного `{@html}` — XSS-поверхности сейчас нет. `formatted_body` хранится в DTO/БД как есть и НЕ рендерится — санитизация (DOMPurify) и строгий CSP (01-АРХ §7) — обязательное предусловие Слайса 6 (перед первым `{@html}`); до этого не трогать.
- **DM-партнёр (verify UX):** НЕ выводить из событий таймлайна и НЕ из `isDirect` (`m.direct` в паттерне приложения ненадёжен) — только из `Room.getJoinedMembers()` (единственный чужой join). В unit-тестах `RoomState.setStateEvents` пропускает событие без `room_id` (`event.getRoomId() !== this.roomId`) — в member-фикстурах обязательно `room_id`. `requestVerificationDM` бросает `unknown userId` для аккаунтов без E2EE-ключей — обёрнуто в cancelled во всех входах `verification.ts`.
- **Токены (Слайс 4):** `accessToken` — только RAM/sessionStorage (`mx_token:<userId>`, ключ — в `accountManager`), в БД запрещено (Principles §3.2.1). **`refreshToken` — реализован** в `accounts.refreshToken` (Principles §3.2.1.1). Пароль не хранится никогда. **OIDC SSO реализован** — matrix.org использует делегированный OIDC (MSC3824/MSC3861), авторизация через `/authorize` + PKCE + динамическая регистрация клиентов. `application_type: "native"` для http:// origins (RFC 8252 §7.3). Хранилище OAuth2-клиентов в `oauthClients`. Токены не попадают в IndexedDB — только в sessionStorage.
- **Хвосты:** `SyncOrchestrator` принимает полный live-timeline комнаты каждый цикл и идемпотентно пишет (DB-PK дедупа). Дубликаты строк в UI предотвращает `batchedStore.pushEvents` (upsert-by-id) + `replaceByTxnId`. invite/leave, пагинация вверх, retention — будущие слайсы; `filters.ts` и `IMultiTabService` — Слайс 7; `activeQueues` (модульный глобал `getActiveQueue().at(-1)`) — рабочий для одного аккаунта, мульти-аккаунт (keyed by userId + unregister на stop) — техдолг слайса 7.
- **Техдолг после Слайса 3 (P1, из аудита):** `startLegacySync` НЕ вызывал `pendingQueue.restore()` — после релоада pending-строки не всплывали, а позднее эхо оставляло сирот в `pendingEvents`. **Решено в ревью-батче (C2/C7):** `restore()` вызывается в `startLegacySync` и переотправляет pending; GC чистит доставленные сироты (txnId неактивен + событие есть в `events`) с фильтром по `userId`.
- **Ручная проверка dev (не автоматизируется):** реальный `/sync` требует accessToken живого аккаунта — прогон против matrix.org делается в браузере вручную (`pnpm dev`, логин с токеном). Unit-покрытие цепи sync→stores есть в `legacySync.test.ts`, `legacySyncProvider.test.ts`, `SyncOrchestrator.test.ts`, `PendingQueueService.test.ts`.
- **Vitest-готча:** рендер-тесты Svelte требуют `resolve.conditions: ['browser']` в `vite.config.ts` — иначе `mount` из `svelte` резолвится в server-сборку (`lifecycle_function_unavailable`). Не удалять. Дополнительно: SDK `matrix-js-sdk` (ESM с directory-imports, напр. `../http-api`) в Node-резолве падает — обязателен `test.server.deps.inline: [/matrix-js-sdk/]` (Vite резолвит `.ts`/индексные импорты). Не удалять.
- **Репо публичное** — ничего лишнего в файлы/историю (в авторских строках только GitHub noreply, без личных email).
- **Reference-клон element-web:** `/Users/macos/Documents/OpenCode/element-web` (`--depth 1`, 118 МБ, вне workspace — вложенного репо нет). Визуальный таргет UI — **Telegram** (макеты: stitch-проект `projects/7820572232356862504`, DS «Ether UI» `assets/159a4d5e…`, dark #111/#007aff; 6 валидных экранов — см. `docs/06-TOOLS.md` §6.2; удалять экраны нельзя), а НЕ Element. element-web — только для Matrix-специфичных UX-флоу (verify/SAS, QR, UTD/recovery, key backup) и имён семантических токенов (`$accent`→`--accent-*`), шпаргалка путей — `docs/06-TOOLS.md` §3; React-код не переносится (ломает слои, `01-АРХ §1`). Правила — `docs/06-TOOLS.md`.

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

## 5. Трек `<repo-owner>` — следующий шаг: Слайс 6 — история, пагинация, retention, медиа (`docs/04-ROADMAP.md` §9)

**Выполнено (сводка):** слайсы 1–5, ревью-батч (`2dd3072`–`409ea1d`), sync race fix (`ea53bf3`), e2ee echo dedup (`2ce4902`), OIDC SSO (`a8987b8`–`275b946`), Слайс 5 (5.1a–d) + UTD-backup фиксы, UI-пуш (см. ниже) — **запушены только слайсы 1–5 и ревью-батч**; локально ждут пуша verify-UI (`acf5106`, `fd68626`), доки и UI-пуш 380f576–683dceb.

**UI-пуш по `DESIGN.md` §8 (2026-08-31, локально, ждёт пуша):**
- `380f576` — токены Ether UI в `app.css` (@theme #111/#007aff/Inter, `.glass-panel` blur16+0.5px);
- `66da661` — `LoginScreen` по макету «Вход» (glass-карта, toggle пароля, CTA 56px, role=alert; тесты на toggle);
- `c5b8f54` — **data**: `SyncJoinedRoom` += `avatarUrl`+`lastMessage`; `toSyncJoinedRoom(room, isDirect, baseUrl)` — комнатная thumbnail `getAvatarUrl(baseUrl,112,112,'crop',false)`, для DM фолбэк на аватар партнёра (`room.getMember(dmPartner)?.getAvatarUrl(...)`); `lastMessage` = реверс-скан live-timeline (m.room.message body; `m.room.encrypted`→`'Encrypted message'`); персист в `SyncOrchestrator.upsertRoom`, `RoomModel.lastMessage`, `RoomDto.lastMessage`. SDK-нюанс: `Room.getAvatarUrl` НЕ фолбэчится на аватар члена — фолбэк явный;
- `ccc4f14` — **главный экран по макету** `41230df5`: превью последнего сообщения под именем (`previewText` в `format.ts`: схлопывание пробелов + кап 120 симв. + «…»; unread-бейдж справа той же строкой); шапка (glass-пилюля «Edit» слева, по центру «Chats»+замок); нижняя overlay-панель: нейтральные чипы «Все/Чаты/Контакты/Папки» (no-op, `ponytail:`, слайс папок m.tag), glass-навбар [Контакты/Чаты активная синяя/Настройки] (no-op), поиск-FAB (no-op); `{#key screen.roomId}` + `animate-[chat-enter_0.22s_ease-out]` + `@keyframes chat-enter`. Поиск убран из шапки (перенос в FAB), чипы пришли на место макета.
- `683dceb` — **сессионный виджет верификации + интерактив**: (1) пилюля «!» в шапке списка при `statusLoaded && secretStorageReady && !deviceVerified`; клик → `cryptoStore.openUnlock()` (recovery key); успех → «✓» ~450 мс → `session-widget-leave` CSS-анимация вправо → unmount (см. дизайн юзера: «таблетка меняет размер»). Данные: `security.getDeviceVerified()` (`DeviceVerificationStatus.crossSigningVerified`, SDK v42 — поле, не метод), `adoptCrossSigning()` = `bootstrapCrossSigning({ authUploadDeviceSigningKeys })`; `cryptoStore.deviceVerified` в `refreshStatus()` + adopt после любого unlock. (2) Глобальный press-фидбек `button:active { transform: scale(0.96) }` + tap-highlight (app.css). (3) Чипы папок `w-fit max-w-[calc(100%-2rem)]` — резиновые под будущий счётчик папок (m.tag). (4) Навбар `h-12` (48px = поиск-FAB), активная вкладка `size-10`. Удалена старая пилюля [check/pencil]. Старый грабли: `onclick={() => {...}}` без обрамляющих `{}` ломает Svelte-парсинг — обработчики выносить в script; `$state` нельзя читать в своём же effect (самонвалидация → cleanup убивает таймер) — `prevUnverified` plain-переменная. **315 тестов**. Доки: `05-UI-E2EE.md` §7.4; SAS-со-второго-устройства — только план (§9.5).
- **Проверка юзером:** главный экран на dev-сервере (:5174) — аватары/превью наполнятся после нового `/sync` (старые комнаты в БД получат `avatarUrl`/`lastMessage` на ближайшем цикле, `upsertRoom` пишет каждый sync).
- Дальше по §8: **«Переписка»** `aab4de2b` (Timeline/TimelineItem/composer) → verify-модалка → заделы поиска/контактов.

**Verify UX (полечено, локально, ждёт пуша):** `acf5106` — пер-сообщенческая кнопка Verify на каждом чужом сообщении (всегда); `fd68626` — DM-партнёр из состава комнаты (`Room.getJoinedMembers()` → `others` без self → единственный = `dmPartner`), персист через `RoomModel.dmPartner`/`RoomDto` (неиндексируемое поле, миграция не нужна), CTA в шапке DM показывается всегда, когда партнёр известен (независимо от `m.direct` и наличия его сообщений — `isDirect` ненадёжен, а таймлайн партнёра пуст до Слайса 6.1). Доп.: `requestVerificationDM` обёрнут в try/catch во всех трёх входах (SAS/QR-show/QR-scan) — верификация юзера без E2EE-ключей (напр. `@server:matrix.org`, welcome-бот) падает грациозно (cancelled), без uncaught rejection. Итого **284 теста**. Проверено в браузере: шапка CTA появилась в DM с Matrix.org-ботом, клик не бросает ошибок.

**Слайс 5 (E2EE) — ЗАВЕРШЁН кодом и доками** (локально, коммиты ждут пуша):
- Коммиты: `da0aa39` (5.1a bootstrap+recovery), `5411c17` (5.1b SAS+trust), `0c38803` (5.1c QR show/scan), `83996f4`/`c838e5b` (docs/05-UI-E2EE + roadmap/handoff), `c96e95f` (фиксы ревью #1–#7 + убран каст + dead Cancel), `61c23df` (доки QR-гардов), `40877fa` (cross-doc consistency pass + §11.1).
- Фиксы UTD/key-backup: `248c838` (auto-restore доверенного server-бэкапа при логине), `54371b6` (reset cross-signing + 4S при recovery setup — убирает «Content is not encrypted!»), `26fa419` (leave-комнаты), `95d5e94` (restore нетрастед-бэкапа: загрузка backup-ключей из 4S + ре-триггер после ввода recovery key — закрывает «This message was sent before this device logged in, and key backup is not working»).
- Итого **266 тестов** (20 файлов), гейт зелёный; подпись SSH.
- Ключевые файлы: `src/crypto/security.ts`, `src/crypto/verification.ts` (SAS `runSasVerification`, QR `beginQrShow`/`scanQrVerification`/`cancelActiveVerification`), `src/stores/verificationStore.svelte.ts`, `src/components/crypto/VerificationDialog.svelte`, `src/components/Timeline.svelte`.
- Гард против воскрешения/отмены: модульный `generation`+`cancelRequested` гейт в `emit()`; `VerifierEvent.Cancel` в SDK не эмитится — отмена = reject `verify()`.

**Техдолг:** SSO `m.login.token` (подзадача 4), мульти-аккаунт (отложено до 7), e2ee echo dedup race (известная async гонка).

**Слайс 6 — история/retention/медиа:** см. `docs/04-ROADMAP.md` §9. Оценка: **средний объём, несколько независимых подзадач** (см. §5.1).

### 5.1. Слайс 6 — разбивка, сложность и объём

Предусловие обязательное, отдельной задачей (ДО рендера `formattedBody`):
- **6.0 Санитизация + CSP** (небольшая, критичная): DOMPurify для `formatted_body` (`03-REFERENCE-CODE.md` §3 `EventDto.formattedBody`), строгий CSP по `01-АРХ §7` (prod-заголовки или prod-only `<meta>`; НЕ статический CSP в dev — ломает HMR), рендер `{@html}` только после санитизации. **Сейчас в коде НЕТ ни одного `{@html}` для пользовательского контента** — единственный `{@html qrSvg}` — безопасный локальный SVG (uqr-биты), не трогать. XSS-поверхности пока нет.

Подзадачи (независимые, каждая — своя горизонталь/свой коммит):
| Подзадача | Объём | Сложность | Что есть / чего нет |
|---|---|---|---|
| **6.1 Пагинация вверх** (`timelineGaps` + `/messages`) | средний | средне | Таблица `timelineGaps` **уже есть** в db.ts (Слайс 0) + тесты. НЕТ сервиса записи gap при долгом оффлайне, НЕТ вызова `client.getPaginationToken`/`/messages`, НЕТ lazy-load на скролл вверх в Timeline. |
| **6.2 Retention ≤300 событий/комнату** | малый | низкая–средняя | НЕТ фоновой очистки по индексу `[userId+roomId+originServerTs]`; защита Reply/Thread соседних (stub-снимки) — чистая новая логика. |
| **6.3 Media Cache (Cache Storage + LRU/FIFO)** | средний | средняя | НЕТ `mediaCache.ts` вообще; нужны квота + очистка по retention/`QuotaExceededError`. |
| **6.4 Виртуализация ленты** | средний–крупный | средняя–высокая | Сейчас `{#each}` по всем событиям (суть записан в ROADMAP как хвост слайса 1) — нужно окно/переиспользование DOM. Затрагивает `Timeline.svelte`/`TimelineItem`. |

**Совет для старта:** идти в порядке 6.0 (безопасность, обязательно) → 6.2 (самый дешёвый) → 6.1 → 6.3 → 6.4 (самый крупный). Каждая подзадача — TDD (падающий тест → реализация → зелёный) + отдельный коммит; DOMPurify — новая dep (единственная разрешённая добавка; проверить, что не тащит `@types/node`, см. gotcha).

