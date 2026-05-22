// Unit test for the /api prefix normalizer middleware. Verifies that the
// Express app correctly handles both the hosting-rewrite path shape
// (/api/auth/login) and the direct-function path shape (/auth/login).
import { describe, it, expect, vi } from "vitest";
import { stripApiPrefix } from "../../functions/src/api/index";

function fakeReq(url: string) {
  return { url } as unknown as Parameters<typeof stripApiPrefix>[0];
}

describe("stripApiPrefix", () => {
  it("strips leading /api/ so /api/auth/login becomes /auth/login", () => {
    const req = fakeReq("/api/auth/login");
    const next = vi.fn();
    stripApiPrefix(req, {} as never, next);
    expect(req.url).toBe("/auth/login");
    expect(next).toHaveBeenCalledOnce();
  });

  it("normalizes bare /api to /", () => {
    const req = fakeReq("/api");
    stripApiPrefix(req, {} as never, vi.fn());
    expect(req.url).toBe("/");
  });

  it("passes /auth/login through unchanged (direct function URL)", () => {
    const req = fakeReq("/auth/login");
    stripApiPrefix(req, {} as never, vi.fn());
    expect(req.url).toBe("/auth/login");
  });

  it("does not strip an /apiv2/... prefix that merely starts with /api", () => {
    const req = fakeReq("/apiv2/foo");
    stripApiPrefix(req, {} as never, vi.fn());
    expect(req.url).toBe("/apiv2/foo");
  });

  it("preserves the query string while stripping the prefix", () => {
    const req = fakeReq("/api/proofs/url?path=foo%2Fbar.jpg");
    stripApiPrefix(req, {} as never, vi.fn());
    expect(req.url).toBe("/proofs/url?path=foo%2Fbar.jpg");
  });

  it("always calls next()", () => {
    const next = vi.fn();
    stripApiPrefix(fakeReq("/"), {} as never, next);
    stripApiPrefix(fakeReq("/api"), {} as never, next);
    stripApiPrefix(fakeReq("/api/x"), {} as never, next);
    expect(next).toHaveBeenCalledTimes(3);
  });
});
