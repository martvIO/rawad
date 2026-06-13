// @vitest-environment node
//
// Unit tests for the server-side password-encryption crypto. Covers the three
// key-source branches (configured secret, emulator ephemeral, production-no-key)
// and the envelope round-trip / failure modes. The "client" half is simulated
// with Node's own crypto.publicEncrypt against the server's published SPKI key,
// which is exactly what the browser (WebCrypto) and the load test (Python
// cryptography) produce — same OAEP/SHA-256 params.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as crypto from "node:crypto";

import {
  ENVELOPE_PREFIX,
  isEncryptedField,
  decryptField,
  getPublicKeyMeta,
  isEncryptionAvailable,
  isEphemeralKey,
  PasswordDecryptError,
  __resetStateForTests,
} from "../../functions/src/api/passwordCrypto";

// One keypair reused across the suite. The PEM is what an operator would set as
// PASSWORD_ENC_PRIVATE_KEY.
const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const PRIV_PEM = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

/** Encrypt `plaintext` with the server's published public key → enc:v1: envelope. */
function clientEncrypt(plaintext: string): string {
  const meta = getPublicKeyMeta();
  if (!meta) throw new Error("no public key available");
  const pub = crypto.createPublicKey({
    key: Buffer.from(meta.key, "base64"),
    format: "der",
    type: "spki",
  });
  const ct = crypto.publicEncrypt(
    { key: pub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(plaintext, "utf8"),
  );
  return ENVELOPE_PREFIX + ct.toString("base64");
}

const ENV_KEYS = [
  "PASSWORD_ENC_PRIVATE_KEY",
  "FUNCTIONS_EMULATOR",
  "FIREBASE_AUTH_EMULATOR_HOST",
] as const;
let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = {};
  for (const k of ENV_KEYS) snapshot[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
  __resetStateForTests();
});

describe("passwordCrypto — configured secret", () => {
  beforeEach(() => {
    process.env.PASSWORD_ENC_PRIVATE_KEY = PRIV_PEM;
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    __resetStateForTests();
  });

  it("is available and serves an importable base64 SPKI key", () => {
    expect(isEncryptionAvailable()).toBe(true);
    expect(isEphemeralKey()).toBe(false); // configured key is not ephemeral
    const meta = getPublicKeyMeta();
    expect(meta).not.toBeNull();
    expect(meta!.alg).toBe("RSA-OAEP-256");
    expect(meta!.kid).toBe("v1");
    expect(() =>
      crypto.createPublicKey({
        key: Buffer.from(meta!.key, "base64"),
        format: "der",
        type: "spki",
      }),
    ).not.toThrow();
  });

  it("memoizes one stable key across calls (encrypt-then-decrypt must agree)", () => {
    const a = getPublicKeyMeta()!.key;
    const b = getPublicKeyMeta()!.key;
    expect(a).toBe(b); // same key every call → fleet-safe within a process
  });

  it("round-trips a value encrypted with the published key", () => {
    const env = clientEncrypt("S3cretPass!");
    expect(isEncryptedField(env)).toBe(true);
    expect(decryptField(env)).toBe("S3cretPass!");
  });

  it("round-trips a non-ASCII password (Arabic-Indic digits, accents)", () => {
    const pw = "Pâss٤٢wörd";
    expect(decryptField(clientEncrypt(pw))).toBe(pw);
  });

  it("isEncryptedField only matches the enc:v1: prefix", () => {
    expect(isEncryptedField("enc:v1:abc")).toBe(true);
    expect(isEncryptedField("plaintext")).toBe(false);
    expect(isEncryptedField(123)).toBe(false);
    expect(isEncryptedField(null)).toBe(false);
    expect(isEncryptedField(undefined)).toBe(false);
  });

  it("throws PasswordDecryptError on an empty / malformed envelope", () => {
    expect(() => decryptField(`${ENVELOPE_PREFIX}`)).toThrow(PasswordDecryptError);
    expect(() => decryptField(`${ENVELOPE_PREFIX}AAAA`)).toThrow(PasswordDecryptError);
  });

  it("never leaks OpenSSL/padding detail in the error message", () => {
    let caught: unknown;
    try {
      decryptField(`${ENVELOPE_PREFIX}AAAA`);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PasswordDecryptError);
    expect((caught as Error).message).toBe("decrypt_failed");
  });
});

describe("passwordCrypto — production with no key", () => {
  beforeEach(() => {
    delete process.env.PASSWORD_ENC_PRIVATE_KEY;
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    __resetStateForTests();
  });

  it("is unavailable and serves no public key (clients fall back to plaintext)", () => {
    expect(isEncryptionAvailable()).toBe(false);
    expect(getPublicKeyMeta()).toBeNull();
  });

  it("decryptField throws rather than silently accepting", () => {
    expect(() => decryptField(`${ENVELOPE_PREFIX}AAAA`)).toThrow(PasswordDecryptError);
  });
});

describe("passwordCrypto — emulator ephemeral key", () => {
  beforeEach(() => {
    delete process.env.PASSWORD_ENC_PRIVATE_KEY;
    process.env.FUNCTIONS_EMULATOR = "true";
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    __resetStateForTests();
  });

  it("auto-generates a usable keypair so encryption works in dev", () => {
    expect(isEncryptionAvailable()).toBe(true);
    expect(isEphemeralKey()).toBe(true); // dev key is flagged ephemeral
    const env = clientEncrypt("EphemeralPass1");
    expect(decryptField(env)).toBe("EphemeralPass1");
  });

  it("also detects the emulator via FIREBASE_AUTH_EMULATOR_HOST alone", () => {
    delete process.env.FUNCTIONS_EMULATOR;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    __resetStateForTests();
    expect(isEncryptionAvailable()).toBe(true);
    expect(isEphemeralKey()).toBe(true);
    expect(decryptField(clientEncrypt("HostBranch1"))).toBe("HostBranch1");
  });
});

describe("passwordCrypto — misconfigured secret (unparseable PEM)", () => {
  beforeEach(() => {
    process.env.PASSWORD_ENC_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nnot a key\n-----END PRIVATE KEY-----";
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
    __resetStateForTests();
  });

  it("disables encryption instead of crashing the API", () => {
    // loadKeyState must catch the parse error and fall back to disabled, NOT throw.
    expect(isEncryptionAvailable()).toBe(false);
    expect(getPublicKeyMeta()).toBeNull();
    expect(isEphemeralKey()).toBe(false);
  });
});
