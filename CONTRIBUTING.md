# Contributing — matrix-pwa

Онбординг для разработчиков. Правила коммитов — в `COMMITS.md` (обязательны к прочтению). Требования и архитектура — в `AGENTS.md` и `docs/00–04`.

> Работаешь через ИИ-агента (OpenCode, Claude Code и т.п.)? Экскурс по проекту, состояние и правила за тебя развернёт твой агент: просто начни сессию со слов **«я mtwave»** (треки участников — в `AGENTS.md`, состояние — в `HANDOFF.md`/`HANDOFF-MTWAVE.md`).

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

Каждый коммит подписывается SSH-ключом (branch protection требует signed commits):

```sh
git config user.name "Твоё имя"
git config user.email "<id>+<username>@users.noreply.github.com"   # GitHub noreply, не личная почта
git config commit.gpgsign true
git config gpg.format ssh
```

- Email автора — **GitHub noreply-адрес** (GitHub → Settings → Emails → «Keep my email addresses private»): репозиторий публичный, личные email в историю коммитов не попадают.

- Загрузи публичный ключ в GitHub → Settings → SSH and GPG keys → New SSH signing key.
- Проверка подписи: `git log --format='%h | %G?'` — должно быть `G` (Verified).
- Внутри репозитория автор коммита задаётся твоим именем/email; трейлер `Co-authored-by: OpenCode` обязателен для код-коммитов (см. `COMMITS.md`).

## Воркфлоу (люди: ветка + PR)

Автоматизированный агент (`<repo-owner>`) пушит в `main` напрямую — это доверенный путь, для него PR не нужен. Людям — в т.ч. `MTWave` — прямой пуш запрещён (Ruleset):

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
