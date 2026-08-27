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

  - **Как определить значения плейсхолдеров:** не подставляй `<repo-owner>`, `<GitHub noreply>`, `<GitHub bot-noreply>` буквально. Реальные значения резолвятся в рантайме процедурой bootstrap (см. ниже) из локального git-config / опроса разработчика — не из `git log` (история может быть пустой или перемешана с ботом). Конкретно:
  - `<repo-owner>` и `<GitHub noreply>` — владелец репозитория; noreply-адрес формата `<id>+<username>@users.noreply.github.com`.
  - `<GitHub bot-noreply>` — `opencode-agent[bot]@users.noreply.github.com` (бот OpenCode). Используется как автор док-коммитов и в трейлере `Co-authored-by` код-коммитов.
- **Приватность:** по умолчанию в авторских строках используются только GitHub noreply-адреса (приватность). Разработчик вправе использовать свой реальный email, верифицированный на его GitHub-аккаунте — для этого достаточно задать `git config --local user.email` (или глобальный) перед bootstrap; процедура использует его как есть. Неверифицированные/чужие email не допускаются (сломают Verified). Личные данные в коммитируемые файлы репозитория не попадают: реестр личностей не хранится в репо, всё резолвится в рантайме.
- **Код-коммит:** автор по умолчанию — владелец репо (из `git log`); трейлер — в конце сообщения, после пустой строки, не дублировать.
- **Код-коммит стороннего разработчика:** автор — сам разработчик (его имя/email), трейлер `Co-authored-by: OpenCode` обязателен.
- **Док-коммит:** создавать с явным автором:
  `git commit --author="OpenCode <opencode-agent[bot]@users.noreply.github.com>"`
- **Не смешивать:** правки `.md` (документация) и `src/` (код) в одном коммите запрещены — разбивай на `docs(...)` и `feat/fix/...`. Исключение — только обновление `AGENTS.md`/`HANDOFF.md` одновременно с правилами, которые они описывают.

## Identity & Signing Bootstrap

Выполнять перед первым коммитом в сессии (idempotent, без создания файлов в репо, без внешних CLI). Личность и ключ резолвятся локально в рантайме — в репозиторий ничего не попадает. Docs-коммиты всегда authored `OpenCode <opencode-agent[bot]@users.noreply.github.com>`; code — резолвнутым человеком (роль owner/contributor для подписи не нужна).

1. **Личность (без ручного файла).** Приоритет:
   - `git config --local user.email` (или global) задан → использовать как есть (реальный или noreply — выбор разработчика);
   - иначе спросить разработчика один раз (name + email). Подсказать форму `<id>+<login>@users.noreply.github.com`, но не принуждать.
   Реальный email допустим только если верифицирован на GitHub-аккаунте (иначе нарушится Verified).

2. **Ключ — смотрим `~/.ssh` (без догадок).** Перечислить локальные ключи:
   ```sh
   ls ~/.ssh/*.pub
   ```
   - Если **один** `.pub` — взять его.
   - Если **несколько** — **спросить разработчика**, какой использовать (не угадывать).
   Убедиться, что приватный ключ загружен в агент (иначе `ssh-add ~/.ssh/<выбранный>`), и назначить:
   ```sh
   git config --local user.signingkey "~/.ssh/<выбранный>.pub"
   ```
   **Предупреждение:** без внешних сервисов сверить ключ с GitHub нельзя — разработчик сам должен убедиться, что этот ключ зарегистрирован на его аккаунте как SSH signing-ключ, иначе коммит покажет `Unverified`.

3. **Local git-config** (не global):
   ```sh
   git config --local user.name "$name"
   git config --local user.email "$email"
   git config --local gpg.format ssh
   git config --local commit.gpgsign true
   git config --local gpg.ssh.allowedsignersfile ~/.ssh/allowed_signers
   ```
   Дописать в `~/.ssh/allowed_signers` (если нет):
   ```sh
   echo "$email $(cat ~/.ssh/<выбранный>.pub)" >> ~/.ssh/allowed_signers
   ```

4. **Чиним баги путей:** если `core.sshcommand` указывает на несуществующий путь (напр. `/home/macos/...` на macOS) — сбросить:
   ```sh
   sshpath=$(git config --local core.sshcommand | grep -oP "(?<=ssh -i ')[^']+")
   [ -f "$sshpath" ] || git config --local --unset core.sshcommand
   ```
   Аналогично проверить `user.signingkey`: если файл по этому пути не существует — переназначить на валидный `~/.ssh/<выбранный>.pub` (шаг 2) или сбросить:
   ```sh
   [ -f "$(git config --local user.signingkey)" ] || git config --local --unset user.signingkey
   ```

5. **Проверка:** `git log --show-signature -1` на любом подписанном коммите → `%G?` = `G`.

## Работа с несколькими разработчиками

- **Доверенный агент (владелец репо):** пушит напрямую в `main` без PR (bypass в Ruleset) — **только после явного словесного подтверждения пользователя**. Это единственный путь прямого пуша; ветки для работы агента не создаются.
- **Люди (контрибьюторы):** в `main` напрямую не пушат; каждый слайс/фича — ветка от `main` → pull request → минимум 1 approval от владельца репо → merge. После merge ветка удаляется (remote-ветки не копим). Перед работой контрибьютор настраивает identity+подпись через bootstrap (см. раздел «Identity & Signing Bootstrap») и коммитит под своим именем (author = сам разработчик, трейлер `Co-authored-by: OpenCode` обязателен).
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
