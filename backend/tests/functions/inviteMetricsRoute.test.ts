// @vitest-environment node
//
// Route-seam test for POST /invites/digital/metrics. Drives the REAL route over
// HTTP with the Firestore/RTDB I/O faked, so the gates that matter are exercised
// for real: the zod body contract, the templateId allowlist (a public payload
// must never be able to name an arbitrary Firestore document), the guest/demo
// surface split, and the "analytics must never break the invite page" posture.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

// NOTE: the `firebase-admin/*` specifiers below are only mockable because the
// backend unit project aliases them to the one physical copy under
// functions/node_modules (see backend/vitest.config.js). Without that, the mock
// and the route would resolve to different ids, the real SDK would run, and the
// route's catch-all would mask it as a 200 — every I/O assertion here passing
// vacuously.
const { STATE } = vi.hoisted(() => ({
  STATE: {
    // RTDB inviteTokens/{token}
    tokens: {} as Record<string, any>,
    // Firestore docs written, by path
    written: [] as { path: string; data: any; merge?: boolean }[],
    // Firestore guest docs, by path
    guests: {} as Record<string, any>,
    throwOnWrite: false,
  },
}));

vi.mock("firebase-admin/database", () => ({
  getDatabase: () => ({
    ref: (path: string) => ({
      get: async () => {
        const token = path.split("/")[1];
        const val = STATE.tokens[token];
        return { exists: () => val !== undefined, val: () => val };
      },
      set: async () => {},
    }),
  }),
}));

// FieldValue.increment is recorded structurally so tests can assert the deltas.
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { increment: (n: number) => ({ __inc__: n }) },
  getFirestore: () => ({
    doc: (path: string) => ({
      get: async () => ({
        exists: STATE.guests[path] !== undefined,
        data: () => STATE.guests[path],
      }),
      set: async (data: any, opts?: { merge?: boolean }) => {
        if (STATE.throwOnWrite) throw new Error("firestore down");
        STATE.written.push({ path, data, merge: opts?.merge });
        if (path.includes("/guests/")) {
          STATE.guests[path] = { ...(STATE.guests[path] ?? {}), ...data };
        }
      },
      update: async () => {},
    }),
  }),
}));

vi.mock("../../functions/src/api/middleware/rateLimit", () => ({
  ipRateLimit: () => (_r: any, _s: any, n: any) => n(),
  uidRateLimit: () => (_r: any, _s: any, n: any) => n(),
  tokenRateLimit: () => (_r: any, _s: any, n: any) => n(),
  keyedRateLimit: () => (_r: any, _s: any, n: any) => n(),
}));
vi.mock("../../functions/src/api/middleware/auth", () => ({
  requireAuth: (_r: any, _s: any, n: any) => n(),
  requireAdmin: (_r: any, _s: any, n: any) => n(),
  AuthRequest: {},
}));
vi.mock("../../functions/src/audit", () => ({ writeAudit: vi.fn(async () => {}) }));

const { invitesRouter } = await import("../../functions/src/api/routes/invites");

let server: Server;
let base: string;

const TOKEN = "a".repeat(32);

const post = (body: unknown) =>
  fetch(`${base}/invites/digital/metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const validGuestBody = (over: Record<string, unknown> = {}) => ({
  token: TOKEN,
  surface: "guest",
  templateId: "classic",
  loadId: "abc123ef",
  phase: "load",
  t: { sealedMs: 900, readyMs: 2500 },
  ...over,
});

const rollups = () => STATE.written.filter((w) => w.path.startsWith("metricsDaily/"));
const guestWrites = () => STATE.written.filter((w) => w.path.includes("/guests/"));

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/invites", invitesRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  STATE.tokens = { [TOKEN]: { guestType: "digital", groomUid: "g1", guestId: "gu1" } };
  STATE.guests = { "digitalInvitations/g1/guests/gu1": { name: "x" } };
  STATE.written = [];
  STATE.throwOnWrite = false;
});

describe("POST /invites/digital/metrics — body contract", () => {
  it("rejects a malformed body", async () => {
    for (const bad of [
      {},
      { surface: "guest" },
      validGuestBody({ surface: "hacker" }),
      validGuestBody({ phase: "middle" }),
      validGuestBody({ loadId: "NOT-HEX!" }),
      validGuestBody({ token: "short" }),
      validGuestBody({ t: { tapKind: "wat" } }),
    ]) {
      const r = await post(bad);
      expect(r.status).toBe(400);
    }
    expect(STATE.written).toHaveLength(0);
  });

  it("rejects an unknown templateId — a public payload must not name a doc", async () => {
    const r = await post(validGuestBody({ templateId: "../../etc/passwd" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("invalid_template_id");
    expect(STATE.written).toHaveLength(0);
  });

  it("requires a token on the guest surface", async () => {
    const r = await post(validGuestBody({ token: undefined }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("missing_token");
  });

  it("404s an unknown token before writing anything", async () => {
    const r = await post(validGuestBody({ token: "b".repeat(32) }));
    expect(r.status).toBe(404);
    expect(STATE.written).toHaveLength(0);
  });

  it("409s a physical invite token", async () => {
    STATE.tokens[TOKEN].guestType = "physical";
    const r = await post(validGuestBody());
    expect(r.status).toBe(409);
    expect(STATE.written).toHaveLength(0);
  });
});

describe("POST /invites/digital/metrics — rollups", () => {
  it("increments the (surface, template, day) rollup doc", async () => {
    const r = await post(validGuestBody());
    expect(r.status).toBe(200);
    const [w] = rollups();
    expect(w.path).toMatch(/^metricsDaily\/guest_classic_\d{8}$/);
    expect(w.merge).toBe(true);
    expect(w.data.surface).toBe("guest");
    expect(w.data.loads).toEqual({ __inc__: 1 });
    expect(w.data["hist.sealed.b2"]).toEqual({ __inc__: 1 });
  });

  it("keeps demo traffic in a SEPARATE doc from guest traffic", async () => {
    await post({ surface: "demo", templateId: "destination-love", loadId: "aaaa1111", phase: "load", t: {} });
    const [w] = rollups();
    expect(w.path).toMatch(/^metricsDaily\/demo_destination-love_\d{8}$/);
    // No token → no guest doc may be touched by demo traffic.
    expect(guestWrites()).toHaveLength(0);
  });

  it("accepts the gallery's 'all' sentinel, which is not a real template", async () => {
    const r = await post({ surface: "gallery", templateId: "all", loadId: "aaaa1111", phase: "load", t: {} });
    expect(r.status).toBe(200);
    expect(rollups()[0].path).toMatch(/^metricsDaily\/gallery_all_\d{8}$/);
  });

  it("does NOT accept the 'all' sentinel on the guest surface", async () => {
    const r = await post(validGuestBody({ templateId: "all" }));
    expect(r.status).toBe(400);
  });
});

describe("POST /invites/digital/metrics — per-guest row", () => {
  it("writes the perf row on the first visit", async () => {
    await post(validGuestBody());
    const w = guestWrites()[0];
    expect(w.data.perf).toMatchObject({ loadId: "abc123ef", templateId: "classic", sealedMs: 900, readyMs: 2500 });
    expect(typeof w.data.perf.at).toBe("number");
  });

  it("merges the final phase into the row it started (same loadId)", async () => {
    await post(validGuestBody());
    STATE.written = [];
    await post(validGuestBody({ phase: "final", t: { lcpMs: 1500, tapKind: "tap", tapDelayMs: 3000 } }));
    const w = guestWrites()[0];
    expect(w.data.perf).toMatchObject({ loadId: "abc123ef", sealedMs: 900, lcpMs: 1500, tapKind: "tap" });
  });

  it("a LATER visit must not overwrite the first visit's row", async () => {
    await post(validGuestBody());
    STATE.written = [];
    // Different loadId = a different visit; the rollup still counts it, but the
    // per-guest KPI row keeps first-visit semantics (matching viewedAt).
    await post(validGuestBody({ loadId: "ffff9999", t: { sealedMs: 50 } }));
    expect(guestWrites()).toHaveLength(0);
    expect(rollups()).toHaveLength(1);
  });

  it("a final phase from a DIFFERENT visit cannot patch the stored row", async () => {
    await post(validGuestBody());
    STATE.written = [];
    await post(validGuestBody({ loadId: "ffff9999", phase: "final", t: { lcpMs: 99999 } }));
    expect(guestWrites()).toHaveLength(0);
  });
});

describe("POST /invites/digital/metrics — failure posture", () => {
  it("degrades silently (200 ok:false) when the datastore fails — never breaks the invite page", async () => {
    STATE.throwOnWrite = true;
    const r = await post(validGuestBody());
    expect(r.status).toBe(200);
    expect((await r.json()).ok).toBe(false);
  });

  it("tolerates a guest doc that no longer exists", async () => {
    STATE.guests = {};
    const r = await post(validGuestBody());
    expect(r.status).toBe(200);
    expect(rollups()).toHaveLength(1); // the rollup still lands
  });
});
