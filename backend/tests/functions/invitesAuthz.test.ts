// @vitest-environment node
//
// Integration test for the invite-link authorization rule:
//   "Only admins may send a guest an invite link."
//
// Mounts the REAL invitesRouter in an Express app and drives it over HTTP.
// The only thing stubbed is token *verification* (`requireAuth`), which is
// unchanged by the fix and would otherwise need a live Firebase Auth app.
// The role gate under test — `requireAdmin` — runs for real, exactly as it
// does in production, so this verifies the actual middleware chain
// (requireAuth → requireAdmin → handler) on the real route definitions.
//
// Regression guard: before the fix the mint routes used
// requireAnyRole("admin","groom"), so a groom hitting the API directly
// (bypassing the admin-only Send UI) could self-send. Grooms (and drivers)
// must now be rejected with 403 admins_only by the real requireAdmin gate.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

// Opaque bearer token → decoded claims. Hoisted so the vi.mock factory
// (also hoisted) can reference it without a temporal-dead-zone error.
const { CLAIMS } = vi.hoisted(() => {
  // Skip the in-memory per-uid rate limiter so repeated admin calls don't
  // trip a bucket (read at module load inside rateLimit.ts).
  process.env.FUNCTIONS_EMULATOR = "true";
  return {
    CLAIMS: {
      "admin-token": { uid: "admin-uid", role: "admin", username: "admin" },
      "groom-token": { uid: "groom-uid", role: "groom", username: "groom" },
      "driver-token": { uid: "driver-uid", role: "driver", username: "driver" },
    } as Record<string, { uid: string; role: string; username: string }>,
  };
});

// Replace ONLY requireAuth with a stub that maps our fake bearer tokens to
// claims. requireAdmin / requireAnyRole / requireRole stay REAL (importActual)
// so the route's actual authorization runs.
vi.mock("../../functions/src/api/middleware/auth", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../functions/src/api/middleware/auth")
    >();
  return {
    ...actual,
    requireAuth: (req: any, res: any, next: () => void) => {
      const header: string = req.headers?.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      const claims = CLAIMS[token];
      if (!claims) {
        res.status(401).json({ error: "unauthenticated" });
        return;
      }
      req.caller = { uid: claims.uid, claims };
      next();
    },
  };
});

import { invitesRouter } from "../../functions/src/api/routes/invites";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/invites", invitesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (addr && typeof addr === "object") {
    baseUrl = `http://127.0.0.1:${addr.port}`;
  }
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function postInvite(path: string, token: string | null, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

const BODY = { groomUid: "groom-uid", guestId: "g1" };

describe("POST /invites (physical) is admin-only", () => {
  it("rejects a groom with 403 admins_only", async () => {
    const { status, json } = await postInvite("/invites", "groom-token", BODY);
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });

  it("rejects a driver with 403 admins_only", async () => {
    const { status, json } = await postInvite("/invites", "driver-token", BODY);
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });

  it("rejects an unauthenticated caller with 401", async () => {
    const { status } = await postInvite("/invites", null, BODY);
    expect(status).toBe(401);
  });

  it("lets an admin through the authorization layer into the handler", async () => {
    const { status, json } = await postInvite("/invites", "admin-token", BODY);
    // The admin clears requireAuth + requireAdmin and REACHES the handler,
    // which then calls getDatabase() — unavailable in this unit env — and so
    // returns 500 write_failed. Asserting that exact shape proves two things:
    // (1) admins are NOT rejected by the authz layer, and (2) the route is
    // actually wired (a 404 here would be a false "pass").
    expect(status).toBe(500);
    expect(json.error).toBe("write_failed");
  });
});

describe("POST /invites/digital is admin-only", () => {
  it("rejects a groom with 403 admins_only BEFORE any design check", async () => {
    const { status, json } = await postInvite("/invites/digital", "groom-token", BODY);
    expect(status).toBe(403);
    // Proves the role gate runs ahead of the handler — not design_not_approved.
    expect(json.error).toBe("admins_only");
  });

  it("lets an admin through the authorization layer into the handler", async () => {
    const { status, json } = await postInvite("/invites/digital", "admin-token", BODY);
    // Same reasoning as the physical route: admin reaches the handler, which
    // calls getFirestore()/getDatabase() and fails with 500 write_failed in
    // the unit env — proving admins pass authz and the route is wired.
    expect(status).toBe(500);
    expect(json.error).toBe("write_failed");
  });
});
