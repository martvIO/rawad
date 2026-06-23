// @vitest-environment node
//
// Handler-behaviour tests for routes/guests.ts, driven over real HTTP against
// the REAL guestsRouter. Two things are stubbed:
//   - requireAuth (maps a fake bearer token -> claims), same as invitesAuthz.ts
//   - guestStore (the data-access seam) -> the in-memory adapter
// Because the guest domain now talks to Firebase only through GuestStore, this
// exercises the actual authorization + token-stripping + validation + response
// shapes with NO emulator. Before the seam existed these handlers 500'd at
// getDatabase(), so this behaviour was untestable in the unit env.
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import express from "express";
import type { Server } from "node:http";
import { inMemoryGuestStore } from "./support/inMemoryGuestStore";

// Hoisted so the vi.mock factories (also hoisted) can reference them.
const { CLAIMS, STORE } = vi.hoisted(() => {
  // Skip the in-memory per-uid rate limiter (read at module load in rateLimit.ts).
  process.env.FUNCTIONS_EMULATOR = "true";
  return {
    CLAIMS: {
      "admin-token": { uid: "admin-uid", role: "admin", username: "admin" },
      "owner-token": { uid: "groom-uid", role: "groom", username: "groom" },
      "other-groom-token": { uid: "other-uid", role: "groom", username: "other" },
      "driver-token": {
        uid: "driver-uid",
        role: "driver",
        username: "driver",
        assignedGrooms: { "groom-uid": true },
      },
      "unassigned-driver-token": {
        uid: "driver2-uid",
        role: "driver",
        username: "driver2",
        assignedGrooms: { "someone-else": true },
      },
    } as Record<string, Record<string, unknown>>,
    // Mutable holder; the guestStore mock delegates to STORE.current, which each
    // test resets to a freshly-seeded in-memory adapter.
    STORE: { current: null as ReturnType<typeof inMemoryGuestStore>["store"] | null },
  };
});

// Stub ONLY requireAuth — requireAdmin / role gates stay real.
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

// Replace the GuestStore seam with the in-memory adapter (delegated at call time).
vi.mock("../../functions/src/api/stores/guestStore", () => ({
  guestStore: {
    listAll: (...a: unknown[]) => (STORE.current as any).listAll(...a),
    listByGroom: (...a: unknown[]) => (STORE.current as any).listByGroom(...a),
    get: (...a: unknown[]) => (STORE.current as any).get(...a),
    create: (...a: unknown[]) => (STORE.current as any).create(...a),
    patch: (...a: unknown[]) => (STORE.current as any).patch(...a),
    remove: (...a: unknown[]) => (STORE.current as any).remove(...a),
  },
}));

import { guestsRouter } from "../../functions/src/api/routes/guests";

let server: Server;
let baseUrl: string;
let mem: ReturnType<typeof inMemoryGuestStore>;

const GUEST = {
  name: "Layla",
  phone: "+972500000000",
  status: "pending",
  inviteType: "vip",
  inviteLinkToken: "secret-tok",
};

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

beforeEach(() => {
  mem = inMemoryGuestStore({ "groom-uid": { g1: { ...GUEST } } });
  STORE.current = mem.store;
});

async function req(
  method: string,
  path: string,
  token: string | null,
  body?: unknown
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  return { status: res.status, json };
}

describe("GET /guests/:groomUid — read + driver token-strip", () => {
  it("admin sees the guest WITH its inviteLinkToken", async () => {
    const { status, json } = await req("GET", "/guests/groom-uid", "admin-token");
    expect(status).toBe(200);
    expect(json[0].id).toBe("g1");
    expect(json[0].inviteLinkToken).toBe("secret-tok");
  });

  it("owning groom sees the guest WITH its inviteLinkToken", async () => {
    const { status, json } = await req("GET", "/guests/groom-uid", "owner-token");
    expect(status).toBe(200);
    expect(json[0].inviteLinkToken).toBe("secret-tok");
  });

  it("assigned driver sees the guest with inviteLinkToken STRIPPED", async () => {
    const { status, json } = await req("GET", "/guests/groom-uid", "driver-token");
    expect(status).toBe(200);
    expect(json[0].name).toBe("Layla");
    expect(json[0].inviteLinkToken).toBeUndefined();
    // The store's record is untouched — only the response copy is stripped.
    expect((await mem.store.get("groom-uid", "g1"))?.inviteLinkToken).toBe("secret-tok");
  });

  it("a different groom is forbidden", async () => {
    const { status, json } = await req("GET", "/guests/groom-uid", "other-groom-token");
    expect(status).toBe(403);
    expect(json.error).toBe("forbidden");
  });

  it("an unassigned driver is forbidden", async () => {
    const { status } = await req("GET", "/guests/groom-uid", "unassigned-driver-token");
    expect(status).toBe(403);
  });
});

describe("GET /guests — admin-only flat list", () => {
  it("admin gets the flattened list with groomUid stamped", async () => {
    const { status, json } = await req("GET", "/guests", "admin-token");
    expect(status).toBe(200);
    expect(json).toHaveLength(1);
    expect(json[0].groomUid).toBe("groom-uid");
  });

  it("a groom is rejected with admins_only", async () => {
    const { status, json } = await req("GET", "/guests", "owner-token");
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });
});

describe("POST /guests/:groomUid — create", () => {
  it("owning groom creates a guest; response is { id, ...guest } without groomUid", async () => {
    const body = { name: "Sara", phone: "+972500000001", status: "pending", inviteType: "premium" };
    const { status, json } = await req("POST", "/guests/groom-uid", "owner-token", body);
    expect(status).toBe(200);
    expect(json.id).toBeTruthy();
    expect(json.name).toBe("Sara");
    expect(json.groomUid).toBeUndefined();
    expect(mem.grooms.get("groom-uid")?.size).toBe(2); // g1 + new
  });

  it("a driver cannot create (403 forbidden)", async () => {
    const body = { name: "Sara", phone: "+972500000001", status: "pending", inviteType: "premium" };
    const { status, json } = await req("POST", "/guests/groom-uid", "driver-token", body);
    expect(status).toBe(403);
    expect(json.error).toBe("forbidden");
    expect(mem.grooms.get("groom-uid")?.size).toBe(1); // unchanged
  });

  it("rejects a body missing required fields (400)", async () => {
    const { status, json } = await req("POST", "/guests/groom-uid", "owner-token", { name: "X" });
    expect(status).toBe(400);
    expect(json.error).toBe("missing_required");
  });
});

describe("PATCH /guests/:groomUid/:guestId — update", () => {
  it("assigned driver can mark delivered", async () => {
    const { status, json } = await req("PATCH", "/guests/groom-uid/g1", "driver-token", { status: "delivered" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect((await mem.store.get("groom-uid", "g1"))?.status).toBe("delivered");
  });

  it("rejects an empty patch (400)", async () => {
    const { status, json } = await req("PATCH", "/guests/groom-uid/g1", "owner-token", {});
    expect(status).toBe(400);
    expect(json.error).toBe("empty_patch");
  });
});

describe("DELETE /guests/:groomUid/:guestId — remove", () => {
  it("owning groom deletes the guest", async () => {
    const { status, json } = await req("DELETE", "/guests/groom-uid/g1", "owner-token");
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(await mem.store.get("groom-uid", "g1")).toBeNull();
  });

  it("a driver cannot delete (403 forbidden)", async () => {
    const { status, json } = await req("DELETE", "/guests/groom-uid/g1", "driver-token");
    expect(status).toBe(403);
    expect(json.error).toBe("forbidden");
    expect(await mem.store.get("groom-uid", "g1")).not.toBeNull(); // unchanged
  });
});
