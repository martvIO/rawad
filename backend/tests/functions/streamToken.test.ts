// @vitest-environment node
//
// Unit tests for the short-lived SSE stream token (api/streamToken.ts): an
// HMAC-signed `{groomUid, exp}` capability that replaces the long-lived idToken
// in the EventSource URL.
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.STREAM_TOKEN_SECRET = "test-secret-at-least-16-chars-long";
});

// Imported AFTER the secret is set (the module caches it lazily on first use).
const { mintStreamToken, verifyStreamToken, STREAM_TOKEN_TTL_MS } = await import(
  "../../functions/src/api/streamToken"
);

describe("stream token", () => {
  const NOW = 1_700_000_000_000;

  it("a freshly minted token verifies for its groom", () => {
    const tok = mintStreamToken("groom-1", NOW);
    expect(verifyStreamToken(tok, "groom-1", NOW + 1000)).toBe(true);
  });

  it("is rejected for a DIFFERENT groom (capability scope)", () => {
    const tok = mintStreamToken("groom-1", NOW);
    expect(verifyStreamToken(tok, "groom-2", NOW + 1000)).toBe(false);
  });

  it("is rejected once expired", () => {
    const tok = mintStreamToken("groom-1", NOW);
    expect(verifyStreamToken(tok, "groom-1", NOW + STREAM_TOKEN_TTL_MS + 1)).toBe(false);
  });

  it("is rejected if the signature is tampered", () => {
    const tok = mintStreamToken("groom-1", NOW);
    const tampered = tok.slice(0, -2) + (tok.endsWith("aa") ? "bb" : "aa");
    expect(verifyStreamToken(tampered, "groom-1", NOW + 1000)).toBe(false);
  });

  it("is rejected if the exp is rewritten (signature no longer matches)", () => {
    const [uid, , sig] = mintStreamToken("groom-1", NOW).split(".");
    const forged = `${uid}.${NOW + 10 * STREAM_TOKEN_TTL_MS}.${sig}`;
    expect(verifyStreamToken(forged, "groom-1", NOW + 1000)).toBe(false);
  });

  it("rejects malformed / non-string input", () => {
    expect(verifyStreamToken("not-a-token", "groom-1")).toBe(false);
    expect(verifyStreamToken("a.b", "groom-1")).toBe(false);
    expect(verifyStreamToken(undefined, "groom-1")).toBe(false);
    expect(verifyStreamToken(12345, "groom-1")).toBe(false);
  });
});
