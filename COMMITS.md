# COMMITS.md — правила коммитов

Единый источник правды по коммитам для ИИ-агентов. Читать перед каждым коммитом.
Вся история репозитория приведена к этим правилам (16 коммитов, все подписаны SSH).

## Hard rules

1. **Один вертикальный слайс — один коммит.** Атомарность: коммит — законченное изменение, не ломающее гейт.
2. **Формат Conventional Commits:** `<type>(<scope>): <subject>`.
   - Subject ≤ 72 симв., повелительное наклонение, с маленькой буквы, без точки в конце. Язык — английский.
   - Подробности — в теле сообщения (пустая строка после subject), язык RU/EN.
3. **Типы:** `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `build`, `ci`.
   - `docs` — только правки документации без кода.
   - `chore` — инфраструктура (git, setup, meta).
4. **Scopes** (по слоям проекта): `setup`, `git`, `storage`, `sync`, `stores`, `ui`, `crypto`, `data-model`, `roadmap`, `handoff`, `meta`. Новый scope — только если не подходит существующий.
5. **Авторство** — по типу коммита (таблица ниже): код пишет `<repo-owner>`, доки пишет `OpenCode`. Глобально git-identity не менять; автора задавать только при создании коммита (`--author`).
6. **Подписи:** каждый коммит подписывается SSH-ключом (`commit.gpgsign=true`, `gpg.format=ssh`) — на GitHub стоит галка Verified. Подпись не отключать. Коммиттер всегда `<repo-owner>` — его SSH-ключ зарегистрирован на аккаунте GitHub.
7. **Гейт:** pre-commit хук прогоняет `pnpm run check && pnpm test && pnpm run lint`. Коммитить только при 100% зелёном прогоне. `--no-verify` / `--no-hooks` запрещены.

## Авторство: код vs документация

| Коммит | Автор | Трейлер `Co-authored-by` |
| --- | --- | --- |
| Код (`feat`/`fix`/`refactor`/`chore` по коду, `test`) | `<repo-owner> <<GitHub noreply>>` | ровно одна строка: `OpenCode <opencode-agent[bot]@users.noreply.github.com>` |
| Доки (`docs(...)`, `chore(meta): refresh repo map`, правки `AGENTS.md`/`HANDOFF.md`/`COMMITS.md`/файлов в `docs/`) | `OpenCode <opencode-agent[bot]@users.noreply.github.com>` | нет |

- **Код-коммит:** автор по умолчанию `<repo-owner>`; трейлер — в конце сообщения, после пустой строки, не дублировать.
- **Док-коммит:** создавать с явным автором:
  `git commit --author="OpenCode <opencode-agent[bot]@users.noreply.github.com>"`
- **Не смешивать:** правки `.md` (документация) и `src/` (код) в одном коммите запрещены — разбивай на `docs(...)` и `feat/fix/...`. Исключение — только обновление `AGENTS.md`/`HANDOFF.md` одновременно с правилами, которые они описывают.

## Порядок (TDD)

1. Падающий тест в Vitest → 2. минимальная реализация → 3. рефакторинг → 4. гейт зелёный → 5. коммит.

## Проверки перед push

- `git log --format='%h | %G? | %an | %s'` — подписи `G`; автор: код `<repo-owner>`, доки `OpenCode`.
- `git log --format='%ae' | sort -u` — только `<GitHub noreply>` и `opencode-agent[bot]@users.noreply.github.com`.
- `git fetch` перед push; `--force`/`--force-with-lease` — только по явному запросу.

## Чеклист перед коммитом

- [ ] один слайс/фича, атомарно
- [ ] `<type>(<scope>): <subject>`, subject ≤ 72 симв., английский
- [ ] код и доки не смешаны
- [ ] автор: код — `<repo-owner>`, доки — `OpenCode`
- [ ] трейлер: код — ровно 1, доки — 0
- [ ] подпись SSH (Verified)
- [ ] гейт зелёный без `--no-verify`
