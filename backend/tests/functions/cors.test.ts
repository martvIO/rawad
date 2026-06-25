// @vitest-environment node
//
// Unit tests for the CORS origin policy (api/cors.ts). The key behaviour: a
// FAIL-CLOSED default — when ALLOWED_ORIGINS is unset, only the built-in
// always-allowed origins pass; unknown origins are denied (previously allowed).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isAlwaysAllowedOrigin,
  buildCorsOriginCheck,
} from "../../functions/src/api/cors";

// Run the cors callback and capture its allow decision.
function decide(check: ReturnType<typeof buildCorsOriginCheck>, origin: string | undefined) {
  let allowed: boolean | undefined;
  check(origin, (_err, allow) => { allowed = allow; });
  return allowed;
}

describe("isAlwaysAllowedOrigin", () => {
  it("allows localhost, firebase hosting, and the prod custom domains", () => {
    for (const o of [
      "http://localhost:5173",
      "https://127.0.0.1:3000",
      "https://dawa-aa793.web.app",
      "https://something.firebaseapp.com",
      "https://dawa.to",
      "https://invite.dawa.to",
    ]) {
      expect(isAlwaysAllowedOrigin(o)).toBe(true);
    }
  });

  it("denies unknown origins and look-alikes", () => {
    for (const o of [
      "https://evil.com",
      "https://dawa.to.evil.com",
      "https://notdawa.to",
      "http://dawa.to", // wrong scheme
    ]) {
      expect(isAlwaysAllowedOrigin(o)).toBe(false);
    }
  });
});

describe("buildCorsOriginCheck — fail-closed default (ALLOWED_ORIGINS unset)", () => {
  const prev = process.env.ALLOWED_ORIGINS;
  beforeEach(() => { delete process.env.ALLOWED_ORIGINS; });
  afterEach(() => { if (prev === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = prev; });

  it("allows no-Origin requests (server-to-server)", () => {
    expect(decide(buildCorsOriginCheck(), undefined)).toBe(true);
  });
  it("allows a built-in prod domain", () => {
    expect(decide(buildCorsOriginCheck(), "https://invite.dawa.to")).toBe(true);
  });
  it("DENIES an arbitrary origin (the fix)", () => {
    expect(decide(buildCorsOriginCheck(), "https://evil.com")).toBe(false);
  });
});

describe("buildCorsOriginCheck — explicit ALLOWED_ORIGINS", () => {
  const prev = process.env.ALLOWED_ORIGINS;
  afterEach(() => { if (prev === undefined) delete process.env.ALLOWED_ORIGINS; else process.env.ALLOWED_ORIGINS = prev; });

  it("allows a listed origin plus the always-allowed set, denies others", () => {
    process.env.ALLOWED_ORIGINS = "https://staging.example.com, https://other.example.com";
    const check = buildCorsOriginCheck();
    expect(decide(check, "https://staging.example.com")).toBe(true);
    expect(decide(check, "https://dawa.to")).toBe(true); // always-allowed
    expect(decide(check, "https://evil.com")).toBe(false);
  });
});
