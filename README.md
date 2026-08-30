# Matrix PWA

_A privacy-first chat client for the Matrix network, built as a web app._

[![CI](https://github.com/id7392x/matrix-pwa/actions/workflows/gate.yml/badge.svg)](https://github.com/id7392x/matrix-pwa/actions/workflows/gate.yml)
[![License: AGPL-3.0](https://img.shields.io/github/license/id7392x/matrix-pwa)](LICENSE)

Matrix is an open network for chat — think of it like email, but for messaging.
Your messages live on a server you choose, yet you can talk to anyone in the
network, no matter which server they use. No one owns the network.

This app is a client for that network. You sign in with your Matrix account and
chat with people across the whole network — right in your browser, with
end-to-end encryption on by default.

> **Status:** active development. It's a working MVP — not yet ready as a daily
> driver. New features ship slice by slice (see [the roadmap](docs/04-ROADMAP.md)).

## What works today

- **Log in with your Matrix account** — password or SSO. Your session survives a
  browser restart.
- **See your rooms and unread messages** in one list.
- **Send and receive messages instantly** (they appear immediately, even before
  the network confirms).
- **End-to-end encryption** — messages are sealed like an envelope; only you and
  the recipient can read them, not even the servers. Includes device
  verification (emoji or QR scan) and an account recovery key.

## What's coming next

- Chat history, pagination and a media cache
- Creating and joining rooms, invites
- Custom chat folders (sections in the room list)
- Syncing across multiple browser tabs
- Group video calls (after the MVP)

## Try it

Requires **Node.js 24** and **pnpm 10**.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:5173> and sign in with any Matrix account.

| Command          | What it does                        |
|------------------|-------------------------------------|
| `pnpm dev`       | dev server at http://localhost:5173 |
| `pnpm run check` | type-check and diagnostics          |
| `pnpm test`      | run the test suite                  |
| `pnpm run lint`  | lint                                |
| `pnpm build`     | production build                    |

## For developers

- **Stack:** Svelte 5 (Runes) · TypeScript (strict) · Vite · Tailwind CSS ·
  Dexie 4 (IndexedDB) · matrix-js-sdk v42 · Vodozemac WASM (E2EE)
- **Quality gate:** every commit must pass `check`, `test`, `lint` — enforced
  by a pre-commit hook and GitHub Actions.
- **Architecture docs:** [00 — Principles](docs/00-PRINCIPLES.md) ·
  [01 — Architecture](docs/01-ARCHITECTURE.md) ·
  [02 — Data model](docs/02-DATA-MODEL.md) ·
  [03 — Reference code](docs/03-REFERENCE-CODE.md) ·
  [04 — Roadmap](docs/04-ROADMAP.md) ·
  [05 — E2EE UI](docs/05-UI-E2EE.md)

## License

AGPL-3.0 — see [LICENSE](LICENSE).