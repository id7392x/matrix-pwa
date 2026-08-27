# Contributing — matrix-pwa

Онбординг для разработчиков. Правила коммитов — в `COMMITS.md` (обязательны к прочтению). Требования и архитектура — в `AGENTS.md` и `docs/00–04`.

> Работаешь через ИИ-агента (OpenCode, Claude Code и т.п.)? Экскурс по проекту, состояние и правила за тебя развернёт твой агент: просто начни сессию со слов **«я <ник>»** (треки участников — в `AGENTS.md`, состояние — в `HANDOFF.md`/`HANDOFF-<ник>.md`).

## Начало работы

1. Клонируй репозиторий и установи зависимости:

   ```sh
   git clone git@github.com:<repo-owner>/matrix-pwa.git
   cd matrix-pwa
   pnpm install
   ```

2. Проверь, что гейт зелёный:

   ```sh
   pnpm run check && pnpm test && pnpm run lint
   ```

   Pre-commit хук прогоняет те же проверки автоматически на каждом коммите.

## Git-идентичность и подпись коммитов

Каждый коммит подписывается SSH-ключом. Настройка выполняется **автоматически** процедурой **Identity & Signing Bootstrap** из `COMMITS.md` — нужны `gh` CLI с `gh auth login` и SSH-signing-ключ, зарегистрированный на GitHub. Личность и ключ резолвятся из `gh`/локального git-config, ничего ручного создавать не надо. По умолчанию используется noreply-адрес; если хочешь реальный email — задай `git config --local user.email` (верифицированный на GitHub) перед bootstrap.

Проверка: `git log --format='%h | %G?'` — должно быть `G` (Verified).

## Воркфлоу (люди: ветка + PR)

Автоматизированный агент (`<repo-owner>`) пушит в `main` напрямую — это доверенный путь, для него PR не нужен. Людям — прямой пуш запрещён (Ruleset):

1. Создай ветку от `main`: `git checkout -b feature/<описание>`.
2. Работай по текущему слайсу из `docs/04-ROADMAP.md` и правилам `AGENTS.md` (TDD, типизация, blast radius).
3. Локально прогони гейт: `pnpm run check && pnpm test && pnpm run lint`.
4. Запушь ветку: `git push -u origin <ветка>` и открой pull request.
5. Дождись зелёного CI-статуса `gate` и одобрения `<repo-owner>`.
6. После merge ветка удаляется (в remote лишние ветки не оставляем).

Правила коммитов (формат, scopes, авторство, трейлеры) — в `COMMITS.md`.

## Локальный dev против реального homeserver (Слайс 2)

1. Скопируй `.env.example` в `.env` и заполни реальные значения (`.env` в `.gitignore`, в коммиты не попадает):

   ```sh
   cp .env.example .env
   ```

   - `HOMESERVER` — base URL сервера (например `https://matrix.org`).
   - `USER_ID` — полный Matrix ID (`@user:server`).
   - `ACCESS_TOKEN` — access token аккаунта.

2. `pnpm dev` — UI на `http://localhost:5173`; токен также можно ввести прямо в форме логина.
