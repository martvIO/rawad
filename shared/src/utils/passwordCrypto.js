// Client-side RSA encryption of password fields before they leave the browser.
//
// Pairs with the backend's api/passwordCrypto.ts + middleware/decryptPasswordFields:
// we fetch the server's RSA public key from GET /auth/pubkey, RSA-OAEP(SHA-256)
// encrypt the password, and wrap it as `enc:v1:<base64>`. The server decrypts it
// in place so its route handlers are unchanged.
//
// SECURITY BOUNDARY — read before trusting this.
// This is defense-in-depth on TOP of HTTPS. It only hardens PASSIVE surfaces:
// plaintext passwords stay out of server/proxy access logs, body-capturing error
// trackers, and a DevTools/proxy inspection view. It does NOT defend against an
// ACTIVE adversary who can already read or modify the request body: that party
// can swap the unauthenticated public key served by /auth/pubkey, or simply force
// the plaintext fallback (a 503/garbage pubkey), since the layer is fail-open by
// design for rollout safety. TLS remains the primary in-transit / anti-MITM
// control. There is also no forward secrecy — a leak of the server's single
// long-lived private key decrypts every previously captured envelope.
//
// It is best-effort: if the server publishes no key (older deploy / secret not
// provisioned), the browser lacks WebCrypto, or encryption otherwise fails, we
// transparently fall back to sending plaintext (still TLS-protected), so login
// NEVER breaks. Every failure path returns null/the original body, never throws.
//
// NOTE: a raw `fetch` (not apiClient) is used for the pubkey GET to avoid a
// circular import (apiClient imports this module).

import { API_BASE_URL } from "../config/index.js";
import { getPasswordEncryptor } from "../adapters/crypto.js";
import { logWarn } from "./logger.js";
import { PRESERVE_KEYS } from "./digits.js";

/** Prefix marking a value as an encrypted-password envelope. Matches the backend. */
const ENVELOPE_PREFIX = "enc:v1:";

// Body fields that carry a password. Reuses the exact set digits.js already
// preserves from digit-normalization, so the two lists never drift.
export const PASSWORD_FIELDS = PRESERVE_KEYS;

// Memoized public-key import. Resolves to a CryptoKey (encryption active) or
// null (unavailable → plaintext fallback). One in-flight promise is shared so
// concurrent logins fetch the key once.
let _keyPromise = null;

// ─── base64 ⇄ bytes (WebCrypto wants ArrayBuffers) ────────────────────────────

function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(buf) {
  const arr = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

// ─── Public-key fetch + import ────────────────────────────────────────────────

async function importPublicKey() {
  const subtle = globalThis.crypto?.subtle;
  const custom = getPasswordEncryptor(); // native (Hermes has no WebCrypto)
  if (!subtle && !custom) return null; // ancient browser / insecure context → plaintext

  let meta;
  try {
    // cache:"no-store" so resetPublicKeyCache() forces a genuine re-fetch (the
    // server may cache the key for proxies; we must not reuse a stale ephemeral
    // key after a dev key rotation triggers the bad_encrypted_field retry).
    const res = await fetch(`${API_BASE_URL}/auth/pubkey`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null; // 503 encryption_unavailable, etc.
    meta = await res.json();
  } catch {
    return null; // network error → plaintext fallback
  }

  if (!meta || typeof meta.key !== "string") return null;
  // Injected platform encryptor (native): keep the raw SPKI base64 — the impl
  // parses it per-encrypt and throws on corruption, which encryptPassword
  // catches (same plaintext fallback as a failing subtle.importKey).
  if (!subtle) return { customKeyB64: meta.key };
  try {
    return await subtle.importKey(
      "spki",
      b64ToBytes(meta.key),
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["encrypt"],
    );
  } catch (err) {
    logWarn("passwordCrypto.importKey", err);
    return null;
  }
}

/** Lazily fetch + import the server public key (memoized). */
export function getPublicKey() {
  if (!_keyPromise) _keyPromise = importPublicKey();
  return _keyPromise;
}

/**
 * Drop the cached key so the next call re-fetches. Called when the server
 * rejects our ciphertext (`bad_encrypted_field`) — e.g. a dev emulator restart
 * rotated its ephemeral key mid-session.
 */
export function resetPublicKeyCache() {
  _keyPromise = null;
}

// ─── Encryption ───────────────────────────────────────────────────────────────

/**
 * Encrypt one password string into an `enc:v1:` envelope, or return null when
 * encryption is unavailable (caller keeps the plaintext).
 */
export async function encryptPassword(plaintext) {
  const key = await getPublicKey();
  if (!key) return null;
  try {
    if (key.customKeyB64) {
      const b64 = await getPasswordEncryptor()(key.customKeyB64, String(plaintext));
      return typeof b64 === "string" && b64 ? ENVELOPE_PREFIX + b64 : null;
    }
    const data = new TextEncoder().encode(String(plaintext));
    const cipher = await globalThis.crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      key,
      data,
    );
    return ENVELOPE_PREFIX + bytesToB64(cipher);
  } catch (err) {
    // RSA-2048 OAEP-SHA256 can encrypt at most 190 plaintext bytes; an unusually
    // long passphrase (or any subtle.encrypt failure) MUST NOT break the request.
    // Return null so the caller keeps the original plaintext (still TLS-protected).
    logWarn("passwordCrypto.encrypt", err);
    return null;
  }
}

/**
 * Return a shallow copy of `body` with every present password field encrypted.
 * No-op fast paths (return the input unchanged):
 *   - body is not a plain object, or has no password field → no pubkey fetch.
 *   - encryption unavailable → plaintext fallback.
 * Already-encrypted values (`enc:v1:`) are left as-is.
 */
export async function encryptPasswordFields(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;

  const fields = [];
  for (const f of PASSWORD_FIELDS) {
    const v = body[f];
    if (typeof v === "string" && v.length > 0 && !v.startsWith(ENVELOPE_PREFIX)) {
      fields.push(f);
    }
  }
  if (fields.length === 0) return body;

  const key = await getPublicKey();
  if (!key) return body; // plaintext fallback

  const out = { ...body };
  for (const f of fields) {
    const enc = await encryptPassword(out[f]);
    if (enc) out[f] = enc;
  }
  return out;
}
