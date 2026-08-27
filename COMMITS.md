# COMMITS.md — правила коммитов

Единый источник правды по коммитам для ИИ-агентов. Читать перед каждым коммитом.
Вся история репозитория приведена к этим правилам (все коммиты подписаны SSH).

## Hard rules

1. **Один вертикальный слайс — один коммит.** Атомарность: коммит — законченное изменение, не ломающее гейт.
2. **Формат Conventional Commits:** `<type>(<scope>): <subject>`.
   - Subject ≤ 72 симв., повелительное наклонение, с маленькой буквы, без точки в конце. Язык — английский.
   - Подробности — в теле сообщения (пустая строка после subject), язык RU/EN.
3. **Типы:** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `build`, `ci`.
   - `docs` — только правки документации без кода.
   - `chore` — инфраструктура (git, setup, meta).
4. **Scopes** (по слоям проекта): `setup`, `git`, `storage`, `sync`, `stores`, `ui`, `crypto`, `data-model`, `roadmap`, `handoff`, `meta`. Новый scope — только если не подходит существующий.
5. **Авторство** — по типу коммита (таблица ниже): код пишет владелец репо, доки пишет `OpenCode`. Identity и подпись настраиваются per-repo через **local** git-config (см. раздел «Identity & Signing Bootstrap»), не global; автора задавать только при создании коммита (`--author`). Контрибьютор ОБЯЗАН указать свою личность через bootstrap.
6. **Подписи:** каждый коммит подписывается SSH-ключом (`commit.gpgsign=true`, `gpg.format=ssh`, `user.signingkey` — публичный SSH-ключ, зарегистрированный на GitHub как signing-ключ; `gpg.ssh.allowedsignersfile` задан). Ключ резолвится процедурой bootstrap (не по имени файла!). Подпись не отключать. SSH-ключ должен быть в `ssh-agent`. На GitHub коммит показывается Verified.
7. **Гейт:** pre-commit хук прогоняет `pnpm run check && pnpm test && pnpm run lint`. Коммитить только при 100% зелёном прогоне. `--no-verify` / `--no-hooks` запрещены.
8. **Пуш агента:** коммиты — локальные и свободные, но в `origin` пушить только после явного словесного подтверждения пользователя («пушь», «да»). Bypass в Ruleset даёт право, но не отменяет процессного правила.

## Авторство: код vs документация

| Коммит | Автор | Трейлер `Co-authored-by` |
| --- | --- | --- |
| Код (`feat`/`fix`/`refactor`/`chore` по коду, `test`) | владелец репо (см. `git log`) | ровно одна строка: `Co-authored-by: OpenCode <opencode-agent[bot]@users.noreply.github.com>` |
| Код — сторонний разработчик | разработчик (см. `git log`) | ровно одна строка: `Co-authored-by: OpenCode <opencode-agent[bot]@users.noreply.github.com>` |
| Доки (`docs(...)`, правки `AGENTS.md`/`HANDOFF.md`/`COMMITS.md`/файлов в `docs/`) | `OpenCode <opencode-agent[bot]@users.noreply.github.com>` | нет |

- **Подпись docs-коммитов:** у бота `OpenCode` нет собственного SSH-ключа, поэтому docs-коммиты физически подписываются ключом активного человека-оператора (см. bootstrap) — на GitHub они показываются Verified под его аккаунтом. Поле `author` остаётся `OpenCode`.

  - **Как определить значения плейсхолдеров:** не подставляй `<repo-owner>`, `<GitHub noreply>`, `<GitHub bot-noreply>` буквально. Реальные значения резолвятся в рантайме процедурой bootstrap (см. ниже) из `gh` CLI / локального git-config — не из `git log` (история может быть пустой или перемешана с ботом). Конкретно:
  - `<repo-owner>` и `<GitHub noreply>` — владелец репозитория; noreply-адрес формата `<id>+<username>@users.noreply.github.com`.
  - `<GitHub bot-noreply>` — `opencode-agent[bot]@users.noreply.github.com` (бот OpenCode). Используется как автор док-коммитов и в трейлере `Co-authored-by` код-коммитов.
- **Приватность:** по умолчанию в авторских строках используются только GitHub noreply-адреса (приватность). Разработчик вправе использовать свой реальный email, верифицированный на его GitHub-аккаунте — для этого достаточно задать `git config --local user.email` (или глобальный) перед bootstrap; процедура использует его как есть. Неверифицированные/чужие email не допускаются (сломают Verified). Личные данные в коммитируемые файлы репозитория не попадают: реестр личностей не хранится в репо, всё резолвится в рантайме.
- **Код-коммит:** автор по умолчанию — владелец репо (из `git log`); трейлер — в конце сообщения, после пустой строки, не дублировать.
- **Код-коммит стороннего разработчика:** автор — сам разработчик (его имя/email), трейлер `Co-authored-by: OpenCode` обязателен.
- **Док-коммит:** создавать с явным автором:
  `git commit --author="OpenCode <opencode-agent[bot]@users.noreply.github.com>"`
- **Не смешивать:** правки `.md` (документация) и `src/` (код) в одном коммите запрещены — разбивай на `docs(...)` и `feat/fix/...`. Исключение — только обновление `AGENTS.md`/`HANDOFF.md` одновременно с правилами, которые они описывают.

## Identity & Signing Bootstrap

Выполнять перед первым коммитом в сессии (idempotent, без создания файлов в репо). Личность и ключ резолвятся в рантайме из `gh`/локального git-config — в репозиторий ничего не попадает.

1. **Роль.** Определить по `gh` (owner/repo — из `git remote get-url origin`):
   ```sh
   owner=$(gh api repos/{owner}/{repo} --jq .owner.login)
   me=$(gh api user --jq .login)
   # repo-owner если $owner == $me, иначе contributor
   ```
   Docs-коммиты всегда authored `OpenCode <opencode-agent[bot]@users.noreply.github.com>`.

2. **Личность (без ручного файла).** Приоритет:
   - `git config --local user.email` задан → использовать как есть (реальный или noreply — выбор разработчика);
   - иначе `gh` авторизован → `email="$(gh api user --jq .id)+$(gh api user --jq .login)@users.noreply.github.com"`, `name="$(gh api user --jq .login)"`;
   - иначе спросить один раз.
   Реальный email допустим только если верифицирован на GitHub-аккаунте (иначе нарушится Verified).

3. **Ключ (без перебора по имени).** Загрузить в агент и сверить с GitHub:
   ```sh
   ssh-add -L                                   # загруженные публичные ключи
   gh api user/ssh_signing_keys --jq '.[].key'  # signing-ключи аккаунта
   ```
   Взять тот публичный ключ из `ssh-add -L`, который есть в списке signing-ключей аккаунта. Если приватника нет в агенте — `ssh-add ~/.ssh/<файл>`. Назначить:
   ```sh
   git config --local user.signingkey "<совпавший публичный ключ>"
   ```

4. **Local git-config** (не global):
   ```sh
   git config --local user.name "$name"
   git config --local user.email "$email"
   git config --local gpg.format ssh
   git config --local commit.gpgsign true
   git config --local gpg.ssh.allowedsignersfile ~/.ssh/allowed_signers
   ```
   Дописать в `~/.ssh/allowed_signers` (если нет):
   ```sh
   echo "$email $(echo "<публичный ключ>" | awk '{print $1, $2}')" >> ~/.ssh/allowed_signers
   ```

5. **Чиним баг `core.sshcommand`:** если он указывает на несуществующий путь (напр. `/home/macos/...` на macOS) — сбросить:
   ```sh
   sshpath=$(git config --local core.sshcommand | grep -oP "(?<=ssh -i ')[^']+")
   [ -f "$sshpath" ] || git config --local --unset core.sshcommand
   ```

6. **Проверка:** `git log --show-signature -1` на любом подписанном коммите → `%G?` = `G`.

## Работа с несколькими разработчиками

- **Доверенный агент (владелец репо):** пушит напрямую в `main` без PR (bypass в Ruleset) — **только после явного словесного подтверждения пользователя**. Это единственный путь прямого пуша; ветки для работы агента не создаются.
- **Люди (контрибьюторы):** в `main` напрямую не пушат; каждый слайс/фича — ветка от `main` → pull request → минимум 1 approval от владельца репо → merge. После merge ветка удаляется (remote-ветки не копим). Перед работой контрибьютор настраивает identity+подпись через bootstrap (см. раздел «Identity & Signing Bootstrap») — роль определится автоматически (`contributor`).
- **CI обязателен:** гейт (`check`, `test`, `lint`) прогоняется GitHub Actions на push и PR; для PR-веток branch protection требует зелёный статус `gate`.
- **Правило 7 (гейт) действует всегда:** локально `pnpm run check && pnpm test && pnpm run lint` перед push; `--no-verify` / `--no-hooks` запрещены у всех.
- Подпись SSH — у каждого разработчика своя (см. `CONTRIBUTING.md`).

## Порядок (TDD)

1. Падающий тест в Vitest → 2. минимальная реализация → 3. рефакторинг → 4. гейт зелёный → 5. коммит.

## Проверки перед push

- Пуш без явного словесного подтверждения пользователя запрещён — сначала спросить и дождаться «да».
- `git log --format='%h | %G? | %an | %s'` — подписи `G`; автор: код — владелец репо, доки — `OpenCode`.
- `git log --format='%ae' | sort -u` — только noreply-адреса (никаких личных email).
- `git fetch` перед push; `--force`/`--force-with-lease` — только по явному запросу.

## Чеклист перед коммитом

- [ ] один слайс/фича, атомарно
- [ ] `<type>(<scope>): <subject>`, subject ≤ 72 симв., английский
- [ ] код и доки не смешаны
- [ ] автор: код — владелец репо (из `git log`), доки — `OpenCode <opencode-agent[bot]@users.noreply.github.com>`
- [ ] трейлер: код — ровно 1, доки — 0
- [ ] подпись SSH (Verified)
- [ ] гейт зелёный без `--no-verify`
