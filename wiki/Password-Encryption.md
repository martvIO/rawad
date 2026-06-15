---
date: 2026-06-13
sources:
  - backend/functions/src/api/passwordCrypto.ts
  - backend/functions/src/api/middleware/decryptPasswordFields.ts
  - frontend/src/utils/passwordCrypto.js
  - loadtest/passwordcrypto.py
tags: [security, auth, crypto, rsa, concept]
---

# Password Encryption

A defense-in-depth layer (commit `dc22fd6`, 2026-06-13) that RSA-encrypts password
fields **before they leave the client**, so a plaintext password never appears in
server/proxy access logs, body-capturing error trackers, or a DevTools/proxy
inspection view. It sits **on top of** the [[Authentication]] flow and the
[[Security Model]] — it is **not** a replacement for HTTPS.

## Envelope format

A password field's value becomes the string `enc:v1:<base64( RSA-OAEP ciphertext )>`.
Anything without the `enc:v1:` prefix is treated as legacy plaintext.

- **Algorithm:** RSA-2048, OAEP padding, SHA-256 for **both** the OAEP hash and
  MGF1, empty label. This exact combination is byte-identical across WebCrypto
  (browser), Node `crypto` (backend), and Python `cryptography` (load test).
- **Public key:** published as SPKI DER (base64) at unauthenticated
  `GET /auth/pubkey` → `{ alg: "RSA-OAEP-256", kid: "v1", key }`. Returns **503
  `encryption_unavailable`** when no key is configured.

## How it flows (3 runtimes)

- **Backend** — `api/passwordCrypto.ts` loads/derives the keypair and decrypts;
  the `decryptPasswordFields` middleware is mounted ahead of `/auth` and `/users`
  in `api/index.ts`, turning any `enc:v1:` envelope back into plaintext in
  `req.body` **before** the route handlers (`isStrongPassword`, Firebase Auth)
  read it — so no handler changed. `GET /auth/pubkey` lives in `routes/auth.ts`.
- **Frontend** — `utils/passwordCrypto.js` (WebCrypto) is hooked into
  `utils/apiClient.js`'s `request()` at the existing `westernizeDeep` transform
  point (see [[Digit Normalization]]), so no [[REST API Architecture|service]]
  call site can forget to encrypt. The field list is `PRESERVE_KEYS` from
  `utils/digits.js` (`password`, `newPassword`, `currentPassword`, …).
- **Load test** — `loadtest/passwordcrypto.py` wires into the bootstrap +
  cleanup logins (see [[Load-Test Dashboard]]); adds the `cryptography` dep.

## Key management & status

- Private key from env `PASSWORD_ENC_PRIVATE_KEY` (PKCS8 PEM), set as a secret
  like `WEB_API_KEY`. Generate with `node backend/scripts/gen-password-keypair.cjs`.
- **Emulator/dev:** an ephemeral keypair is generated at cold start (logged
  DEV-ONLY); `/auth/pubkey` is served `Cache-Control: no-store` so a rotation
  never strands a client on a dead key.
- **Production with no secret:** encryption is **DISABLED** (multi-instance can't
  share an ephemeral key) — clients fall back to plaintext-over-TLS, exactly as
  before, so it is **zero-regression**. `GET /api/health` reports
  `encryption: true|false` so monitoring can catch a deploy that forgot the secret.
- **Status:** committed (`dc22fd6`) but the prod secret is **not yet provisioned**
  → the layer is inert in production until `PASSWORD_ENC_PRIVATE_KEY` is set.

## Rollout gating

Backward-compatible: the server accepts both encrypted and plaintext. Env
`REQUIRE_ENCRYPTED_PASSWORDS=true` makes it reject plaintext on `/auth` + `/users`
(encrypted-only) — flip it on **after** all clients encrypt. The
[[REST API Architecture|apiClient]] retries once on `bad_encrypted_field` (stale
ephemeral key) or `encryption_required` (transient pubkey outage), re-fetching a
fresh key.

## Security boundary (important — what it does NOT do)

This hardens **passive** surfaces only (logs, error-trackers, DevTools). It does
**not** defend against an **active** adversary who can read/modify request bodies:
that party can swap the unauthenticated `/auth/pubkey` key or force the plaintext
fallback. **TLS remains the primary in-transit / anti-MITM control.** There is
**no forward secrecy** — a leak of the single long-lived private key decrypts every
previously captured envelope. Encrypt also **never throws**: an over-length
password (>190 bytes for RSA-2048 OAEP) or any crypto failure degrades to
plaintext so login can't break.

## Adversarial review

A 4-lens multi-agent review (crypto-interop / threat-model / integration /
test-coverage) verified each finding. Real bugs fixed before commit: the
over-length-password crash, pubkey cache staleness (client `no-store` + ephemeral
server `no-store`), the `encryption_required` retry gap, and the `/health`
encryption signal. Honest limitations (passive-only, no forward secrecy) are
documented in code + `CLAUDE.md`. Tests: FE 419 / BE 128 / load-test round-trip
green; live emulator + Playwright confirmed the browser sends `enc:v1:` and login
returns 200.

> Distinct from the parallel [[Audit Remediation 2026]] work — this was a separate
> request and was committed on its own (`dc22fd6`), deploy held.
