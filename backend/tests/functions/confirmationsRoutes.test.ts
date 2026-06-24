// @vitest-environment node
//
// Route-seam test for confirmationsRouter on the domain/ports convention.
// Mounts the REAL router and drives it over HTTP, stubbing ONLY requireAuth, and
// injects in-memory stores by mocking firebaseConfirmationStore(),
// firebaseGuestStore() and firebaseUserIndex() to wrap the REAL make*Store
// builders over ONE shared fake DbPort. This exercises the admin/public
// authorization gates, the public-submit groom resolution + best-effort
// auto-attach decision, and the admin attach-location cross-store write — with
// NO emulator. (Pure persistence lives in confirmationStore.test.ts; the
// composition + decision logic is route logic, so it is covered here.)
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

// Hoisted so the (hoisted) vi.mock factories can reference them. One shared fake
// DbPort backs all three stores so cross-store writes (auto-attach, attach-
// location) land in the same tree we assert against.
const { CLAIMS, DB, db } = vi.hoisted(() => {
  // Skip the in-memory rate limiters (read at module load in rateLimit.ts).
  process.env.FUNCTIONS_EMULATOR = "true";
  const DB = { tree: null as any };
  const getAt = (path: string) => {
    let node: any = DB.tree;
    for (const k of path.split("/")) {
      if (node === null || node === undefined || typeof node !== "object") return null;
      node = node[k];
    }
    return node === undefined ? null : node;
  };
  const setAt = (path: string, value: unknown) => {
    const parts = path.split("/");
    const last = parts.pop()!;
    let node: any = DB.tree;
    for (const k of parts) {
      if (typeof node[k] !== "object" || node[k] === null) node[k] = {};
      node = node[k];
    }
    if (value === null) delete node[last];
    else node[last] = value;
  };
  const db = {
    async get(path: string) {
      return getAt(path);
    },
    async update(updates: Record<string, unknown>) {
      for (const [p, v] of Object.entries(updates)) setAt(p, v);
    },
    async set(path: string, value: unknown) {
      setAt(path, value);
    },
    async remove(path: string) {
      setAt(path, null);
    },
  };
  return {
    CLAIMS: {
      "admin-token": { uid: "admin-uid", role: "admin", username: "admin" },
      "groom-token": { uid: "groom-uid", role: "groom", username: "karim" },
    } as Record<string, Record<string, unknown>>,
    DB,
    db,
  };
});

// Stub ONLY requireAuth; requireAdmin stays real.
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

// Inject the three in-memory stores at the production-wiring seams. All three
// wrap the REAL builders over the SHARED fake DbPort.
vi.mock(
  "../../functions/src/domain/confirmations/firebaseConfirmationStore",
  async () => {
    const { makeConfirmationStore } = await import(
      "../../functions/src/domain/confirmations/confirmationStore"
    );
    let n = 0;
    return {
      firebaseConfirmationStore: () =>
        makeConfirmationStore({ db, newId: () => `conf${++n}` }),
    };
  }
);
vi.mock("../../functions/src/domain/guests/firebaseGuestStore", async () => {
  const { makeGuestStore } = await import(
    "../../functions/src/domain/guests/guestStore"
  );
  let m = 0;
  return {
    firebaseGuestStore: () => makeGuestStore({ db, newId: () => `g${++m}` }),
  };
});
vi.mock("../../functions/src/domain/users/firebaseUserIndex", async () => {
  const { makeUserIndex } = await import(
    "../../functions/src/domain/users/userIndex"
  );
  return { firebaseUserIndex: () => makeUserIndex({ db }) };
});

import { confirmationsRouter } from "../../functions/src/api/routes/confirmations";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/confirmations", confirmationsRouter);
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
  DB.tree = {
    usernameIndex: { karim: "groom-uid" },
    confirmations: {
      cExisting: {
        groomUid: "groom-uid",
        submittedName: "Old Name",
        confirmedAt: 1,
      },
      cLoc: {
        groomUid: "groom-uid",
        submittedName: "Loc Person",
        lat: 32.1,
        lng: 35.2,
        locationAccuracy: 12,
        confirmedAt: 2,
      },
      cNoLoc: { groomUid: "groom-uid", submittedName: "No Loc", confirmedAt: 3 },
    },
    guestsByGroom: {
      "groom-uid": {
        gMatch: {
          name: "Layla Khoury",
          phone: "+972501112233",
          status: "pending",
          inviteType: "vip",
        },
      },
    },
  };
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

describe("GET /confirmations — admin-only list", () => {
  it("admin gets the flat list with ids stamped", async () => {
    const { status, json } = await req("GET", "/confirmations", "admin-token");
    expect(status).toBe(200);
    expect(json.map((c: any) => c.id).sort()).toEqual([
      "cExisting",
      "cLoc",
      "cNoLoc",
    ]);
  });

  it("a groom is rejected with admins_only", async () => {
    const { status, json } = await req("GET", "/confirmations", "groom-token");
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });

  it("no token is rejected with 401", async () => {
    const { status } = await req("GET", "/confirmations", null);
    expect(status).toBe(401);
  });
});

describe("PATCH /confirmations/:id — admin edit", () => {
  it("updates a field and preserves untouched siblings", async () => {
    const { status, json } = await req(
      "PATCH",
      "/confirmations/cExisting",
      "admin-token",
      { submittedName: "New Full Name" }
    );
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(DB.tree.confirmations.cExisting.submittedName).toBe("New Full Name");
    expect(DB.tree.confirmations.cExisting.confirmedAt).toBe(1);
  });

  it("404s when the confirmation does not exist", async () => {
    const { status, json } = await req(
      "PATCH",
      "/confirmations/missing",
      "admin-token",
      { submittedName: "Whoever" }
    );
    expect(status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("400 empty_patch when nothing valid is sent", async () => {
    const { status, json } = await req(
      "PATCH",
      "/confirmations/cExisting",
      "admin-token",
      { notAField: "x" }
    );
    expect(status).toBe(400);
    expect(json.error).toBe("empty_patch");
  });
});

describe("POST /confirmations — public submit + auto-attach", () => {
  const submission = {
    groomUsername: "karim",
    submittedName: "Layla Khoury",
    submittedPhone: "+972501112233",
    submittedCity: "Haifa",
  };

  it("creates a confirmation and auto-attaches a single phone match", async () => {
    const { status, json } = await req(
      "POST",
      "/confirmations",
      null,
      submission
    );
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.attachedGuestId).toBe("gMatch");
    // The matched guest is stamped confirmedAt; the new confirmation records the link.
    expect(typeof DB.tree.guestsByGroom["groom-uid"].gMatch.confirmedAt).toBe(
      "number"
    );
    expect(DB.tree.confirmations[json.id].attachedGuestId).toBe("gMatch");
    expect(DB.tree.confirmations[json.id].groomUid).toBe("groom-uid");
  });

  it("declines auto-attach when two guests share the phone (still creates)", async () => {
    DB.tree.guestsByGroom["groom-uid"].gMatch2 = {
      name: "Layla Other",
      phone: "+972501112233",
      status: "pending",
      inviteType: "vip",
    };
    const { status, json } = await req(
      "POST",
      "/confirmations",
      null,
      submission
    );
    expect(status).toBe(200);
    expect(json.attachedGuestId).toBeNull();
    expect(DB.tree.confirmations[json.id]).toBeDefined();
    expect(DB.tree.confirmations[json.id].attachedGuestId).toBeUndefined();
  });

  it("404 unknown_groom for an unregistered username", async () => {
    const { status, json } = await req("POST", "/confirmations", null, {
      ...submission,
      groomUsername: "ghost",
    });
    expect(status).toBe(404);
    expect(json.error).toBe("unknown_groom");
  });

  it("400 name_must_be_full for a single-word name", async () => {
    const { status, json } = await req("POST", "/confirmations", null, {
      ...submission,
      submittedName: "Layla",
    });
    expect(status).toBe(400);
    expect(json.error).toBe("name_must_be_full");
  });
});

describe("POST /confirmations/attach-location — admin manual attach", () => {
  it("copies the confirmation coords onto the guest and links it", async () => {
    const { status, json } = await req(
      "POST",
      "/confirmations/attach-location",
      "admin-token",
      { confirmationId: "cLoc", guestId: "gMatch" }
    );
    expect(status).toBe(200);
    expect(json.attachedGuestId).toBe("gMatch");
    const guest = DB.tree.guestsByGroom["groom-uid"].gMatch;
    expect(guest.lat).toBe(32.1);
    expect(guest.lng).toBe(35.2);
    expect(guest.locationSource).toBe("gps");
    expect(guest.locationAccuracy).toBe(12);
    expect(typeof guest.locationUpdatedAt).toBe("number");
    expect(DB.tree.confirmations.cLoc.attachedGuestId).toBe("gMatch");
  });

  it("404 confirmation_not_found for an unknown confirmation", async () => {
    const { status, json } = await req(
      "POST",
      "/confirmations/attach-location",
      "admin-token",
      { confirmationId: "nope", guestId: "gMatch" }
    );
    expect(status).toBe(404);
    expect(json.error).toBe("confirmation_not_found");
  });

  it("409 confirmation_has_no_location when coords are absent", async () => {
    const { status, json } = await req(
      "POST",
      "/confirmations/attach-location",
      "admin-token",
      { confirmationId: "cNoLoc", guestId: "gMatch" }
    );
    expect(status).toBe(409);
    expect(json.error).toBe("confirmation_has_no_location");
  });

  it("404 guest_not_found when the target guest is missing", async () => {
    const { status, json } = await req(
      "POST",
      "/confirmations/attach-location",
      "admin-token",
      { confirmationId: "cLoc", guestId: "ghost" }
    );
    expect(status).toBe(404);
    expect(json.error).toBe("guest_not_found");
  });

  it("403 admins_only for a non-admin caller", async () => {
    const { status, json } = await req(
      "POST",
      "/confirmations/attach-location",
      "groom-token",
      { confirmationId: "cLoc", guestId: "gMatch" }
    );
    expect(status).toBe(403);
    expect(json.error).toBe("admins_only");
  });

  it("400 invalid_id for a malformed id", async () => {
    const { status, json } = await req(
      "POST",
      "/confirmations/attach-location",
      "admin-token",
      { confirmationId: "bad/id", guestId: "gMatch" }
    );
    expect(status).toBe(400);
    expect(json.error).toBe("invalid_id");
  });
});
