// @vitest-environment node
//
// Route-seam test for guestsRouter on the domain/ports convention. Mounts the
// REAL router and drives it over HTTP, stubbing ONLY requireAuth, and injects an
// in-memory guest store by mocking firebaseGuestStore() to wrap the REAL
// makeGuestStore over a fake DbPort. This exercises authorization + the
// assigned-driver inviteLinkToken strip + sanitizeGuest validation + write
// round-trips with NO emulator. (Pure domain logic lives in guestStore.test.ts;
// the inviteLinkToken strip is route logic, so it is covered here.)
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

// Hoisted so the (hoisted) vi.mock factories can reference them.
const { CLAIMS, DB } = vi.hoisted(() => {
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
    } as Record<string, Record<string, unknown>>,
    // Mutable RTDB tree; reset per test, read directly to assert post-state.
    DB: { tree: null as any },
  };
});

// Stub ONLY requireAuth; requireAdmin / role gates stay real.
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

// Inject the in-memory store at the production-wiring seam: the REAL
// makeGuestStore over a tree-backed fake DbPort.
vi.mock("../../functions/src/domain/guests/firebaseGuestStore", async () => {
  const { makeGuestStore } = await import(
    "../../functions/src/domain/guests/guestStore"
  );
  const getAt = (tree: any, path: string) => {
    let node = tree;
    for (const k of path.split("/")) {
      if (node === null || node === undefined || typeof node !== "object") return null;
      node = node[k];
    }
    return node === undefined ? null : node;
  };
  const setAt = (tree: any, path: string, value: unknown) => {
    const parts = path.split("/");
    const last = parts.pop()!;
    let node = tree;
    for (const k of parts) {
      if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
      node = node[k];
    }
    if (value === null) delete node[last];
    else node[last] = value;
  };
  let n = 0;
  const db = {
    async get(path: string) {
      return getAt(DB.tree, path);
    },
    async update(updates: Record<string, unknown>) {
      for (const [p, v] of Object.entries(updates)) setAt(DB.tree, p, v);
    },
    async set(path: string, value: unknown) {
      setAt(DB.tree, path, value);
    },
    async remove(path: string) {
      setAt(DB.tree, path, null);
    },
  };
  return {
    firebaseGuestStore: () => makeGuestStore({ db, newId: () => `new${++n}` }),
  };
});

import { guestsRouter } from "../../functions/src/api/routes/guests";

let server: Server;
let baseUrl: string;

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
  DB.tree = { guestsByGroom: { "groom-uid": { g1: { ...GUEST } } } };
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
    expect(DB.tree.guestsByGroom["groom-uid"].g1.inviteLinkToken).toBe("secret-tok");
  });

  it("a different groom is forbidden", async () => {
    const { status, json } = await req("GET", "/guests/groom-uid", "other-groom-token");
    expect(status).toBe(403);
    expect(json.error).toBe("forbidden");
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
    expect(json.id).toBe("new1");
    expect(json.name).toBe("Sara");
    expect(json.groomUid).toBeUndefined();
    expect(DB.tree.guestsByGroom["groom-uid"].new1.name).toBe("Sara");
  });

  it("a driver cannot create (403 forbidden)", async () => {
    const body = { name: "Sara", phone: "+972500000001", status: "pending", inviteType: "premium" };
    const { status, json } = await req("POST", "/guests/groom-uid", "driver-token", body);
    expect(status).toBe(403);
    expect(json.error).toBe("forbidden");
    expect(DB.tree.guestsByGroom["groom-uid"].new1).toBeUndefined();
  });

  it("rejects a body missing required fields (400 missing_required)", async () => {
    const { status, json } = await req("POST", "/guests/groom-uid", "owner-token", { name: "X" });
    expect(status).toBe(400);
    expect(json.error).toBe("missing_required");
  });

  it("rejects an empty phone (400 invalid_phone)", async () => {
    const body = { name: "X", phone: "", status: "pending", inviteType: "vip" };
    const { status, json } = await req("POST", "/guests/groom-uid", "owner-token", body);
    expect(status).toBe(400);
    expect(json.error).toBe("invalid_phone");
  });
});

describe("PATCH /guests/:groomUid/:guestId — update", () => {
  it("assigned driver can mark delivered (siblings preserved)", async () => {
    const { status, json } = await req("PATCH", "/guests/groom-uid/g1", "driver-token", { status: "delivered" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(DB.tree.guestsByGroom["groom-uid"].g1.status).toBe("delivered");
    expect(DB.tree.guestsByGroom["groom-uid"].g1.name).toBe("Layla");
  });

  it("rejects an empty patch (400 empty_patch)", async () => {
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
    expect(DB.tree.guestsByGroom["groom-uid"].g1).toBeUndefined();
  });

  it("a driver cannot delete (403 forbidden)", async () => {
    const { status, json } = await req("DELETE", "/guests/groom-uid/g1", "driver-token");
    expect(status).toBe(403);
    expect(json.error).toBe("forbidden");
    expect(DB.tree.guestsByGroom["groom-uid"].g1).not.toBeUndefined();
  });
});
