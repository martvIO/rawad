#!/usr/bin/env node
// Generate an RSA-2048 keypair for the password-encryption layer.
//
//   node backend/scripts/gen-password-keypair.cjs
//
// Set the printed PKCS8 private-key PEM as the PASSWORD_ENC_PRIVATE_KEY secret
// (Google Secret Manager / Firebase functions env), exactly like WEB_API_KEY.
// The matching public key is derived from it automatically and served at
// GET /api/auth/pubkey — you do NOT need to store the public key anywhere.
//
// Keep the private key SECRET. There is NO forward secrecy: a single leak of this
// key retroactively decrypts EVERY password envelope ever captured (in logs etc.).
// The PEM below is printed to stdout — it can land in shell history / terminal
// scrollback / CI logs, so prefer piping it straight into the secret store rather
// than displaying it, e.g.:
//   node backend/scripts/gen-password-keypair.cjs | firebase functions:secrets:set PASSWORD_ENC_PRIVATE_KEY
// Rotating it means generating a new pair and updating the secret; clients fetch
// the fresh public key on their next session.

const crypto = require("node:crypto");

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const privPem = privateKey.export({ type: "pkcs8", format: "pem" });
const pubB64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");

/* eslint-disable no-console */
console.log("# ── Dawa password-encryption keypair ─────────────────────────");
console.log("#");
console.log("# 1) Set the PRIVATE key as the PASSWORD_ENC_PRIVATE_KEY secret.");
console.log("#    e.g.  firebase functions:secrets:set PASSWORD_ENC_PRIVATE_KEY");
console.log("#    (paste the full PEM below, including the BEGIN/END lines)");
console.log("#");
console.log(privPem.trimEnd());
console.log("");
console.log("# 2) Public key (SPKI DER, base64) — FYI only; the server derives");
console.log("#    and serves this from the private key at GET /api/auth/pubkey.");
console.log("#    Non-secret.");
console.log("#");
console.log(pubB64);
/* eslint-enable no-console */
