// Native RSA-OAEP(SHA-256) password encryptor for @dawa/core's crypto adapter.
//
// Hermes has no WebCrypto, so the shared passwordCrypto.js cannot use
// `crypto.subtle` here. node-forge is pure JS (no native module, no prebuild)
// and a password is <200 bytes, so the encrypt cost is negligible. Must stay
// byte-compatible with the backend's decrypt: RSA-OAEP, SHA-256 digest,
// MGF1-SHA256 (node crypto privateDecrypt oaepHash "sha256").
import forge from "node-forge";

export async function nativeRsaOaepEncrypt(spkiKeyB64, plaintext) {
  const der = forge.util.decode64(spkiKeyB64);
  const publicKey = forge.pki.publicKeyFromAsn1(forge.asn1.fromDer(der));
  const cipher = publicKey.encrypt(forge.util.encodeUtf8(String(plaintext)), "RSA-OAEP", {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  });
  return forge.util.encode64(cipher);
}
