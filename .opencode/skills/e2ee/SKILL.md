---
name: e2ee
description: E2EE cold start, UTD handling, re-decryption, Vodozemac/WASM integration for matrix-pwa. Use when touching src/crypto/*, initRustCrypto, encrypted events, or writing tests for E2EE.
metadata:
  version: 1.0.0
---

# E2EE — matrix-pwa

## When to Use

- Working on `src/crypto/e2ee.ts` or any file involving `initRustCrypto`
- Writing tests for encrypted events, UTD states, or re-decryption
- Debugging crypto init order, storePrefix isolation, or WASM loading
- Touching `E2EEHandle` / `createE2EE` or the fake crypto client in tests

## Architecture

- **Interface:** `E2EEHandle` (src/crypto/e2ee.ts)
- **Implementation:** `src/crypto/e2ee.ts` (Слайс 5)
- **WASM:** Vodozemac via `matrix-js-sdk`, lazy loaded via `initRustCrypto`
- **Store prefix:** `matrix-js-sdk:crypto:${userId}:${deviceId}` — per account+device isolation, shared store FORBIDDEN (00 §3.3.1)

## Init Order (strict, no exceptions)

```
1. createClient(config)          — SDK client created, no crypto yet
2. initRustCrypto({ storePrefix }) — async, loads WASM, initializes crypto store
3. startClient(since)            — ONLY after initRustCrypto resolves
```

Events from `/sync` must NOT be processed until `cryptoReady` flag is set. Queue them if they arrive early.

## UTD Lifecycle

```
Event arrives encrypted, no key
  → UTD (Unable To Decrypt)
  → Temporary UTD: 30s timer, auto key request (m.room_key_request)
  → If no key arrives in 30s → Permanent UTD (shown in UI)
  → Key arrives later → re-decryption → Event.decrypted fires
  → Update EventModel.content, re-push to stores via BatchedStoreManager
```

## Content Semantics

- `EventModel.isEncrypted: true` — always for encrypted events
- `EventModel.content` — decrypted content after re-decryption; encrypted envelope NOT stored (minimize persistence)
- `EventModel.decryptionError` — set on UTD, cleared on re-decryption

## Testing Pattern

**WASM does NOT load in Vitest.** This is a hard constraint, not a hack.

- Unit tests: mock `CryptoApi` (`as unknown as CryptoApi`) from `matrix-js-sdk`; fake client/verifier in `e2ee.test.ts`
- TDD: write mock contract test first, then implementation
- `vite.config.ts` requirements (DO NOT REMOVE):
  - `resolve.conditions: ['browser']`
  - `test.server.deps.inline: [/matrix-js-sdk/]`

## Key Gotchas

1. `initRustCrypto` is async — must complete before `startClient`. Awaiting it is not optional.
2. `storePrefix` MUST include `userId` + `deviceId`. Shared store = crypto collision between accounts.
3. Events before crypto ready: queue them, process after `initRustCrypto` resolves. Don't drop them.
4. UTD timer: use `setTimeout` with cleanup on re-decryption, not `interval`.
5. Re-decryption: check if event already in stores (dedup by `event_id`) before writing.
6. After re-decryption, the encrypted envelope (`m.room.encrypted` content) is NOT kept in `events` table.
7. `matrix-js-sdk` ESM imports with directory patterns (`../http-api`) fail in Node — needs `test.server.deps.inline`.
8. Cross-Signing, SAS/QR, Recovery Key are sub-tasks of Слайс 5, not separate slices.

## References

- `docs/04-ROADMAP.md` §8 — full spec (TDD contracts, DoD, key decisions)
- `src/crypto/e2ee.ts` — `createE2EE` / `E2EEHandle` (Слайс 5, TDD-contracts из §8)
- `docs/00-PRINCIPLES.md` §3.3.1 — storePrefix isolation rule
- `docs/01-ARCHITECTURE.md` §4 — E2EE architecture layer
