// @vitest-environment node
//
// Regression test: POST /guests/:groomUid must reject an EMPTY phone, the same
// way it rejects an empty name. The prior validator checked only the phone's
// max length, and the requireRequired guard only checks `typeof === "string"`
// — so an empty-string phone slipped through and created an un-matchable guest
// (phone drives confirmation auto-match + WhatsApp). The add-guest UI already
// disables submit without a complete phone, so the API is just catching up.
//
// Mounts the REAL guestsRouter and stubs only requireAuth (same trick as
// invitesAuthz.test.ts). Validation runs BEFORE any datastore call, so an empty
// phone returns 400 invalid_phone without needing a live database.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const { CLAIMS } = vi.hoisted(() => {
  process.env.FUNCTIONS_EMULATOR = "true"; // skip the in-memory rate limiter
  return {
    CLAIMS: {
      "admin-token": { uid: "admin-uid", role: "admin", username: "admin" },
    } as Record<string, { uid: string; role: string; username: string }>,
  };
});

vi.mock("../../functions/src/api/middleware/auth", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../functions/src/api/middleware/auth")>();
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

import { guestsRouter } from "../../functions/src/api/routes/guests";

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/guests", guestsRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function postGuest(body: unknown) {
  const res = await fetch(`${baseUrl}/guests/admin-uid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer admin-token" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

const base = { name: "Khaled Tester", status: "pending", inviteType: "premium" };

describe("POST /guests rejects an empty phone", () => {
  it("400 invalid_phone for an empty-string phone (validation runs before the DB)", async () => {
    const { status, json } = await postGuest({ ...base, phone: "" });
    expect(status).toBe(400);
    expect(json.error).toBe("invalid_phone");
  });

  it("400 missing_required when phone is omitted entirely", async () => {
    const { status, json } = await postGuest({ ...base });
    expect(status).toBe(400);
    expect(json.error).toBe("missing_required");
  });

  it("passes validation for a real phone (then 500 since the DB is offline here)", async () => {
    // A valid phone clears sanitizeGuest and reaches guestStore.create, which
    // calls getDatabase() — unavailable in this unit env — proving the rejection
    // above is specific to empty phones, not a blanket failure.
    const { status, json } = await postGuest({ ...base, phone: "0501112233" });
    expect(status).toBe(500);
    expect(json.error).toBe("write_failed");
  });
});
