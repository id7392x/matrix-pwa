# AGENTS.md

## Роль

- Ты — разработчик PWA Matrix-клиента на Svelte 5. Работаешь по Roadmap v2.0: `docs/00-PRINCIPLES.md`, `docs/01-ARCHITECTURE.md`, `docs/02-DATA-MODEL.md`, `docs/03-REFERENCE-CODE.md`, `docs/04-ROADMAP.md` — источники требований и решений для вертикальных слайсов.
- Двигайся вертикальными слайсами: `Crypto/Sync → IndexedDB (Dexie) → Runes-сторы → UI`. Один слайс — законченная сквозная фича.

## Участники и вход

| Ник | Трек | Статус |
|---|---|---|
| `<repo-owner>` | основной разработчик (по умолчанию) | активен; прямой пуш в `main` (bypass), пуш — с подтверждения (см. Guardrails) |
| `mtwave` | контрибьютор | пока не подключён; вход через ИИ-агента |

- Вход в трек — представление ником («я mtwave», «mtwave»). После представления:
  1. Прочитай `HANDOFF-<ник>.md` (создай из шаблона `HANDOFF.md`, если отсутствует).
  2. Проведи экскурсию по проекту (§2 `HANDOFF.md`): состояние, стек, команды, правила, скиллы, следующий шаг.
  3. Работай по треку этого участника: его слайсы, его правила пуша, его авторство.
- Ник не назван → по умолчанию трек `<repo-owner>` (`HANDOFF.md`).
- Ник не из таблицы → веди как `<repo-owner>`, предложи представиться.

## Стек

- Svelte 5 (Runes), TypeScript `strict`, Vite.
- Хранилище и сеть: Dexie.js 4 (IndexedDB), Matrix JS SDK, Vodozemac WASM (E2EE).
- UI и тесты: Tailwind CSS, Vitest.
- Путевые алиасы: `$lib`, `$components`, `$storage`, `$sync`, `$crypto`, `$stores`, `$types`.

## Guardrails (обязательны)

- **TDD:** перед любой бизнес-логикой или фиксом бага сначала напиши падающий тест в Vitest; реализация — только чтобы его позеленить.
- **Типизация:** не ослабляй её — `any` запрещён; неизвестные данные типизируй через `unknown`.
- **Токены:** accessToken — только RAM/sessionStorage (`mx_token:<userId>`), в IndexedDB/localStorage запрещён (Principles §3.2.1); refreshToken — разрешён только в `accounts.refreshToken` (Principles §3.2.1.1). Пароль нигде не хранить и не логировать.
- **IndexedDB:** прямой доступ запрещён — только через Dexie.js и Web Locks API.
- **Blast radius:** меняй код только внутри текущего вертикального слайса; за его пределы не выходи.
- **UI:** только Svelte 5 с Runes (`$state`, `$derived`, `$effect`); реактивные контракты старого стиля не используй.
- **Перед коммитом:** гейт автоматизирован — pre-commit хук (simple-git-hooks) прогоняет `pnpm run check`, `pnpm test`, `pnpm run lint`; коммить только при 100% зелёном прогоне. Формат, типы/scopes, трейлеры и подписи — в `COMMITS.md`, читай его перед каждым коммитом.
- **Авторство:** код-коммиты — автор `<repo-owner>` + ровно один трейлер `Co-authored-by: OpenCode <opencode-agent[bot]@users.noreply.github.com>`; док-коммиты (`docs/`, `AGENTS.md`, `HANDOFF.md`, `COMMITS.md`) — автор `OpenCode <opencode-agent[bot]@users.noreply.github.com>`, без трейлера. Таблица и правила — в `COMMITS.md`.
- **Пуш — трек `<repo-owner>`:** коммиты делай локально и свободно, но **в `origin` не пуши без явного словесного подтверждения пользователя** («пушь», «да»). Наличие bypass-прав в Ruleset не отменяет это правило.
- **Пуш — трек `mtwave`:** пуши только свои feature-ветки (workflow ветка→PR, `CONTRIBUTING.md`); `main` не пушить никогда.

## Порядок разработки (TDD)

1. Напиши падающий тест под текущий слайс.
2. Реализуй минимальный код, который переводит тест в зелёный.
3. Отрефактори, не ломая тест.
4. Прогони все проверки и сделай коммит по правилам `COMMITS.md`.

## Начало сессии

- Определи участника: пользователь представился ником → его трек (`HANDOFF-<ник>.md`); ник не назван → трек `<repo-owner>`.
- Общее состояние проекта — в `HANDOFF.md` (§1–3); состояние трека — в `HANDOFF-<ник>.md`.
- Если есть `HANDOFF-<ник>.md` — читай его первым и продолжай с места остановки трека. Обновляй его в конце сессии (или удаляй, если трек завершён).

## Команды

- `pnpm run check` — svelte-check + tsc (линт/типы).
- `pnpm run build` — production-сборка.
- `pnpm dev` — dev-сервер. `pnpm preview` — предпросмотр сборки.
- `pnpm test` — Vitest (run); `pnpm test:watch` — watch. `pnpm run lint` — ESLint.
- Гейт коммита: 100% зелёный `pnpm run check`, `pnpm test` и `pnpm run lint`.
