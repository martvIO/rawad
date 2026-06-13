"""
RSA password-encryption helper for the Dawa load test.

Mirrors the browser client (frontend/src/utils/passwordCrypto.js): fetch the
server's RSA public key from GET /api/auth/pubkey, then RSA-OAEP(SHA-256)-encrypt
the password and wrap it as the `enc:v1:<base64>` envelope the backend decrypts
(backend/functions/src/api/passwordCrypto.ts). This keeps a plaintext password
out of access logs even though the channel is already TLS-encrypted.

Best-effort by contract: if the server publishes no key (older deploy / secret
not provisioned) encryption degrades to plaintext, so callers can wrap every
password unconditionally and the suite keeps working against any deploy.

Imports ONLY `requests` + `cryptography` (never locust / gevent), so it is safe
to import from the framework-free cleanup path and the locustfile alike.
"""
from __future__ import annotations

import base64
from typing import Optional

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey

API_BASE = "/api"
ENVELOPE_PREFIX = "enc:v1:"
_TIMEOUT = 15

# Cache the imported public key per base_url so repeated logins fetch /auth/pubkey
# once. A cached None means "encryption unavailable here" — also remembered so we
# don't re-hit a keyless server on every login.
_key_cache: dict = {}


def _fetch_public_key(base_url: str) -> Optional[RSAPublicKey]:
    if base_url in _key_cache:
        return _key_cache[base_url]
    key: Optional[RSAPublicKey] = None
    try:
        r = requests.get(f"{base_url}{API_BASE}/auth/pubkey", timeout=_TIMEOUT)
        if r.status_code == 200:
            meta = r.json()
            der = base64.b64decode(meta["key"])
            loaded = serialization.load_der_public_key(der)
            if isinstance(loaded, RSAPublicKey):
                key = loaded
    except Exception:  # noqa: BLE001 — any failure → plaintext fallback
        key = None
    _key_cache[base_url] = key
    return key


def encrypt_password(base_url: str, plaintext: str) -> str:
    """RSA-OAEP-encrypt `plaintext` for base_url's server key, returning the
    `enc:v1:<base64>` envelope. Falls back to the raw plaintext when the key is
    unavailable, so the result is always safe to send as the password field."""
    key = _fetch_public_key(base_url)
    if key is None:
        return plaintext
    try:
        ciphertext = key.encrypt(
            plaintext.encode("utf-8"),
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None,
            ),
        )
    except Exception:  # noqa: BLE001 — e.g. >190-byte password; never break login
        return plaintext
    return ENVELOPE_PREFIX + base64.b64encode(ciphertext).decode("ascii")


def encrypt_credentials(base_url: str, creds: dict) -> dict:
    """Return a copy of a {username, password} dict with the password encrypted."""
    out = dict(creds)
    pw = out.get("password")
    if isinstance(pw, str) and pw:
        out["password"] = encrypt_password(base_url, pw)
    return out


def reset_cache() -> None:
    """Drop the cached key(s) — used by tests and after a server key rotation."""
    _key_cache.clear()
