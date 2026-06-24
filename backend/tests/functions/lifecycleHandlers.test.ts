// @vitest-environment node
//
// Handler-behaviour tests for routes/lifecycle.ts, driven over real HTTP against
// the REAL lifecycleRouter. Mirrors usersHandlers.test.ts: requireAuth is stubbed
// (token → claims) while requireRole / requireAdmin stay real, and the userStore
// data-access seam is the in-memory adapter. Exercises the full state machine
// (cancel / undo / pause / resume / confirm-cancel / restore), the self-serve
// role gate, the admin inbox, and the public availability projection — no emulator.
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
import { inMemoryUserStore } from "./support/inMemoryUserStore";

const { CLAIMS, STORE } = vi.hoisted(() => {
  process.env.FUNCTIONS_EMULATOR = "true";
  return {
    CLAIMS: {
      "admin-token": { uid: "admin-uid", role: "admin", username: "admin" },
      "groom-token": { uid: "groom-uid", role: "groom", username: "groom" },
      "driver-token": { uid: "driver-uid", role: "driver", username: "driver" },
    } as Record<string, Record<string, unknown>>,
    STORE: { current: null as ReturnType<typeof inMemoryUserStore>["store"] | null },
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

vi.mock("../../functions/src/api/stores/userStore", () => {
  const d = (m: string) => (...a: unknown[]) => (STORE.current as any)[m](...a);
  return {
    userStore: {
      listUsers: d("listUsers"),
      listGroomProfiles: d("listGroomProfiles"),
      readUser: d("readUser"),
      readUsernameOwner: d("readUsernameOwner"),
      readPhoneOwner: d("readPhoneOwner"),
      applyUpdates: d("applyUpdates"),
      patchUserFields: d("patchUserFields"),
      setUserRole: d("setUserRole"),
      setGroomProfile: d("setGroomProfile"),
      removeGroomProfile: d("removeGroomProfile"),
      authCreateUser: d("authCreateUser"),
      authSetClaims: d("authSetClaims"),
      authUpdateUser: d("authUpdateUser"),
      authDeleteUser: d("authDeleteUser"),
      authGetUser: d("authGetUser"),
      authRevokeTokens: d("authRevokeTokens"),
    },
  };
});

import { lifecycleRouter } from "../../functions/src/api/routes/lifecycle";

let server: Server;
let baseUrl: string;
let mem: ReturnType<typeof inMemoryUserStore>;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/lifecycle", lifecycleRouter);
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
  mem = inMemoryUserStore({
    users: {
      "groom-uid": { username: "groom", role: "groom" },
      "admin-uid": { username: "admin", role: "admin" },
      u1: { username: "ali", role: "groom" },
    },
    usernameIndex: { groom: "groom-uid", admin: "admin-uid", ali: "u1" },
  });
  STORE.current = mem.store;
});

async function req(method: string, path: string, token: string | null, body?: unknown) {
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

const groomRec = () => mem.rtdb.users["groom-uid"];

describe("POST /lifecycle/cancel — groom self-serve", () => {
  it("active → cancel_pending with grace window + reason", async () => {
    const { status, json } = await req("POST", "/lifecycle/cancel", "groom-token", {
      reason: "moved abroad",
    });
    expect(status).toBe(200);
    expect(json.lifecycleStatus).toBe("cancel_pending");
    expect(groomRec().lifecycleStatus).toBe("cancel_pending");
    expect(typeof groomRec().cancelRequestedAt).toBe("number");
    expect(groomRec().cancelGraceEndsAt).toBeGreaterThan(groomRec().cancelRequestedAt);
    expect(groomRec().cancelReason).toBe("moved abroad");
    expect(groomRec().statusUpdatedBy).toBe("groom-uid");
  });

  it("is rejected for a non-groom role (driver → 403)", async () => {
    const { status, json } = await req("POST", "/lifecycle/cancel", "driver-token");
    expect(status).toBe(403);
    expect(json.error).toBe("forbidden");
  });

  it("a second cancel while pending → 409 already_pending", async () => {
    await req("POST", "/lifecycle/cancel", "groom-token");
    const { status, json } = await req("POST", "/lifecycle/cancel", "groom-token");
    expect(status).toBe(409);
    expect(json.error).toBe("already_pending");
  });
});

describe("POST /lifecycle/cancel/undo", () => {
  it("cancel_pending → active and clears the cancel fields", async () => {
    await req("POST", "/lifecycle/cancel", "groom-token", { reason: "x" });
    const { status, json } = await req("POST", "/lifecycle/cancel/undo", "groom-token");
    expect(status).toBe(200);
    expect(json.lifecycleStatus).toBe("active");
    expect(groomRec().lifecycleStatus).toBe("active");
    expect(groomRec().cancelRequestedAt).toBeUndefined();
    expect(groomRec().cancelGraceEndsAt).toBeUndefined();
    expect(groomRec().cancelReason).toBeUndefined();
  });

  it("undo when not pending → 409 not_pending", async () => {
    const { status, json } = await req("POST", "/lifecycle/cancel/undo", "groom-token");
    expect(status).toBe(409);
    expect(json.error).toBe("not_pending");
  });
});

describe("POST /lifecycle/pause + /resume", () => {
  it("active → paused with optional new date, then resume → active", async () => {
    const future = 4102444800000; // 2100-01-01
    const paused = await req("POST", "/lifecycle/pause", "groom-token", { newDate: future });
    expect(paused.status).toBe(200);
    expect(groomRec().lifecycleStatus).toBe("paused");
    expect(groomRec().pausedNewDate).toBe(future);

    const resumed = await req("POST", "/lifecycle/resume", "groom-token");
    expect(resumed.status).toBe(200);
    expect(groomRec().lifecycleStatus).toBe("active");
    expect(groomRec().pausedAt).toBeUndefined();
    expect(groomRec().pausedNewDate).toBeUndefined();
  });

  it("rejects an invalid new date (400)", async () => {
    const { status, json } = await req("POST", "/lifecycle/pause", "groom-token", { newDate: -1 });
    expect(status).toBe(400);
    expect(json.error).toBe("invalid_date");
  });

  it("pause when not active → 409 not_active", async () => {
    await req("POST", "/lifecycle/cancel", "groom-token");
    const { status, json } = await req("POST", "/lifecycle/pause", "groom-token");
    expect(status).toBe(409);
    expect(json.error).toBe("not_active");
  });

  it("resume when not paused → 409 not_paused", async () => {
    const { status, json } = await req("POST", "/lifecycle/resume", "groom-token");
    expect(status).toBe(409);
    expect(json.error).toBe("not_paused");
  });
});

describe("GET /lifecycle/me", () => {
  it("returns the caller's status block (default active)", async () => {
    const { status, json } = await req("GET", "/lifecycle/me", "groom-token");
    expect(status).toBe(200);
    expect(json.lifecycleStatus).toBe("active");
  });
});

describe("admin inbox + actions", () => {
  it("GET /lifecycle/pending lists only non-active accounts; groom is forbidden", async () => {
    await req("POST", "/lifecycle/cancel", "groom-token");
    const ok = await req("GET", "/lifecycle/pending", "admin-token");
    expect(ok.status).toBe(200);
    expect(ok.json.map((r: any) => r.uid)).toEqual(["groom-uid"]);
    expect(ok.json[0].lifecycleStatus).toBe("cancel_pending");

    const no = await req("GET", "/lifecycle/pending", "groom-token");
    expect(no.status).toBe(403);
    expect(no.json.error).toBe("admins_only");
  });

  it("POST /:uid/confirm-cancel finalises a pending cancellation", async () => {
    await req("POST", "/lifecycle/cancel", "groom-token");
    const { status, json } = await req("POST", "/lifecycle/groom-uid/confirm-cancel", "admin-token");
    expect(status).toBe(200);
    expect(json.lifecycleStatus).toBe("cancelled");
    expect(groomRec().lifecycleStatus).toBe("cancelled");
    expect(typeof groomRec().cancelledAt).toBe("number");
  });

  it("confirm-cancel on a non-pending account → 409 not_pending", async () => {
    const { status, json } = await req("POST", "/lifecycle/groom-uid/confirm-cancel", "admin-token");
    expect(status).toBe(409);
    expect(json.error).toBe("not_pending");
  });

  it("confirm-cancel on a ghost uid → 404", async () => {
    const { status, json } = await req("POST", "/lifecycle/ghost/confirm-cancel", "admin-token");
    expect(status).toBe(404);
    expect(json.error).toBe("not_found");
  });

  it("POST /:uid/restore returns a cancelled account to active and clears fields", async () => {
    await req("POST", "/lifecycle/cancel", "groom-token");
    await req("POST", "/lifecycle/groom-uid/confirm-cancel", "admin-token");
    const { status, json } = await req("POST", "/lifecycle/groom-uid/restore", "admin-token");
    expect(status).toBe(200);
    expect(json.lifecycleStatus).toBe("active");
    expect(groomRec().lifecycleStatus).toBe("active");
    expect(groomRec().cancelledAt).toBeUndefined();
    expect(groomRec().cancelGraceEndsAt).toBeUndefined();
  });

  it("restore on an already-active account → 409 already_active", async () => {
    const { status, json } = await req("POST", "/lifecycle/groom-uid/restore", "admin-token");
    expect(status).toBe(409);
    expect(json.error).toBe("already_active");
  });
});

describe("GET /lifecycle/public/:username", () => {
  it("active groom → available:true / state:active", async () => {
    const { status, json } = await req("GET", "/lifecycle/public/groom", null);
    expect(status).toBe(200);
    expect(json).toEqual({ available: true, state: "active", pausedNewDate: null });
  });

  it("cancelled groom → available:false / state:cancelled", async () => {
    mem.rtdb.users["groom-uid"].lifecycleStatus = "cancelled";
    const { status, json } = await req("GET", "/lifecycle/public/groom", null);
    expect(status).toBe(200);
    expect(json.available).toBe(false);
    expect(json.state).toBe("cancelled");
  });

  it("paused groom → state:postponed with the new date", async () => {
    mem.rtdb.users["groom-uid"].lifecycleStatus = "paused";
    mem.rtdb.users["groom-uid"].pausedNewDate = 4102444800000;
    const { json } = await req("GET", "/lifecycle/public/groom", null);
    expect(json.state).toBe("postponed");
    expect(json.pausedNewDate).toBe(4102444800000);
  });

  it("unknown groom → 404", async () => {
    const { status, json } = await req("GET", "/lifecycle/public/nobody", null);
    expect(status).toBe(404);
    expect(json.error).toBe("unknown_groom");
  });
});
