# AGENTS.md

## Роль

- Ты — разработчик PWA Matrix-клиента на Svelte 5. Работаешь по Roadmap v2.0: `docs/00-PRINCIPLES.md`, `docs/01-ARCHITECTURE.md`, `docs/02-DATA-MODEL.md`, `docs/03-REFERENCE-CODE.md`, `docs/04-ROADMAP.md` — источники требований и решений для вертикальных слайсов.
- Инструменты MCP (context7, sveltejs, stitch), внешний reference element-web и правила их использования — `docs/06-TOOLS.md`.
- Двигайся вертикальными слайсами: `Crypto/Sync → IndexedDB (Dexie) → Runes-сторы → UI`. Один слайс — законченная сквозная фича.

## Участники и вход

| Ник | Трек | Статус |
|---|---|---|
| `<repo-owner>` | основной разработчик (по умолчанию) | активен; прямой пуш в `main` (bypass), пуш — с подтверждения (см. Guardrails) |
| `<contributor>` | контрибьютор (любой сторонний разработчик) | вход через ИИ-агента или вручную |

- Вход в трек — представление ником («я <ник>»). После представления:
  1. Прочитай `HANDOFF-<ник>.md` (создай из шаблона `HANDOFF-CONTRIBUTOR.md`, если отсутствует).
  2. Проведи экскурсию по проекту (§2 `HANDOFF.md`): состояние, стек, команды, правила, следующий шаг.
  3. Работай по треку этого участника: его слайсы, его правила пуша, его авторство.
- Ник не назван → по умолчанию трек `<repo-owner>` (`HANDOFF.md`).
- Ник не из таблицы → веди как `<repo-owner>`, предложи представиться.

## Стек

- Svelte 5 (Runes), TypeScript `strict`, Vite.
- Хранилище и сеть: Dexie.js 4 (IndexedDB), Matrix JS SDK, Vodozemac WASM (E2EE).
- UI и тесты: Tailwind CSS, Vitest.
- Путевые алиасы: `$lib`, `$components`, `$storage`, `$sync`, `$crypto`, `$stores`, `$types`.

## Guardrails (обязательны)

- **TDD:** падающий тест → минимальная реализация → рефакторинг. См. skill `ponytail`.
- **Типизация:** `any` запрещён; неизвестные данные — `unknown`.
- **Токены:** accessToken — только RAM/sessionStorage; refreshToken — только `accounts.refreshToken`. Пароль не хранить и не логировать.
- **IndexedDB:** только через Dexie.js + Web Locks API.
- **Blast radius:** меняй код только в текущем слайсе.
- **UI:** только Svelte 5 Runes.
- **Коммиты и авторство** — `COMMITS.md` (читать перед каждым коммитом).
- **Пуш:** коммиты локально; в `origin` — только после явного подтверждения пользователя.

## Начало сессии

- Определи участника: пользователь представился ником → его трек (`HANDOFF-<ник>.md`); ник не назван → трек `<repo-owner>`.
- Общее состояние проекта — в `HANDOFF.md` (§1–3); состояние трека — в `HANDOFF-<ник>.md`.
- Если есть `HANDOFF-<ник>.md` — читай его первым и продолжай с места остановки трека. Обновляй его в конце сессии (или удаляй, если трек завершён).
- Перед коммитами выполни **Identity & Signing Bootstrap** из `COMMITS.md` (idempotent: резолвит личность и ключ локально через `~/.ssh` + ssh-agent, ставит local git-config, чинит `core.sshcommand`). Если ключей несколько — спроси разработчика, какой брать; не гадай.

## Команды

- `pnpm run check` — svelte-check + tsc (линт/типы).
- `pnpm run build` — production-сборка.
- `pnpm dev` — dev-сервер. `pnpm preview` — предпросмотр сборки.
- `pnpm test` — Vitest (run); `pnpm test:watch` — watch. `pnpm run lint` — ESLint.
- Гейт коммита: 100% зелёный `pnpm run check`, `pnpm test` и `pnpm run lint`.
