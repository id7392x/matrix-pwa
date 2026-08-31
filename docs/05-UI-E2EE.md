# 05-UI-E2EE.md — UI-спецификация E2EE: верификация, доверие, recovery key

**Версия:** 0.1-DRAFT
**Статус:** Референс + контракт для UI-трека (дизайн-трек Д2, слайсы 5.1x, будущие слайсы)
**Подчиняется:** `00-PRINCIPLES.md`, `01-ARCHITECTURE.md`, `02-DATA-MODEL.md`, `03-REFERENCE-CODE.md`, `DESIGN.md`

Документ собирает в одном месте: (1) публичный API уже реализованных модулей (5.1a–5.1c), (2) SDK-контракты `matrix-js-sdk` v42 (Rust Crypto), которые нужно знать для UI, (3) требования к «хорошему UI» для SAS-/QR-верификации, trust-щитков и recovery key, (4) бэклог доработок с приоритетами.

---

## 1. Сущности и термины

| Термин | Смысл |
|---|---|
| **Cross-signing** | Механизм доверия Matrix: master/signing/self-signing ключи. Однажды подтверждённая личность (`isCrossSigningVerified`) транзитивно доверяет всем устройствам пользователя. |
| **SAS** | Short Authentication String — верификация «по эмодзи»: обе стороны показывают 7 одинаковых эмодзи, пользователь сверяет. |
| **QR-верификация** | «Покажи/отсканируй»: один экран показывает QR, второй сканирует камерой; после скана — подтверждение (reciprocate). |
| **TOFU** | Trust On First Use: незнакомый пользователь «известен», но не подтверждён; шифрование с ним работает, но UI обязан показывать предупреждение. |
| **needsUserApproval** | Идентичность пользователя сменилась (например, сброс cross-signing). UI обязан требовать новой верификации или закрепления (`pinCurrentUserIdentity`). |
| **Recovery key** | SSSS-ключ (`m.secret_storage.v1.aes-hmac-sha2`), восстановление ключей на новом устройстве. Хранится только в RAM сессии. |
| **UIA** | User-Interactive Authentication (пароль при `bootstrapCrossSigning`). |

Источники требований: `00-PRINCIPLES.md §3.3` (E2EE), `01-ARCHITECTURE.md §4` (cold start).

---

## 2. Текущая реализация — публичный API модулей

### 2.1 `$crypto/security.ts`

Модуль cross-signing + secret storage + recovery key. Module-level state, потоки через провайдеров.

- `attachSecurity(client: MatrixClient): void` — кэширует `client` и `crypto = client.getCrypto()`.
- `detachSecurity(): void` — сбрасывает crypto и ключи (`cachedKey`, `provisionalKey`).
- `setSecretStorageKeyPrompt(fn: KeyPrompt | null): void` — регистрирует UI-провайдер запроса recovery key.
- `setPasswordPrompt(fn: PasswordPrompt | null): void` — регистрирует UI-провайдер пароля для UIA.
- `getSecurityState(): Promise<SecurityState>` — `{ crossSigningReady, secretStorageReady, recoveryKeyInMemory }`.
- `setupRecovery(): Promise<string>` — полный bootstrap: `createRecoveryKeyFromPassphrase()` → `bootstrapCrossSigning({ authUploadDeviceSigningKeys })` → `bootstrapSecretStorage({ createSecretStorageKey, setupNewKeyBackup: true })`; возвращает recovery key строкой.
- `installRecoveryKey(recoveryKey: string): Promise<boolean>` — `decodeRecoveryKey` + кэш в RAM (provisional, keyId ещё неизвестен).
- `unlockRecovery(recoveryKey: string, keys): Promise<RecoveryKeyMatch | null>` — decode + MAC-проверка против ключей аккаунта (см. §3.6) + кэш.
- `makeCryptoCallbacks(): CryptoCallbacks` — `cacheSecretStorageKey` + `getSecretStorageKey` с цепочкой: `cachedKey` по `keyId` → `provisionalKey` по MAC-совпадению → `keyPrompt(keys)`.

**Типы:** `SecurityState`, `RecoveryKeyMatch { keyId: string; privateKey: Uint8Array<ArrayBuffer> }`, `KeyPrompt = (keys) => Promise<RecoveryKeyMatch | null>`, `PasswordPrompt = () => Promise<string | null>`.

**UI-точки входа:** баннер «настроить защиту» (setup), диалог ввода recovery key (unlock), промпт пароля (UIA). Подключено через:
```ts
setSecretStorageKeyPrompt((keys) => cryptoStore.requestRecoveryKey(keys))
setPasswordPrompt(() => cryptoStore.requestPassword())
```

### 2.2 `$crypto/verification.ts`

Модуль интерактивной верификации (SAS и QR, 5.1b/5.1c). Через `setVerificationHandlers` публикует UI-сессии и trust-обновления.

- `attachVerification(client: MatrixClient): void` / `detachVerification(): void` — подписка на события crypto (см. §3.1). Вызывается из `legacySync` рядом с `attachSecurity`. `detachVerification` инкрементит `generation`, `attachVerification` сбрасывает его и токен отмены.
- `setVerificationHandlers(onSession: SessionHandler | null, onTrust: TrustHandler | null): void` — UI регистрирует два колбэка.
- `runSasVerification(request: VerificationRequest, roomId?: string): Promise<void>` — машина состояний SAS: pending → accept (если `phase` в `Unsent|Requested`) → `startVerification('m.sas.v1')` → show_sas/confirm → done; отмена → cancelled.
- `beginUserVerification(userId: string, roomId: string): Promise<void>` — CTA из DM: `crypto.requestVerificationDM(userId, roomId)` + `runSasVerification`.
- `beginQrShow(userId: string, roomId: string): Promise<void>` — show-сторона QR (детали §3.4).
- `scanQrVerification(userId: string, roomId: string, qrText: string): Promise<void>` — scan-сторона QR (детали §3.4).
- `cancelActiveVerification(): void` — поднимает токен отмены: все in-flight эмиссии из текущего флоу гасятся (см. §3.5), диалог не воскресает.
- `ensureUserTrust(userId: string): Promise<boolean>` — `getUserVerificationStatus(userId).isCrossSigningVerified()` + push в trust-хендлер; при отсутствии crypto — `false`.

**UI-сессия:**
```ts
interface VerificationSessionUi {
  otherUserId: string
  roomId?: string
  phase: 'emoji' | 'qr' | 'done' | 'cancelled' | 'mismatch'  // какую UI-фазу показывать
  emojis: EmojiMapping[]                                      // [emoji, name][] для SAS
  qrText?: string                                             // содержимое QR (`M2V2:...`) для show
  callbacks?: ShowSasCallbacks | ShowQrCodeCallbacks          // confirm/mismatch/cancel (SAS) | confirm/cancel (QR)
}
```

Состояния сопоставляются с UI: `emoji` — показ эмодзи + кнопки; `qr` — QR show/scan; `done` — «Подтверждено»; `cancelled`/`mismatch` — диалог скрыть (или toast).

### 2.3 `$stores/cryptoStore.svelte.ts`

Состояние защиты аккаунта (Runes):

- Флаги: `crossSigningReady`, `secretStorageReady`, `recoveryKeyInMemory`, `bannerDismissed` (персист в `accounts.securityBannerDismissed`).
- Диалоги: `setupVisible | setupBusy | setupError | setupRecoveryKey`, `unlockVisible | unlockError`, `passwordVisible`.
- Derived: `setupNeeded = !crossSigningReady || !secretStorageReady`, `showBanner = setupNeeded && !bannerDismissed`.
- Методы: `init(userId)`, `dismissBanner()`, `openSetup/closeSetup/runSetup/finishSetup`, `openUnlock/cancelUnlock/submitUnlockKey`, `requestRecoveryKey(keys)` (SDK-провайдер), `requestPassword()/submitPassword/cancelPassword`, `reset()`.

### 2.4 `$stores/verificationStore.svelte.ts`

Состояние верификации и доверия:

- `session: VerificationSessionUi | null`, `trust: Map<userId, boolean>`.
- Derived: `dialogVisible = session.phase ∈ {emoji, qr, done}`.
- Методы: `isTrusted(userId)`, `verifyUser(userId, roomId)`, `startQrShow(userId, roomId)`, `scanQr(userId, roomId, qrText)`, `ensureTrust(userId)` (dedupe через `Map.has`), `confirmSas()`, `mismatchSas()`, `confirmQr()`, `cancelVerification()`, `closeDialog()`, `reset()`.
- `running`-флаг: `verifyUser`/`startQrShow`/`scanQr` игнорируют повторный старт, пока флоу активен (SDK: один флоу на пару); `cancelVerification`/`closeDialog`/`reset` и терминальные фазы снимают его.
- `cancelVerification` вызывает `cancelActiveVerification()` (модуль гасит in-flight эмиссию) + `callbacks.cancel()` при наличии.

### 2.5 Компоненты и проводка

| Компонент | Роль |
|---|---|
| `components/crypto/SecurityBanner.svelte` | Баннер «настройте защиту» в шапке RoomList; CTA → `openSetup`, кнопка «скрыть» → `dismissBanner`. |
| `components/crypto/RecoverySetupDialog.svelte` | Генерация recovery key; текстarea с ключом + «I saved it». |
| `components/crypto/RecoveryKeyEntryDialog.svelte` | Ввод существующего ключа (unlock через `requestRecoveryKey`/`submitUnlockKey`). |
| `components/crypto/PasswordPromptDialog.svelte` | Пароль для UIA (`requestPassword`). |
| `components/crypto/VerificationDialog.svelte` | SAS: эмодзи + «They match / They don't match / Cancel»; done-состояние с Close. |
| `App.svelte` | Рендерит все диалоги глобально (последним слоем). |
| `components/Timeline.svelte` | `$effect` — ленивый `ensureTrust` для сендеров зашифрованных событий; CTA «Verify {user}» в шапке для Direct-чата с непроверенным партнёром (`dmPartner` = единственный другой sender). |
| `components/TimelineItem.svelte` | Shield-иконка (SVG) при `event.isEncrypted && !isTrusted(event.sender)`. |
| `lib/legacySync.ts` | `attachSecurity` + `attachVerification` сразу после `initCrypto`; `detach`+`reset` обоих сторов в трёх точках очистки (два cancelled-пути и stop). |

---

## 3. SDK-контракты matrix-js-sdk v42 (Rust Crypto)

> Эти контракты сняты с типов пакета (`lib/crypto-api/*`, `lib/rust-crypto/*`) и нужны, чтобы UI-реализации не перечитывали `node_modules`.

### 3.1 Подписка на события CryptoEvent

`client.getCrypto()` возвращает `CryptoApi` (интерфейс), но владеет событиями **runtime-объект `RustCrypto`** — он `extends TypedEventEmitter`. Прямых методов `.on/.off` в типе `CryptoApi` нет, поэтому в `verification.ts` используется каст:

```ts
interface CryptoEventSink {
  on(event: string, listener: (...args: never[]) => void): void
  off(event: string, listener: (...args: never[]) => void): void
}
const sink = crypto as unknown as CryptoEventSink
sink.on(CryptoEvent.VerificationRequestReceived, (request) => ...)
```

События, полезные для UI (`CryptoEventHandlerMap`):

| Событие | Payload | UI-смысл |
|---|---|---|
| `VerificationRequestReceived` | `VerificationRequest` | входящий запрос верификации → показать диалог (accept+flow) |
| `UserTrustStatusChanged` | `(userId: string, status: UserVerificationStatus)` | trust пользователя сменился (например, после SAS) → обновить щитки/CTA |
| `DevicesUpdated` | `(users: string[], initialFetch: boolean)` | устройства изменились → перечитать trust по affected users |
| `KeysChanged` | `{}` | изменены ключи (в т.ч. cross-signing reset) → перечитать статус себя |
| `KeyBackupStatus` / `KeyBackupDecryptionKeyCached` (из backup map) | — | статус key backup → индикатор «ключи в облаке» |
| `WillUpdateDevices` | `(users, initialFetch)` | пред-событие `DevicesUpdated` (обычно UI не нужно) |

### 3.2 VerificationRequest: фазы и события

Enum `VerificationPhase`: `Unsent=1 → Requested=2 → Ready=3 → Started=4 → Cancelled=5 | Done=6`.

Полезные члены: `transactionId`, `roomId`, `initiatedByMe`, `otherUserId`, `otherDeviceId`, `isSelfVerification`, `phase`, `accepting`, `pending`, `verifier` (`Verifier | null`), `accept()`, `startVerification(method)`, `cancel(reason?)`.

Событие request: `VerificationRequestEvent.Change` (без payload) — срабатывает на любой смене фазы. Для UI полезно подписаться, чтобы узнать момент `Ready`/`Started`.

**Важное ограничение rust crypto:** `startVerification(method)` **бросает ошибку для любого метода, кроме `VerificationMethod.Sas`**. QR-флоу идёт НЕ через него (см. §3.4).

Поток SAS реализован в `runSasVerification` и уже покрыт тестами — при доработке UI менять состояние, а не переизобретать флоу.

### 3.3 Verifier и SAS

События verifier (`VerifierEvent`): `Cancel` (payload `Error | MatrixEvent`), `ShowSas` (payload `ShowSasCallbacks`), `ShowReciprocateQr` (payload `ShowQrCodeCallbacks`, см. §3.4).

Методы: `verify(): Promise<void>` (резолвится при успехе, реджектится при отмене/таймауте), `cancel(e?: Error)`, `getShowSasCallbacks()`, `getReciprocateQrCodeCallbacks()`.

```ts
interface ShowSasCallbacks {
  sas: GeneratedSas          // { decimal?: [n,n,n], emoji?: [emoji, name][] }
  confirm(): Promise<void>   // пользователь подтвердил совпадение
  mismatch(): void           // не совпало → cancel с кодом m.mismatched_sas
  cancel(): void
}
```

UI-поведение: при `ShowSas` показать `sas.emoji` (7 штук, крупно, с именами) и кнопки. После `confirm()` выставить локально `phase='done'` (мгновенный отклик); `verify()` разрешится после обмена MAC/done.

### 3.4 QR-верификация (5.1c, rust crypto)

API модуля `src/crypto/verification.ts`: `beginQrShow(userId, roomId)` — показать свой QR (сессии обеих сторон по `requestVerificationDM`), `scanQrVerification(userId, roomId, qrText)` — отсканировать QR собеседника (строка из jsQR). Проигрывают в те же `VerificationSessionUi` с `phase: 'qr'`.

`generateQRCode(): Promise<Uint8ClampedArray | undefined>` и `scanQRCode(bytes: Uint8ClampedArray): Promise<Verifier>` объявлены в публичном типе `VerificationRequest` (`lib/crypto-api/verification.d.ts`, строки 117/137) — каст больше не нужен, вызываются напрямую.

**Показ QR (show) — `beginQrShow`:**
1. `request = await crypto.requestVerificationDM(userId, roomId)` (или `requestDeviceVerification`).
2. `bytes = await request.generateQRCode()` → декодировать в строку (UTF-8) → продюснуть `VerificationSessionUi { phase: 'qr', qrText }`; рендер — `uqr` (`renderSVG`) в светлой подложке.
3. Ждать смены request (появление verifier) → подписаться на `VerifierEvent.ShowReciprocateQr` → `ShowQrCodeCallbacks { confirm(): void; cancel(): void }` (другая сторона отсканировала и подтвердила) → вызвать `confirm()`, `verifier.verify()` резолвится.
4. Без байтов (`generateQRCode` → `undefined`), при ошибке, или если request ушёл в `Cancelled` до скана (verifier так и не появился) — `phase: 'cancelled'` (иначе диалог зависнет на pending).

**Сканирование (scan) — `scanQrVerification`:**
1. `requestVerificationDM` → `verifier = await request.scanQRCode(bytes)` (байты строки, декодированной jsQR с камеры).
2. `await verifier.verify()` — ожидание, пока шоу-сторона подтвердит reciprocate.

**Legacy-заглушка:** `getQRCodeBytes()` в rust crypto бросает ошибку («use generateQRCode() instead») — не использовать.

**Отмена и защита от воскрешения:** у SDK нет события отмены (см. §3.8) — модуль держит `cancelRequested`-токен (поднимается `cancelActiveVerification()` при клике Cancel) и `generation`-счётчик (инкремент на `detachVerification`). Все эмиссии идут через `emit()`: гейт `gen === generation && !cancelRequested` гасит late-эмиссию из уже отменённого/закрытого флоу — диалог не воскресает после Cancel/логаута. Стор держит `running`-флаг: второй `requestVerificationDM` на ту же пару игнорируется, пока флоу активен.

Зависимости (установлены в 5.1c): `jsQR` (декод с камеры) + `uqr` (рендер SVG, встроенные типы, ноль зависимостей). Изначально планировалась `qrcode`+`@types/qrcode`, но она тащит `@types/node` и ломает глобальные типы (gotcha из HANDOFF) — не возвращать.

### 3.5 Отмена: у rust crypto нет события Cancel

В `rust-crypto/verification.js` эмитятся только `ShowSas` и `ShowReciprocateQr`. `VerifierEvent.Cancel` упомянут лишь в doc-комменте (строка 486) и никогда не выбрасывается. Отмена всегда приходит как **reject `verify()`** (`completionDeferred`) → в `runSasVerification`/`beginQrShow`/`scanQrVerification` ловится в `catch` → `phase: 'cancelled'`. Поэтому `verifier.on(VerifierEvent.Cancel, ...)` — мёртвый код, не добавлять.

### 3.6 Recovery key / SSSS

- `decodeRecoveryKey(str) / encodeRecoveryKey(bytes)` из `matrix-js-sdk/lib/crypto-api/recovery-key`; `decodeRecoveryKey` **бросает** на мусоре (parity/prefix/length) → всегда try/catch.
- Проверка соответствия ключа аккаунту — **MAC-проверка по spec `m.secret_storage.v1.aes-hmac-sha2`** (реализована в `security.verifySecretStorageKey`): HKDF-SHA-256 (salt = 32×0, info = "") → 64 байта → AES-CTR-256 над 32 нулями → HMAC-SHA-256 → сравнить с `desc.mac`. Никакого вычисления `keyId` из ключа делать не нужно.
- `createRecoveryKeyFromPassphrase()` → `GeneratedSecretStorageKey { encodedPrivateKey, privateKey }`.
- `bootstrapCrossSigning({ authUploadDeviceSigningKeys })` + `bootstrapSecretStorage({ createSecretStorageKey, setupNewKeyBackup: true })` — после этого `recoveryKeyInMemory = true` (ключ в RAM).
- `getSecretStorageKey({ keys })` — запрос ключа SDK; ответ UI-провайдера `[keyId, privateKey] | null`.

### 3.7 Методы CryptoApi для UI

| Метод | Назначение |
|---|---|
| `getUserVerificationStatus(userId)` | `UserVerificationStatus` (см. ниже) |
| `getDeviceVerificationStatus(userId, deviceId)` | статус конкретного устройства `DeviceVerificationStatus` |
| `requestVerificationDM(userId, roomId)` | начать верификацию в DM (интерактивную) |
| `requestDeviceVerification(userId, deviceId)` | верификация конкретного устройства |
| `requestOwnUserVerification()` | верификация второй сессии самих себя (настройка нового устройства) |
| `getCrossSigningStatus()`, `getSecretStorageStatus()`, `getKeyBackupInfo()` | состояние защиты |
| `bootstrapCrossSigning(...)`, `bootstrapSecretStorage(...)`, `createRecoveryKeyFromPassphrase()` | настройка защиты (см. §2.1) |
| `pinCurrentUserIdentity(userId)` | закрепить новую идентичность вместо верификации (для `needsUserApproval`) |

`UserVerificationStatus` (`index.d.ts`): `known`, `needsUserApproval`, `isVerified()`, `isCrossSigningVerified()`, `wasCrossSigningVerified()`. Семантика флагов описана в §1 (TOFU / needsUserApproval).

### 3.8 Ограничения и касты (коротко)

- `CryptoApi` не эмиттер → каст `as unknown as CryptoEventSink`.
- `startVerification` только `m.sas.v1` → QR через `generateQRCode`/`scanQRCode` (эти методы есть в публичном типе `VerificationRequest`, каст не нужен).
- `cryptoDatabasePrefix` (не `storePrefix`): `matrix-js-sdk:crypto:${userId}:${deviceId}`.
- `cryptoCallbacks` обязан передаваться в `createClient` до создания клиента.
- Москов в тестах: `as unknown as CryptoApi`, паттерн в `security.test.ts` / `verification.test.ts`; WASM в Vitest не грузится.

---

## 4. UI-спецификация: SAS-верификация

### 4.1 Идеальный пользовательский сценарий

1. Пользователь открывает DM с непроверенным пользователем → в шапке кнопка **«Verify»** + щитки у зашифрованных сообщений (amber).
2. Нажимает Verify (или приходит входящий запрос) → диалог: «Сравните эмодзи с {user}»; 7 эмодзи крупно, с подписями (одна строка из 7 — важна).
3. Кнопки: **«They don't match»** (danger), **«They match»** (primary), **Cancel** (ghost). По «They match» — мгновенный переход в «Verified ✓».
4. После завершения: щитки этого сендера исчезают, CTA убирается, trust-панель (если есть) обновляется.

### 4.2 Состояния диалога (таблица-контракт)

| `session.phase` | UI | Действия пользователя |
|---|---|---|
| `emoji`, `emojis: []` | «Starting verification…» (spinner), кнопка Cancel | Cancel |
| `emoji`, 7 эмодзи | Эмодзи-сетка + «Compare with {user}» | They match / They don't match / Cancel |
| `done` | «Verified ✓», имя пользователя | Close |
| `cancelled` / `mismatch` | Диалог скрыть; при желании toast «Verification cancelled» / «Emojis didn't match» | — |

Требования: мигание недопустимо (не показывать spinner, если сразу есть показ); двойной клик по кнопкам — защита через смену фазы (первый клик уже перевёл в `done`).

### 4.3 Доступность

- `role="dialog"`, `aria-modal="true"`, `aria-label="Verify {user}"`, focus внутри диалога, ESC = Cancel.
- Эмодзи: `aria-label` = имя эмодзи (для screen reader), не полагаться только на картинку.
- Кнопки с явными текстовыми лейблами; достаточные тач-таргеты (≥44px, DESIGN.md A2).
- Сообщение об ошибке — `aria-live="polite"`.

### 4.4 Ошибки, отмена, таймауты

- **Другая сторона отменила** → `VerifierEvent.Cancel` → фаза `cancelled`; диалог закрывается сам.
- **Само-отмена** → `cancel()` → закрыть.
- **Mismatch** → `mismatch()` (SDK шлёт `m.mismatched_sas` cancel) → закрыть; желателен toast-фидбек.
- **Таймауты** (нет ответа другой стороны): SDK-верификация сама реджектится с `VerificationTimedOutError` → поймать в `runSasVerification` → `cancelled`. UI: вернуть дружелюбное сообщение («Хьюстон, собеседник не ответил»), предложить повторить.

---

## 5. UI-спецификация: QR-верификация (5.1c)

Два режима в одном диалоге: **show** (мой экран показывает QR) и **scan** (сканирую QR собеседника). Спецификация Matrix: QR кодирует `M2V2:<txn>:<public key>:...`; сверять визуально нужно человечный ключ (fingerprint), а не весь QR.

### 5.1 Показ QR (show)

- Экран: «Сканируйте код на другом устройстве», QR (`uqr` → SVG, белая подложка) крупно на контрастном светлом фоне (тёмный QR на тёмной теме не читается! — обязательный нюанс DESIGN).
- Подсказка: «Не совпадает ключ с устройством {user}: {deviceId}? Отмена».
- Состояние ожидания скана: спиннер/текст «Ожидание сканирования…».
- После скана другой стороной → событие `ShowReciprocateQr` → кнопка **«Confirm»** («Код отсканирован и совпадает»).
- Возможность отмены (`cancel()`) на всех шагах.

### 5.2 Сканирование (scan)

- Разрешение камеры: запросить по клику «Start camera»; повторный клик не должен открывать второй поток (`if (scanning) return`).
- Живой видеофид + наложенная рамка; jsQR по кадрам (requestAnimationFrame), после стабильного декода — `stopScan()`, затем `scanQr(bytes)`.
- Камера (track'и + rAF) гасится при уходе из scan-пейна, при `phase !== 'qr'` (в т.ч. `done`) и при закрытии диалога — иначе индикатор камеры и CPU продолжают работать.
- После декода → `scanQRCode(bytes)` → ожидание подтверждения второй стороны → done.

### 5.3 Ошибки QR

| Ошибка | UI |
|---|---|
| `CameraPermissionError` / отказ | Экран объяснения, кнопка «Показать мой код» |
| `InvalidQRCodeError` | Тофст «Код не распознан», продолжить сканирование |
| `UserCancelledError` | Закрыть диалог |
| `VerificationTimedOutError` | Предложить повторить |

### 5.4 Кнопка-переключатель

Диалог умеет переключаться show ↔ scan. **Один активный флоу на пару:** стор с `running`-флагом игнорирует повторный `requestVerificationDM` (SDK второго не позволяет). В scan-флоу show-пейн НЕ рендерит QR (отсканированный текст принадлежит другой стороне) — вместо картинки подсказка «Ask {other} to show yours». В show-флоу ре-рендер локально сгенерированного QR.

---

## 6. UI-спецификация: доверие (trust)

### 6.1 Модель

- `verificationStore.trust: Map<userId, boolean>` — кэш `isCrossSigningVerified()`. Незаполненное значение = `false` (untrusted by default — консервативно и честно).
- Наполнение: лениво по сендерам зашифрованных событий (`Timeline $effect` + `ensureTrust` c dedupe через `Map.has`); реактивно через `UserTrustStatusChanged`.

### 6.2 Щитки / индикаторы

Текущее правило шилка: `event.isEncrypted && !isTrusted(event.sender)` (amber `data-shield` у имени сендера). Для «хорошего UI»:

- **Уровни:** незнакомый (TOFU) = amber ⚠; подтверждён (✓); сменённая идентичность (`needsUserApproval`) = red/пурпурный + CTA «Verify again»; себя = нейтральный.
- Тултип: «Не проверено — подтвердите личность» / «Проверено по cross-signing».
- Легенда/справка где-то в настройках (первый раз: объяснить, что значит щиток).

### 6.3 CTA-правила

- В DM: кнопка Verify в шапке, если `isDirect && !isTrusted(dmPartner)` и нет активной сессии.
- В группе: не спамить CTA на каждого — один системный баннер «В этом чате есть непроверенные участники» с переходом к списку.
- При собственной новой сессии (`requestOwnUserVerification`) — «Верифицировать эту сессию» (обязательно при новом устройстве).

### 6.4 Trust-панель (future, след. слайсы)

- Список участников чата с trust-статусом, фильтр по «проверен/нет/сменено».
- Список устройств пользователя (`getDeviceVerificationStatus`) + cross-signing fingerprint каждой.
- Действия: «Verify» (SAS/QR), «Pin identity» (`needsUserApproval`), «Reset cross-signing» (продвинутое, аккуратно).

### 6.5 Переустановка cross-signing / needsUserApproval

`needsUserApproval` = личность пользователя сменилась (сброс ключей). Обязательно показать предупреждение со старым/новым статусом и двумя действиями: **Verify again** или **Trust on use** (`pinCurrentUserIdentity`). Не тихо продолжать шифровать.

---

## 7. UI-спецификация: Recovery key

### 7.1 Setup (первый запуск / баннер)

- Баннер (`SecurityBanner`) показывается, пока `setupNeeded`, пока не нажат dismiss (персист в `accounts.securityBannerDismissed`). После dismiss — доступ через настройки.
- Диалог setup: объяснение → «Generate» → **показать ключ единственный раз** (текстarea readonly + Copy) → «I saved it». После: `recoveryKeyInMemory = true`, баннер уходит.
- Warning: ключ показывается только в момент генерации. Re-reveal не предусмотрен (ключ в RAM есть только в этой сессии; на диске не хранится). Хороший UI — диаграмма «что это даёт» + честное «без ключа не восстановите сообщения на новом устройстве».

### 7.2 Промпт ключа (unlock)

- Появляется, когда SDK запрашивает ключ (`getSecretStorageKey` → `keyPrompt`): «Введите recovery key» + поле + Submit/Отмена.
- Ошибка «ключ не подошёл» — не закрывать диалог, дать повтор (без блокировки).
- После успеха — `unlockRecovery` кэширует в RAM; на UI — флаг `recoveryKeyInMemory`.

### 7.3 Пароль (UIA)

- `requestPassword` — модальный промпт пароля аккаунта при `bootstrapCrossSigning`, если сервер требует UIA. Пароль **не хранить и не логировать** (Principles §3.2.2).
- UI: «Введите пароль от {homeserver}», ошибка UIA-неудачи — «повторить/отмена». Не связан с recovery key.

### 7.4 Верификация сессии (виджет в шапке списка комнат)

Проблема: после логина на новом устройстве сессия не подписана cross-signing-ключами аккаунта — приватные беседы видны, но доверие не подтверждено. Классические клиенты гонят пользователя в сложный SAS-флоу с уже залогиненным устройством; у нас быстрее через recovery key.

- **Триггер (`RoomList.svelte`)**: пилюля «!» появляется, когда `statusLoaded && secretStorageReady && !deviceVerified`. Если 4S не настроен вообще (`setupNeeded`) — пилюли нет, этим владеет `SecurityBanner`.
- **`deviceVerified`** — `CryptoApi.getDeviceVerificationStatus(ownUserId, ownDeviceId).crossSigningVerified ?? false` (SDK v42: поле, не метод). Обновляется в `cryptoStore.refreshStatus()` на каждой инициализации и после unlock.
- **Действие**: клик → `cryptoStore.openUnlock()` (та же `RecoveryKeyEntryDialog`). После успешного unlock `adoptCrossSigning()` (`bootstrapCrossSigning({ authUploadDeviceSigningKeys })`) подписывает это устройство своим self-signing ключом → `deviceVerified = true`.
- **Поведение после верификации**: пилюля превращается в зелёный «✓», держится ~450 мс, уезжает вправо CSS-анимацией и размонтируется (`$effect` + `onanimationend`). Значит «таблетка меняет размер» (дизайн-решение пользователя).
- **Запланировано (не реализовано)**: путь верификации **со второго устройства** — если recovery key недоступен, но есть другой залогиненный device. Схема: `requestOwnUserVerification()` / SAS-сессия между двумя своими устройствами (см. §9.5). Recovery-key путь — основной, он уже в коде.

### 7.4 Хранение, ротация, сброс

- Recovery key живёт в RAM (`cachedKey`/`provisionalKey`) на время сессии. При выходе (`detachSecurity`) — очищается.
- Ротация ключа: `bootstrapSecretStorage` с новым `createSecretStorageKey` (пересоздать ключи, update key backup) — future.
- Сброс cross-signing — только в продвинутых настройках с подтверждением последствий.

---

## 8. Привязка к дизайн-системе (DESIGN.md)

- **Токены:** использовать `var(--accent-color)`, `--glass-bg`, `--glass-border`, `--text-primary`; транзиентные стили — через утилиты `border-[var(--glass-border)] bg-[var(--glass-bg)]` (не хардкод-цвета).
- **Диалоги:** единый шаблон (overlay `bg-black/60` + панель `max-w-md` + кнопки-крючки) — см. существующие crypto-диалоги; вынести в общий компонент при росте числа.
- **Half-светлая тема для QR:** панель QR должна оставаться светлой (контраст для камеры) даже в dark mode.
- **Accessibility:** закрыть A1–A4, I5–I10 из DESIGN.md для всех новых диалогов (aria, focus-visible, touch targets, loading/empty states).
- **Safe area / small screens:** диалог верификации должен помещаться на 320px-экране без скролла по горизонтали (эмодзи-строка переносится на 2 ряда на узких экранах).

---

## 9. Бэклог «хорошего UI» (по ценности)

1. **VerificationDialog: toast на cancelled/mismatch** + защита от двойного клика (уже частично — фаза `done`).
2. **Trust-легенда** и тултипы у щитков (объяснение «что значит щиток» новичкам).
3. **needsUserApproval баннер** в DM/группе при смене идентичности (Verify / Pin).
4. **QR-флоу-доработки**: ошибки из §5.3 (tost «Код не распознан» при дёрганых декодах), кнопка «Показать свой код» в скан-пейне при отказе камеры, дебаунс/стабильный кадр jsQR. Show/scan-переключение и сами потоки — уже сделаны (5.1c).
5. **QSS-вход в верификацию из диалога «новое устройство»** (`requestOwnUserVerification`). Касается и виджета сессии (§7.4): SAS/QR-подтверждение сессии между двумя своими устройствами, когда recovery key недоступен (`!recoveryKeyInMemory`).
6. **Trust-панель участников/устройств** (список, фильтры, fingerprint).
7. **Общий Dialog-компонент** (шаблон overlay/панель/кнопки) и инпут-компонент (шест для recovery key).
8. **Loading/empty states** диалогов (I5, I10).
9. **Стресс-обновление trust**: большие комнаты — батчить `ensureTrust`, LRU вместо unbounded Map (пока `ponytail: Map по сессии, LRU если комнаты > 100 участников`).

**Уже закрыто (не переделывать):** SAS-флоу (`runSasVerification`), QR-флоу show/scan (`beginQrShow`/`scanQrVerification`, 5.1c), recovery-флоу (setup/unlock/UIA), trust-кэш (`verificationStore`), ленивый загруз доверия в Timeline, shield-иконка.

---

## 10. Тестирование

Паттерны уже в репо — копировать:

| Что тестить | Файл-образец | Приём |
|---|---|---|
| SAS-машина состояний | `src/crypto/verification.test.ts` | FakeRequest/FakeVerifier (мини-emitter `on/off/emit`), cast `as unknown as VerificationRequest` |
| Trust-маппинг | там же: `ensureUserTrust` → `getUserVerificationStatus().isCrossSigningVerified()` |
| Store-состояния | `src/stores/verificationStore.svelte.test.ts` | `vi.mock('$crypto/verification')` + `vi.hoisted` для захвата handler'ов |
| Crypto-моки | `src/crypto/security.test.ts`, `e2ee.test.ts` | типизированные объекты `as unknown as CryptoApi`; `globalThis.crypto.subtle` доступен (НЕ стубить) |
| ВАЖНО | — | `/// <reference types="node" />` в тестах ломает глобальные типы других тестов — не использовать |