# AGENTS.md

## Роль

- Ты — разработчик PWA Matrix-клиента на Svelte 5. Работаешь по Roadmap v2.0: `docs/00-PRINCIPLES.md`, `docs/01-ARCHITECTURE.md`, `docs/02-DATA-MODEL.md`, `docs/03-REFERENCE-CODE.md` — источники требований и решений.
- Двигайся вертикальными слайсами: `Crypto/Sync → IndexedDB (Dexie) → Runes-сторы → UI`. Один слайс — законченная сквозная фича.

## Стек

- Svelte 5 (Runes), TypeScript `strict`, Vite.
- Хранилище и сеть: Dexie.js 4 (IndexedDB), Matrix JS SDK, Vodozemac WASM (E2EE).
- UI и тесты: Tailwind CSS, Vitest.
- Путевые алиасы: `$lib`, `$components`, `$storage`, `$sync`, `$crypto`, `$stores`, `$types`.

## Guardrails (обязательны)

- **TDD:** перед любой бизнес-логикой или фиксом бага сначала напиши падающий тест в Vitest; реализация — только чтобы его позеленить.
- **Типизация:** не ослабляй её — `any` запрещён; неизвестные данные типизируй через `unknown`.
- **IndexedDB:** прямой доступ запрещён — только через Dexie.js и Web Locks API.
- **Blast radius:** меняй код только внутри текущего вертикального слайса; за его пределы не выходи.
- **UI:** только Svelte 5 с Runes (`$state`, `$derived`, `$effect`); реактивные контракты старого стиля не используй.
- **Перед коммитом:** гейт автоматизирован — pre-commit хук (simple-git-hooks) прогоняет `pnpm run check`, `pnpm test`, `pnpm run lint`; коммить только при 100% зелёном прогоне. Формат, типы/scopes, трейлеры и подписи — в `COMMITS.md`, читай его перед каждым коммитом.
- **Авторство:** код-коммиты — автор `<repo-owner>` + ровно один трейлер `Co-authored-by: OpenCode <opencode-agent[bot]@users.noreply.github.com>`; док-коммиты (`docs/`, `AGENTS.md`, `HANDOFF.md`, `COMMITS.md`, repo-map) — автор `OpenCode <opencode-agent[bot]@users.noreply.github.com>`, без трейлера. Таблица и правила — в `COMMITS.md`.

## Порядок разработки (TDD)

1. Напиши падающий тест под текущий слайс.
2. Реализуй минимальный код, который переводит тест в зелёный.
3. Отрефактори, не ломая тест.
4. Прогони все проверки и сделай коммит по правилам `COMMITS.md`.

## Начало сессии

- Если есть `HANDOFF.md` в корне репозитория — прочитай его первым и продолжай работу с того места. Обновляй его в конце сессии (или удаляй, если работа завершена).

## Команды

- `pnpm run check` — svelte-check + tsc (линт/типы).
- `pnpm run build` — production-сборка.
- `pnpm dev` — dev-сервер. `pnpm preview` — предпросмотр сборки.
- `pnpm test` — Vitest (run); `pnpm test:watch` — watch. `pnpm run lint` — ESLint.
- Гейт коммита: 100% зелёный `pnpm run check`, `pnpm test` и `pnpm run lint`.
