// Server-side RSA key handling for the password-encryption layer.
//
// Clients (the browser apiClient + the Python load test) encrypt password
// fields with the server's RSA public key before sending them, so a plaintext
// password never lands in server/proxy access logs, error-tracking that
// captures request bodies, or a DevTools/proxy inspection view. This is
// defense-in-depth ON TOP of HTTPS — TLS is still the primary in-transit
// protection; this keeps plaintext out of at-rest/observability surfaces.
//
// Envelope format (string-valued, so no request body shape changes):
//   enc:v1:<base64( RSA-OAEP-SHA256 ciphertext )>
//
// Key source (single source of truth across all function instances):
//   1. PASSWORD_ENC_PRIVATE_KEY (PKCS8 PEM) — the production secret, set via
//      Secret Manager / functions env exactly like WEB_API_KEY.
//   2. Emulator/dev with no secret → an EPHEMERAL keypair generated at cold
//      start (single local process, safe). Logged as DEV ONLY.
//   3. Production with no secret → encryption DISABLED (we must NOT generate an
//      ephemeral key per instance — different instances would hold different
//      keys and decryption would fail across the autoscaled fleet). Clients
//      then fall back to plaintext (still TLS-protected) until the secret is
//      provisioned. See getPublicKeyMeta()/isEncryptionAvailable().
//
// Interop: RSA-2048, OAEP padding, SHA-256 for both the OAEP hash and MGF1,
// empty label — the exact combination WebCrypto (`{name:'RSA-OAEP',
// hash:'SHA-256'}`) and Python `cryptography` (OAEP/MGF1/SHA256) produce, and
// that Node's privateDecrypt with `oaepHash:'sha256'` consumes.
//
// SECURITY BOUNDARY: this hardens PASSIVE surfaces only (logs, body-capturing
// error trackers, DevTools). It does NOT defend against an active adversary who
// can read/modify request bodies — that party can swap the unauthenticated
// /auth/pubkey key or force the plaintext fallback. TLS is the primary control.
// There is no forward secrecy: a leak of this single long-lived private key
// decrypts every previously captured envelope.

import * as crypto from "node:crypto";

/** Prefix that marks a string value as an encrypted-password envelope. */
export const ENVELOPE_PREFIX = "enc:v1:";

/** Key-id + algorithm advertised at GET /auth/pubkey. */
const KID = "v1";
const ALG = "RSA-OAEP-256";

interface KeyState {
  privateKey: crypto.KeyObject | null;
  publicKey: crypto.KeyObject | null;
  /** SPKI DER, base64 — served verbatim to clients, non-secret. */
  publicKeySpkiB64: string | null;
  ephemeral: boolean;
}

/** True under the Firebase local emulator suite (e2e / dev). */
function inEmulator(): boolean {
  return (
    process.env.FUNCTIONS_EMULATOR === "true" ||
    !!process.env.FIREBASE_AUTH_EMULATOR_HOST
  );
}

function publicSpkiB64(publicKey: crypto.KeyObject): string {
  return (publicKey.export({ type: "spki", format: "der" }) as Buffer).toString(
    "base64",
  );
}

function loadKeyState(): KeyState {
  const pem = process.env.PASSWORD_ENC_PRIVATE_KEY;
  if (pem && pem.trim()) {
    try {
      const privateKey = crypto.createPrivateKey(pem);
      const publicKey = crypto.createPublicKey(privateKey);
      return {
        privateKey,
        publicKey,
        publicKeySpkiB64: publicSpkiB64(publicKey),
        ephemeral: false,
      };
    } catch (err) {
      // A misconfigured secret must not take the whole API down — log loudly
      // and fall back to "encryption unavailable" (plaintext over TLS).
      // eslint-disable-next-line no-console
      console.error(
        "[passwordCrypto] PASSWORD_ENC_PRIVATE_KEY is set but could not be " +
          "parsed; password encryption is DISABLED. Fix the secret (PKCS8 PEM).",
        err,
      );
      return { privateKey: null, publicKey: null, publicKeySpkiB64: null, ephemeral: false };
    }
  }

  if (inEmulator()) {
    const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
    });
    // eslint-disable-next-line no-console
    console.warn(
      "[passwordCrypto] No PASSWORD_ENC_PRIVATE_KEY set — generated an " +
        "EPHEMERAL dev keypair. DEV ONLY; never rely on this in production.",
    );
    return {
      privateKey,
      publicKey,
      publicKeySpkiB64: publicSpkiB64(publicKey),
      ephemeral: true,
    };
  }

  // Production without a configured key: stay disabled (see file header).
  // eslint-disable-next-line no-console
  console.warn(
    "[passwordCrypto] PASSWORD_ENC_PRIVATE_KEY not set in production — " +
      "password encryption is DISABLED (clients send plaintext over TLS). " +
      "Provision the secret to enable the layer.",
  );
  return { privateKey: null, publicKey: null, publicKeySpkiB64: null, ephemeral: false };
}

let _state: KeyState | null = null;
function state(): KeyState {
  if (!_state) _state = loadKeyState();
  return _state;
}

/** True when the server holds a usable private key and can decrypt envelopes. */
export function isEncryptionAvailable(): boolean {
  return state().privateKey !== null;
}

/**
 * True when the active key is an EPHEMERAL dev key (no configured secret, under
 * the emulator). The pubkey route uses this to send `Cache-Control: no-store`
 * so a client never re-imports a stale key after a cold-start rotation.
 */
export function isEphemeralKey(): boolean {
  return state().ephemeral;
}

/**
 * Public-key metadata for GET /auth/pubkey, or null when encryption is
 * unavailable (clients then fall back to plaintext).
 */
export function getPublicKeyMeta(): { alg: string; kid: string; key: string } | null {
  const s = state();
  if (!s.publicKeySpkiB64) return null;
  return { alg: ALG, kid: KID, key: s.publicKeySpkiB64 };
}

/** True if a value is an `enc:v1:` envelope string (vs. legacy plaintext). */
export function isEncryptedField(v: unknown): v is string {
  return typeof v === "string" && v.startsWith(ENVELOPE_PREFIX);
}

/** Thrown when an envelope can't be decrypted (bad data, wrong/absent key). */
export class PasswordDecryptError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "PasswordDecryptError";
  }
}

/**
 * Decrypt an `enc:v1:` envelope back to the plaintext password.
 * Throws PasswordDecryptError on any failure (caller maps to 400).
 */
export function decryptField(value: string): string {
  const s = state();
  if (!s.privateKey) throw new PasswordDecryptError("encryption_unavailable");

  const ciphertext = Buffer.from(value.slice(ENVELOPE_PREFIX.length), "base64");
  if (ciphertext.length === 0) throw new PasswordDecryptError("empty_ciphertext");

  let plain: Buffer;
  try {
    plain = crypto.privateDecrypt(
      {
        key: s.privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      ciphertext,
    );
  } catch {
    // Never echo OpenSSL's error detail — it can leak padding-oracle signal.
    throw new PasswordDecryptError("decrypt_failed");
  }
  return plain.toString("utf8");
}

/**
 * Encrypt a plaintext value into an `enc:v1:` envelope with the server's own
 * public key — the AT-REST counterpart of the in-transit layer, used to store
 * generated temp passwords in /generatedPasswords/{uid} so they are never
 * plaintext in the database. Returns null when encryption is unavailable
 * (no configured key in prod): callers then store the plaintext as before —
 * absence of the `enc:v1:` prefix is the signal, and the node is already
 * unreadable by clients (`.read: false`), so this degrades to today's posture.
 *
 * RSA-OAEP-SHA256 caps the plaintext at ~190 bytes for a 2048-bit key — far
 * above any password we generate or accept (max 128 chars).
 */
export function encryptField(plaintext: string): string | null {
  const s = state();
  if (!s.publicKey) return null;
  const ciphertext = crypto.publicEncrypt(
    {
      key: s.publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(plaintext, "utf8"),
  );
  return ENVELOPE_PREFIX + ciphertext.toString("base64");
}

/**
 * Test-only hook: drop the memoized key state so a test can re-load it after
 * mutating PASSWORD_ENC_PRIVATE_KEY. Never called in production code paths.
 */
export function __resetStateForTests(): void {
  _state = null;
}
