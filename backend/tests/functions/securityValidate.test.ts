// Unit tests for the security-layer building blocks that are pure enough to run
// without the Firebase emulator: the zod validate() middleware and the
// client-metadata helpers (device-fingerprint parsing + IP key sanitisation).
import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { validate } from "../../functions/src/api/middleware/validate";
import { deviceFingerprint, ipKey } from "../../functions/src/api/clientMeta";

// Minimal Express res double capturing status()/json().
function mockRes() {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = vi.fn((code: number) => {
    res.statusCode = code;
    return res as Response;
  }) as unknown as Response["status"];
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res as Response;
  }) as unknown as Response["json"];
  return res as Response & { statusCode?: number; body?: any };
}

describe("validate() middleware", () => {
  it("calls next() and coerces/strips when input is valid", () => {
    const schema = { body: z.object({ n: z.coerce.number().int() }) };
    const req = { body: { n: "42", junk: "x" } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    // parsed value written back, coerced to number, unknown key stripped
    expect((req as any).body).toEqual({ n: 42 });
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects invalid input with 400 invalid_input + field, without calling next()", () => {
    const schema = { body: z.object({ email: z.string().email() }) };
    const req = { body: { email: "not-an-email" }, headers: {}, method: "POST", path: "/x" } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe("invalid_input");
    expect(res.body.part).toBe("body");
    expect(res.body.field).toBe("email");
  });

  it("validates params and query independently", () => {
    const schema = {
      params: z.object({ id: z.string().regex(/^[a-z0-9]+$/) }),
      query: z.object({ limit: z.coerce.number().int().min(1).max(10).catch(5) }),
    };
    const req = { params: { id: "abc123" }, query: { limit: "999" } } as unknown as Request;
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    validate(schema)(req, res, next);

    // limit=999 exceeds max(10) → .catch(5) applies, so it stays valid
    expect(next).toHaveBeenCalledOnce();
    expect((req as any).query.limit).toBe(5);
  });
});

describe("clientMeta helpers", () => {
  it("accepts a well-formed device fingerprint header", () => {
    const req = { headers: { "x-device-fp": "a1b2c3d4e5f6a1b2c3d4e5f6" } } as unknown as Request;
    expect(deviceFingerprint(req)).toBe("a1b2c3d4e5f6a1b2c3d4e5f6");
  });

  it("rejects a malformed / oversized fingerprint header", () => {
    expect(deviceFingerprint({ headers: { "x-device-fp": "short" } } as unknown as Request)).toBeNull();
    expect(deviceFingerprint({ headers: { "x-device-fp": "has spaces!!" } } as unknown as Request)).toBeNull();
    expect(deviceFingerprint({ headers: {} } as unknown as Request)).toBeNull();
  });

  it("sanitises IPs into RTDB-safe keys", () => {
    expect(ipKey("1.2.3.4")).toBe("1_2_3_4");
    expect(ipKey("2001:db8::1")).toBe("2001_db8__1");
  });
});
