"""
Round-trip test for loadtest/passwordcrypto.py — no running server required.

We generate an RSA keypair, inject the public key into passwordcrypto's cache,
encrypt with the module, and decrypt with the matching private key to prove the
`enc:v1:` envelope interoperates with the server's RSA-OAEP(SHA-256) decryption.

Run directly:
    python test_passwordcrypto.py      # asserts, prints OK
Or via pytest (functions are named test_*):
    pytest test_passwordcrypto.py
"""
import base64
from unittest.mock import MagicMock, patch

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

import cleanup_core
import passwordcrypto

_BASE = "https://example.test"


def _install_key():
    """Generate a keypair, inject the public key into passwordcrypto's per-base
    cache (so no HTTP call happens), and return the private key for decryption."""
    priv = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    passwordcrypto.reset_cache()
    passwordcrypto._key_cache[_BASE] = priv.public_key()
    return priv


def _decrypt(priv, envelope: str) -> str:
    assert envelope.startswith(passwordcrypto.ENVELOPE_PREFIX), envelope
    ct = base64.b64decode(envelope[len(passwordcrypto.ENVELOPE_PREFIX):])
    return priv.decrypt(
        ct,
        padding.OAEP(
            mgf=padding.MGF1(hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    ).decode("utf-8")


def test_encrypt_password_round_trip():
    priv = _install_key()
    env = passwordcrypto.encrypt_password(_BASE, "DawaAdmin2026")
    assert _decrypt(priv, env) == "DawaAdmin2026"


def test_encrypt_credentials_encrypts_only_password():
    priv = _install_key()
    out = passwordcrypto.encrypt_credentials(
        _BASE, {"username": "admin", "password": "DawaAdmin2026"}
    )
    assert out["username"] == "admin"
    assert _decrypt(priv, out["password"]) == "DawaAdmin2026"


def test_plaintext_fallback_when_no_key():
    passwordcrypto.reset_cache()
    passwordcrypto._key_cache[_BASE] = None  # simulate keyless / older server
    assert passwordcrypto.encrypt_password(_BASE, "DawaAdmin2026") == "DawaAdmin2026"


def test_non_ascii_password_round_trip():
    priv = _install_key()
    pw = "Pâss٤٢wörd"  # accents + Arabic-Indic digits (multi-byte UTF-8)
    assert _decrypt(priv, passwordcrypto.encrypt_password(_BASE, pw)) == pw


def test_over_length_password_falls_back_to_plaintext():
    _install_key()
    huge = "Aa1" + "x" * 300  # exceeds the RSA-2048 OAEP 190-byte limit
    # Must NOT raise; degrades to plaintext so the load test keeps running.
    assert passwordcrypto.encrypt_password(_BASE, huge) == huge


def test_cleanup_core_login_encrypts_password_keeps_username_plaintext():
    priv = _install_key()
    captured = {}

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["json"] = json
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = {"idToken": "x", "uid": "u"}
        return resp

    with patch.object(cleanup_core.requests, "post", side_effect=fake_post):
        cleanup_core.login(_BASE, "admin", "DawaAdmin2026")

    assert captured["json"]["username"] == "admin"  # username untouched
    assert _decrypt(priv, captured["json"]["password"]) == "DawaAdmin2026"


if __name__ == "__main__":
    test_encrypt_password_round_trip()
    test_encrypt_credentials_encrypts_only_password()
    test_plaintext_fallback_when_no_key()
    test_non_ascii_password_round_trip()
    test_over_length_password_falls_back_to_plaintext()
    test_cleanup_core_login_encrypts_password_keeps_username_plaintext()
    print("passwordcrypto: all round-trip tests passed")
