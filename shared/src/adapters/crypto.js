// Password-encryption adapter.
//
// passwordCrypto.js RSA-OAEP(SHA-256)-encrypts password fields with WebCrypto
// (`crypto.subtle`). Hermes / React Native has no WebCrypto, so without help the
// native app silently falls back to plaintext — which production REJECTS
// (REQUIRE_ENCRYPTED_PASSWORDS): no store user could ever log in. Native injects
// a pure-JS RSA implementation through this seam; web never registers one, so
// the subtle path is untouched.
//
// Implementation contract — impl(spkiKeyB64, plaintext) -> Promise<string>:
//   spkiKeyB64: base64 DER SPKI RSA public key (as served by GET /auth/pubkey)
//   plaintext:  the password string
//   resolve with the base64 ciphertext of RSA-OAEP(SHA-256, MGF1-SHA256);
//   throw on any failure (corrupt key, >190-byte plaintext) — the caller
//   catches and falls back to plaintext, mirroring the subtle path.

let _passwordEncryptor = null;

/** Inject the platform RSA-OAEP encryptor (native only). */
export function setPasswordEncryptor(impl) {
  _passwordEncryptor = impl;
}

/** Return the injected implementation, or null when unset (web default → subtle). */
export function getPasswordEncryptor() {
  return _passwordEncryptor;
}
