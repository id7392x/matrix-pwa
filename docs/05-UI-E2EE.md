# 05-UI-E2EE.md — UI-спецификация E2EE: верификация, доверие, recovery key

**Версия:** 0.2-DRAFT
**Статус:** Референс + контракт для UI-трека (дизайн-трек Д2, слайсы 5.1x)
**Подчиняется:** `00-PRINCIPLES.md`, `01-ARCHITECTURE.md`, `02-DATA-MODEL.md`, `03-DESIGN.md`

Этот документ описывает **проектные UI-решения** E2EE (как верификация, доверие и recovery key устроены в нашем UI). Публичные API модулей и SDK-контракты **в коде и графе** — здесь не дублируются:
- Модули: `src/crypto/security.ts` (cross-signing/recovery), `src/crypto/verification.ts` (SAS/QR).
- Сторы: `src/stores/cryptoStore.svelte.ts`, `src/stores/verificationStore.svelte.ts`.
- Svelte-API — через svelte-mcp; контракты matrix-js-sdk — через типы пакета / граф.

---

## 1. Сущности и термины

| Термин | Смысл |
|---|---|
| **Cross-signing** | Доверие Matrix: master/signing/self-signing ключи. Однажды подтверждённая личность (`isCrossSigningVerified`) транзитивно доверяет всем устройствам пользователя. |
| **SAS** | Short Authentication String — верификация «по эмодзи»: обе стороны показывают 7 одинаковых эмодзи, пользователь сверяет. |
| **QR-верификация** | «Покажи/отсканируй»: один экран показывает QR, второй сканирует камерой; после скана — подтверждение (reciprocate). |
| **TOFU** | Trust On First Use: незнакомый пользователь «известен», но не подтверждён; шифрование работает, но UI обязан показывать предупреждение. |
| **needsUserApproval** | Идентичность пользователя сменилась (сброс cross-signing). UI обязан требовать новой верификации или закрепления (`pinCurrentUserIdentity`). |
| **Recovery key** | SSSS-ключ (`m.secret_storage.v1.aes-hmac-sha2`), восстановление ключей на новом устройстве. Хранится только в RAM сессии. |
| **UIA** | User-Interactive Authentication (пароль при `bootstrapCrossSigning`). |

---

## 2. Модули и стор (карта, без дублирования кода)

Публичные функции/методы — в коде (`src/crypto/*`, `src/stores/*`), точные сигнатуры — в графе. Ключевые точки проводки:

| Слой | Что | Где |
|---|---|---|
| security | attach/detach, setup/install/unlock recovery, adoptCrossSigning, getDeviceVerified, makeCryptoCallbacks | `src/crypto/security.ts` |
| verification | runSasVerification, beginQrShow/scanQr, cancelActiveVerification, ensureUserTrust | `src/crypto/verification.ts` |
| cryptoStore | флаги защиты, диалоги setup/unlock/password, deviceVerified | `src/stores/cryptoStore.svelte.ts` |
| verificationStore | VerificationSessionUi, trust map, running-флаг | `src/stores/verificationStore.svelte.ts` |
| UI-проводка | SecurityBanner, диалоги (crypto/), VerificationDialog, ensureTrust в Timeline, shield в TimelineItem, CTA в шапке DM | `src/App.svelte`, `src/components/*` |

**Критичное ограничение (`src/crypto/verification.ts`):** SAS = входящая (`VerifierRequestReceived`), пользователь действует через CTA в чате. `startVerification(method)` бросает для любого метода, кроме `m.sas.v1`; QR-флоу идёт через `generateQRCode()`/`scanQRCode()`. `VerifierEvent.Cancel` в SDK не эмитится — отмена всегда reject `verify()`.

---

## 3. SAS-верификация: UI-сценарий

### 3.1 Идеальный пользовательский сценарий
1. Пользователь открывает DM с непроверенным пользователем → в шапке кнопка **«Verify»** + щитки у зашифрованных сообщений (amber).
2. Нажимает Verify (или входящий запрос) → диалог: «Сравните эмодзи с {user}»; 7 эмодзи крупно, с подписями (одна строка из 7 — важна).
3. Кнопки: **«They don't match»** (danger), **«They match»** (primary), **Cancel** (ghost). По «They match» — мгновенный переход в «Verified ✓».
4. После завершения: щитки сендера исчезают, CTA убирается, trust-панель (если есть) обновляется.

### 3.2 Состояния диалога (контракт)
| `session.phase` | UI | Действия |
|---|---|---|
| `emoji`, `emojis: []` | «Starting verification…» (spinner), Cancel | Cancel |
| `emoji`, 7 эмодзи | Эмодзи-сетка + «Compare with {user}» | They match / They don't match / Cancel |
| `done` | «Verified ✓», имя | Close |
| `cancelled` / `mismatch` | скрыть диалог; optional toast | — |

Мигание недопустимо (не показывать spinner, если сразу есть показ). Двойной клик — защита сменой фазы (первый клик перевёл в `done`).

### 3.3 Доступность
- `role="dialog"`, `aria-modal="true"`, `aria-label="Verify {user}"`, focus внутри, ESC = Cancel.
- Эмодзи: `aria-label` = имя эмодзи.
- Кнопки с явными лейблами, тач-таргет ≥44px (03-DESIGN.md A2).
- Ошибка — `aria-live="polite"`.

### 3.4 Ошибки, отмена, таймауты
- **Другая сторона отменила** → reject `verify()` → `cancelled`; диалог закрывается.
- **Само-отмена** → `cancel()` → закрыть.
- **Mismatch** → `mismatch()` (SDK шлёт `m.mismatched_sas`) → закрыть; желателен toast.
- **Таймаут** (нет ответа) → SDK реджектится `VerificationTimedOutError` → `cancelled`; UI: дружелюбное «собеседник не ответил», предложить повторить.

---

## 4. QR-верификация

Два режима в одном диалоге: **show** (мой экран показывает QR) и **scan** (сканирую QR собеседника). Спецификация: QR кодирует `M2V2:<txn>:<public key>:...`; сверять визуально человечный fingerprint, не весь QR.

### 4.1 Показ QR (show)
- «Сканируйте код на другом устройстве», QR (`uqr` → SVG) крупно на **контрастном светлом фоне** (тёмный QR на тёмной теме не читается!).
- Подсказка: «Не совпадает ключ с устройством {user}: {deviceId}? Отмена».
- Ожидание скана: спиннер «Ожидание сканирования…».
- После скана другой стороной → `ShowReciprocateQr` → кнопка **«Confirm»**.
- Отмена (`cancel()`) на всех шагах.

### 4.2 Сканирование (scan)
- Разрешение камеры по клику «Start camera»; повторный клик не открывает второй поток (`if (scanning) return`).
- Живой видеофид + рамка; jsQR по кадрам (rAF), после стабильного декода — `stopScan()`.
- Камера (track'и + rAF) гасится при уходе из scan-пейна, при `phase !== 'qr'` и при закрытии — иначе индикатор камеры и CPU работают.

### 4.3 Ошибки QR
| Ошибка | UI |
|---|---|
| `CameraPermissionError` / отказ | экран объяснения, кнопка «Показать мой код» |
| `InvalidQRCodeError` | toast «Код не распознан», продолжить |
| `UserCancelledError` | закрыть диалог |
| `VerificationTimedOutError` | предложить повторить |

### 4.4 Кнопка-переключатель
Диалог умеет переключаться show ↔ scan. **Один активный флоу на пару:** стор с `running`-флагом игнорирует повторный `requestVerificationDM`. В scan-флоу show-пейн НЕ рендерит QR (текст принадлежит другой стороне) — подсказка «Ask {other} to show yours».

---

## 5. Доверие (trust)

### 5.1 Модель
- `verificationStore.trust: Map<userId, boolean>` — кэш `isCrossSigningVerified()`. Незаполненное = `false` (untrusted by default).
- Наполнение: лениво по сендерам зашифрованных событий (Timeline `$effect` + `ensureTrust` c dedupe через `Map.has`); реактивно через `UserTrustStatusChanged`.

### 5.2 Щитки / индикаторы
Текущее правило: `event.isEncrypted && !isTrusted(event.sender)` (amber). Для «хорошего UI»:
- **Уровни:** незнакомый TOFU = amber ⚠; подтверждён ✓; сменённая идентичность (`needsUserApproval`) = red/пурпурный + CTA «Verify again»; себя — нейтральный.
- Тултип: «Не проверено» / «Проверено по cross-signing».
- Легенда где-то в настройках.

### 5.3 CTA-правила
- DM: кнопка Verify в шапке, если `isDirect && !isTrusted(dmPartner)` и нет активной сессии.
- Группа: не спамить CTA — один системный баннер «есть непроверенные участники».
- Своя новая сессия (`requestOwnUserVerification`): «Верифицировать эту сессию».

### 5.4 Trust-панель (future, след. слайсы)
Список участников с trust-статусом, фильтр; список устройств (`getDeviceVerificationStatus`) + fingerprint; действия Verify / Pin identity / Reset cross-signing.

### 5.5 Переустановка cross-signing / needsUserApproval
`needsUserApproval` = личность сменилась. Обязательно показать предупреждение со старым/новым статусом и двумя действиями: **Verify again** или **Trust on use** (`pinCurrentUserIdentity`). Не тихо продолжать шифровать.

---

## 6. Recovery key

### 6.1 Setup (первый запуск / баннер)
- Баннер (`SecurityBanner`) показывается, пока `setupNeeded`, пока не нажат dismiss (персист в `accounts.securityBannerDismissed`). После dismiss — через настройки.
- Диалог setup: объяснение → «Generate» → **показать ключ единственный раз** (textarea readonly + Copy) → «I saved it». После: `recoveryKeyInMemory = true`, баннер уходит.
- Warning: ключ показывается только в момент генерации; re-reveal не предусмотрен (в RAM; на диске не хранится).

### 6.2 Промпт ключа (unlock)
- Появляется, когда SDK запрашивает ключ (`getSecretStorageKey` → `keyPrompt`): «Введите recovery key» + поле + Submit/Отмена.
- Ошибка «ключ не подошёл» — не закрывать диалог, дать повтор.
- После успеха — `unlockRecovery` кэширует в RAM; флаг `recoveryKeyInMemory`.

### 6.3 Пароль (UIA)
- `requestPassword` — модальный промпт пароля при `bootstrapCrossSigning`, если сервер требует UIA. Пароль **не хранить и не логировать** (Principles §3.2.2).
- Ошибка UIA-неудачи — «повторить/отмена».

### 6.4 Верификация сессии (виджет в шапке списка комнат)
- **Триггер:** кнопка «!» в общей пилюле шапки рядом с созданием чата, когда `statusLoaded && secretStorageReady && !deviceVerified`. Если 4S не настроен (`setupNeeded`) — кнопки нет, этим владеет `SecurityBanner`.
- **`deviceVerified`** — `getDeviceVerificationStatus(ownUserId, ownDeviceId).crossSigningVerified ?? false` (SDK v42: поле). Обновляется в `cryptoStore.refreshStatus()`.
- **Действие:** клик → `openUnlock()` (RecoveryKeyEntryDialog). После успешного unlock `adoptCrossSigning()` (`bootstrapCrossSigning({ authUploadDeviceSigningKeys })`) → `deviceVerified = true`.
- **После верификации:** кнопка → зелёный «✓» ~450 мс → анимация-улёт → unmount; пилюля сжимается до карандаша создания чата.
- **Запланировано:** верификация со второго устройства (`requestOwnUserVerification`/SAS между своими устройствами), если recovery key недоступен.

### 6.5 Хранение, ротация, сброс
- Recovery key живёт в RAM (`cachedKey`/`provisionalKey`) на время сессии; при выходе (`detachSecurity`) — очищается.
- Ротация: `bootstrapSecretStorage` с новым `createSecretStorageKey` — future.
- Сброс cross-signing — только в продвинутых настройках с подтверждением.

---

## 7. Привязка к дизайн-системе (03-DESIGN.md)

- **Токены:** `var(--accent-color)`, `--glass-bg`, `--glass-border`, `--text-primary`; утилиты `border-[var(--glass-border)] bg-[var(--glass-bg)]`.
- **Диалоги:** единый шаблон (overlay `bg-black/60` + панель `max-w-md` + кнопки) — см. crypto-диалоги.
- **Half-светлая тема для QR:** панель QR остаётся светлой даже в dark mode (контраст для камеры).
- **Accessibility:** закрыть A1–A4, I5–I10 из 03-DESIGN.md для всех новых диалогов.
- **Safe area / small screens:** диалог верификации помещается на 320px без горизонтального скролла (эмодзи-строка переносится на 2 ряда).

---

## 8. Бэклог «хорошего UI» (по ценности)

1. VerificationDialog: toast на cancelled/mismatch + защита двойного клика (частично — фаза `done`).
2. Trust-легенда и тултипы у щитков.
3. needsUserApproval баннер в DM/группе (Verify / Pin).
4. QR-доработки: ошибки §4.3, кнопка «Показать свой код», дебаунс/стабильный кадр jsQR.
5. QSS-вход в верификацию из диалога «новое устройство» (`requestOwnUserVerification`); SAS/QR-подтверждение между своими устройствами, когда recovery key недоступен.
6. Trust-панель участников/устройств (список, фильтры, fingerprint).
7. Общий Dialog-компонент и инпут-компонент (шест для recovery key).
8. Loading/empty states диалогов.
9. Стресс-обновление trust: батчить `ensureTrust`, LRU вместо unbounded Map (пока `ponytail: Map по сессии, LRU если комнаты > 100 участников`).

**Уже закрыто (не переделывать):** SAS-флоу (`runSasVerification`), QR-флоу show/scan (5.1c), recovery-флоу (setup/unlock/UIA), trust-кэш (`verificationStore`), ленивый загруз доверия в Timeline, shield-иконка.

---

## 9. Тестирование

Паттерны в репо — копировать:

| Что тестить | Файл-образец | Приём |
|---|---|---|
| SAS-машина состояний | `src/crypto/verification.test.ts` | FakeRequest/FakeVerifier (мини-emitter `on/off/emit`), cast `as unknown as VerificationRequest` |
| Trust-маппинг | там же | `ensureUserTrust` → `getUserVerificationStatus().isCrossSigningVerified()` |
| Store-состояния | `src/stores/verificationStore.svelte.test.ts` | `vi.mock('$crypto/verification')` + `vi.hoisted` |
| Crypto-моки | `src/crypto/security.test.ts`, `e2ee.test.ts` | типизированные `as unknown as CryptoApi`; `globalThis.crypto.subtle` доступен (НЕ стубить) |
| ВАЖНО | — | `/// <reference types="node" />` в тестах ломает глобальные типы — не использовать |

---

**Конец документа.**
